import { db } from '../../db'
import { messages, personas } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { streamChat, chatOnce } from '../ollama'
import { getSalonMemoryBlock } from '../memory'
import type { OllamaMessage } from '../../types'
import type { SseChannel } from '../sse'
import { FORMAT_ADDENDUM } from './prompt'
import { stripDataUri, parseJsonColumn, type MessageRow } from './context'
import { COUNCIL_NUM_PREDICT } from '../../constants'

export type SalonPersona = typeof personas.$inferSelect

const ROUTER_HISTORY_SIZE = 6   // tours récents fournis au routeur
const ROUTER_EXCERPT_CHARS = 150

/** Détecte une interpellation directe `@Nom` dans le message de l'utilisateur. */
export function detectForcedPersona(content: string, participants: SalonPersona[]): SalonPersona | null {
  const lower = content.toLowerCase()
  return participants.find(p => lower.includes(`@${p.name.toLowerCase()}`)) ?? null
}

/**
 * Choisit le persona le plus pertinent pour répondre.
 *
 * En cas d'échec (modèle indisponible, réponse hors-liste), on retombe sur le
 * premier participant plutôt que d'interrompre la conversation.
 */
export async function routeSalonMessage(
  userContent: string,
  participants: SalonPersona[],
  conversationId: string,
  signal?: AbortSignal,
): Promise<SalonPersona> {
  const history = db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all()
    .slice(-ROUTER_HISTORY_SIZE)

  const personaNames = new Map(participants.map(p => [p.id, p.name]))
  const historyText = history.map(m => {
    if (m.role === 'user') return `Utilisateur : ${m.content.slice(0, ROUTER_EXCERPT_CHARS)}`
    const who = personaNames.get(m.personaId ?? '') ?? 'Persona'
    return `${who} : ${m.content.slice(0, ROUTER_EXCERPT_CHARS)}`
  }).join('\n')

  const routerSystem = `Tu es le routeur d'un salon entre ces personas :
${participants.map(p => `- ${p.name} : ${(p.description ?? p.systemPrompt).slice(0, 120)}`).join('\n')}

Règle : choisis le persona le plus pertinent pour répondre au message de l'utilisateur selon son rôle.
Réponds UNIQUEMENT avec le nom exact du persona, rien d'autre.`

  const routerUser = `${historyText ? `Historique récent :\n${historyText}\n\n` : ''}Nouveau message : "${userContent}"\n\nQuel persona répond ?`

  try {
    const { content: chosen } = await chatOnce(
      participants[0].model,
      [{ role: 'system', content: routerSystem }, { role: 'user', content: routerUser }],
      0.1, undefined, false, signal,
    )
    return participants.find(p => p.name.toLowerCase() === chosen.trim().toLowerCase()) ?? participants[0]
  } catch {
    return participants[0]
  }
}

/**
 * Construit le contexte du locuteur : ses propres messages en `assistant`,
 * ceux des autres participants préfixés de leur nom en `user`.
 */
function buildSalonContext(
  speaker: SalonPersona,
  participants: SalonPersona[],
  history: MessageRow[],
  memoryBlock: string,
): OllamaMessage[] {
  const others = participants.filter(p => p.id !== speaker.id)
  const personaNames = new Map(participants.map(p => [p.id, p.name]))

  const salonAddendum = `\n\n---
Tu participes à un salon de discussion avec d'autres personas.
Les autres participants : ${others.map(p => p.name).join(', ')}.
Tu peux t'adresser directement à un autre participant avec @SonNom si tu veux solliciter son avis.
Reste dans ton rôle et sois naturel.
---`

  const currentMessages: OllamaMessage[] = [
    { role: 'system', content: speaker.systemPrompt + FORMAT_ADDENDUM + memoryBlock + salonAddendum },
  ]

  for (const m of history) {
    // Les tours d'outils sont du contexte interne — hors salon
    if (m.role === 'tool' || (m.role === 'assistant' && m.toolCalls)) continue

    if (m.role === 'user') {
      const storedImages = parseJsonColumn<string[]>(m.images)
      const msgImages = storedImages ? stripDataUri(storedImages) : undefined
      currentMessages.push({ role: 'user', content: m.content, ...(msgImages?.length ? { images: msgImages } : {}) })
    } else if (m.role === 'assistant') {
      if (m.personaId === speaker.id) {
        currentMessages.push({ role: 'assistant', content: m.content })
      } else {
        const name = personaNames.get(m.personaId ?? '') ?? 'Persona'
        currentMessages.push({ role: 'user', content: `[${name}] : ${m.content}` })
      }
    }
  }

  return currentMessages
}

/** Fait parler le locuteur choisi et persiste sa réponse. */
export async function runSalonTurn(
  conversationId: string,
  speaker: SalonPersona,
  salonPersonas: SalonPersona[],
  history: MessageRow[],
  channel: SseChannel,
): Promise<{ content: string }> {
  const memoryBlock = getSalonMemoryBlock(speaker.id, salonPersonas.map(p => p.id))
  const currentMessages = buildSalonContext(speaker, salonPersonas, history, memoryBlock)

  let fullContent = ''
  await streamChat(
    speaker.model,
    currentMessages,
    speaker.temperature ?? 0.7,
    [],
    (chunk) => { fullContent += chunk; channel.send({ type: 'chunk', content: chunk }) },
    undefined,
    { num_predict: COUNCIL_NUM_PREDICT },
    channel.signal,
  )

  return { content: fullContent }
}
