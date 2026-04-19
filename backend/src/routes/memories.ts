import { Router } from 'express'
import { db } from '../db'
import { memories } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'

export const memoriesRouter = Router()

memoriesRouter.get('/', (_req, res) => {
  const all = db.select().from(memories).all()
  res.json(all)
})

memoriesRouter.get('/persona/:personaId', (req, res) => {
  const persona = db.select().from(memories)
    .where(and(eq(memories.type, 'persona'), eq(memories.personaId, req.params.personaId)))
    .all()
  const global = db.select().from(memories)
    .where(and(eq(memories.type, 'global'), isNull(memories.personaId)))
    .all()
  res.json({ global, persona })
})

memoriesRouter.delete('/:id', (req, res) => {
  db.delete(memories).where(eq(memories.id, req.params.id)).run()
  res.status(204).send()
})

memoriesRouter.post('/', (req, res) => {
  const { type, personaId, content, source } = req.body as { type: string; personaId?: string; content: string; source?: string }
  if (!type || !content) return res.status(400).json({ error: 'type and content required' })
  const mem = {
    id: crypto.randomUUID(),
    type,
    source: source === 'user' ? 'user' : 'tool',
    personaId: personaId ?? null,
    content,
    createdAt: Date.now(),
  }
  db.insert(memories).values(mem).run()
  res.status(201).json(mem)
})
