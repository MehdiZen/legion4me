import { Router } from 'express'
import { db } from '../db'
import { conversations, messages, personas } from '../db/schema'
import { eq } from 'drizzle-orm'
import { setupSSE, isAbortError } from '../services/sse'
import { extractFile } from '../services/files/extract'
import { generatePersona, PersonaGenError } from '../services/orchestrator/persona-gen'
import { generateTitle } from '../services/orchestrator/prompt'
import { runChat, type ChatRequest } from '../services/orchestrator/chat'
import {
  runCouncilLoop,
  type CouncilPersona,
  type CouncilHistoryEntry,
  type CouncilResumeState,
} from '../services/orchestrator/council'
import {
  detectForcedPersona,
  routeSalonMessage,
  runSalonTurn,
  type SalonPersona,
} from '../services/orchestrator/salon'
import { loadHistory, stripDataUri } from '../services/orchestrator/context'
import { resolveImageRefs, toImageUrls } from '../services/files/images'
import { MAX_FILE_UPLOAD_BYTES } from '../constants'

export const chatRouter = Router()

const MAX_COUNCIL_PERSONAS = 4
const MAX_SALON_PERSONAS   = 6
const MIN_TURNS = 1
const MAX_TURNS = 6

/** Charge des personas par id, en ignorant silencieusement les introuvables. */
function loadPersonas(ids: string[], limit: number): CouncilPersona[] {
  return ids
    .slice(0, limit)
    .map(id => db.select().from(personas).where(eq(personas.id, id)).get())
    .filter((p): p is CouncilPersona => Boolean(p))
}

// ── Génération de persona ─────────────────────────────────────────────────────

chatRouter.post('/generate-persona', async (req, res) => {
  const { description, model } = req.body as { description: string; model: string }
  if (!description?.trim() || !model) {
    return res.status(400).json({ error: 'description et model requis' })
  }

  try {
    res.json(await generatePersona(description, model))
  } catch (err) {
    if (err instanceof PersonaGenError) return res.status(err.status).json({ error: err.message })
    res.status(500).json({ error: err instanceof Error ? err.message : 'Génération échouée' })
  }
})

// ── Extraction de fichiers ────────────────────────────────────────────────────

chatRouter.post('/extract-file', async (req, res) => {
  const { name, base64, mimeType } = req.body as { name: string; base64: string; mimeType: string }
  if (!base64 || !name) return res.status(400).json({ error: 'name et base64 requis' })

  if (base64.length > MAX_FILE_UPLOAD_BYTES) {
    return res.status(413).json({ error: `Fichier trop volumineux (max ${MAX_FILE_UPLOAD_BYTES / 1024 / 1024} Mo)` })
  }

  try {
    res.json(await extractFile(name, Buffer.from(base64, 'base64'), mimeType))
  } catch (err) {
    console.error('[extract-file]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Extraction échouée' })
  }
})

// ── Chat ──────────────────────────────────────────────────────────────────────

chatRouter.post('/stream', async (req, res) => {
  const body = req.body as ChatRequest
  if (!body.conversationId || !body.content || !body.personaId) {
    return res.status(400).json({ error: 'conversationId, content et personaId requis' })
  }

  const channel = setupSSE(req, res)
  try {
    await runChat(body, channel)
  } catch (err) {
    if (!isAbortError(err)) {
      console.error('[chat] unhandled:', err)
      channel.send({ type: 'error', error: err instanceof Error ? err.message : 'Erreur inconnue' })
    }
  }
  res.end()
})

// ── Conseil ───────────────────────────────────────────────────────────────────

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

  const councilPersonas = loadPersonas(personaIds, MAX_COUNCIL_PERSONAS)
  if (councilPersonas.length < 2) return res.status(404).json({ error: 'Personas introuvables' })

  const totalTurns = Math.min(Math.max(Number(turns) || 3, MIN_TURNS), MAX_TURNS)
  const channel = setupSSE(req, res)

  const resolved = resolveImageRefs(images)
  const userMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user' as const,
    content,
    images: resolved?.length ? JSON.stringify(resolved) : null,
    personaId: councilPersonas[0].id,
    model: null as string | null,
    createdAt: Date.now(),
  }
  db.transaction(() => {
    db.insert(messages).values(userMessage).run()
    db.update(conversations)
      .set({ updatedAt: Date.now(), personaId: councilPersonas[0].id })
      .where(eq(conversations.id, conversationId))
      .run()
  })

  channel.send({ type: 'user_message', message: { ...userMessage, images: toImageUrls(conversationId, userMessage.id, resolved) } })
  channel.send({
    type: 'council_start',
    personas: councilPersonas.map(p => ({ id: p.id, name: p.name, color: p.color })),
    turns: totalTurns,
  })

  try {
    const result = await runCouncilLoop(
      conversationId, councilPersonas, content, [], totalTurns, 1, 0, channel,
      resolved ? stripDataUri(resolved) : undefined,
    )
    if (result.status === 'paused') {
      channel.send({
        type: 'council_pause',
        question: result.question,
        questionPersonaId: result.questionPersonaId,
        questionPersonaName: result.questionPersonaName,
        resumeState: result.resumeState,
      })
    } else if (result.status === 'done') {
      generateTitle(conversationId, councilPersonas[0].model, content)
      channel.send({ type: 'done' })
    }
  } catch (err) {
    if (!isAbortError(err)) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      console.error(`[council] error — ${msg}`)
      channel.send({ type: 'error', error: msg })
    }
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

  const councilPersonas = loadPersonas(resumeState.personaIds, MAX_COUNCIL_PERSONAS)
  if (councilPersonas.length < 2) return res.status(404).json({ error: 'Personas introuvables' })

  const channel = setupSSE(req, res)

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
  channel.send({ type: 'user_message', message: userMsg })

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
      channel,
    )
    if (result.status === 'paused') {
      channel.send({
        type: 'council_pause',
        question: result.question,
        questionPersonaId: result.questionPersonaId,
        questionPersonaName: result.questionPersonaName,
        resumeState: result.resumeState,
      })
    } else if (result.status === 'done') {
      channel.send({ type: 'done' })
    }
  } catch (err) {
    if (!isAbortError(err)) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      console.error(`[council/resume] error — ${msg}`)
      channel.send({ type: 'error', error: msg })
    }
  }

  res.end()
})

// ── Salon ─────────────────────────────────────────────────────────────────────

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

  const salonPersonas = loadPersonas(personaIds, MAX_SALON_PERSONAS) as SalonPersona[]
  if (salonPersonas.length < 2) return res.status(404).json({ error: 'Personas introuvables' })

  const channel = setupSSE(req, res)

  const resolved = resolveImageRefs(images)
  const userMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user' as const,
    content,
    images: resolved?.length ? JSON.stringify(resolved) : null,
    personaId: salonPersonas[0].id,
    model: salonPersonas[0].model,
    createdAt: Date.now(),
  }
  db.transaction(() => {
    db.insert(messages).values(userMessage).run()
    db.update(conversations)
      .set({
        updatedAt: Date.now(),
        personaId: salonPersonas[0].id,
        mode: 'salon',
        salonPersonaIds: JSON.stringify(personaIds),
      })
      .where(eq(conversations.id, conversationId))
      .run()
  })

  channel.send({ type: 'user_message', message: { ...userMessage, images: toImageUrls(conversationId, userMessage.id, resolved) } })

  try {
    // Une interpellation @Nom court-circuite le routage
    const forced = detectForcedPersona(content, salonPersonas)
    const speaker = forced ?? await routeSalonMessage(content, salonPersonas, conversationId, channel.signal)

    console.log(`[salon] speaker="${speaker.name}"${forced ? ' (forced @mention)' : ' (routed)'}`)
    channel.send({ type: 'salon_turn', personaId: speaker.id, personaName: speaker.name })

    const history = loadHistory(conversationId)
    const { content: fullContent } = await runSalonTurn(conversationId, speaker, salonPersonas, history, channel)

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
    generateTitle(conversationId, salonPersonas[0].model, content)
    channel.send({ type: 'salon_message', message: assistantMsg })
    channel.send({ type: 'done' })
  } catch (err) {
    if (!isAbortError(err) && !channel.aborted) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      console.error(`[salon] error — ${msg}`)
      channel.send({ type: 'error', error: msg })
    }
  }

  res.end()
})
