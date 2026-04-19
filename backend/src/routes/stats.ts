import { Router } from 'express'
import { db } from '../db'
import { messages, personas } from '../db/schema'
import { sql } from 'drizzle-orm'

export const statsRouter = Router()

const SIZE_EXPR = sql<number>`COALESCE(SUM(LENGTH(${messages.content}) + COALESCE(LENGTH(${messages.images}), 0) + COALESCE(LENGTH(${messages.toolCalls}), 0)), 0)`

statsRouter.get('/', (_req, res) => {
  const totalRow = db.select({
    tokensIn:  sql<number>`COALESCE(SUM(${messages.tokensIn}), 0)`,
    tokensOut: sql<number>`COALESCE(SUM(${messages.tokensOut}), 0)`,
    messages:  sql<number>`COUNT(CASE WHEN ${messages.role} = 'assistant' THEN 1 END)`,
    sizeBytes: SIZE_EXPR,
  }).from(messages).get()

  // Single JOIN — no separate personas query needed
  const byPersona = db.select({
    personaId:    messages.personaId,
    personaName:  personas.name,
    personaColor: personas.color,
    tokensIn:     sql<number>`COALESCE(SUM(${messages.tokensIn}), 0)`,
    tokensOut:    sql<number>`COALESCE(SUM(${messages.tokensOut}), 0)`,
    messages:     sql<number>`COUNT(CASE WHEN ${messages.role} = 'assistant' THEN 1 END)`,
    sizeBytes:    SIZE_EXPR,
  }).from(messages)
    .leftJoin(personas, sql`${messages.personaId} = ${personas.id}`)
    .groupBy(messages.personaId)
    .all()

  const byPersonaWithName = byPersona.map(row => ({
    ...row,
    personaName:  row.personaName  ?? (row.personaId ? 'Inconnu' : 'Sans persona'),
    personaColor: row.personaColor ?? '#7c3aed',
  })).sort((a, b) => b.sizeBytes - a.sizeBytes)

  res.json({
    total: totalRow ?? { tokensIn: 0, tokensOut: 0, messages: 0, sizeBytes: 0 },
    byPersona: byPersonaWithName,
  })
})
