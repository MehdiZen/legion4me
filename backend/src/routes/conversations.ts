import { Router } from 'express'
import { db } from '../db'
import { conversations, messages, conversationSummaries } from '../db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { decodeDataUri, toImageUrls } from '../services/files/images'

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

  // Les images ne sont pas sérialisées ici : on renvoie une URL par image.
  // Inliner le base64 ferait des dizaines de Mo par conversation.
  res.json(displayMsgs.map(m => {
    let stored: string[] | null = null
    try { stored = m.images ? JSON.parse(m.images) as string[] : null } catch { stored = null }
    return {
      ...m,
      images: toImageUrls(m.conversationId, m.id, stored),
      files:  m.files ? JSON.parse(m.files) : null,
    }
  }))
})

// Sert une image de message à la demande. Le contenu d'un message ne change
// jamais : on peut le mettre en cache agressivement côté navigateur.
conversationsRouter.get('/:id/messages/:msgId/images/:idx', (req, res) => {
  const row = db.select({ images: messages.images, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, req.params.msgId))
    .get()

  if (!row || row.conversationId !== req.params.id) {
    return res.status(404).json({ error: 'Message introuvable' })
  }

  let stored: string[]
  try {
    stored = row.images ? JSON.parse(row.images) as string[] : []
  } catch {
    return res.status(500).json({ error: 'Images illisibles' })
  }

  const index = Number(req.params.idx)
  const dataUri = Number.isInteger(index) ? stored[index] : undefined
  if (!dataUri) return res.status(404).json({ error: 'Image introuvable' })

  const decoded = decodeDataUri(dataUri)
  if (!decoded) return res.status(415).json({ error: 'Format d\'image non supporté' })

  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
  res.type(decoded.mime).send(decoded.buffer)
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
  // Suppression en cascade manuelle : aucune FK n'est déclarée en base
  db.transaction(() => {
    db.delete(messages).where(eq(messages.conversationId, req.params.id)).run()
    db.delete(conversationSummaries).where(eq(conversationSummaries.conversationId, req.params.id)).run()
    db.delete(conversations).where(eq(conversations.id, req.params.id)).run()
  })
  res.status(204).send()
})

conversationsRouter.delete('/:id/messages/:msgId', (req, res) => {
  db.delete(messages).where(eq(messages.id, req.params.msgId)).run()
  res.status(204).send()
})

