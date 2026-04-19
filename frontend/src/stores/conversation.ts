import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Conversation, Message } from '@/types'
import { usePersonaStore } from '@/stores/persona'

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

  const LAST_CONV_KEY = 'asmodeus:lastConversationId'

  async function fetchConversations() {
    const res = await fetch('/api/conversations')
    conversations.value = await res.json()
    const lastId = localStorage.getItem(LAST_CONV_KEY)
    if (lastId && !active.value) {
      const conv = conversations.value.find(c => c.id === lastId)
      if (conv) await selectConversation(conv)
    }
  }

  async function createConversation(personaId: string): Promise<Conversation> {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId }),
    })
    const conv: Conversation = await res.json()
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
    const res = await fetch(`/api/conversations/${conv.id}/messages`)
    messages.value = await res.json()
    streamingContent.value = ''
    isStreaming.value = false
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (active.value?.id === id) {
      active.value = null
      messages.value = []
    }
  }

  async function sendMessage(content: string, personaId: string, images?: string[], fileContext?: { name: string; mode: 'text' | 'vision'; content?: string; images?: string[]; truncated: boolean; chars: number }) {
    if (!active.value || isStreaming.value) return

    isStreaming.value = true
    streamingContent.value = ''
    streamingThinking.value = ''
    streamError.value = null

    // Keep conversation linked to the last used persona
    if (active.value.personaId !== personaId) {
      active.value.personaId = personaId
      const convInList = conversations.value.find(c => c.id === active.value?.id)
      if (convInList) convInList.personaId = personaId
    }

    // Optimistic user message — shown immediately, replaced by the real one from the backend
    const optimisticId = `optimistic-${Date.now()}`
    messages.value.push({
      id: optimisticId,
      conversationId: active.value.id,
      role: 'user',
      content,
      images: images ?? null,
      createdAt: Date.now(),
    })

    try {
      streamAbort = new AbortController()
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: active.value.id, content, personaId, images, fileContext }),
        signal: streamAbort.signal,
      })

      if (!response.body) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'user_message') {
              const idx = messages.value.findIndex(m => m.id === optimisticId)
              if (idx !== -1) messages.value.splice(idx, 1, event.message)
              else messages.value.push(event.message)
            } else if (event.type === 'thinking') {
              streamingThinking.value += event.content
            } else if (event.type === 'chunk') {
              streamingContent.value += event.content
            } else if (event.type === 'done') {
              messages.value.push(event.message)
              streamingContent.value = ''
              const conv = conversations.value.find(c => c.id === active.value?.id)
              if (conv) {
                conv.updatedAt = Date.now()
                // If title was just generated (came back as '…' sentinel or empty), poll once
                if (!conv.title || conv.title === '…') {
                  setTimeout(async () => {
                    const r = await fetch(`/api/conversations`)
                    const updated = (await r.json() as typeof conversations.value).find(c => c.id === conv.id)
                    if (updated?.title && updated.title !== '…') conv.title = updated.title
                  }, 3000)
                }
              }
            } else if (event.type === 'tool_call') {
              const toolLabels: Record<string, string> = {
                web_search: `Recherche : ${event.query}…`,
                fetch_url: `Lecture de ${event.url}…`,
                get_datetime: `Récupération de la date…`,
                youtube_transcript: `Transcription YouTube…`,
                wikipedia: `Wikipedia : ${event.query}…`,
              }
              toolStatus.value = toolLabels[event.tool] ?? `${event.tool}…`
            } else if (event.type === 'error') {
              streamError.value = event.error ?? 'Erreur inconnue'
              console.error('[ASMODEUS] Stream error:', event.error)
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      streamError.value = err instanceof Error ? err.message : 'Erreur réseau'
      console.error('[ASMODEUS] sendMessage error:', err)
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
      streamingThinking.value = ''
      toolStatus.value = null
    }
  }

  async function editAndRegenerate(messageId: string, newContent: string) {
    if (!active.value || isStreaming.value) return
    const personaStore = usePersonaStore()
    if (!personaStore.activePersona) return

    // Find the target message index
    const idx = messages.value.findIndex(m => m.id === messageId)
    if (idx === -1) return

    // Delete from that message onwards (in DB)
    const toDelete = messages.value.slice(idx)
    await Promise.all(
      toDelete.map(m =>
        fetch(`/api/conversations/${active.value!.id}/messages/${m.id}`, { method: 'DELETE' })
      )
    )
    messages.value = messages.value.slice(0, idx)

    const originalMsg = toDelete[0]
    await sendMessage(newContent, personaStore.activePersona.id, originalMsg?.images ?? undefined)
  }

  function stopStreaming() {
    streamAbort?.abort()
    streamAbort = null
  }

  async function togglePin(conv: Conversation) {
    const newPinned = conv.pinned ? 0 : 1
    await fetch(`/api/conversations/${conv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: newPinned === 1 }),
    })
    conv.pinned = newPinned
    // Re-sort: pinned first, then by updatedAt
    conversations.value.sort((a, b) => {
      if ((b.pinned ?? 0) !== (a.pinned ?? 0)) return (b.pinned ?? 0) - (a.pinned ?? 0)
      return b.updatedAt - a.updatedAt
    })
  }

  async function startCouncil(content: string, personaIds: string[], turns: number, images?: string[]) {
    if (!active.value || isStreaming.value) return

    isStreaming.value = true
    streamingContent.value = ''
    streamingThinking.value = ''
    streamError.value = null
    councilStreaming.value = null

    try {
      streamAbort = new AbortController()
      const response = await fetch('/api/chat/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: active.value.id, content, personaIds, turns, images }),
        signal: streamAbort.signal,
      })

      if (!response.body) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'user_message') {
              messages.value.push(event.message)
            } else if (event.type === 'council_turn') {
              streamingContent.value = ''
              councilStreaming.value = {
                personaId: event.personaId,
                personaName: event.personaName,
                turn: event.turn,
                totalTurns: event.totalTurns,
              }
            } else if (event.type === 'chunk') {
              streamingContent.value += event.content
            } else if (event.type === 'council_message') {
              messages.value.push(event.message)
              streamingContent.value = ''
            } else if (event.type === 'council_pause') {
              streamingContent.value = ''
              councilStreaming.value = null
              councilPaused.value = {
                question: event.question,
                questionPersonaId: event.questionPersonaId,
                questionPersonaName: event.questionPersonaName,
                resumeState: event.resumeState,
              }
            } else if (event.type === 'done') {
              const conv = conversations.value.find(c => c.id === active.value?.id)
              if (conv && !conv.title) {
                await fetchConversations()
              } else if (conv) {
                conv.updatedAt = Date.now()
              }
            } else if (event.type === 'error') {
              streamError.value = event.error ?? 'Erreur inconnue'
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      streamError.value = err instanceof Error ? err.message : 'Erreur réseau'
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
      councilStreaming.value = null
      toolStatus.value = null
    }
  }

  async function resumeCouncil(userAnswer: string) {
    if (!active.value || isStreaming.value || !councilPaused.value) return

    const pausedState = councilPaused.value
    councilPaused.value = null
    isStreaming.value = true
    streamingContent.value = ''
    streamError.value = null

    try {
      streamAbort = new AbortController()
      const response = await fetch('/api/chat/council/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: active.value.id, userAnswer, resumeState: pausedState.resumeState }),
        signal: streamAbort.signal,
      })

      if (!response.body) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'user_message') {
              messages.value.push(event.message)
            } else if (event.type === 'council_turn') {
              streamingContent.value = ''
              councilStreaming.value = { personaId: event.personaId, personaName: event.personaName, turn: event.turn, totalTurns: event.totalTurns }
            } else if (event.type === 'chunk') {
              streamingContent.value += event.content
            } else if (event.type === 'council_message') {
              messages.value.push(event.message)
              streamingContent.value = ''
            } else if (event.type === 'council_pause') {
              streamingContent.value = ''
              councilStreaming.value = null
              councilPaused.value = { question: event.question, questionPersonaId: event.questionPersonaId, questionPersonaName: event.questionPersonaName, resumeState: event.resumeState }
            } else if (event.type === 'done') {
              const conv = conversations.value.find(c => c.id === active.value?.id)
              if (conv) conv.updatedAt = Date.now()
            } else if (event.type === 'error') {
              streamError.value = event.error ?? 'Erreur inconnue'
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      streamError.value = err instanceof Error ? err.message : 'Erreur réseau'
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
      councilStreaming.value = null
      toolStatus.value = null
    }
  }

  async function startSalon(content: string, personaIds: string[], images?: string[]) {
    if (!active.value || isStreaming.value) return

    isStreaming.value = true
    streamingContent.value = ''
    streamError.value = null
    salonStreaming.value = null

    // Optimistically mark the conversation as salon so the watch in MessageInput doesn't reset
    active.value.mode = 'salon'
    active.value.salonPersonaIds = personaIds
    const convInList = conversations.value.find(c => c.id === active.value?.id)
    if (convInList) { convInList.mode = 'salon'; convInList.salonPersonaIds = personaIds }

    try {
      streamAbort = new AbortController()
      const response = await fetch('/api/chat/salon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: active.value.id, content, personaIds, images }),
        signal: streamAbort.signal,
      })

      if (!response.body) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'user_message') {
              messages.value.push(event.message)
            } else if (event.type === 'salon_turn') {
              streamingContent.value = ''
              salonStreaming.value = { personaId: event.personaId, personaName: event.personaName }
            } else if (event.type === 'chunk') {
              streamingContent.value += event.content
            } else if (event.type === 'salon_message') {
              messages.value.push(event.message)
              streamingContent.value = ''
            } else if (event.type === 'done') {
              const conv = conversations.value.find(c => c.id === active.value?.id)
              if (conv) {
                conv.updatedAt = Date.now()
                if (!conv.title) {
                  setTimeout(async () => {
                    const r = await fetch('/api/conversations')
                    const updated = (await r.json() as typeof conversations.value).find(c => c.id === conv.id)
                    if (updated?.title) conv.title = updated.title
                  }, 3000)
                }
              }
            } else if (event.type === 'error') {
              streamError.value = event.error ?? 'Erreur inconnue'
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      streamError.value = err instanceof Error ? err.message : 'Erreur réseau'
    } finally {
      isStreaming.value = false
      streamingContent.value = ''
      salonStreaming.value = null
    }
  }

  async function regenerate() {
    if (!active.value || isStreaming.value) return
    const personaStore = usePersonaStore()
    if (!personaStore.activePersona) return

    // Find last user message and last assistant message
    const userMsgs = messages.value.filter(m => m.role === 'user')
    const lastUser = userMsgs.at(-1)
    if (!lastUser) return

    // Delete all messages after (and including) the last assistant response
    const lastAssistant = messages.value.filter(m => m.role === 'assistant').at(-1)
    if (lastAssistant) {
      await fetch(`/api/conversations/${active.value.id}/messages/${lastAssistant.id}`, { method: 'DELETE' })
      messages.value = messages.value.filter(m => m.id !== lastAssistant.id)
    }

    await sendMessage(lastUser.content, personaStore.activePersona.id, lastUser.images ?? undefined)
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
