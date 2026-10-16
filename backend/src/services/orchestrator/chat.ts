import { db } from '../../db'
import { conversations, messages, personas } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { streamChat, chatOnce } from '../ollama'
import { getMemoryBlock } from '../memory'
import { getOrUpdateSummary } from '../summary'
import { TOOLS, executeTool } from '../tools'
import type { OllamaMessage, OllamaToolCall } from '../../types'
import type { SseChannel } from '../sse'
import { isAbortError } from '../sse'
import { FORMAT_ADDENDUM, getToolSystemAddendum, saveMessage, generateTitle } from './prompt'
import { loadHistory, stripDataUri, parseJsonColumn, type MessageRow } from './context'
import { resolveImageRefs, toImageUrls } from '../files/images'
import { TOOL_MAX_ITER, MAX_RECENT_MESSAGES, MAX_FILE_CHARS } from '../../constants'

export interface FileContext {
  name: string
  mode: 'text' | 'vision'
  content?: string   // mode texte
  images?: string[]  // mode vision
  chars: number
  truncated: boolean
}

export interface ChatRequest {
  conversationId: string
  content: string
  personaId: string
  images?: string[]
  fileContext?: FileContext
}

type Persona = typeof personas.$inferSelect

/** Convertit une ligne de la base en message au format Ollama. */
function toOllamaMessage(m: MessageRow, injectFileInto?: { id: string; file: FileContext }): OllamaMessage {
  if (m.role === 'tool') {
    return { role: 'tool', content: m.content }
  }

  if (m.role === 'assistant') {
    const toolCalls = parseJsonColumn<OllamaToolCall[]>(m.toolCalls)
    return { role: 'assistant', content: m.content, ...(toolCalls ? { tool_calls: toolCalls } : {}) }
  }

  const storedImages = parseJsonColumn<string[]>(m.images)
  const msgImages = storedImages ? stripDataUri(storedImages) : undefined

  // Le contenu d'un fichier texte n'est pas persisté : il est réinjecté
  // uniquement dans le message courant, au moment de l'envoi.
  let content = m.content
  if (injectFileInto && m.id === injectFileInto.id) {
    const { file } = injectFileInto
    const truncNote = file.truncated ? ` — tronqué à ${MAX_FILE_CHARS.toLocaleString('fr-FR')} caractères` : ''
    content = `[Fichier joint : ${file.name}${truncNote}]\n\`\`\`\n${file.content}\n\`\`\`\n\n${m.content}`
  }

  return { role: 'user', content, ...(msgImages?.length ? { images: msgImages } : {}) }
}

/**
 * Déroule un échange de chat : persistance du message utilisateur, construction
 * du contexte, boucle d'outils, puis sauvegarde de la réponse.
 *
 * En cas de déconnexion client, la génération est interrompue et le contenu
 * déjà produit est conservé — rien n'est perdu, rien ne continue pour personne.
 */
export async function runChat(req: ChatRequest, channel: SseChannel): Promise<void> {
  const { conversationId, content, personaId, images, fileContext } = req

  const persona = db.select().from(personas).where(eq(personas.id, personaId)).get()
  if (!persona) {
    channel.send({ type: 'error', error: 'Persona introuvable' })
    return
  }

  const userMessage = persistUserMessage(req, persona)
  channel.send({
    type: 'user_message',
    message: {
      ...userMessage,
      images: toImageUrls(conversationId, userMessage.id, parseJsonColumn<string[]>(userMessage.images)),
      files: parseJsonColumn(userMessage.files) ?? null,
    },
  })

  const history = loadHistory(conversationId)
  const memoryBlock = getMemoryBlock(personaId)
  const { summaryContent, coversUpToMsgId } = await getOrUpdateSummary(persona.model, conversationId, history)

  // Ne garder que les messages postérieurs au checkpoint, plafonnés aux N derniers
  let contextHistory = history
  if (coversUpToMsgId) {
    const cutoff = history.findIndex(m => m.id === coversUpToMsgId)
    if (cutoff >= 0) contextHistory = history.slice(cutoff + 1)
  }
  if (contextHistory.length > MAX_RECENT_MESSAGES) {
    contextHistory = contextHistory.slice(-MAX_RECENT_MESSAGES)
  }

  const summaryBlock = summaryContent ? `\n\n---\n[Résumé des échanges précédents]\n${summaryContent}` : ''
  const injectFile = fileContext?.mode === 'text' && fileContext.content
    ? { id: userMessage.id, file: fileContext }
    : undefined

  const currentMessages: OllamaMessage[] = [
    { role: 'system', content: persona.systemPrompt + FORMAT_ADDENDUM + memoryBlock + summaryBlock + getToolSystemAddendum() },
    ...contextHistory.map(m => toOllamaMessage(m, injectFile)),
  ]

  console.log(`[chat] stream start — model=${persona.model} images=${images?.length ?? 0} ctx=${contextHistory.length}`)

  let fullContent = ''
  let tokensIn = 0
  let tokensOut = 0
  let aborted = false

  try {
    for (let i = 0; i < TOOL_MAX_ITER; i++) {
      const iter = await streamChat(
        persona.model,
        currentMessages,
        persona.temperature ?? 0.7,
        TOOLS,
        (chunk) => { fullContent += chunk; channel.send({ type: 'chunk', content: chunk }) },
        (thinking) => channel.send({ type: 'thinking', content: thinking }),
        undefined,
        channel.signal,
      )

      tokensIn  += iter.tokensIn  ?? 0
      tokensOut += iter.tokensOut ?? 0

      // Qwen3 en mode thinking + tools ne produit rien en streaming :
      // on rejoue le tour en non-streaming avec think:false.
      if (!iter.toolCalls?.length && !iter.fullContent) {
        console.log('[chat] stream produced no content — fallback to chatOnce think:false')
        const fallback = await chatOnce(
          persona.model, currentMessages, persona.temperature ?? 0.7, TOOLS, false, channel.signal,
        )
        if (!fallback.toolCalls?.length) {
          fullContent = fallback.content
          if (fullContent) channel.send({ type: 'chunk', content: fullContent })
          break
        }
        await runToolCalls(fallback.content, fallback.toolCalls, currentMessages, conversationId, persona, channel)
        continue
      }

      if (!iter.toolCalls?.length) break

      await runToolCalls(iter.fullContent, iter.toolCalls, currentMessages, conversationId, persona, channel)
      fullContent = ''
    }
  } catch (err) {
    if (isAbortError(err) || channel.aborted) {
      aborted = true
      console.log(`[chat] aborted by client — keeping ${fullContent.length} chars`)
    } else {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      console.error(`[chat] error — ${msg}`)
      channel.send({ type: 'error', error: msg })
      return
    }
  }

  // Rien de généré et annulé : ne pas laisser de message vide derrière soi
  if (aborted && !fullContent.trim()) return

  const assistantMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'assistant' as const,
    content: fullContent,
    personaId,
    model: persona.model,
    tokensIn:  tokensIn  || null,
    tokensOut: tokensOut || null,
    createdAt: Date.now(),
  }
  db.insert(messages).values(assistantMessage).run()

  console.log(`[chat] done — ${fullContent.length} chars${aborted ? ' (partiel)' : ''}`)

  generateTitle(conversationId, persona.model, content)
  channel.send({ type: 'done', message: assistantMessage })
}

/** Persiste le message utilisateur et rafraîchit la conversation. */
function persistUserMessage(req: ChatRequest, persona: Persona) {
  const { conversationId, content, personaId, images, fileContext } = req

  // Le client peut renvoyer les images d'un message existant sous forme d'URL
  // (régénération, édition) : on les re-résout vers leur data URI stocké.
  // Les pages d'un PDF scanné rejoignent les images du message.
  const allImages = [
    ...(resolveImageRefs(images) ?? []),
    ...(fileContext?.mode === 'vision' ? (fileContext.images ?? []) : []),
  ]

  // Seul le texte saisi va dans `content` — les métadonnées fichier ont leur colonne
  const fileMeta = fileContext
    ? JSON.stringify([{ name: fileContext.name, mode: fileContext.mode, chars: fileContext.chars, truncated: fileContext.truncated }])
    : null

  const userMessage = {
    id: crypto.randomUUID(),
    conversationId,
    role: 'user' as const,
    content,
    images: allImages.length ? JSON.stringify(allImages) : null,
    files: fileMeta,
    personaId,
    model: persona.model,
    createdAt: Date.now(),
  }

  db.transaction(() => {
    db.insert(messages).values(userMessage).run()
    db.update(conversations)
      .set({ updatedAt: Date.now(), personaId })
      .where(eq(conversations.id, conversationId))
      .run()
  })

  return userMessage
}

/**
 * Persiste le tour d'outils et exécute chaque appel.
 *
 * L'assistant et les résultats sont sauvegardés pour que le tour suivant
 * retrouve le contexte complet après un rechargement.
 */
async function runToolCalls(
  assistantContent: string,
  toolCalls: OllamaToolCall[],
  currentMessages: OllamaMessage[],
  conversationId: string,
  persona: Persona,
  channel: SseChannel,
): Promise<void> {
  saveMessage({
    conversationId,
    role: 'assistant',
    content: assistantContent,
    personaId: persona.id,
    model: persona.model,
    toolCalls: JSON.stringify(toolCalls),
  })
  currentMessages.push({ role: 'assistant', content: assistantContent, tool_calls: toolCalls })

  for (const tc of toolCalls) {
    const result = await executeTool(tc, { send: channel.send, personaId: persona.id })
    currentMessages.push({ role: 'tool', content: result })
    saveMessage({ conversationId, role: 'tool', content: result })
  }
}
