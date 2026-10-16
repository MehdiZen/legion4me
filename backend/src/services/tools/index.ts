import { db } from '../../db'
import { memories } from '../../db/schema'
import type { OllamaToolCall } from '../../types'
import { fetchUrlContent } from './browser'
import { webSearch } from './search'
import { searchWikipedia } from './wikipedia'
import { fetchYoutubeTranscript } from './youtube'

export { fetchUrlContent } from './browser'

// ── Définitions exposées au modèle ────────────────────────────────────────────

export const TOOLS = [
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

// ── Exécution ─────────────────────────────────────────────────────────────────

export interface ToolContext {
  /** Émet un événement SSE vers le client (indicateur d'outil en cours). */
  send: (data: object) => void
  /** Persona qui a déclenché l'appel — utilisé par `save_memory`. */
  personaId: string
}

type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>

export function getDatetime(): string {
  const now = new Date()
  return now.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) + ` (UTC${now.getTimezoneOffset() <= 0 ? '+' : ''}${-now.getTimezoneOffset() / 60})`
}

/** Valide qu'un argument fourni par le modèle est bien une chaîne exploitable. */
function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Paramètre ${key} manquant ou invalide`)
  }
  return value
}

/**
 * Table de dispatch des outils. Les clés font office de liste blanche :
 * un nom absent d'ici ne peut pas être exécuté.
 */
const HANDLERS: Record<string, ToolHandler> = {
  async web_search(args, { send }) {
    const query = requireString(args, 'query')
    console.log(`[tools] web_search — "${query}"`)
    send({ type: 'tool_call', tool: 'web_search', query })
    return await webSearch(query)
  },

  async fetch_url(args, { send }) {
    const url = requireString(args, 'url')
    console.log(`[tools] fetch_url — ${url}`)
    send({ type: 'tool_call', tool: 'fetch_url', url })
    return await fetchUrlContent(url)
  },

  async wikipedia(args, { send }) {
    const query = requireString(args, 'query')
    console.log(`[tools] wikipedia — "${query}"`)
    send({ type: 'tool_call', tool: 'wikipedia', query })
    return await searchWikipedia(query)
  },

  async youtube_transcript(args, { send }) {
    const url = requireString(args, 'url')
    console.log(`[tools] youtube_transcript — ${url}`)
    send({ type: 'tool_call', tool: 'youtube_transcript', url })
    return await fetchYoutubeTranscript(url)
  },

  async get_datetime(_args, { send }) {
    const result = getDatetime()
    console.log(`[tools] get_datetime — ${result}`)
    send({ type: 'tool_call', tool: 'get_datetime' })
    return result
  },

  async save_memory(args, { send, personaId }) {
    const content = requireString(args, 'content').trim()
    const memType = args.type === 'persona' ? 'persona' : 'global'
    db.insert(memories).values({
      id: crypto.randomUUID(),
      type: memType,
      source: 'tool',
      personaId: memType === 'persona' ? personaId : null,
      content,
      createdAt: Date.now(),
    }).run()
    console.log(`[tools] save_memory — [${memType}] "${content.slice(0, 60)}"`)
    send({ type: 'tool_call', tool: 'save_memory', content })
    return 'Mémorisé.'
  },
}

export const ALLOWED_TOOLS = new Set(Object.keys(HANDLERS))

/**
 * Exécute un appel d'outil et retourne son résultat textuel.
 *
 * Ne lève jamais : toute erreur est convertie en message destiné au modèle,
 * pour qu'il puisse se rattraper au tour suivant plutôt que d'interrompre
 * la conversation.
 */
export async function executeTool(tc: OllamaToolCall, ctx: ToolContext): Promise<string> {
  const toolName = tc.function.name
  const handler = HANDLERS[toolName]

  if (!handler) {
    console.warn(`[tools] blocked — unknown tool "${toolName}"`)
    return `Outil inconnu : ${toolName}`
  }

  try {
    const result = await handler(tc.function.arguments ?? {}, ctx)
    console.log(`[tools] ${toolName} OK — ${result.length} chars`)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erreur inconnue'
    console.error(`[tools] ${toolName} FAIL — ${msg}`)
    return `Erreur lors de l'exécution de ${toolName} : ${msg}`
  }
}
