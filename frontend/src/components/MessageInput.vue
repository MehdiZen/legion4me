<template>
  <div class="input-zone">
    <!-- File loading / error -->
    <div v-if="fileLoading" class="file-status">Lecture du fichier…</div>
    <div v-if="fileError" class="file-status file-status--error">{{ fileError }}</div>

    <!-- Council pause banner -->
    <div v-if="convStore.councilPaused" class="council-pause-banner">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span><strong>{{ convStore.councilPaused.questionPersonaName }}</strong> demande : {{ convStore.councilPaused.question }}</span>
    </div>

    <!-- Salon panel -->
    <div v-if="salonMode" class="council-panel">
      <span class="council-label">Salon</span>
      <div class="council-members">
        <div v-for="(_, i) in salonPersonaIds" :key="i" class="council-member-row">
          <select v-model="salonPersonaIds[i]" class="council-select">
            <option v-for="p in personaStore.personas" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button v-if="salonPersonaIds.length > 2" class="council-remove-btn" @click="removeSalonMember(i)" title="Retirer">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <button v-if="salonPersonaIds.length < 6" class="council-add-btn" @click="addSalonMember">+ Participant</button>
      </div>
      <span class="council-label salon-routing-hint">routage auto</span>
    </div>

    <!-- Council panel -->
    <div v-if="councilMode && !convStore.councilPaused" class="council-panel">
      <span class="council-label">Conseil</span>
      <div class="council-members">
        <div v-for="(_, i) in councilPersonaIds" :key="i" class="council-member-row">
          <select v-model="councilPersonaIds[i]" class="council-select">
            <option v-for="p in personaStore.personas" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button v-if="councilPersonaIds.length > 2" class="council-remove-btn" @click="removeCouncilMember(i)" title="Retirer">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <button v-if="councilPersonaIds.length < 4" class="council-add-btn" @click="addCouncilMember">+ Participant</button>
      </div>
      <div class="council-turns">
        <button
          v-for="n in [2,3,4,5,6]" :key="n"
          class="council-turn-btn"
          :class="{ active: councilTurns === n }"
          @click="councilTurns = n"
        >{{ n }}</button>
      </div>
    </div>

    <!-- Image previews -->
    <div v-if="attachedImages.length || attachedFile" class="image-previews">
      <div v-for="(img, i) in attachedImages" :key="i" class="preview-item">
        <img :src="img" class="preview-thumb" />
        <button class="preview-remove" @click="removeImage(i)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <!-- File chip -->
      <div v-if="attachedFile" class="file-chip">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="file-chip-name">{{ attachedFile.name }}</span>
        <span v-if="attachedFile.mode === 'vision'" class="file-chip-mode">vision</span>
        <span v-if="attachedFile.truncated" class="file-chip-warn" title="Tronqué à 30 000 caractères">⚠</span>
        <span v-if="attachedFile.chars" class="file-chip-size">{{ formatSize(attachedFile.chars) }}</span>
        <button class="preview-remove" @click="attachedFile = null">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <div
      class="input-wrap"
      :class="{ focused, disabled: !canSend, 'drag-over': dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <!-- Council button -->
      <button
        class="file-btn council-btn"
        :class="{ 'council-btn--active': councilMode }"
        @click="toggleCouncil"
        :disabled="personaStore.personas.length < 2 || convStore.isStreaming"
        title="Mode Conseil"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="7" r="4"/><circle cx="17" cy="7" r="4"/>
          <path d="M2 21v-2a7 7 0 0 1 7-7h6a7 7 0 0 1 7 7v2"/>
        </svg>
      </button>
      <!-- Salon button -->
      <button
        class="file-btn council-btn"
        :class="{ 'council-btn--active': salonMode }"
        @click="toggleSalon"
        :disabled="personaStore.personas.length < 2 || convStore.isStreaming"
        title="Mode Salon"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </button>
      <!-- File button -->
      <button class="file-btn" @click="fileInputRef?.click()" :disabled="!canSend" title="Joindre un fichier">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>
      <input ref="fileInputRef" type="file" class="file-input-hidden" @change="onFileInput" accept=".pdf,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.c,.cpp,.html,.css,.yaml,.yml,.toml,.sh" />
      <!-- @mention suggestions -->
      <div v-if="atMentionSuggestions.length" class="at-suggestions">
        <button
          v-for="(p, i) in atMentionSuggestions"
          :key="p.id"
          class="at-suggestion"
          :class="{ active: i === atMentionIndex }"
          @mousedown.prevent="selectMention(p.name)"
        >{{ p.name }}</button>
      </div>
      <textarea
        ref="textareaRef"
        v-model="input"
        @keydown="onKeydown"
        @input="onTextareaInput"
        @focus="focused = true"
        @blur="onBlur"
        @paste="onPaste"
        :disabled="!canSend"
        :placeholder="placeholder"
        rows="1"
        class="msg-textarea"
      />
      <button
        v-if="convStore.isStreaming"
        @click="convStore.stopStreaming()"
        class="send-btn stop-btn"
        title="Arrêter"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
      </button>
      <button
        v-else
        @click="send"
        :disabled="!canSend || (!input.trim() && !attachedImages.length)"
        class="send-btn"
        :class="{ 'has-text': !!input.trim() || attachedImages.length > 0 }"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
    <div class="input-hint">
      <span>↵ Envoyer</span>
      <span>⌃↵ Nouvelle ligne</span>
      <span>Coller une image avec ⌘V / Ctrl+V</span>
      <span v-if="convStore.active?.sizeBytes != null" class="hint-size">{{ formatConvSize(convStore.active.sizeBytes) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { usePersonaStore } from '@/stores/persona'
import { useConversationStore } from '@/stores/conversation'
import { api } from '@/lib/api'

const personaStore = usePersonaStore()
const convStore    = useConversationStore()

const input          = ref('')
const textareaRef    = ref<HTMLTextAreaElement | null>(null)
const fileInputRef   = ref<HTMLInputElement | null>(null)
const focused        = ref(false)
const dragOver       = ref(false)
const attachedImages = ref<string[]>([])
const attachedFile   = ref<{ name: string; mode: 'text' | 'vision'; content?: string; images?: string[]; truncated: boolean; chars: number } | null>(null)
const fileLoading    = ref(false)
const fileError      = ref<string | null>(null)

// Council mode
const councilMode       = ref(false)
const councilPersonaIds = ref<string[]>([])
const councilTurns      = ref(3)

function toggleCouncil() {
  councilMode.value = !councilMode.value
  if (councilMode.value) {
    salonMode.value = false
    const all = personaStore.personas
    const firstId = personaStore.activePersona?.id ?? all[0]?.id ?? ''
    const secondId = all.find(p => p.id !== firstId)?.id ?? ''
    councilPersonaIds.value = [firstId, secondId].filter(Boolean)
  }
}

// Salon mode
const salonMode       = ref(false)
const salonPersonaIds = ref<string[]>([])

// @mention autocomplete
const atMentionQuery = ref<string | null>(null)
const atMentionIndex = ref(0)

const atMentionSuggestions = computed(() => {
  if (!salonMode.value || atMentionQuery.value === null) return []
  const q = atMentionQuery.value.toLowerCase()
  return salonPersonaIds.value
    .map(id => personaStore.personas.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.name.toLowerCase().includes(q))
})

function detectAtMention() {
  const el = textareaRef.value
  if (!el || !salonMode.value) { atMentionQuery.value = null; return }
  const before = input.value.slice(0, el.selectionStart)
  const match = before.match(/(?:^|\s)@(\S*)$/)
  if (match) {
    atMentionQuery.value = match[1]
    atMentionIndex.value = 0
  } else {
    atMentionQuery.value = null
  }
}

function selectMention(name: string) {
  const el = textareaRef.value
  if (!el) return
  const cursor = el.selectionStart
  const before = input.value.slice(0, cursor)
  const after = input.value.slice(cursor)
  const newBefore = before.replace(/(@\S*)$/, `@${name} `)
  input.value = newBefore + after
  atMentionQuery.value = null
  nextTick(() => {
    el.selectionStart = el.selectionEnd = newBefore.length
    resize()
  })
}

function toggleSalon() {
  salonMode.value = !salonMode.value
  if (salonMode.value) {
    councilMode.value = false
    const all = personaStore.personas
    const firstId = personaStore.activePersona?.id ?? all[0]?.id ?? ''
    const secondId = all.find(p => p.id !== firstId)?.id ?? ''
    salonPersonaIds.value = [firstId, secondId].filter(Boolean)
  }
}

function addSalonMember() {
  const available = personaStore.personas.find(p => !salonPersonaIds.value.includes(p.id))
  salonPersonaIds.value.push(available?.id ?? personaStore.personas[0]?.id ?? '')
}

function removeSalonMember(index: number) {
  salonPersonaIds.value.splice(index, 1)
}

// Restore salon mode when switching to a salon conversation
watch(() => convStore.active?.id, () => {
  const conv = convStore.active
  if (conv?.mode === 'salon' && conv.salonPersonaIds?.length) {
    salonMode.value = true
    councilMode.value = false
    salonPersonaIds.value = [...conv.salonPersonaIds]
  } else if (!conv || conv.mode !== 'salon') {
    salonMode.value = false
  }
})

function addCouncilMember() {
  const available = personaStore.personas.find(p => !councilPersonaIds.value.includes(p.id))
  councilPersonaIds.value.push(available?.id ?? personaStore.personas[0]?.id ?? '')
}

function removeCouncilMember(index: number) {
  councilPersonaIds.value.splice(index, 1)
}

function formatSize(chars: number): string {
  if (chars < 1000) return `${chars} car.`
  return `${(chars / 1000).toFixed(1)}k car.`
}

function formatConvSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function extractFile(file: File) {
  fileLoading.value = true
  fileError.value = null
  try {
    const reader = new FileReader()
    const base64 = await new Promise<string>((resolve) => {
      reader.onload = (e) => resolve((e.target?.result as string).split(',')[1])
      reader.readAsDataURL(file)
    })
    const data = await api.post<{ mode: 'text' | 'vision'; content?: string; images?: string[]; truncated: boolean; chars: number }>(
      '/chat/extract-file',
      { name: file.name, base64, mimeType: file.type || 'text/plain' },
    )
    attachedFile.value = { name: file.name, ...data }
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : 'Erreur inconnue'
  } finally {
    fileLoading.value = false
  }
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) extractFile(file)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (!file) return
  if (file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (ev) => { if (ev.target?.result) attachedImages.value.push(ev.target.result as string) }
    reader.readAsDataURL(file)
  } else {
    extractFile(file).catch(console.error)
  }
}

const canSend = computed(() => {
  if (!convStore.active || convStore.isStreaming) return false
  if (convStore.councilPaused) return true
  if (councilMode.value) return councilPersonaIds.value.length >= 2 && new Set(councilPersonaIds.value).size === councilPersonaIds.value.length
  if (salonMode.value) return salonPersonaIds.value.length >= 2 && new Set(salonPersonaIds.value).size === salonPersonaIds.value.length
  return !!personaStore.activePersona
})

const placeholder = computed(() => {
  if (!convStore.active) return 'Crée une invocation…'
  if (convStore.councilPaused) return `Répondre au conseil…`
  if (councilMode.value) return 'Sujet à délibérer…'
  if (salonMode.value) return 'Message au salon… (@Persona pour forcer une réponse)'
  if (!personaStore.activePersona) return 'Sélectionne un persona…'
  return 'Message…'
})

function insertNewline() {
  const el = textareaRef.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  input.value = input.value.slice(0, start) + '\n' + input.value.slice(end)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + 1
    resize()
  })
}

function resize() {
  nextTick(() => {
    if (!textareaRef.value) return
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 160)}px`
  })
}

function onTextareaInput() {
  resize()
  detectAtMention()
}

function onBlur() {
  focused.value = false
  // Small delay so mousedown on suggestion button fires first
  setTimeout(() => { atMentionQuery.value = null }, 150)
}

function onKeydown(e: KeyboardEvent) {
  // @mention navigation
  if (atMentionQuery.value !== null && atMentionSuggestions.value.length) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      atMentionIndex.value = Math.max(0, atMentionIndex.value - 1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      atMentionIndex.value = Math.min(atMentionSuggestions.value.length - 1, atMentionIndex.value + 1)
      return
    }
    if (e.key === 'Escape') {
      atMentionQuery.value = null
      return
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault()
      selectMention(atMentionSuggestions.value[atMentionIndex.value].name)
      return
    }
  }
  // Send on Enter
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    send()
    return
  }
  // Newline on Ctrl/Meta+Enter
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    insertNewline()
  }
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = (ev) => {
        const result = ev.target?.result as string
        if (result) attachedImages.value.push(result)
      }
      reader.readAsDataURL(file)
    }
  }
}

function removeImage(index: number) {
  attachedImages.value.splice(index, 1)
}

async function send() {
  const text = input.value.trim()
  if (!text || !canSend.value) return

  const images = attachedImages.value.length ? [...attachedImages.value] : undefined
  const file   = attachedFile.value ?? undefined

  input.value = ''
  attachedImages.value = []
  attachedFile.value = null
  nextTick(() => { if (textareaRef.value) textareaRef.value.style.height = 'auto' })

  if (convStore.councilPaused) {
    await convStore.resumeCouncil(text)
  } else if (councilMode.value) {
    await convStore.startCouncil(text, [...councilPersonaIds.value], councilTurns.value, images)
  } else if (salonMode.value) {
    await convStore.startSalon(text, [...salonPersonaIds.value], images)
  } else {
    if (!personaStore.activePersona) return
    await convStore.sendMessage(text, personaStore.activePersona.id, images, file)
  }
}

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<style scoped>
.input-zone {
  flex-shrink: 0;
  padding: 12px 24px 16px;
  background: var(--s1);
  border-top: 1px solid var(--border);
}

/* ── Image previews ── */
.image-previews {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.preview-item {
  position: relative;
}

.preview-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: var(--r);
  border: 1px solid var(--border);
  display: block;
}

.preview-remove {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--danger, #ef4444);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

/* ── File status ── */
.file-status {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  padding: 4px 2px;
}
.file-status--error { color: var(--danger); }

/* ── File chip ── */
.file-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
  position: relative;
}
.file-chip-name { color: var(--text); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-chip-mode { color: var(--accent); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.file-chip-warn { color: #f59e0b; }
.file-chip-size { color: var(--text-3); }
.file-chip .preview-remove { position: static; width: 16px; height: 16px; background: var(--s4); color: var(--text-3); border-radius: var(--r); }

/* ── File button ── */
.file-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--r);
  border: none;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
}
.file-btn:hover:not(:disabled) { color: var(--text); background: var(--s3); }
.file-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.file-input-hidden { display: none; }

/* ── Drag over ── */
.input-wrap.drag-over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--s2)); }

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 10px 10px 10px 16px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

[data-theme="signal"] .input-wrap {
  border-radius: var(--r);
}

.input-wrap.focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-bg), 0 4px 16px rgba(0,0,0,0.3);
}

[data-theme="grimoire"] .input-wrap.focused {
  box-shadow: 0 0 0 3px var(--accent-bg);
}

[data-theme="signal"] .input-wrap.focused {
  outline: 1px solid var(--accent);
  outline-offset: 1px;
  box-shadow: 0 0 16px rgba(0, 229, 176, 0.06);
}

.input-wrap.disabled { opacity: 0.5; }

.msg-textarea {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  resize: none;
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.65;
  color: var(--text);
  max-height: 160px;
  min-height: 24px;
}

[data-theme="signal"] .msg-textarea {
  font-family: var(--font-mono);
  font-size: 14px;
}

.msg-textarea::placeholder { color: var(--text-3); }
.msg-textarea:disabled { cursor: not-allowed; }

/* ── Send button ── */
.send-btn {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: var(--s3);
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

[data-theme="grimoire"] .send-btn {
  border-radius: 50%;
  width: 32px;
  height: 32px;
}

.send-btn.has-text {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}

[data-theme="signal"] .send-btn.has-text {
  box-shadow: 0 0 14px rgba(0, 229, 176, 0.25);
}

[data-theme="grimoire"] .send-btn.has-text {
  box-shadow: 0 0 12px rgba(200, 164, 90, 0.3);
}

.send-btn:disabled { opacity: 0.3; cursor: not-allowed; box-shadow: none; }
.send-btn:not(:disabled):hover { opacity: 0.85; }
.stop-btn { background: color-mix(in srgb, var(--danger) 15%, transparent); border-color: color-mix(in srgb, var(--danger) 40%, transparent); color: var(--danger); }
.stop-btn:hover { background: color-mix(in srgb, var(--danger) 25%, transparent); }

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.spin { animation: spin 0.9s linear infinite; }

/* ── Council pause banner ── */
.council-pause-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: var(--r);
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
}
.council-pause-banner svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--accent);
}
.council-pause-banner strong { color: var(--text); }

/* ── Council panel ── */
.council-panel {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 4px;
}

.council-members {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.council-member-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.council-remove-btn {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: var(--s3);
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.council-remove-btn:hover { background: color-mix(in srgb, var(--danger) 20%, transparent); color: var(--danger); }

.council-add-btn {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent);
  background: none;
  border: 1px dashed color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: var(--r);
  padding: 3px 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.council-add-btn:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }

.council-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-3);
  flex-shrink: 0;
}

.council-select {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
  outline: none;
  flex: 1;
  min-width: 100px;
  max-width: 180px;
}
.council-select:focus { border-color: var(--accent); }

.council-vs {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  flex-shrink: 0;
}

.council-turns {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.council-turn-btn {
  width: 24px;
  height: 24px;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: var(--s2);
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.council-turn-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}
.council-turn-btn:not(.active):hover {
  background: var(--s3);
  color: var(--text);
}

/* ── @mention suggestions ── */
.at-suggestions {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 16px;
  display: flex;
  flex-direction: column;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  z-index: 10;
  min-width: 140px;
}

.at-suggestion {
  padding: 6px 12px;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.1s;
}
.at-suggestion:hover,
.at-suggestion.active {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

/* ── Salon routing hint ── */
.salon-routing-hint {
  align-self: flex-end;
  padding-bottom: 2px;
  opacity: 0.6;
  font-style: italic;
}

/* ── Council button ── */
.council-btn--active {
  color: var(--accent) !important;
  background: color-mix(in srgb, var(--accent) 12%, transparent) !important;
}

/* ── Hint ── */
.input-hint {
  display: flex;
  gap: 16px;
  padding: 5px 4px 0;
}

.hint-size {
  margin-left: auto;
}

.input-hint span {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  letter-spacing: 0.03em;
}
</style>
