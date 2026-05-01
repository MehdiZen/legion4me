<template>
  <div :class="['msg-row', isUser ? 'msg-row--user' : 'msg-row--asst', 'anim-fade-up']">

    <!-- ── Assistant ── -->
    <template v-if="!isUser">
      <div
        class="asst-sigil"
        :class="{ 'asst-sigil--emoji': !!persona?.emoji }"
        :style="persona?.emoji ? {} : { background: personaColor }"
      >
        {{ persona?.emoji || personaInitial }}
      </div>
      <div class="asst-body">
        <div class="asst-meta">
          <span class="meta-persona">{{ personaName }}</span>
          <span v-if="message.model" class="meta-sep">·</span>
          <span v-if="message.model" class="meta-model">{{ message.model }}</span>
        </div>
        <div class="asst-bubble">
          <ThinkingBlock v-if="thinking" :content="thinking" :is-streaming="isStreaming && !message.content" />
          <div v-if="toolStatus" class="tool-status">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="tool-spin">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 010 20"/>
            </svg>
            {{ toolStatus }}
          </div>
          <div
            class="prose-chat"
            :class="{ 'streaming-cursor': isStreaming && !message.content && !toolStatus }"
            v-html="renderedContent"
          />
          <span v-if="isStreaming && message.content" class="streaming-cursor" />
          <div v-if="isStreaming" class="stream-bar" />
          <div v-if="!isStreaming" class="msg-actions">
            <button class="msg-action-btn" @click="copy" :title="copied ? 'Copié !' : 'Copier'">
              <svg v-if="!copied" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
            <button v-if="isLast && !convStore.isStreaming" class="msg-action-btn" @click="convStore.regenerate()" title="Régénérer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
              </svg>
            </button>
            <span v-if="message.tokensIn || message.tokensOut" class="token-count">
              {{ message.tokensIn ?? '?' }} → {{ message.tokensOut ?? '?' }} tok
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- ── User ── -->
    <template v-else>
      <div class="user-wrap">
        <!-- Display mode -->
        <div
          v-if="!editing"
          class="user-bubble"
          :class="{ 'user-bubble--editable': props.editable && !convStore.isStreaming }"
          @click="props.editable && !convStore.isStreaming && startEdit()"
        >
          <!-- File chips -->
          <div v-if="message.files?.length" class="user-files">
            <div v-for="f in message.files" :key="f.name" class="user-file-chip">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>{{ f.name }}</span>
              <span v-if="f.mode === 'vision'" class="uf-mode">vision</span>
              <span v-else-if="f.chars" class="uf-size">{{ formatFileSize(f.chars) }}</span>
              <span v-if="f.truncated" class="uf-warn" title="Tronqué">⚠</span>
            </div>
          </div>
          <!-- Images (vision PDF = images shown, regular images shown only if no file chip) -->
          <div v-if="message.images?.length && !message.files?.some(f => f.mode === 'vision')" class="user-images">
            <img v-for="(img, i) in message.images" :key="i" :src="img" class="user-img" />
          </div>
          <p v-if="message.content?.trim()" class="user-text">{{ message.content }}</p>
        </div>

        <!-- Edit mode -->
        <div v-else class="edit-wrap">
          <textarea
            ref="editTextareaRef"
            v-model="editContent"
            class="user-bubble user-edit-textarea"
            @input="autoResizeEdit"
            @keydown.enter.exact.prevent="confirmEdit"
            @keydown.ctrl.enter.exact="insertNewline"
            @keydown.meta.enter.exact="insertNewline"
            @keydown.escape="cancelEdit"
            @blur="cancelEdit"
            rows="1"
          />
          <div class="edit-actions">
            <button class="edit-cancel-btn" @mousedown.prevent @click="cancelEdit">Annuler</button>
            <button class="edit-send-btn" @mousedown.prevent @click="confirmEdit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Renvoyer
            </button>
          </div>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { usePersonaStore } from '@/stores/persona'
import { useConversationStore } from '@/stores/conversation'
import type { Message } from '@/types'
import ThinkingBlock from './ThinkingBlock.vue'

const props = defineProps<{
  message: Message
  isStreaming?: boolean
  toolStatus?: string | null
  thinking?: string
  isLast?: boolean
  editable?: boolean
}>()

const convStore = useConversationStore()
const copied = ref(false)

function formatFileSize(chars: number): string {
  if (chars < 1000) return `${chars} car.`
  return `${(chars / 1000).toFixed(1)}k car.`
}
const editing = ref(false)
const editContent = ref('')
const editTextareaRef = ref<HTMLTextAreaElement | null>(null)

function startEdit() {
  editContent.value = props.message.content
  editing.value = true
  nextTick(() => {
    if (editTextareaRef.value) {
      editTextareaRef.value.focus()
      editTextareaRef.value.selectionStart = editTextareaRef.value.value.length
      autoResizeEdit()
    }
  })
}

function autoResizeEdit() {
  if (!editTextareaRef.value) return
  editTextareaRef.value.style.height = 'auto'
  editTextareaRef.value.style.height = `${editTextareaRef.value.scrollHeight}px`
}

function cancelEdit() {
  editing.value = false
}

function insertNewline() {
  const el = editTextareaRef.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  editContent.value = editContent.value.slice(0, start) + '\n' + editContent.value.slice(end)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + 1
    autoResizeEdit()
  })
}

async function confirmEdit() {
  const newContent = editContent.value.trim()
  if (!newContent) return
  editing.value = false
  await convStore.editAndRegenerate(props.message.id, newContent)
}

async function copy() {
  await navigator.clipboard.writeText(props.message.content)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

const personaStore = usePersonaStore()
const isUser       = computed(() => props.message.role === 'user')

const persona = computed(() =>
  props.message.personaId
    ? personaStore.personas.find(p => p.id === props.message.personaId)
    : personaStore.activePersona
)

const personaColor   = computed(() => persona.value?.color ?? 'var(--accent)')
const personaInitial = computed(() => persona.value?.name?.[0]?.toUpperCase() ?? '?')
const personaName    = computed(() => persona.value?.name ?? 'Assistant')

marked.setOptions({ breaks: true })

function injectCompactLists(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('ul').forEach(ul => {
    const items = Array.from(ul.querySelectorAll(':scope > li'))
    const allShort = items.every(li => (li.textContent ?? '').trim().length < 65)
    if (items.length > 2 && allShort)
      ul.classList.add(items.length > 5 ? 'ul-columns-3' : 'ul-columns')
  })
  return doc.body.innerHTML
}

const renderedContent = computed(() => {
  if (!props.message.content) return ''
  return DOMPurify.sanitize(injectCompactLists(marked(props.message.content) as string))
})
</script>

<style scoped>
.msg-row {
  display: flex;
  padding: 0 24px;
}

.msg-row--asst { align-items: flex-start; gap: 12px; justify-content: flex-start; }
.msg-row--user { justify-content: flex-end; }

/* ── User wrap ── */
.user-wrap { max-width: 72%; }

/* ── Sigil (assistant avatar) ── */
.asst-sigil {
  width: 30px;
  height: 30px;
  border-radius: var(--r);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-brand);
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.65);
  margin-top: 2px;
}

[data-theme="grimoire"] .asst-sigil {
  border-radius: 50%;
  width: 28px;
  height: 28px;
}

.asst-sigil--emoji {
  background: var(--s3) !important;
  border: 1px solid var(--border);
  font-size: 16px;
}

/* ── Assistant body ── */
.asst-body { flex: 1; min-width: 0; max-width: 820px; }

.asst-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
}

.meta-persona {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-2);
  letter-spacing: 0.05em;
}

[data-theme="signal"] .meta-persona {
  font-family: var(--font-brand);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.meta-sep   { color: var(--text-3); font-size: 10px; }

.meta-model {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
}

.asst-bubble {
  background: var(--asst-bg);
  border: 1px solid var(--asst-bd);
  border-radius: 3px var(--r-lg) var(--r-lg) var(--r-lg);
  padding: 14px 18px;
  position: relative;
  overflow: hidden;
}

[data-theme="signal"] .asst-bubble {
  border-radius: 0 var(--r) var(--r) var(--r);
  border-left: 2px solid var(--border);
}

/* ── Tool status ── */
.tool-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 10px;
  padding: 5px 8px;
  background: var(--s3);
  border-radius: var(--r);
  width: fit-content;
}

@keyframes tool-spin { to { transform: rotate(360deg); } }
.tool-spin { animation: tool-spin 1s linear infinite; color: var(--accent); }

/* ── Message actions ── */
.msg-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.15s;
}
.asst-bubble:hover .msg-actions { opacity: 1; }

.msg-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: var(--s3);
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}
.msg-action-btn:hover { color: var(--text); border-color: var(--border-hi); background: var(--s4); }

.token-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  align-self: center;
}

/* streaming bar at bottom */
.stream-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 100%;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: streamBar 1.8s ease-in-out infinite;
  transform-origin: left;
}

/* ── User bubble ── */
.user-bubble {
  width: 100%;
  background: var(--user-bg);
  border: 1px solid var(--user-bd);
  border-radius: var(--r-lg) 3px var(--r-lg) var(--r-lg);
  padding: 12px 16px;
}

[data-theme="signal"] .user-bubble {
  border-radius: var(--r) 0 var(--r) var(--r);
  border-right: 2px solid var(--accent);
}

/* ── File chips in bubble ── */
.user-files { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }

.user-file-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-radius: var(--r);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
  width: fit-content;
}
.uf-mode { color: var(--accent); text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
.uf-size { color: var(--text-3); }
.uf-warn { color: #f59e0b; }

.user-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.user-img {
  max-width: 260px;
  max-height: 200px;
  object-fit: cover;
  border-radius: var(--r);
  display: block;
}

.user-text {
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.50;
  color: var(--text);
  white-space: pre-wrap;
  margin: 0;
}

/* ── Edit mode ── */
.user-bubble--editable { cursor: text; }
.user-bubble--editable:hover { border-color: var(--border-hi); }

.user-edit-textarea {
  width: 100%;
  min-height: 0;
  border-color: var(--accent);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.50;
  resize: none;
  outline: none;
  box-sizing: border-box;
  overflow: hidden;
}

.edit-wrap { display: flex; flex-direction: column; gap: 6px; width: 100%; }

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.edit-cancel-btn {
  padding: 5px 12px;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: none;
  color: var(--text-3);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.edit-cancel-btn:hover { color: var(--text); border-color: var(--border-hi); }

.edit-send-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: var(--r);
  border: 1px solid var(--accent-bd);
  background: var(--accent-bg);
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.edit-send-btn:hover { background: rgba(200, 164, 90, 0.15); border-color: var(--accent); }
</style>
