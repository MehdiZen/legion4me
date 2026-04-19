import { db } from '../db'
import { conversationSummaries } from '../db/schema'
import { eq } from 'drizzle-orm'
import { chatOnce } from './ollama'

const THRESHOLD = 20 // compact when raw messages after checkpoint exceed this
const STEP = 10      // number of messages to absorb per compaction

interface MsgRow {
  id: string
  role: string
  content: string
  toolCalls?: string | null
}

function formatForSummary(msgs: MsgRow[]): string {
  return msgs.map(m => {
    const role = m.role === 'user' ? 'Utilisateur' : 'Assistant'
    return `${role}: ${m.content.slice(0, 800)}`
  }).join('\n\n')
}

/**
 * Returns { summaryContent, coversUpToMsgId } for a conversation.
 * May trigger a compaction if raw message count exceeds THRESHOLD.
 * Only user/assistant messages without tool_calls count.
 */
export async function getOrUpdateSummary(
  model: string,
  conversationId: string,
  allMessages: MsgRow[],
): Promise<{ summaryContent: string | null; coversUpToMsgId: string | null }> {

  // Only visible messages matter for compaction
  const visible = allMessages.filter(m =>
    (m.role === 'user' || m.role === 'assistant') && !m.toolCalls
  )

  const existing = db.select().from(conversationSummaries)
    .where(eq(conversationSummaries.conversationId, conversationId))
    .get()

  // Find index of the checkpoint message
  const checkpointIdx = existing
    ? visible.findIndex(m => m.id === existing.coversUpToMsgId)
    : -1

  // Messages not yet covered by any summary
  const rawMsgs = checkpointIdx >= 0 ? visible.slice(checkpointIdx + 1) : visible

  // Not enough raw messages yet — return existing summary as-is
  if (rawMsgs.length <= THRESHOLD) {
    return {
      summaryContent: existing?.content ?? null,
      coversUpToMsgId: existing?.coversUpToMsgId ?? null,
    }
  }

  // Compact the first STEP raw messages into the summary
  const toAbsorb = rawMsgs.slice(0, STEP)
  const newCheckpoint = toAbsorb[toAbsorb.length - 1]

  const promptBody = existing
    ? `Résumé existant (à étendre) :\n${existing.content}\n\nNouveaux échanges à intégrer :\n${formatForSummary(toAbsorb)}`
    : `Échanges à résumer :\n${formatForSummary(toAbsorb)}`

  let newContent: string
  try {
    const { content } = await chatOnce(model, [
      {
        role: 'system',
        content: 'Tu résumes des échanges entre un utilisateur et un assistant IA. '
          + 'Garde les décisions importantes, les faits clés, le contexte essentiel. '
          + 'Si un résumé existant est fourni, fusionne-le avec les nouveaux échanges en un seul bloc cohérent. '
          + 'Réponds uniquement avec le résumé, sans introduction ni titre.',
      },
      { role: 'user', content: promptBody },
    ], 0.3, undefined, false)
    newContent = content.trim()
  } catch (err) {
    console.error('[summary] generation failed:', err)
    // Don't block the chat — return existing summary
    return {
      summaryContent: existing?.content ?? null,
      coversUpToMsgId: existing?.coversUpToMsgId ?? null,
    }
  }

  // Upsert
  const row = {
    conversationId,
    content: newContent,
    coversUpToMsgId: newCheckpoint.id,
    updatedAt: Date.now(),
  }
  if (existing) {
    db.update(conversationSummaries).set(row).where(eq(conversationSummaries.conversationId, conversationId)).run()
  } else {
    db.insert(conversationSummaries).values(row).run()
  }

  console.log(`[summary] compacted ${toAbsorb.length} msgs → checkpoint=${newCheckpoint.id}`)

  return { summaryContent: newContent, coversUpToMsgId: newCheckpoint.id }
}
