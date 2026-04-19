import { Router } from 'express'
import { db } from '../db'
import { personas } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { Persona } from '../types'

export const personasRouter = Router()

personasRouter.get('/', (_req, res) => {
  const all = db.select().from(personas).all()
  res.json(all)
})

personasRouter.get('/:id', (req, res) => {
  const persona = db.select().from(personas).where(eq(personas.id, req.params.id)).get()
  if (!persona) return res.status(404).json({ error: 'Persona not found' })
  res.json(persona)
})

personasRouter.post('/', (req, res) => {
  const { name, description, systemPrompt, model, temperature, color } = req.body as Partial<Persona>

  if (!name || !systemPrompt || !model) {
    return res.status(400).json({ error: 'name, systemPrompt, and model are required' })
  }

  const now = Date.now()
  const persona = {
    id: crypto.randomUUID(),
    name,
    description: description ?? null,
    systemPrompt,
    model,
    temperature: temperature ?? 0.7,
    color: color ?? '#7c3aed',
    createdAt: now,
    updatedAt: now,
  }

  db.insert(personas).values(persona).run()
  res.status(201).json(persona)
})

personasRouter.put('/:id', (req, res) => {
  const existing = db.select().from(personas).where(eq(personas.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Persona not found' })

  const { name, description, systemPrompt, model, temperature, color } = req.body as Partial<Persona>

  db.update(personas).set({
    ...(name && { name }),
    ...(description !== undefined && { description }),
    ...(systemPrompt && { systemPrompt }),
    ...(model && { model }),
    ...(temperature !== undefined && { temperature }),
    ...(color && { color }),
    updatedAt: Date.now(),
  }).where(eq(personas.id, req.params.id)).run()

  const updated = db.select().from(personas).where(eq(personas.id, req.params.id)).get()
  res.json(updated)
})

personasRouter.delete('/:id', (req, res) => {
  const existing = db.select().from(personas).where(eq(personas.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Persona not found' })

  db.delete(personas).where(eq(personas.id, req.params.id)).run()
  res.status(204).send()
})
