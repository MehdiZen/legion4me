import { Router } from 'express'
import { db } from '../db'
import { agents, agentRuns } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { runAgent } from '../services/agentRunner'

export const agentsRouter = Router()

agentsRouter.get('/', (_req, res) => {
  const rows = db.select().from(agents).all()
  res.json(rows.map(a => ({ ...a, config: JSON.parse(a.config) })))
})

agentsRouter.post('/', (req, res) => {
  const { name, type, config, personaId } = req.body as {
    name: string; type: string; config: object; personaId?: string
  }
  if (!name?.trim() || !type || !config) return res.status(400).json({ error: 'name, type, config requis' })

  const now = Date.now()
  const agent = {
    id: crypto.randomUUID(),
    name: name.trim(),
    type,
    config: JSON.stringify(config),
    personaId: personaId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  db.insert(agents).values(agent).run()
  res.status(201).json({ ...agent, config })
})

agentsRouter.put('/:id', (req, res) => {
  const { name, type, config, personaId } = req.body as {
    name?: string; type?: string; config?: object; personaId?: string
  }
  const existing = db.select().from(agents).where(eq(agents.id, req.params.id)).get()
  if (!existing) return res.status(404).json({ error: 'Agent introuvable' })

  const updated = {
    ...(name?.trim()   ? { name: name.trim() } : {}),
    ...(type           ? { type } : {}),
    ...(config         ? { config: JSON.stringify(config) } : {}),
    ...(personaId !== undefined ? { personaId: personaId || null } : {}),
    updatedAt: Date.now(),
  }
  db.update(agents).set(updated).where(eq(agents.id, req.params.id)).run()
  const result = db.select().from(agents).where(eq(agents.id, req.params.id)).get()!
  res.json({ ...result, config: JSON.parse(result.config) })
})

agentsRouter.delete('/:id', (req, res) => {
  db.delete(agents).where(eq(agents.id, req.params.id)).run()
  res.json({ ok: true })
})

agentsRouter.post('/:id/run', async (req, res) => {
  try {
    const { transcript } = req.body as { transcript?: string }
    const { runId } = await runAgent(req.params.id, { transcript })
    res.json({ runId })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur' })
  }
})

agentsRouter.get('/:id/runs', (req, res) => {
  const runs = db.select().from(agentRuns)
    .where(eq(agentRuns.agentId, req.params.id))
    .orderBy(desc(agentRuns.createdAt))
    .limit(20)
    .all()
  res.json(runs)
})

agentsRouter.get('/runs/:runId', (req, res) => {
  const run = db.select().from(agentRuns).where(eq(agentRuns.id, req.params.runId)).get()
  if (!run) return res.status(404).json({ error: 'Run introuvable' })
  res.json(run)
})
