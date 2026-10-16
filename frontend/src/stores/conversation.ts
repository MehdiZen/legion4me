import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Conversation, Message } from '@/types'
import { usePersonaStore } from '@/stores/persona'
import { api, stream, type StreamEvent } from '@/lib/api'

const LAST_CONV_KEY = 'legion4me:lastConversationId'
const TITLE_POLL_DELAY_MS = 3000

const TOOL_LABELS: Record<string, (e: StreamEvent) => string> = {
  web_search:         e => `Recherche : ${e.query}…`,
  fetch_url:          e => `Lecture de ${e.url}…`,
  get_datetime:       () => 'Récupération de la date…',
  youtube_transcript: () => 'Transcription YouTube…',
  wikipedia:          e => `Wikipedia : ${e.query}…`,
  save_memory:        () => 'Mémorisation…',
}

export const useConversationStore = defineStore('conversation', () => {
  const conversations = ref<Conversation[]>([])
  const active = ref<Conversation | null>(null)
  const messages = ref<Message[]>([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const streamingThinking = ref('')
  const toolStatus = ref<string | null>(null)
  const streamError = ref<string | null>(null)
  const councilStreaming = ref<{ personaId: string; personaName: string; turn: number; totalTurns: number } | null>(null)
  const councilPaused = ref<{ question: string; questionPersonaId: string; questionPersonaName: string; resumeState: object } | null>(null)
  const salonStreaming = ref<{ personaId: string; personaName: string } | null>(null)
  let streamAbort: AbortController | null = null

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Enveloppe commune à tous les flux : réinitialise l'état, gère l'abort et
   * garantit la remise à zéro en sortie, quelle que soit l'issue.
   */
  async function runStream(
    path: string,
    body: unknown,
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    isStreaming.value = true
    streamingContent.value = ''
    streamingThinking.value = ''
    streamError.value = null

    const convId = active.value?.id
    try {
      streamAbort = new AbortController()
      await stream(path, body, onEvent, streamAbort.signal)
    } catch (err) {
      streamError.value = err instanceof Error ? err.message : 'Erreur réseau'
      console.error('[LEGION4ME] stream error:', err)
    } finally {
      const wasAborted = streamAbort?.signal.aborted ?? false
      isStreaming.value = false
      streamingContent.value = ''
      streamingThinking.value = ''
      toolStatus.value = null
      councilStreaming.value = null
      salonStreaming.value = null
      streamAbort = null

      // Après un Stop, le serveur a conservé ce qui avait été généré :
      // on resynchronise pour afficher la réponse partielle.
      if (wasAborted && convId && active.value?.id === convId) {
        try {
          messages.value = await api.get<Message[]>(`/conversations/${convId}/messages`)
        } catch {
          // resync best-effort
        }
      }
    }
  }

  /** Marque la conversation comme fraîche et récupère le titre auto-généré. */
  function touchConversation(convId: string) {
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    conv.updatedAt = Date.now()

    // Le titre est généré en tâche de fond côté serveur : on le récupère une
    // seule fois, et on met à jour localement plutôt que de recharger la liste.
    if (conv.title && conv.title !== '…') return
    setTimeout(async () => {
      try {
        const all = await api.get<Conversation[]>('/conversations')
        const updated = all.find(c => c.id === convId)
        if (updated?.title && updated.title !== '…') conv.title = updated.title
      } catch {
        // titre non critique — on laisse tel quel
      }
    }, TITLE_POLL_DELAY_MS)
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async function fetchConversations() {
    conversations.value = await api.get<Conversation[]>('/conversations')
    const lastId = localStorage.getItem(LAST_CONV_KEY)
    if (lastId && !active.value) {
      const conv = conversations.value.find(c => c.id === lastId)
      if (conv) await selectConversation(conv)
    }
  }

  async function createConversation(personaId: string): Promise<Conversation> {
    const conv = await api.post<Conversation>('/conversations', { personaId })
    conversations.value.unshift(conv)
    return conv
  }

  async function selectConversation(conv: Conversation) {
    active.value = conv
    localStorage.setItem(LAST_CONV_KEY, conv.id)
    // Restore the persona associated with this conversation
    const personaStore = usePersonaStore()
    if (conv.personaId) {
      const persona = personaStore.personas.find(p => p.id === conv.personaId)
      personaStore.setActivePersona(persona ?? null)
    } else {
      personaStore.setActivePersona(null)
    }
    messages.value = await api.get<Message[]>(`/conversations/${conv.id}/messages`)
    streamingContent.value = ''
    isStreaming.value = false
  }

  async function deleteConversation(id: string) {
    await api.del(`/conversations/${id}`)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (active.value?.id === id) {
      active.value = null
      messages.value = []
    }
  }

  async function togglePin(conv: Conversation) {
    const newPinned = conv.pinned ? 0 : 1
    await api.patch(`/conversations/${conv.id}`, { pinned: newPinned === 1 })
    conv.pinned = newPinned
    // Re-sort: pinned first, then by updatedAt
    conversations.value.sort((a, b) => {
      if ((b.pinned ?? 0) !== (a.pinned ?? 0)) return (b.pinned ?? 0) - (a.pinned ?? 0)
      return b.updatedAt - a.updatedAt
    })
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  async function sendMessage(
    content: string,
    personaId: string,
    images?: string[],
    fileContext?: { name: string; mode: 'text' | 'vision'; content?: string; images?: string[]; truncated: boolean; chars: number },
  ) {
    if (!active.value || isStreaming.value) return
    const convId = active.value.id

    // Keep conversation linked to the last used persona
    if (active.value.personaId !== personaId) {
      active.value.personaId = personaId
      const convInList = conversations.value.find(c => c.id === convId)
      if (convInList) convInList.personaId = personaId
    }

    // Optimistic user message — shown immediately, replaced by the real one from the backend
    const optimisticId = `optimistic-${Date.now()}`
    messages.value.push({
      id: optimisticId,
      conversationId: convId,
      role: 'user',
      content,
      images: images ?? null,
      createdAt: Date.now(),
    })

    await runStream('/chat/stream', { conversationId: convId, content, personaId, images, fileContext }, (event) => {
      switch (event.type) {
        case 'user_message': {
          const idx = messages.value.findIndex(m => m.id === optimisticId)
          if (idx !== -1) messages.value.splice(idx, 1, event.message as Message)
          else messages.value.push(event.message as Message)
          break
        }
        case 'thinking':
          streamingThinking.value += event.content as string
          break
        case 'chunk':
          streamingContent.value += event.content as string
          break
        case 'tool_call':
          toolStatus.value = TOOL_LABELS[event.tool as string]?.(event) ?? `${event.tool}…`
          break
        case 'done':
          messages.value.push(event.message as Message)
          streamingContent.value = ''
          touchConversation(convId)
          break
        case 'error':
          streamError.value = (event.error as string) ?? 'Erreur inconnue'
          console.error('[LEGION4ME] Stream error:', event.error)
          break
      }
    })
  }

  async function editAndRegenerate(messageId: string, newContent: string) {
    if (!active.value || isStreaming.value) return
    const personaStore = usePersonaStore()
    if (!personaStore.activePersona) return

    // Find the target message index
    const idx = messages.value.findIndex(m => m.id === messageId)
    if (idx === -1) return

    // Delete from that message onwards (in DB)
    const convId = active.value.id
    const toDelete = messages.value.slice(idx)
    await Promise.all(
      toDelete.map(m => api.del(`/conversations/${convId}/messages/${m.id}`)),
    )
    messages.value = messages.value.slice(0, idx)

    const originalMsg = toDelete[0]
    await sendMessage(newContent, personaStore.activePersona.id, originalMsg?.images ?? undefined)
  }

  async function regenerate() {
    if (!active.value || isStreaming.value) return
    const personaStore = usePersonaStore()
    if (!personaStore.activePersona) return

    // Find last user message and last assistant message
    const lastUser = messages.value.filter(m => m.role === 'user').at(-1)
    if (!lastUser) return

    // Delete all messages after (and including) the last assistant response
    const lastAssistant = messages.value.filter(m => m.role === 'assistant').at(-1)
    if (lastAssistant) {
      await api.del(`/conversations/${active.value.id}/messages/${lastAssistant.id}`)
      messages.value = messages.value.filter(m => m.id !== lastAssistant.id)
    }

    await sendMessage(lastUser.content, personaStore.activePersona.id, lastUser.images ?? undefined)
  }

  function stopStreaming() {
    streamAbort?.abort()
    streamAbort = null
  }

  // ── Conseil ────────────────────────────────────────────────────────────────

  /** Gestionnaire commun au démarrage et à la reprise d'un conseil. */
  function councilHandler(convId: string) {
    return (event: StreamEvent) => {
      switch (event.type) {
        case 'user_message':
          messages.value.push(event.message as Message)
          break
        case 'council_turn':
          streamingContent.value = ''
          councilStreaming.value = {
            personaId:   event.personaId as string,
            personaName: event.personaName as string,
            turn:        event.turn as number,
            totalTurns:  event.totalTurns as number,
          }
          break
        case 'chunk':
          streamingContent.value += event.content as string
          break
        case 'council_message':
          messages.value.push(event.message as Message)
          streamingContent.value = ''
          break
        case 'council_pause':
          streamingContent.value = ''
          councilStreaming.value = null
          councilPaused.value = {
            question:           event.question as string,
            questionPersonaId:  event.questionPersonaId as string,
            questionPersonaName: event.questionPersonaName as string,
            resumeState:        event.resumeState as object,
          }
          break
        case 'done':
          touchConversation(convId)
          break
        case 'error':
          streamError.value = (event.error as string) ?? 'Erreur inconnue'
          break
      }
    }
  }

  async function startCouncil(content: string, personaIds: string[], turns: number, images?: string[]) {
    if (!active.value || isStreaming.value) return
    const convId = active.value.id
    councilStreaming.value = null
    await runStream(
      '/chat/council',
      { conversationId: convId, content, personaIds, turns, images },
      councilHandler(convId),
    )
  }

  async function resumeCouncil(userAnswer: string) {
    if (!active.value || isStreaming.value || !councilPaused.value) return
    const convId = active.value.id
    const pausedState = councilPaused.value
    councilPaused.value = null
    await runStream(
      '/chat/council/resume',
      { conversationId: convId, userAnswer, resumeState: pausedState.resumeState },
      councilHandler(convId),
    )
  }

  // ── Salon ──────────────────────────────────────────────────────────────────

  async function startSalon(content: string, personaIds: string[], images?: string[]) {
    if (!active.value || isStreaming.value) return
    const convId = active.value.id
    salonStreaming.value = null

    // Optimistically mark the conversation as salon so the watch in MessageInput doesn't reset
    active.value.mode = 'salon'
    active.value.salonPersonaIds = personaIds
    const convInList = conversations.value.find(c => c.id === convId)
    if (convInList) { convInList.mode = 'salon'; convInList.salonPersonaIds = personaIds }

    await runStream('/chat/salon', { conversationId: convId, content, personaIds, images }, (event) => {
      switch (event.type) {
        case 'user_message':
          messages.value.push(event.message as Message)
          break
        case 'salon_turn':
          streamingContent.value = ''
          salonStreaming.value = {
            personaId:   event.personaId as string,
            personaName: event.personaName as string,
          }
          break
        case 'chunk':
          streamingContent.value += event.content as string
          break
        case 'salon_message':
          messages.value.push(event.message as Message)
          streamingContent.value = ''
          break
        case 'done':
          touchConversation(convId)
          break
        case 'error':
          streamError.value = (event.error as string) ?? 'Erreur inconnue'
          break
      }
    })
  }

  return {
    conversations,
    active,
    messages,
    isStreaming,
    streamingContent,
    streamingThinking,
    toolStatus,
    streamError,
    councilStreaming,
    councilPaused,
    salonStreaming,
    fetchConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    sendMessage,
    startCouncil,
    resumeCouncil,
    startSalon,
    stopStreaming,
    togglePin,
    regenerate,
    editAndRegenerate,
  }
})
