import { db } from '../../db'
import { messages } from '../../db/schema'
import { and, eq, gte } from 'drizzle-orm'
import { getSummaryCheckpoint } from '../summary'

export type MessageRow = typeof messages.$inferSelect

/**
 * Charge l'historique utile d'une conversation.
 *
 * Les messages déjà absorbés par le résumé glissant ne sont jamais relus : sur
 * une longue conversation, ils représentent l'essentiel des octets (les images
 * base64 y sont stockées) pour aucune valeur ajoutée.
 */
export function loadHistory(conversationId: string): MessageRow[] {
  const checkpoint = getSummaryCheckpoint(conversationId)

  if (checkpoint) {
    const checkpointMsg = db.select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, checkpoint.coversUpToMsgId))
      .get()

    // Checkpoint toujours présent → on ne lit que ce qui suit.
    // S'il a été supprimé, on retombe sur un chargement complet.
    if (checkpointMsg) {
      // Borne inclusive puis exclusion par id : deux messages peuvent partager
      // la même milliseconde, un `>` strict en perdrait un.
      return db.select().from(messages)
        .where(and(
          eq(messages.conversationId, conversationId),
          gte(messages.createdAt, checkpointMsg.createdAt),
        ))
        .orderBy(messages.createdAt)
        .all()
        .filter(m => m.id !== checkpoint.coversUpToMsgId)
    }
  }

  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all()
}

/** Retire le préfixe data-URI : Ollama attend du base64 brut. */
export function stripDataUri(images: string[]): string[] {
  return images.map(img => img.replace(/^data:image\/[^;]+;base64,/, ''))
}

/** Parse une colonne JSON, en tolérant les données corrompues. */
export function parseJsonColumn<T>(raw: string | null): T | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}
