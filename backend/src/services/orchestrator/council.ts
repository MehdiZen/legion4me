import { db } from '../../db'
import { messages, personas } from '../../db/schema'
import { streamChat, chatOnce } from '../ollama'
import { getCouncilMemoryBlock } from '../memory'
import type { OllamaMessage } from '../../types'
import type { SseChannel } from '../sse'
import { isAbortError } from '../sse'
import { FORMAT_ADDENDUM } from './prompt'
import { COUNCIL_NUM_PREDICT } from '../../constants'

export type CouncilPersona = typeof personas.$inferSelect

/** `__user__` = réponse de l'utilisateur, `__summary__` = historique compacté. */
export type CouncilHistoryEntry = { personaId: string; content: string }

export interface CouncilResumeState {
  personaIds: string[]
  totalTurns: number
  nextTurn: number
  nextSpeakerIndex: number
  initialUserContent: string
  councilHistory: CouncilHistoryEntry[]
}

export type CouncilLoopResult =
  | { status: 'done' }
  | { status: 'aborted' }
  | {
      status: 'paused'
      question: string
      questionPersonaId: string
      questionPersonaName: string
      resumeState: CouncilResumeState
    }

// ── Compaction ────────────────────────────────────────────────────────────────

async function compactCouncilHistory(
  history: CouncilHistoryEntry[],
  councilPersonas: CouncilPersona[],
  model: string,
  signal?: AbortSignal,
): Promise<CouncilHistoryEntry[]> {
  const personaNames = new Map(councilPersonas.map(p => [p.id, p.name]))
  const historyText = history.map(e => {
    if (e.personaId === '__summary__') return e.content
    const name = e.personaId === '__user__' ? 'Utilisateur' : (personaNames.get(e.personaId) ?? 'Persona')
    return `[${name}]: ${e.content}`
  }).join('\n\n')

  try {
    const { content } = await chatOnce(
      model,
      [
        { role: 'system', content: 'Résume ces échanges en 150 mots max. Garde les points clés, positions et conclusions de chaque participant. Sois factuel et concis.' },
        { role: 'user', content: historyText },
      ],
      0.2, undefined, false, signal,
    )
    console.log(`[council] history compacted — ${history.length} entries → 1 summary`)
    return [{ personaId: '__summary__', content: `[Résumé des échanges]\n${content.trim()}` }]
  } catch {
    return history
  }
}

// ── Contexte ──────────────────────────────────────────────────────────────────

function buildCouncilContext(
  speaker: CouncilPersona,
  councilPersonas: CouncilPersona[],
  initialUserContent: string,
  councilHistory: CouncilHistoryEntry[],
  turn: number,
  totalTurns: number,
  isLastTurn: boolean,
  initialUserImages?: string[],
): OllamaMessage[] {
  const others = councilPersonas.filter(p => p.id !== speaker.id)

  const councilAddendum = `\n\n---
Tu fais partie d'un conseil de personas dont le but est d'aider l'utilisateur.
Les autres membres du conseil sont : ${others.map(p => p.name).join(', ')}.
Votre objectif commun : éclairer l'utilisateur au mieux, même si vos approches divergent.
Tu es au tour ${turn} sur ${totalTurns}.${isLastTurn ? " C'est le dernier tour, conclus ta pensée." : ''}
Si une information cruciale manque pour délibérer efficacement, pose UNE question précise à l'utilisateur en terminant ton message par [QUESTION: ta question ici].
Si tu estimes que la délibération est complète, termine par [FIN].`

  const memoryBlock = getCouncilMemoryBlock(councilPersonas.map(p => p.id))

  const currentMessages: OllamaMessage[] = [
    { role: 'system', content: speaker.systemPrompt + FORMAT_ADDENDUM + memoryBlock + councilAddendum },
    { role: 'user', content: initialUserContent, ...(initialUserImages?.length ? { images: initialUserImages } : {}) },
  ]

  for (const entry of councilHistory) {
    if (entry.personaId === '__summary__') {
      currentMessages.push({ role: 'user', content: entry.content })
    } else if (entry.personaId === speaker.id) {
      currentMessages.push({ role: 'assistant', content: entry.content })
    } else if (entry.personaId === '__user__') {
      currentMessages.push({ role: 'user', content: `[Utilisateur] : ${entry.content}` })
    } else {
      const entryPersona = councilPersonas.find(p => p.id === entry.personaId)
      currentMessages.push({ role: 'user', content: `[Conseil — ${entryPersona?.name ?? 'Inconnu'}] : ${entry.content}` })
    }
  }

  return currentMessages
}

// ── Boucle ────────────────────────────────────────────────────────────────────

export async function runCouncilLoop(
  conversationId: string,
  councilPersonas: CouncilPersona[],
  initialUserContent: string,
  councilHistory: CouncilHistoryEntry[],
  totalTurns: number,
  startTurn: number,
  startSpeakerIndex: number,
  channel: SseChannel,
  initialUserImages?: string[],
): Promise<CouncilLoopResult> {
  outer: for (let turn = startTurn; turn <= totalTurns; turn++) {
    const siStart = turn === startTurn ? startSpeakerIndex : 0

    for (let si = siStart; si < councilPersonas.length; si++) {
      const speaker = councilPersonas[si]
      const isLastTurn = turn === totalTurns && si === councilPersonas.length - 1

      const currentMessages = buildCouncilContext(
        speaker, councilPersonas, initialUserContent, councilHistory, turn, totalTurns, isLastTurn, initialUserImages,
      )

      channel.send({ type: 'council_turn', turn, totalTurns, personaId: speaker.id, personaName: speaker.name })
      console.log(`[council] turn ${turn}/${totalTurns} speaker ${si + 1}/${councilPersonas.length} — ${speaker.name}`)

      let fullContent = ''
      try {
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
      } catch (err) {
        if (isAbortError(err) || channel.aborted) return { status: 'aborted' }
        throw err
      }

      // Signaux de fin — priorité : QUESTION > FIN.
      // Pas d'ancre $ : le signal peut apparaître n'importe où dans la réponse.
      const questionMatch = fullContent.match(/\[QUESTION:\s*([\s\S]+?)\]/i)
      const hasFin = !questionMatch && /\[FIN\]/i.test(fullContent)

      const cleanContent = fullContent
        .replace(/\s*\[QUESTION:[\s\S]+?\]\s*/gi, '')
        .replace(/\s*\[FIN\]\s*/gi, '')
        .trim()

      const assistantMsg = {
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant' as const,
        content: cleanContent,
        personaId: speaker.id,
        model: speaker.model,
        createdAt: Date.now(),
      }
      db.insert(messages).values(assistantMsg).run()
      councilHistory.push({ personaId: speaker.id, content: cleanContent })
      channel.send({ type: 'council_message', message: assistantMsg })
      console.log(`[council] ${speaker.name} done — ${cleanContent.length} chars${questionMatch ? ' [QUESTION]' : hasFin ? ' [FIN]' : ''}`)

      if (questionMatch) {
        // Reprise au locuteur suivant, ou au tour suivant si c'était le dernier
        const isLastSpeaker = si + 1 >= councilPersonas.length
        return {
          status: 'paused',
          question: questionMatch[1].trim(),
          questionPersonaId: speaker.id,
          questionPersonaName: speaker.name,
          resumeState: {
            personaIds: councilPersonas.map(p => p.id),
            totalTurns,
            nextTurn: isLastSpeaker ? turn + 1 : turn,
            nextSpeakerIndex: isLastSpeaker ? 0 : si + 1,
            initialUserContent,
            councilHistory: [...councilHistory],
          },
        }
      }

      if (hasFin) break outer
    }

    // Compacter en fin de tour pour borner la croissance du contexte
    if (turn < totalTurns && councilHistory.length > 0) {
      councilHistory = await compactCouncilHistory(councilHistory, councilPersonas, councilPersonas[0].model, channel.signal)
    }
  }

  return { status: 'done' }
}
