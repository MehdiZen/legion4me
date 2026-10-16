import { db } from '../../db'
import { messages } from '../../db/schema'
import { eq } from 'drizzle-orm'

/**
 * Les images de messages sont stockées en data URI dans la colonne `images`.
 * Les transmettre en base64 dans les listes de messages fait exploser les
 * payloads (une page PDF en vision pèse plusieurs Mo). On expose donc une URL
 * par image, servie à la demande, et les listes ne portent que ces URLs.
 */

const DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i

export interface DecodedImage { mime: string; buffer: Buffer }

/** Décode un data URI stocké en base. Retourne null si le format est inattendu. */
export function decodeDataUri(dataUri: string): DecodedImage | null {
  const match = DATA_URI.exec(dataUri)
  if (!match) return null
  try {
    return { mime: match[1].toLowerCase(), buffer: Buffer.from(match[2], 'base64') }
  } catch {
    return null
  }
}

/** URL publique d'une image de message. */
export function imageUrl(conversationId: string, messageId: string, index: number): string {
  return `/api/conversations/${conversationId}/messages/${messageId}/images/${index}`
}

/**
 * Remplace les data URIs d'un message par leurs URLs.
 * Les valeurs qui ne sont pas des data URIs (déjà des URLs) sont conservées.
 */
export function toImageUrls(
  conversationId: string,
  messageId: string,
  stored: string[] | null | undefined,
): string[] | null {
  if (!stored?.length) return null
  return stored.map((value, i) => (DATA_URI.test(value) ? imageUrl(conversationId, messageId, i) : value))
}

const IMAGE_URL = /^\/api\/conversations\/[^/]+\/messages\/([^/]+)\/images\/(\d+)$/

/**
 * Opération inverse : re-résout les URLs servies par l'app vers les data URIs
 * stockés. Nécessaire quand le client renvoie les images d'un message existant
 * — régénération, édition d'un message passé.
 */
export function resolveImageRefs(refs: string[] | undefined): string[] | undefined {
  if (!refs?.length) return refs

  return refs.flatMap(ref => {
    const match = IMAGE_URL.exec(ref)
    if (!match) return [ref]  // data URI direct (upload frais)

    const row = db.select({ images: messages.images })
      .from(messages)
      .where(eq(messages.id, match[1]))
      .get()
    if (!row?.images) return []

    try {
      const stored = JSON.parse(row.images) as string[]
      const image = stored[Number(match[2])]
      return image ? [image] : []
    } catch {
      return []
    }
  })
}
