import { db } from '../db'
import { memories, personas } from '../db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'

export function getCouncilMemoryBlock(councilPersonaIds: string[]): string {
  const global = db.select().from(memories)
    .where(and(eq(memories.type, 'global'), isNull(memories.personaId)))
    .all()

  // All persona-specific memories for every council member
  const perPersona = councilPersonaIds.length
    ? db.select().from(memories)
        .where(and(eq(memories.type, 'persona'), inArray(memories.personaId, councilPersonaIds)))
        .all()
    : []

  if (!global.length && !perPersona.length) return ''

  // Group persona memories by personaId, attach persona name
  const personaNames = new Map(
    db.select({ id: personas.id, name: personas.name }).from(personas)
      .where(inArray(personas.id, councilPersonaIds))
      .all()
      .map(p => [p.id, p.name])
  )

  const grouped = new Map<string, string[]>()
  for (const m of perPersona) {
    if (!m.personaId) continue
    if (!grouped.has(m.personaId)) grouped.set(m.personaId, [])
    grouped.get(m.personaId)!.push(m.content)
  }

  const lines: string[] = ['\n\n---\n[Mémoire partagée du conseil]']
  if (global.length) {
    lines.push('Général :')
    global.forEach(m => lines.push(`- ${m.content}`))
  }
  for (const [personaId, facts] of grouped) {
    const name = personaNames.get(personaId) ?? personaId
    lines.push(`Contexte ${name} :`)
    facts.forEach(f => lines.push(`- ${f}`))
  }
  lines.push('---')
  return lines.join('\n')
}

export function getSalonMemoryBlock(speakerId: string, participantIds: string[]): string {
  const global = db.select().from(memories)
    .where(and(eq(memories.type, 'global'), isNull(memories.personaId)))
    .all()

  const own = db.select().from(memories)
    .where(and(eq(memories.type, 'persona'), eq(memories.personaId, speakerId)))
    .all()

  const otherIds = participantIds.filter(id => id !== speakerId)
  const others = otherIds.length
    ? db.select().from(memories)
        .where(and(eq(memories.type, 'persona'), inArray(memories.personaId, otherIds)))
        .all()
    : []

  if (!global.length && !own.length && !others.length) return ''

  const personaNames = otherIds.length
    ? new Map(
        db.select({ id: personas.id, name: personas.name }).from(personas)
          .where(inArray(personas.id, otherIds))
          .all()
          .map(p => [p.id, p.name])
      )
    : new Map<string, string>()

  const grouped = new Map<string, string[]>()
  for (const m of others) {
    if (!m.personaId) continue
    if (!grouped.has(m.personaId)) grouped.set(m.personaId, [])
    grouped.get(m.personaId)!.push(m.content)
  }

  const lines: string[] = ['\n\n---\n[Mémoire — Salon]']
  if (global.length) {
    lines.push('Général :')
    global.forEach(m => lines.push(`- ${m.content}`))
  }
  if (own.length) {
    lines.push('Tes propres souvenirs :')
    own.forEach(m => lines.push(`- ${m.content}`))
  }
  for (const [personaId, facts] of grouped) {
    const name = personaNames.get(personaId) ?? personaId
    lines.push(`Ce que sait ${name} (partagé dans ce salon) :`)
    facts.forEach(f => lines.push(`- ${f}`))
  }
  lines.push('---')
  return lines.join('\n')
}

export function getMemoryBlock(personaId: string): string {
  const global = db.select().from(memories)
    .where(and(eq(memories.type, 'global'), isNull(memories.personaId)))
    .all()

  const persona = db.select().from(memories)
    .where(and(eq(memories.type, 'persona'), eq(memories.personaId, personaId)))
    .all()

  if (!global.length && !persona.length) return ''

  const lines: string[] = ['\n\n---\n[Mémoire]']
  if (global.length) {
    lines.push('Général :')
    global.forEach(m => lines.push(`- ${m.content}`))
  }
  if (persona.length) {
    lines.push('Contexte persona :')
    persona.forEach(m => lines.push(`- ${m.content}`))
  }
  lines.push('---')
  return lines.join('\n')
}
