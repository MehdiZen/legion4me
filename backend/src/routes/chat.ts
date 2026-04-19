import { Router } from 'express'
import { db } from '../db'
import { conversations, messages, personas, memories } from '../db/schema'
import { eq } from 'drizzle-orm'
import { streamChat, chatOnce } from '../services/ollama'
import { getMemoryBlock, getCouncilMemoryBlock, getSalonMemoryBlock } from '../services/memory'
import { getOrUpdateSummary } from '../services/summary'
import type { OllamaMessage } from '../types'
import puppeteer, { type Browser } from 'puppeteer'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
// youtube-transcript has type:module — lazy-import to avoid CJS/ESM conflict at load time
async function getYoutubeTranscript(): Promise<{ fetchTranscript: (url: string) => Promise<{ text: string; offset: number; duration: number }[]> }> {
  const mod = await import('youtube-transcript')
  return (mod.YoutubeTranscript ?? mod.default?.YoutubeTranscript) as { fetchTranscript: (url: string) => Promise<{ text: string; offset: number; duration: number }[]> }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_UPLOAD_BYTES = 10 * 1024 * 1024   // 10 MB base64 input limit
const MAX_FILE_CHARS        = 30_000
const MIN_PDF_TEXT_CHARS    = 100                 // below this = image-based PDF
const PDF_DPI               = 150
const WEB_CONTENT_CHARS     = 12_000
const TOOL_MAX_ITER         = 5
const OLLAMA_TIMEOUT_MS     = 5 * 60 * 1000      // 5 min

const ALLOWED_TOOLS = new Set(['web_search', 'fetch_url', 'get_datetime', 'youtube_transcript', 'wikipedia', 'save_memory'])

// ── Puppeteer ─────────────────────────────────────────────────────────────────

let browser: Browser | null = null
async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    if (browser) {
      try { await browser.close() } catch { /* already dead */ }
    }
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  }
  return browser
}

process.on('exit', () => { try { browser?.close() } catch { /* ignore */ } })

export const chatRouter = Router()

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Use this when you need up-to-date information and you do NOT have a specific URL to fetch. If the user provides a URL or you know the exact page to read, prefer fetch_url instead — it gives complete content, not just summaries.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetches the full rendered content of a web page via a real browser. Always prefer this over web_search when a specific URL is known or provided — it returns complete, accurate content instead of partial summaries.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save an important fact about the user to persistent memory across conversations. Use this when the user reveals a preference, a constraint, a project, a personal detail, or anything that would be useful to remember in future conversations. Do NOT use this for temporary context or things already in memory.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The fact to remember, phrased as a concise statement about the user' },
          type: { type: 'string', enum: ['global', 'persona'], description: '"global" if the fact applies in all contexts, "persona" if it is specific to the current persona' },
        },
        required: ['content', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_datetime',
      description: 'Returns the current date and time. Use this whenever the user asks about today\'s date, the current time, or when you need to know the current date to answer accurately.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'youtube_transcript',
      description: 'Fetches the transcript of a YouTube video. Use this when the user provides a YouTube URL or video ID and wants to discuss, summarize, or extract information from the video.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The YouTube video URL or video ID' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia',
      description: 'Searches Wikipedia and returns a summary of the best matching article. More reliable than web_search for factual, encyclopedic information about people, places, events, or concepts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query or article title' },
        },
        required: ['query'],
      },
    },
  },
]

function getToolSystemAddendum(): string {
  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return `\n\n---
Date du jour : ${dateStr}

Tu as accès aux outils suivants :
- \`save_memory\` : mémorise un fait important sur l'utilisateur pour les futures conversations. Utilise-le dès que l'utilisateur révèle une préférence, contrainte, projet ou info personnelle utile à retenir.
- \`get_datetime\` : retourne la date et l'heure actuelles. Utilise-le dès qu'une question porte sur la date ou le temps.
- \`web_search\` : recherche web pour des informations récentes quand tu n'as pas d'URL précise. Inclus toujours la date ou la période pertinente dans ta query pour obtenir des résultats à jour.
- \`fetch_url\` : lit le contenu complet d'une page via un navigateur réel. **Priorité absolue** dès qu'une URL est connue ou fournie.
- \`youtube_transcript\` : récupère la transcription d'une vidéo YouTube depuis une URL ou un ID.
- \`wikipedia\` : recherche Wikipedia, plus fiable que web_search pour les faits encyclopédiques.

Règles impératives :
- Si tu as besoin d'un outil, **appelle-le immédiatement** — ne génère aucun texte avant.
- N'annonce jamais "je vais faire une recherche" ou "je vais consulter". Fais-le, c'est tout.
- **TOUJOURS appeler \`web_search\` en premier** pour : prix (carburant, immobilier, bourse, crypto…), actualités, météo, résultats sportifs, classements, taux de change, événements récents, sorties (films, jeux, albums…), ou toute donnée susceptible d'avoir changé depuis 2024.
- Ne jamais répondre d'après ta mémoire d'entraînement pour ces sujets, même si tu "crois" connaître la réponse.
- Pour \`save_memory\` : appelle-le en plus de ta réponse, pas à la place. Sauvegarde en silence, continue de répondre normalement.`
}

async function webSearch(query: string): Promise<string> {
  const now = new Date()
  const dateTag = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: 'long', day: 'numeric' })
  const enrichedQuery = /\b\d{4}\b/.test(query) ? query : `${query} (${dateTag})`
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: enrichedQuery,
      search_depth: 'basic',
      max_results: 5,
      include_answer: true,
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)
  const data = await res.json() as {
    answer?: string
    results: { title: string; url: string; content: string }[]
  }

  const lines: string[] = []
  if (data.answer) lines.push(`Résumé Tavily : ${data.answer}\n`)

  // Fetch full content of top 2 results via Puppeteer
  const topUrls = data.results.slice(0, 2).map(r => r.url)
  const fetched = await Promise.allSettled(topUrls.map(url => fetchUrlContent(url)))

  for (let i = 0; i < data.results.length; i++) {
    const r = data.results[i]
    const full = i < 2 && fetched[i].status === 'fulfilled' ? (fetched[i] as PromiseFulfilledResult<string>).value : null
    if (full) {
      lines.push(`[${r.title}](${r.url})\n${full}`)
    } else {
      lines.push(`[${r.title}](${r.url})\n${r.content}`)
    }
  }

  console.log(`[chat] web_search — fetched ${fetched.filter(f => f.status === 'fulfilled').length}/${topUrls.length} top URLs`)
  return lines.join('\n\n').slice(0, WEB_CONTENT_CHARS)
}

import type { OllamaToolCall } from '../types'

function saveMessage(fields: {
  conversationId: string
  role: string
  content: string
  personaId?: string | null
  model?: string | null
  toolCalls?: string | null
}) {
  db.insert(messages).values({
    id: crypto.randomUUID(),
    conversationId: fields.conversationId,
    role: fields.role,
    content: fields.content,
    personaId: fields.personaId ?? null,
    model: fields.model ?? null,
    toolCalls: fields.toolCalls ?? null,
    createdAt: Date.now(),
  }).run()
}

async function executeTool(
  tc: OllamaToolCall,
  send: (data: object) => void,
  currentMessages: OllamaMessage[],
  personaId: string,
): Promise<string> {
  const toolName = tc.function.name

  if (!ALLOWED_TOOLS.has(toolName)) {
    console.warn(`[chat] tool blocked — unknown tool "${toolName}"`)
    currentMessages.push({ role: 'tool', content: `Outil inconnu : ${toolName}` })
    return ''
  }

  let result = ''
  if (toolName === 'web_search') {
    const query = tc.function.arguments.query
    if (typeof query !== 'string' || !query.trim()) {
      currentMessages.push({ role: 'tool', content: 'Paramètre query manquant ou invalide' })
      return ''
    }
    console.log(`[chat] tool: web_search — "${query}"`)
    send({ type: 'tool_call', tool: 'web_search', query })
    try {
      result = await webSearch(query)
      console.log(`[chat] web_search OK — ${result.length} chars`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erreur inconnue'
      console.error(`[chat] web_search FAIL — ${msg}`)
      result = `Erreur de recherche : ${msg}`
    }
  } else if (toolName === 'fetch_url') {
    const url = tc.function.arguments.url
    if (typeof url !== 'string' || !url.trim()) {
      currentMessages.push({ role: 'tool', content: 'Paramètre url manquant ou invalide' })
      return ''
    }
    console.log(`[chat] tool: fetch_url — ${url}`)
    send({ type: 'tool_call', tool: 'fetch_url', url })
    try {
      result = await fetchUrlContent(url)
      console.log(`[chat] fetch_url OK — ${result.length} chars`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erreur inconnue'
      console.error(`[chat] fetch_url FAIL — ${url} : ${msg}`)
      result = `Impossible de charger ${url} : ${msg}`
    }
  } else if (toolName === 'save_memory') {
    const content = tc.function.arguments.content
    const type = tc.function.arguments.type
    if (typeof content !== 'string' || !content.trim()) {
      currentMessages.push({ role: 'tool', content: 'Paramètre content manquant ou invalide' })
      return ''
    }
    const memType = type === 'persona' ? 'persona' : 'global'
    db.insert(memories).values({
      id: crypto.randomUUID(),
      type: memType,
      source: 'tool',
      personaId: memType === 'persona' ? personaId : null,
      content: content.trim(),
      createdAt: Date.now(),
    }).run()
    console.log(`[chat] save_memory — [${memType}] "${content.trim().slice(0, 60)}"`)
    send({ type: 'tool_call', tool: 'save_memory', content: content.trim() })
    result = 'Mémorisé.'
  } else if (toolName === 'get_datetime') {
    result = getDatetime()
    console.log(`[chat] tool: get_datetime — ${result}`)
    send({ type: 'tool_call', tool: 'get_datetime' })
  } else if (toolName === 'youtube_transcript') {
    const url = tc.function.arguments.url
    if (typeof url !== 'string' || !url.trim()) {
      currentMessages.push({ role: 'tool', content: 'Paramètre url manquant ou invalide' })
      return ''
    }
    console.log(`[chat] tool: youtube_transcript — ${url}`)
    send({ type: 'tool_call', tool: 'youtube_transcript', url })
    try {
      result = await fetchYoutubeTranscript(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erreur inconnue'
      console.error(`[chat] youtube_transcript FAIL — ${msg}`)
      result = `Impossible de récupérer la transcription : ${msg}`
    }
  } else if (toolName === 'wikipedia') {
    const query = tc.function.arguments.query
    if (typeof query !== 'string' || !query.trim()) {
      currentMessages.push({ role: 'tool', content: 'Paramètre query manquant ou invalide' })
      return ''
    }
    console.log(`[chat] tool: wikipedia — "${query}"`)
    send({ type: 'tool_call', tool: 'wikipedia', query })
    try {
      result = await searchWikipedia(query)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erreur inconnue'
      console.error(`[chat] wikipedia FAIL — ${msg}`)
      result = `Erreur Wikipedia : ${msg}`
    }
  }
  currentMessages.push({ role: 'tool', content: result })
  return result
}

async function fetchUrlContent(url: string): Promise<string> {
  const b = await getBrowser()
  const page = await b.newPage()
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36')
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
    const status = response?.status() ?? 0
    const finalUrl = page.url()

    const text = await page.evaluate(() => {
      document.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove())
      return document.body?.innerText ?? ''
    })

    const clean = text.replace(/\s+/g, ' ').trim()
    const prefix = finalUrl !== url ? `[Redirigé vers: ${finalUrl}] [HTTP ${status}]\n\n` : `[HTTP ${status}]\n\n`
    const result = prefix + (clean || '[Page vide ou contenu non lisible]')
    console.log(`[chat] fetchUrlContent — ${clean.length} chars, status=${status}`)
    return result.slice(0, WEB_CONTENT_CHARS)
  } finally {
    await page.close()
  }
}

function getDatetime(): string {
  const now = new Date()
  return now.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) + ` (UTC${now.getTimezoneOffset() <= 0 ? '+' : ''}${-now.getTimezoneOffset() / 60})`
}

async function fetchYoutubeTranscript(url: string): Promise<string> {
  const YoutubeTranscript = await getYoutubeTranscript()
  const segments = await YoutubeTranscript.fetchTranscript(url)
  if (!segments.length) return '[Aucune transcription disponible pour cette vidéo]'

  // Group into ~30s blocks to keep the output readable
  const blocks: string[] = []
  let blockText = ''
  let blockStart = segments[0].offset

  for (const seg of segments) {
    blockText += (blockText ? ' ' : '') + seg.text
    if (seg.offset - blockStart >= 30000) {
      const ts = new Date(blockStart).toISOString().slice(11, 19)
      blocks.push(`[${ts}] ${blockText.trim()}`)
      blockText = ''
      blockStart = seg.offset
    }
  }
  if (blockText) {
    const ts = new Date(blockStart).toISOString().slice(11, 19)
    blocks.push(`[${ts}] ${blockText.trim()}`)
  }

  const result = blocks.join('\n')
  console.log(`[chat] youtube_transcript — ${segments.length} segments, ${result.length} chars`)
  return result.slice(0, WEB_CONTENT_CHARS)
}

async function searchWikipedia(query: string): Promise<string> {
  // Step 1 — find best matching article title
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`
  const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) })
  if (!searchRes.ok) throw new Error(`Wikipedia search error: ${searchRes.status}`)
  const searchData = await searchRes.json() as { query: { search: { title: string }[] } }
  const title = searchData.query.search[0]?.title
  if (!title) return `[Aucun article Wikipedia trouvé pour "${query}"]`

  // Step 2 — fetch full extract of the article
  const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=false&explaintext=true&titles=${encodeURIComponent(title)}&format=json`
  const extractRes = await fetch(extractUrl, { signal: AbortSignal.timeout(10000) })
  if (!extractRes.ok) throw new Error(`Wikipedia extract error: ${extractRes.status}`)
  const extractData = await extractRes.json() as { query: { pages: Record<string, { title: string; extract?: string }> } }
  const page = Object.values(extractData.query.pages)[0]
  if (!page?.extract) return `[Article "${title}" trouvé mais sans contenu extractible]`

  const result = `Wikipedia — ${page.title}\n\n${page.extract}`
  console.log(`[chat] wikipedia — "${title}", ${result.length} chars`)
  return result.slice(0, WEB_CONTENT_CHARS)
}

// ── Persona generator ─────────────────────────────────────────────────────────

const PERSONA_GEN_SYSTEM = `Tu es un générateur de personas pour une interface LLM personnelle.
L'utilisateur décrit un besoin, tu génères un persona complet.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication, sans balises.

Format attendu :
{
  "name": "Nom court du persona (2-3 mots max)",
  "description": "Une phrase décrivant le rôle du persona",
  "systemPrompt": "Prompt système complet et détaillé, en français sauf si le contexte impose une autre langue",
  "temperature": 0.7,
  "color": "#hexcolor"
}

Règles :
- temperature : 0.1-0.3 pour du technique/précis, 0.4-0.6 pour de l'équilibré, 0.7-1.0 pour du créatif
- color : couleur hex qui correspond à l'ambiance du persona (ex: #3b82f6 pour technique, #10b981 pour créatif, #f59e0b pour stratégique)
- systemPrompt : détaillé, avec le rôle, le style de réponse, les contraintes éventuelles`

chatRouter.post('/generate-persona', async (req, res) => {
  const { description, model } = req.body as { description: string; model: string }
  if (!description?.trim() || !model) {
    return res.status(400).json({ error: 'description and model are required' })
  }

  try {
    const { content } = await chatOnce(model, [
      { role: 'system', content: PERSONA_GEN_SYSTEM },
      { role: 'user', content: description },
    ])

    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return res.status(422).json({ error: 'Le modèle n\'a pas retourné de JSON valide' })

    let persona: unknown
    try {
      persona = JSON.parse(match[0])
    } catch {
      return res.status(422).json({ error: 'Le modèle a retourné un JSON malformé' })
    }
    res.json(persona)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Génération échouée' })
  }
})

// ── File extraction ───────────────────────────────────────────────────────────

import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

const execFileAsync = promisify(execFile)
// constants defined above at module level

async function pdfToImages(buffer: Buffer): Promise<string[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asmodeus-pdf-'))
  const inputPath = path.join(tmpDir, 'input.pdf')
  try {
    await fs.writeFile(inputPath, buffer)
    // -r PDF_DPI = good quality/size balance, -png, output prefix
    await execFileAsync('pdftoppm', ['-r', String(PDF_DPI), '-png', inputPath, path.join(tmpDir, 'page')], { timeout: 30000 })
    const files = (await fs.readdir(tmpDir))
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort()
    const images = await Promise.all(
      files.map(async f => {
        const buf = await fs.readFile(path.join(tmpDir, f))
        return `data:image/png;base64,${buf.toString('base64')}`
      })
    )
    return images
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

chatRouter.post('/extract-file', async (req, res) => {
  const { name, base64, mimeType } = req.body as { name: string; base64: string; mimeType: string }
  if (!base64 || !name) return res.status(400).json({ error: 'name and base64 required' })

  if (base64.length > MAX_FILE_UPLOAD_BYTES) {
    return res.status(413).json({ error: `Fichier trop volumineux (max ${MAX_FILE_UPLOAD_BYTES / 1024 / 1024} Mo)` })
  }

  try {
    const buffer = Buffer.from(base64, 'base64')

    if (mimeType === 'application/pdf') {
      // Try text extraction first
      const data = await pdfParse(buffer)
      const rawText = data.text?.trim() ?? ''

      if (rawText.length >= MIN_PDF_TEXT_CHARS) {
        // Text-based PDF
        const truncated = rawText.length > MAX_FILE_CHARS
        return res.json({
          mode: 'text',
          content: rawText.slice(0, MAX_FILE_CHARS).trim(),
          truncated,
          chars: rawText.length,
        })
      }

      // Image-based PDF → convert to images via pdftoppm
      console.log(`[extract-file] "${name}" — no text, converting to images`)
      const images = await pdfToImages(buffer)
      console.log(`[extract-file] "${name}" — ${images.length} pages as images`)
      return res.json({ mode: 'vision', images, chars: 0, truncated: false })
    }

    // text / code / csv / markdown
    const text = buffer.toString('utf-8')
    const truncated = text.length > MAX_FILE_CHARS
    return res.json({
      mode: 'text',
      content: text.slice(0, MAX_FILE_CHARS).trim(),
      truncated,
      chars: text.length,
    })
  } catch (err) {
    console.error('[extract-file]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Extraction failed' })
  }
})

// ── Chat stream ───────────────────────────────────────────────────────────────

interface FileContext {
  name: string
  mode: 'text' | 'vision'
  content?: string   // text mode
  images?: string[]  // vision mode
  chars: number
  truncated: boolean
}

chatRouter.post('/stream', async (req, res) => {
  const { conversationId, content, personaId, images, fileContext } = req.body as {
    conversationId: string
    content: string
    personaId: string
    images?: string[]
    fileContext?: FileContext
  }

  if (!conversationId || !content || !personaId) {
    return res.status(400).json({ error: 'conversationId, content, and personaId are required' })
  }

  const persona = db.select().from(personas).where(eq(personas.id, personaId)).get()
  if (!persona) return res.status(404).json({ error: 'Persona not found' })

  // Merge vision images from file with regular images
  const allImages = [
    ...(images ?? []),
    ...(fileContext?.mode === 'vision' ? (fileContext.images ?? []) : []),
  ]

  // Store only user's typed message in content — file metadata goes in `files` column
  const fileMeta = fileContext
    ? JSON.stringify([{ name: fileContext.name, mode: fileContext.mode, chars: fileContext.chars, truncated: fileContext.truncated }])
    : null

  // Save user message
  const userMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user' as const,
    content,
    images: allImages.length ? JSON.stringify(allImages) : null,
    files: fileMeta,
    personaId,
    model: persona.model,
    createdAt: Date.now(),
  }
  db.insert(messages).values(userMessage).run()
  db.update(conversations).set({ updatedAt: Date.now(), personaId }).where(eq(conversations.id, conversationId)).run()

  // Build message history for Ollama
  const history = db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all()

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.socket?.setNoDelay(true)
  res.flushHeaders()

  const send = (data: object) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch { /* client gone */ }
  }

  send({ type: 'user_message', message: {
    ...userMessage,
    images: allImages.length ? allImages : null,
    files: fileMeta ? JSON.parse(fileMeta) : null,
  } })

  const memoryBlock = getMemoryBlock(personaId)

  // Check / update rolling summary
  const { summaryContent, coversUpToMsgId } = await getOrUpdateSummary(persona.model, conversationId, history)

  // Keep only messages after the summary checkpoint
  let contextHistory = history
  if (coversUpToMsgId) {
    const cutoff = history.findIndex(m => m.id === coversUpToMsgId)
    if (cutoff >= 0) contextHistory = history.slice(cutoff + 1)
  }

  const summaryBlock = summaryContent
    ? `\n\n---\n[Résumé des échanges précédents]\n${summaryContent}`
    : ''

  const currentMessages: OllamaMessage[] = [
    { role: 'system', content: persona.systemPrompt + memoryBlock + summaryBlock + getToolSystemAddendum() },
    ...contextHistory.map(m => {
      if (m.role === 'tool') {
        return { role: 'tool' as const, content: m.content }
      }
      if (m.role === 'assistant') {
        let toolCalls: OllamaToolCall[] | undefined
        try { toolCalls = m.toolCalls ? JSON.parse(m.toolCalls) as OllamaToolCall[] : undefined } catch { toolCalls = undefined }
        return { role: 'assistant' as const, content: m.content, ...(toolCalls ? { tool_calls: toolCalls } : {}) }
      }
      // user — inject file content into context if present
      let storedImages: string[] | undefined
      try { storedImages = m.images ? JSON.parse(m.images) as string[] : undefined } catch { storedImages = undefined }
      const msgImages = storedImages?.map(img => img.replace(/^data:image\/[^;]+;base64,/, ''))
      let filesMeta: Array<{ name: string; mode: string; chars: number; truncated: boolean }> | null = null
      try { filesMeta = m.files ? JSON.parse(m.files) : null } catch { filesMeta = null }
      let fullUserContent = m.content
      // If this is the current message being sent and has a text file, inject it
      if (m.id === userMessage.id && fileContext?.mode === 'text' && fileContext.content) {
        const truncNote = fileContext.truncated ? ' — tronqué à 30 000 caractères' : ''
        fullUserContent = `[Fichier joint : ${fileContext.name}${truncNote}]\n\`\`\`\n${fileContext.content}\n\`\`\`\n\n${m.content}`
      }
      return { role: 'user' as const, content: fullUserContent, ...(msgImages?.length ? { images: msgImages } : {}) }
    }),
  ]

  console.log(`[chat] stream start — model=${persona.model} images=${images?.length ?? 0}`)

  let fullContent = ''
  let totalTokensIn = 0
  let totalTokensOut = 0

  try {
    const MAX_ITER = TOOL_MAX_ITER
    for (let i = 0; i < MAX_ITER; i++) {
      const { toolCalls, fullContent: iterContent, tokensIn, tokensOut } = await streamChat(
        persona.model,
        currentMessages,
        persona.temperature ?? 0.7,
        TOOLS,
        (chunk) => {
          fullContent += chunk
          send({ type: 'chunk', content: chunk })
        },
        (thinking) => {
          send({ type: 'thinking', content: thinking })
        },
      )

      if (tokensIn) totalTokensIn += tokensIn
      if (tokensOut) totalTokensOut += tokensOut

      // Qwen3 thinking mode + tools in streaming = no content output
      // Fall back to non-streaming with think:false
      if (!toolCalls?.length && !iterContent) {
        console.log(`[chat] stream produced no content — fallback to chatOnce think:false`)
        const { content: fallbackContent, toolCalls: fallbackToolCalls } = await chatOnce(
          persona.model,
          currentMessages,
          persona.temperature ?? 0.7,
          TOOLS,
          false,
        )
        if (!fallbackToolCalls?.length) {
          fullContent = fallbackContent
          if (fullContent) send({ type: 'chunk', content: fullContent })
          break
        }
        // Save assistant+tool_calls message to DB
        saveMessage({ conversationId, role: 'assistant', content: fallbackContent, personaId, model: persona.model, toolCalls: JSON.stringify(fallbackToolCalls) })
        currentMessages.push({ role: 'assistant', content: fallbackContent, tool_calls: fallbackToolCalls })
        for (const tc of fallbackToolCalls) {
          const toolResult = await executeTool(tc, send, currentMessages, personaId)
          saveMessage({ conversationId, role: 'tool', content: toolResult })
        }
        continue
      }

      if (!toolCalls?.length) break

      // Save assistant+tool_calls and tool results to DB so next turn has context
      saveMessage({ conversationId, role: 'assistant', content: iterContent, personaId, model: persona.model, toolCalls: JSON.stringify(toolCalls) })
      currentMessages.push({ role: 'assistant', content: iterContent, tool_calls: toolCalls })

      for (const tc of toolCalls) {
        const toolResult = await executeTool(tc, send, currentMessages, personaId)
        saveMessage({ conversationId, role: 'tool', content: toolResult })
      }

      fullContent = ''
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error(`[chat] error — ${msg}`)
    send({ type: 'error', error: msg })
    res.end()
    return
  }

  console.log(`[chat] done — ${fullContent.length} chars`)

  const assistantMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'assistant' as const,
    content: fullContent,
    personaId,
    model: persona.model,
    tokensIn: totalTokensIn || null,
    tokensOut: totalTokensOut || null,
    createdAt: Date.now(),
  }
  db.insert(messages).values(assistantMessage).run()

  const conv = db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
  if (conv && !conv.title) {
    // Mark as generating to prevent race condition
    db.update(conversations).set({ title: '…', updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
    chatOnce(persona.model, [
      { role: 'system', content: 'Génère un titre court (5 mots max) pour cette conversation. Réponds UNIQUEMENT avec le titre, sans guillemets, sans ponctuation finale.' },
      { role: 'user', content: content },
    ], 0.3, undefined, false).then(({ content: title }) => {
      db.update(conversations).set({ title: title.trim().slice(0, 60), updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
    }).catch((err) => {
      console.error('[chat] title generation failed:', err)
      db.update(conversations).set({ title: content.slice(0, 50), updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
    })
  }

  send({ type: 'done', message: assistantMessage })
  res.end()

  // Memory is now saved proactively via the save_memory tool during the response
})

// ── Council mode ──────────────────────────────────────────────────────────────

type CouncilPersona = typeof personas.$inferSelect
type CouncilHistoryEntry = { personaId: string; content: string } // personaId='__user__' = user answer, '__summary__' = compacted history

async function compactCouncilHistory(
  history: CouncilHistoryEntry[],
  councilPersonas: CouncilPersona[],
  model: string,
): Promise<CouncilHistoryEntry[]> {
  const personaNames = new Map(councilPersonas.map(p => [p.id, p.name]))
  const historyText = history.map(e => {
    if (e.personaId === '__summary__') return e.content
    const name = e.personaId === '__user__' ? 'Utilisateur' : (personaNames.get(e.personaId) ?? 'Persona')
    return `[${name}]: ${e.content}`
  }).join('\n\n')

  try {
    const { content } = await chatOnce(
      model,
      [
        { role: 'system', content: 'Résume ces échanges en 150 mots max. Garde les points clés, positions et conclusions de chaque participant. Sois factuel et concis.' },
        { role: 'user', content: historyText },
      ],
      0.2,
      undefined,
      false,
    )
    console.log(`[council] history compacted — ${history.length} entries → 1 summary`)
    return [{ personaId: '__summary__', content: `[Résumé des échanges]\n${content.trim()}` }]
  } catch {
    return history
  }
}

interface CouncilResumeState {
  personaIds: string[]
  totalTurns: number
  nextTurn: number
  nextSpeakerIndex: number
  initialUserContent: string
  councilHistory: CouncilHistoryEntry[]
}

function buildCouncilContext(
  speaker: CouncilPersona,
  councilPersonas: CouncilPersona[],
  initialUserContent: string,
  councilHistory: CouncilHistoryEntry[],
  turn: number,
  totalTurns: number,
  isLastTurn: boolean,
  initialUserImages?: string[],
): OllamaMessage[] {
  const others = councilPersonas.filter(p => p.id !== speaker.id)
  const othersNames = others.map(p => p.name).join(', ')

  const councilAddendum = `\n\n---
Tu fais partie d'un conseil de personas dont le but est d'aider l'utilisateur.
Les autres membres du conseil sont : ${othersNames}.
Votre objectif commun : éclairer l'utilisateur au mieux, même si vos approches divergent.
Tu es au tour ${turn} sur ${totalTurns}.${isLastTurn ? " C'est le dernier tour, conclus ta pensée." : ''}
Si une information cruciale manque pour délibérer efficacement, pose UNE question précise à l'utilisateur en terminant ton message par [QUESTION: ta question ici].
Si tu estimes que la délibération est complète, termine par [FIN].`

  const memoryBlock = getCouncilMemoryBlock(councilPersonas.map(p => p.id))

  const currentMessages: OllamaMessage[] = [
    { role: 'system', content: speaker.systemPrompt + memoryBlock + councilAddendum },
    { role: 'user', content: initialUserContent, ...(initialUserImages?.length ? { images: initialUserImages } : {}) },
  ]

  for (const entry of councilHistory) {
    if (entry.personaId === '__summary__') {
      currentMessages.push({ role: 'user', content: entry.content })
    } else if (entry.personaId === speaker.id) {
      currentMessages.push({ role: 'assistant', content: entry.content })
    } else if (entry.personaId === '__user__') {
      currentMessages.push({ role: 'user', content: `[Utilisateur] : ${entry.content}` })
    } else {
      const entryPersona = councilPersonas.find(p => p.id === entry.personaId)
      currentMessages.push({ role: 'user', content: `[Conseil — ${entryPersona?.name ?? 'Inconnu'}] : ${entry.content}` })
    }
  }

  return currentMessages
}

type CouncilLoopResult =
  | { status: 'done' }
  | { status: 'paused'; question: string; questionPersonaId: string; questionPersonaName: string; resumeState: CouncilResumeState }

async function runCouncilLoop(
  conversationId: string,
  councilPersonas: CouncilPersona[],
  initialUserContent: string,
  councilHistory: CouncilHistoryEntry[],
  totalTurns: number,
  startTurn: number,
  startSpeakerIndex: number,
  send: (data: object) => void,
  initialUserImages?: string[],
): Promise<CouncilLoopResult> {
  outer: for (let turn = startTurn; turn <= totalTurns; turn++) {
    const siStart = turn === startTurn ? startSpeakerIndex : 0
    for (let si = siStart; si < councilPersonas.length; si++) {
      const speaker = councilPersonas[si]
      const isLastTurn = turn === totalTurns && si === councilPersonas.length - 1

      const currentMessages = buildCouncilContext(
        speaker, councilPersonas, initialUserContent, councilHistory, turn, totalTurns, isLastTurn, initialUserImages,
      )

      send({ type: 'council_turn', turn, totalTurns, personaId: speaker.id, personaName: speaker.name })
      console.log(`[council] turn ${turn}/${totalTurns} speaker ${si + 1}/${councilPersonas.length} — ${speaker.name}`)

      let fullContent = ''
      await streamChat(
        speaker.model,
        currentMessages,
        speaker.temperature ?? 0.7,
        [],
        (chunk) => {
          fullContent += chunk
          send({ type: 'chunk', content: chunk })
        },
        undefined,
        { num_predict: 2000 },
      )

      // Detect signals — priority: QUESTION > FIN
      // No $ anchor: the signal may appear anywhere, including mid-sentence or with trailing text
      const questionMatch = fullContent.match(/\[QUESTION:\s*([\s\S]+?)\]/i)
      const hasFin = !questionMatch && /\[FIN\]/i.test(fullContent)

      const cleanContent = fullContent
        .replace(/\s*\[QUESTION:[\s\S]+?\]\s*/gi, '')
        .replace(/\s*\[FIN\]\s*/gi, '')
        .trim()

      const assistantMsg = {
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant' as const,
        content: cleanContent,
        personaId: speaker.id,
        model: speaker.model,
        createdAt: Date.now(),
      }
      db.insert(messages).values(assistantMsg).run()
      councilHistory.push({ personaId: speaker.id, content: cleanContent })
      send({ type: 'council_message', message: assistantMsg })
      console.log(`[council] ${speaker.name} done — ${cleanContent.length} chars${questionMatch ? ' [QUESTION]' : hasFin ? ' [FIN]' : ''}`)

      if (questionMatch) {
        const question = questionMatch[1].trim()
        // Next speaker after resume: si+1, or turn+1/si=0 if last speaker of this turn
        const nextSpeakerIndex = si + 1 < councilPersonas.length ? si + 1 : 0
        const nextTurn = si + 1 < councilPersonas.length ? turn : turn + 1
        return {
          status: 'paused',
          question,
          questionPersonaId: speaker.id,
          questionPersonaName: speaker.name,
          resumeState: {
            personaIds: councilPersonas.map(p => p.id),
            totalTurns,
            nextTurn,
            nextSpeakerIndex,
            initialUserContent,
            councilHistory: [...councilHistory],
          },
        }
      }

      if (hasFin) break outer
    }

    // Compact history at the end of each turn to keep context bounded
    if (turn < totalTurns && councilHistory.length > 0) {
      councilHistory = await compactCouncilHistory(councilHistory, councilPersonas, councilPersonas[0].model)
    }
  }
  return { status: 'done' }
}

function setupSSE(res: import('express').Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.socket?.setNoDelay(true)
  res.flushHeaders()
  return (data: object) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch { /* client gone */ }
  }
}

function generateCouncilTitle(conversationId: string, model: string, userContent: string) {
  const conv = db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
  if (!conv || conv.title) return
  chatOnce(model, [
    { role: 'system', content: 'Génère un titre court (5 mots max) pour cette conversation. Réponds UNIQUEMENT avec le titre, sans guillemets, sans ponctuation finale.' },
    { role: 'user', content: userContent },
  ], 0.3, undefined, false).then(({ content: title }) => {
    db.update(conversations).set({ title: title.trim().slice(0, 60), updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
  }).catch(() => {
    db.update(conversations).set({ title: userContent.slice(0, 50), updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()
  })
}

chatRouter.post('/council', async (req, res) => {
  const { conversationId, content, personaIds, turns, images } = req.body as {
    conversationId: string
    content: string
    personaIds: string[]
    turns: number
    images?: string[]
  }

  if (!conversationId || !content || !Array.isArray(personaIds) || personaIds.length < 2) {
    return res.status(400).json({ error: 'conversationId, content, et au moins 2 personaIds requis' })
  }

  const councilPersonas = personaIds
    .slice(0, 4)
    .map(id => db.select().from(personas).where(eq(personas.id, id)).get())
    .filter(Boolean) as CouncilPersona[]

  if (councilPersonas.length < 2) return res.status(404).json({ error: 'Personas introuvables' })

  const totalTurns = Math.min(Math.max(Number(turns) || 3, 1), 6)
  const send = setupSSE(res)

  const userMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user' as const,
    content,
    images: images?.length ? JSON.stringify(images) : null,
    personaId: councilPersonas[0].id,
    model: null as string | null,
    createdAt: Date.now(),
  }
  db.insert(messages).values(userMessage).run()
  db.update(conversations)
    .set({ updatedAt: Date.now(), personaId: councilPersonas[0].id })
    .where(eq(conversations.id, conversationId))
    .run()

  send({ type: 'user_message', message: { ...userMessage, images: images ?? null } })
  send({ type: 'council_start', personas: councilPersonas.map(p => ({ id: p.id, name: p.name, color: p.color })), turns: totalTurns })

  const strippedImages = images?.map(img => img.replace(/^data:image\/[^;]+;base64,/, ''))

  try {
    const result = await runCouncilLoop(conversationId, councilPersonas, content, [], totalTurns, 1, 0, send, strippedImages)
    if (result.status === 'paused') {
      send({ type: 'council_pause', question: result.question, questionPersonaId: result.questionPersonaId, questionPersonaName: result.questionPersonaName, resumeState: result.resumeState })
    } else {
      generateCouncilTitle(conversationId, councilPersonas[0].model, content)
      send({ type: 'done' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error(`[council] error — ${msg}`)
    send({ type: 'error', error: msg })
  }

  res.end()
})

chatRouter.post('/council/resume', async (req, res) => {
  const { conversationId, userAnswer, resumeState } = req.body as {
    conversationId: string
    userAnswer: string
    resumeState: CouncilResumeState
  }

  if (!conversationId || !userAnswer?.trim() || !resumeState) {
    return res.status(400).json({ error: 'conversationId, userAnswer, resumeState requis' })
  }

  const councilPersonas = resumeState.personaIds
    .map(id => db.select().from(personas).where(eq(personas.id, id)).get())
    .filter(Boolean) as CouncilPersona[]

  if (councilPersonas.length < 2) return res.status(404).json({ error: 'Personas introuvables' })

  const send = setupSSE(res)

  // Save user answer as a real message
  const userMsg = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user' as const,
    content: userAnswer,
    personaId: null as string | null,
    model: null as string | null,
    createdAt: Date.now(),
  }
  db.insert(messages).values(userMsg).run()
  send({ type: 'user_message', message: userMsg })

  // Inject user answer into council history
  const history: CouncilHistoryEntry[] = [
    ...resumeState.councilHistory,
    { personaId: '__user__', content: userAnswer },
  ]

  try {
    const result = await runCouncilLoop(
      conversationId,
      councilPersonas,
      resumeState.initialUserContent,
      history,
      resumeState.totalTurns,
      resumeState.nextTurn,
      resumeState.nextSpeakerIndex,
      send,
    )
    if (result.status === 'paused') {
      send({ type: 'council_pause', question: result.question, questionPersonaId: result.questionPersonaId, questionPersonaName: result.questionPersonaName, resumeState: result.resumeState })
    } else {
      send({ type: 'done' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error(`[council/resume] error — ${msg}`)
    send({ type: 'error', error: msg })
  }

  res.end()
})

// ── Salon mode ────────────────────────────────────────────────────────────────

type SalonPersona = typeof personas.$inferSelect

function detectForcedPersona(content: string, participants: SalonPersona[]): SalonPersona | null {
  const lower = content.toLowerCase()
  for (const p of participants) {
    if (lower.includes(`@${p.name.toLowerCase()}`)) return p
  }
  return null
}

async function routeSalonMessage(
  userContent: string,
  participants: SalonPersona[],
  conversationId: string,
): Promise<SalonPersona> {
  const history = db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all()
    .slice(-6)

  const personaNames = new Map(participants.map(p => [p.id, p.name]))
  const historyText = history.map(m => {
    if (m.role === 'user') return `Utilisateur : ${m.content.slice(0, 150)}`
    const who = personaNames.get(m.personaId ?? '') ?? 'Persona'
    return `${who} : ${m.content.slice(0, 150)}`
  }).join('\n')

  const routerSystem = `Tu es le routeur d'un salon entre ces personas :
${participants.map(p => `- ${p.name} : ${(p.description ?? p.systemPrompt).slice(0, 120)}`).join('\n')}

Règle : choisis le persona le plus pertinent pour répondre au message de l'utilisateur selon son rôle.
Réponds UNIQUEMENT avec le nom exact du persona, rien d'autre.`

  const routerUser = `${historyText ? `Historique récent :\n${historyText}\n\n` : ''}Nouveau message : "${userContent}"\n\nQuel persona répond ?`

  try {
    const { content: chosen } = await chatOnce(
      participants[0].model,
      [{ role: 'system', content: routerSystem }, { role: 'user', content: routerUser }],
      0.1,
      undefined,
      false,
    )
    return participants.find(
      p => p.name.toLowerCase() === chosen.trim().toLowerCase()
    ) ?? participants[0]
  } catch {
    return participants[0]
  }
}

function buildSalonContext(
  speaker: SalonPersona,
  participants: SalonPersona[],
  history: (typeof messages.$inferSelect)[],
  memoryBlock: string,
): OllamaMessage[] {
  const others = participants.filter(p => p.id !== speaker.id)
  const personaNames = new Map(participants.map(p => [p.id, p.name]))

  const salonAddendum = `\n\n---
Tu participes à un salon de discussion avec d'autres personas.
Les autres participants : ${others.map(p => p.name).join(', ')}.
Tu peux t'adresser directement à un autre participant avec @SonNom si tu veux solliciter son avis.
Reste dans ton rôle et sois naturel.
---`

  const currentMessages: OllamaMessage[] = [
    { role: 'system', content: speaker.systemPrompt + memoryBlock + salonAddendum },
  ]

  for (const m of history) {
    if (m.role === 'tool' || (m.role === 'assistant' && m.toolCalls)) continue
    if (m.role === 'user') {
      let storedImages: string[] | undefined
      try { storedImages = m.images ? JSON.parse(m.images) as string[] : undefined } catch { storedImages = undefined }
      const msgImages = storedImages?.map(img => img.replace(/^data:image\/[^;]+;base64,/, ''))
      currentMessages.push({ role: 'user', content: m.content, ...(msgImages?.length ? { images: msgImages } : {}) })
    } else if (m.role === 'assistant') {
      if (m.personaId === speaker.id) {
        currentMessages.push({ role: 'assistant', content: m.content })
      } else {
        const name = personaNames.get(m.personaId ?? '') ?? 'Persona'
        currentMessages.push({ role: 'user', content: `[${name}] : ${m.content}` })
      }
    }
  }

  return currentMessages
}

chatRouter.post('/salon', async (req, res) => {
  const { conversationId, content, personaIds, images } = req.body as {
    conversationId: string
    content: string
    personaIds: string[]
    images?: string[]
  }

  if (!conversationId || !content || !Array.isArray(personaIds) || personaIds.length < 2) {
    return res.status(400).json({ error: 'conversationId, content, et au moins 2 personaIds requis' })
  }

  const salonPersonas = personaIds
    .slice(0, 6)
    .map(id => db.select().from(personas).where(eq(personas.id, id)).get())
    .filter(Boolean) as SalonPersona[]

  if (salonPersonas.length < 2) return res.status(404).json({ error: 'Personas introuvables' })

  const send = setupSSE(res)

  // Save user message
  const userMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user' as const,
    content,
    images: images?.length ? JSON.stringify(images) : null,
    personaId: salonPersonas[0].id,
    model: salonPersonas[0].model,
    createdAt: Date.now(),
  }
  db.insert(messages).values(userMessage).run()
  db.update(conversations)
    .set({ updatedAt: Date.now(), personaId: salonPersonas[0].id, mode: 'salon', salonPersonaIds: JSON.stringify(personaIds) })
    .where(eq(conversations.id, conversationId))
    .run()

  send({ type: 'user_message', message: { ...userMessage, images: images ?? null } })

  // Route to speaker
  let speaker = detectForcedPersona(content, salonPersonas)
  const forced = !!speaker
  if (!speaker) speaker = await routeSalonMessage(content, salonPersonas, conversationId)

  console.log(`[salon] speaker="${speaker.name}"${forced ? ' (forced @mention)' : ' (routed)'}`)
  send({ type: 'salon_turn', personaId: speaker.id, personaName: speaker.name })

  // Build context with full history + cross-persona memory
  const history = db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all()

  const memoryBlock = getSalonMemoryBlock(speaker.id, personaIds)
  const currentMessages = buildSalonContext(speaker, salonPersonas, history, memoryBlock)

  // Stream response
  let fullContent = ''
  try {
    await streamChat(
      speaker.model,
      currentMessages,
      speaker.temperature ?? 0.7,
      [],
      (chunk) => {
        fullContent += chunk
        send({ type: 'chunk', content: chunk })
      },
      undefined,
      { num_predict: 2000 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur'
    console.error(`[salon] stream error — ${msg}`)
    send({ type: 'error', error: msg })
    res.end(); return
  }

  const assistantMsg = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'assistant' as const,
    content: fullContent,
    personaId: speaker.id,
    model: speaker.model,
    createdAt: Date.now(),
  }
  db.insert(messages).values(assistantMsg).run()

  console.log(`[salon] done — ${speaker.name}, ${fullContent.length} chars`)
  generateCouncilTitle(conversationId, salonPersonas[0].model, content)
  send({ type: 'salon_message', message: assistantMsg })
  send({ type: 'done' })
  res.end()
})
