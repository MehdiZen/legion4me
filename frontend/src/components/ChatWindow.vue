<template>
  <div ref="container" class="chat-window" @scroll.passive="onScroll">

    <!-- Empty state -->
    <div v-if="!convStore.active" class="empty-state">
      <div class="empty-glyph">⬡</div>
      <p class="empty-title">ASMODEUS</p>
      <p class="empty-sub">Sélectionne un persona puis commence une invocation</p>
    </div>

    <div v-else-if="convStore.messages.length === 0 && !convStore.isStreaming" class="empty-state">
      <div class="empty-glyph">◈</div>
      <p class="empty-title" v-if="personaStore.activePersona">{{ personaStore.activePersona.name }}</p>
      <p class="empty-sub">Invocation prête</p>
    </div>

    <!-- Messages -->
    <div v-else class="messages">
      <MessageBubble
        v-for="(msg, i) in displayMessages"
        :key="msg.id"
        :message="msg"
        :is-last="i === displayMessages.length - 1 && msg.role === 'assistant'"
        :editable="msg.role === 'user' && i === lastUserIndex"
      />
      <MessageBubble
        v-if="convStore.isStreaming"
        :message="streamingMsg"
        :is-streaming="true"
        :tool-status="councilStatus ?? convStore.toolStatus"
        :thinking="convStore.streamingThinking"
      />
      <div v-if="convStore.streamError" class="stream-error">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {{ convStore.streamError }}
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useConversationStore } from '@/stores/conversation'
import { usePersonaStore } from '@/stores/persona'
import MessageBubble from './MessageBubble.vue'

const convStore    = useConversationStore()
const personaStore = usePersonaStore()
const container    = ref<HTMLElement | null>(null)

const displayMessages = computed(() =>
  convStore.messages.filter(m => m.role === 'user' || (m.role === 'assistant' && !m.toolCalls))
)

const lastUserIndex = computed(() => {
  let last = -1
  displayMessages.value.forEach((m, i) => { if (m.role === 'user') last = i })
  return last
})

const streamingMsg = computed(() => {
  const council = convStore.councilStreaming
  const salon = convStore.salonStreaming
  const personaId = council?.personaId ?? salon?.personaId ?? personaStore.activePersona?.id ?? null
  const persona = personaId
    ? personaStore.personas.find(p => p.id === personaId) ?? personaStore.activePersona
    : personaStore.activePersona
  return {
    id:             '__streaming__',
    conversationId: convStore.active?.id ?? '',
    role:           'assistant' as const,
    content:        convStore.streamingContent,
    personaId,
    model:          persona?.model ?? null,
    createdAt:      Date.now(),
  }
})

const councilStatus = computed(() => {
  const c = convStore.councilStreaming
  if (c) return `Tour ${c.turn}/${c.totalTurns} — ${c.personaName}…`
  const s = convStore.salonStreaming
  if (s) return `Salon — ${s.personaName} répond…`
  return null
})

const userScrolled = ref(false)

function onScroll() {
  if (!container.value) return
  const { scrollTop, scrollHeight, clientHeight } = container.value
  userScrolled.value = scrollHeight - scrollTop - clientHeight > 80
}

function scrollBottom() {
  nextTick(() => {
    if (container.value && !userScrolled.value)
      container.value.scrollTop = container.value.scrollHeight
  })
}

function forceScrollBottom() {
  userScrolled.value = false
  nextTick(() => {
    if (container.value) container.value.scrollTop = container.value.scrollHeight
  })
}

onMounted(forceScrollBottom)

watch(() => convStore.messages.length,  scrollBottom)
watch(() => convStore.streamingContent, scrollBottom)
watch(() => convStore.active,           forceScrollBottom)
</script>

<style scoped>
.chat-window {
  flex: 1;
  overflow-y: auto;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

.messages {
  padding: 32px 0 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Stream error ── */
.stream-error {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 24px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  border-radius: var(--r);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--danger);
}

/* ── Empty state ── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
  text-align: center;
}

.empty-glyph {
  font-size: 36px;
  color: var(--text-3);
  line-height: 1;
  margin-bottom: 4px;
  animation: fadeIn 0.8s ease forwards;
}

[data-theme="grimoire"] .empty-glyph {
  text-shadow: 0 0 30px var(--accent-bg);
}

[data-theme="signal"] .empty-glyph {
  color: var(--accent);
  opacity: 0.3;
  font-size: 28px;
}

.empty-title {
  font-family: var(--font-brand);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.3em;
  color: var(--text-2);
  text-transform: uppercase;
  margin: 0;
}

[data-theme="signal"] .empty-title {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.25em;
}

.empty-sub {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-3);
  letter-spacing: 0.05em;
  margin: 0;
}

[data-theme="signal"] .empty-sub {
  font-family: var(--font-mono);
  font-size: 11px;
}
</style>
