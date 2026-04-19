import { db } from '../db'
import { memories, personas } from '../db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { chatOnce } from './ollama'

const EXTRACT_SYSTEM = `Tu es un extracteur de mémoire pour un assistant IA personnel.
Analyse la conversation et extrait les faits importants sur l'utilisateur à retenir pour de futures conversations.

Retourne UNIQUEMENT un JSON array de strings (peut être vide []).
Chaque string = un fait court, précis, actionnable.

Retiens :
- Préférences techniques (langages, frameworks, outils, style de code)
- Projets en cours et leur contexte
- Décisions prises et leur raison
- Style de travail et préférences de communication
- Contraintes ou contexte personnel pertinent

Ne retiens PAS :
- Des généralités évidentes
- Des faits déjà couverts par les mémoires existantes
- Des informations éphémères sans intérêt durable
- Le contenu des réponses de l'assistant

Si rien de nouveau à retenir, retourne [].`

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

export async function extractAndSaveMemories(
  model: string,
  personaId: string,
  conversationExcerpt: string,
): Promise<void> {
  try {
    const existingGlobal = db.select().from(memories)
      .where(and(eq(memories.type, 'global'), isNull(memories.personaId)))
      .all().map(m => m.content)

    const existingPersona = db.select().from(memories)
      .where(and(eq(memories.type, 'persona'), eq(memories.personaId, personaId)))
      .all().map(m => m.content)

    const existingBlock = [...existingGlobal, ...existingPersona].length
      ? `Mémoires existantes :\n${[...existingGlobal, ...existingPersona].map(c => `- ${c}`).join('\n')}\n\n`
      : ''

    const { content } = await chatOnce(
      model,
      [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: `${existingBlock}Conversation :\n${conversationExcerpt}` },
      ],
      0.2,
      undefined,
      false, // think: false for speed
    )

    const match = content.match(/\[[\s\S]*\]/)
    if (!match) return

    const facts: string[] = JSON.parse(match[0])
    if (!facts.length) return

    console.log(`[memory] extracted ${facts.length} new fact(s)`)

    // Classify each fact: global if it applies regardless of persona, persona-specific otherwise
    for (const fact of facts) {
      if (!fact.trim()) continue

      // Ask the model to classify global vs persona-specific
      const { content: cls } = await chatOnce(
        model,
        [
          { role: 'system', content: 'Réponds uniquement par "global" ou "persona". Est-ce que ce fait sur l\'utilisateur s\'applique à tous les contextes (global) ou est-il spécifique au contexte actuel (persona) ?' },
          { role: 'user', content: fact },
        ],
        0.1,
        undefined,
        false,
      )

      const type = cls.trim().toLowerCase().startsWith('global') ? 'global' : 'persona'
      db.insert(memories).values({
        id: crypto.randomUUID(),
        type,
        personaId: type === 'persona' ? personaId : null,
        content: fact.trim(),
        createdAt: Date.now(),
      }).run()
    }
  } catch (err) {
    console.error('[memory] extraction failed:', err instanceof Error ? err.message : err)
  }
}
