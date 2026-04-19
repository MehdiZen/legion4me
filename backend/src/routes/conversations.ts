import { Router } from 'express'
import { db } from '../db'
import { conversations, messages } from '../db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { chatOnce } from '../services/ollama'

export const conversationsRouter = Router()

conversationsRouter.get('/', (_req, res) => {
  const all = db.select({
    id:              conversations.id,
    title:           conversations.title,
    personaId:       conversations.personaId,
    pinned:          conversations.pinned,
    mode:            conversations.mode,
    salonPersonaIds: conversations.salonPersonaIds,
    createdAt:       conversations.createdAt,
    updatedAt:       conversations.updatedAt,
    sizeBytes: sql<number>`(
      SELECT COALESCE(SUM(
        LENGTH(m.content) +
        COALESCE(LENGTH(m.images), 0) +
        COALESCE(LENGTH(m.tool_calls), 0)
      ), 0)
      FROM messages m
      WHERE m.conversation_id = conversations.id
    )`,
  }).from(conversations)
    .orderBy(desc(conversations.pinned), desc(conversations.updatedAt))
    .all()
  res.json(all.map(c => ({
    ...c,
    salonPersonaIds: c.salonPersonaIds ? JSON.parse(c.salonPersonaIds) as string[] : null,
  })))
})

conversationsRouter.get('/:id/messages', (req, res) => {
  const msgs = db.select().from(messages)
    .where(eq(messages.conversationId, req.params.id))
    .orderBy(messages.createdAt)
    .all()

  // Filter out tool messages and intermediate assistant+tool_calls messages
  // (those are internal context only — not meant for display)
  const displayMsgs = msgs.filter(m => {
    if (m.role === 'tool') return false
    if (m.role === 'assistant' && m.toolCalls) return false
    return true
  })

  res.json(displayMsgs.map(m => ({
    ...m,
    images: m.images ? JSON.parse(m.images) : null,
    files:  m.files  ? JSON.parse(m.files)  : null,
  })))
})

conversationsRouter.post('/', (req, res) => {
  const { personaId } = req.body as { personaId?: string }
  const now = Date.now()
  const conv = {
    id: crypto.randomUUID(),
    title: null,
    personaId: personaId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  db.insert(conversations).values(conv).run()
  res.status(201).json(conv)
})

conversationsRouter.patch('/:id', (req, res) => {
  const existing = db.select().from(conversations).where(eq(conversations.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Conversation not found' })

  const { title, personaId, pinned } = req.body as { title?: string; personaId?: string; pinned?: boolean }

  db.update(conversations).set({
    ...(title !== undefined && { title }),
    ...(personaId !== undefined && { personaId }),
    ...(pinned !== undefined && { pinned: pinned ? 1 : 0 }),
    updatedAt: Date.now(),
  }).where(eq(conversations.id, req.params.id)).run()

  const updated = db.select().from(conversations).where(eq(conversations.id, req.params.id)).get()
  res.json(updated)
})

conversationsRouter.delete('/:id', (req, res) => {
  db.delete(messages).where(eq(messages.conversationId, req.params.id)).run()
  db.delete(conversations).where(eq(conversations.id, req.params.id)).run()
  res.status(204).send()
})

conversationsRouter.delete('/:id/messages/:msgId', (req, res) => {
  db.delete(messages).where(eq(messages.id, req.params.msgId)).run()
  res.status(204).send()
})

conversationsRouter.post('/:id/generate-title', async (req, res) => {
  const { model, firstMessage } = req.body as { model: string; firstMessage: string }
  if (!model || !firstMessage) return res.status(400).json({ error: 'model and firstMessage required' })

  try {
    const { content } = await chatOnce(model, [
      { role: 'system', content: 'Génère un titre court (5 mots max) pour cette conversation. Réponds UNIQUEMENT avec le titre, sans guillemets, sans ponctuation finale.' },
      { role: 'user', content: firstMessage },
    ], 0.3, undefined, false)

    const title = content.trim().slice(0, 60)
    db.update(conversations).set({ title, updatedAt: Date.now() }).where(eq(conversations.id, req.params.id)).run()
    res.json({ title })
  } catch {
    res.status(500).json({ error: 'Title generation failed' })
  }
})
