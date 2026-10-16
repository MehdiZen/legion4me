<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="$emit('close')">
      <div class="modal">

        <!-- Header -->
        <div class="modal-header">
          <h2 class="modal-title">
            {{ editingPersona ? 'Modifier le persona' : 'Nouveau persona' }}
          </h2>
          <button @click="$emit('close')" class="modal-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="modal-body">

          <!-- Generator -->
          <div class="gen-block">
            <div class="gen-header" @click="genOpen = !genOpen">
              <span class="gen-title">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Générer avec l'IA
              </span>
              <svg class="gen-chevron" :class="{ open: genOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <Transition name="gen-expand">
              <div v-if="genOpen" class="gen-body">
                <textarea
                  v-model="genPrompt"
                  class="asm-input asm-textarea gen-textarea"
                  rows="3"
                  placeholder="Décris ton besoin… ex : un assistant expert en Python qui répond de façon concise avec des exemples de code"
                  :disabled="genLoading"
                />
                <div class="gen-footer">
                  <span v-if="genError" class="gen-error">{{ genError }}</span>
                  <div class="gen-actions">
                    <select v-model="genModel" class="asm-input asm-select gen-model-select" :disabled="genLoading || models.length === 0">
                      <option value="" disabled>Modèle…</option>
                      <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
                    </select>
                    <button
                      @click="generate"
                      :disabled="!genPrompt.trim() || !genModel || genLoading"
                      class="btn-generate"
                    >
                      <svg v-if="!genLoading" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                      <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin">
                        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 010 20"/>
                      </svg>
                      {{ genLoading ? 'Génération…' : 'Générer' }}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Name + Color -->
          <div class="field-row">
            <div class="field" style="flex: 1">
              <label class="field-label">Nom <span class="req">*</span></label>
              <input v-model="form.name" required class="asm-input" placeholder="DevBot, Rédacteur, Stratège…" />
            </div>
            <div class="field">
              <label class="field-label">Couleur</label>
              <div class="color-pick">
                <input v-model="form.color" type="color" class="color-input" />
                <div class="color-preview" :style="{ background: form.color }">
                  {{ form.emoji || form.name?.[0]?.toUpperCase() || '?' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Emoji picker -->
          <div class="field">
            <label class="field-label">Emoji</label>
            <div class="emoji-field">
              <button type="button" class="emoji-display" @click="pickerOpen = !pickerOpen">
                <span class="emoji-display-char">{{ form.emoji || '?' }}</span>
                <span class="emoji-display-hint">{{ form.emoji ? 'Changer' : 'Choisir un emoji' }}</span>
                <svg class="emoji-chevron" :class="{ open: pickerOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div v-if="pickerOpen" ref="pickerContainer" class="emoji-picker-wrap" />
            </div>
          </div>

          <!-- Description -->
          <div class="field">
            <label class="field-label">Description</label>
            <input v-model="form.description" class="asm-input" placeholder="Rôle et contexte du persona…" />
          </div>

          <!-- Model -->
          <div class="field">
            <label class="field-label">Modèle Ollama <span class="req">*</span></label>
            <div v-if="modelsLoading" class="field-status">Chargement…</div>
            <div v-else-if="modelsError" class="field-status field-status--err">{{ modelsError }}</div>
            <select v-else v-model="form.model" required class="asm-input asm-select">
              <option value="" disabled>Sélectionner un modèle</option>
              <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>

          <!-- Temperature -->
          <div class="field">
            <label class="field-label">
              Température
              <span class="field-value">{{ form.temperature }}</span>
            </label>
            <input v-model.number="form.temperature" type="range" min="0" max="1" step="0.05" class="range-input" />
            <div class="range-labels">
              <span>Précis</span>
              <span>Créatif</span>
            </div>
          </div>

          <!-- System prompt -->
          <div class="field">
            <label class="field-label">System Prompt <span class="req">*</span></label>
            <textarea
              v-model="form.systemPrompt"
              required
              rows="9"
              class="asm-input asm-textarea"
              placeholder="Tu es un assistant expert en développement TypeScript. Tu réponds de façon concise et précise, avec des exemples de code quand c'est pertinent…"
            />
          </div>

        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button type="button" @click="$emit('close')" class="btn-ghost">Annuler</button>
          <button @click="submit" :disabled="!form.name || !form.model || !form.systemPrompt" class="btn-primary">
            {{ editingPersona ? 'Enregistrer' : 'Créer' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue'
import { useModels } from '@/composables/useModels'
import type { Persona } from '@/types'
import type { Picker as PickerType } from 'emoji-mart'
import { api } from '@/lib/api'

interface GeneratedPersona {
  name?: string
  description?: string
  systemPrompt?: string
  temperature?: number
  color?: string
  emoji?: string
}

const props = defineProps<{ editingPersona?: Persona | null }>()
const emit  = defineEmits<{ close: []; save: [data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>] }>()

const { models, loading: modelsLoading, error: modelsError } = useModels()

const form = reactive({
  name:         '',
  description:  '',
  model:        '',
  temperature:  0.7,
  systemPrompt: '',
  color:        '#c8a45a',
  emoji:        '',
})

// ── Emoji picker ──
const pickerOpen      = ref(false)
const pickerContainer = ref<HTMLElement | null>(null)

watch(pickerContainer, async (el) => {
  if (!el) return
  const [{ Picker }, data] = await Promise.all([
    import('emoji-mart'),
    import('@emoji-mart/data'),
  ])
  const picker = new Picker({
    data: data.default,
    theme: 'dark',
    previewPosition: 'none',
    skinTonePosition: 'none',
    locale: 'fr',
    onEmojiSelect: (e: { native: string }) => {
      form.emoji       = e.native
      pickerOpen.value = false
    },
  })
  el.appendChild(picker as unknown as Node)
})

// ── Generator ──
const genOpen    = ref(!props.editingPersona) // open by default on creation
const genPrompt  = ref('')
const genModel   = ref('')
const genLoading = ref(false)
const genError   = ref<string | null>(null)

// Sync genModel with form.model and available models
watch(models, (list) => {
  if (!genModel.value && list.length) genModel.value = list[0]
}, { immediate: true })
watch(() => form.model, (m) => { if (m) genModel.value = m })

async function generate() {
  if (!genPrompt.value.trim() || !genModel.value) return
  genLoading.value = true
  genError.value = null
  try {
    const data = await api.post<GeneratedPersona>('/chat/generate-persona', {
      description: genPrompt.value,
      model: genModel.value,
    })

    if (data.name)         form.name         = data.name
    if (data.description)  form.description  = data.description
    if (data.systemPrompt) form.systemPrompt = data.systemPrompt
    if (typeof data.temperature === 'number') form.temperature = Math.min(1, Math.max(0, data.temperature))
    if (data.color)        form.color        = data.color
    if (data.emoji)        form.emoji        = data.emoji
    if (!form.model && genModel.value) form.model = genModel.value
    genOpen.value = false
  } catch (err) {
    genError.value = err instanceof Error ? err.message : 'Impossible de contacter le backend'
  } finally {
    genLoading.value = false
  }
}

// ── Form ──
onMounted(() => {
  if (props.editingPersona) {
    form.name         = props.editingPersona.name
    form.description  = props.editingPersona.description ?? ''
    form.model        = props.editingPersona.model
    form.temperature  = props.editingPersona.temperature
    form.systemPrompt = props.editingPersona.systemPrompt
    form.color        = props.editingPersona.color ?? '#c8a45a'
    form.emoji        = props.editingPersona.emoji ?? ''
  }
})

function submit() {
  if (!form.name || !form.model || !form.systemPrompt) return
  emit('save', {
    name:         form.name,
    description:  form.description || null,
    model:        form.model,
    temperature:  form.temperature,
    systemPrompt: form.systemPrompt,
    color:        form.color,
    emoji:        form.emoji || null,
  })
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: fadeIn 0.15s ease forwards;
}

.modal {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  animation: fadeUp 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

[data-theme="signal"] .modal {
  border-radius: var(--r);
  border-color: var(--border-hi);
}

/* ── Header ── */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal-title {
  font-family: var(--font-brand);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text);
  margin: 0;
}

[data-theme="signal"] .modal-title {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.22em;
  color: var(--accent);
}

.modal-close {
  width: 30px;
  height: 30px;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: var(--s3);
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.12s ease, background 0.12s ease;
}

.modal-close:hover { color: var(--text); background: var(--s4); }

/* ── Body ── */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field { display: flex; flex-direction: column; gap: 6px; }

.field-row { display: flex; gap: 12px; align-items: flex-end; }

.field-label {
  font-family: var(--font-ui);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 5px;
}

[data-theme="signal"] .field-label {
  font-family: var(--font-brand);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.req { color: var(--accent); }

.field-value {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  letter-spacing: normal;
  text-transform: none;
}

.field-status {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}

.field-status--err { color: var(--danger); }

/* Color picker */
.color-pick { display: flex; align-items: center; gap: 8px; }

.color-input {
  width: 36px;
  height: 36px;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: var(--s1);
  cursor: pointer;
  padding: 2px;
}

[data-theme="signal"] .color-input { border-radius: 2px; }

.color-preview {
  width: 36px;
  height: 36px;
  border-radius: var(--r);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-brand);
  font-size: 14px;
  font-weight: 600;
  color: rgba(0,0,0,0.65);
}

[data-theme="grimoire"] .color-preview { border-radius: 50%; }

/* Range slider */
.range-input {
  width: 100%;
  height: 3px;
  background: var(--s4);
  border-radius: 99px;
  appearance: none;
  cursor: pointer;
  accent-color: var(--accent);
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  margin-top: 3px;
}

/* ── Generator ── */
.gen-block {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
}

[data-theme="signal"] .gen-block { border-radius: var(--r); }

.gen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--s3);
  cursor: pointer;
  user-select: none;
  transition: background 0.12s ease;
}

.gen-header:hover { background: var(--s4); }

.gen-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-ui);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}

[data-theme="signal"] .gen-title {
  font-family: var(--font-brand);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.gen-chevron {
  color: var(--text-3);
  transition: transform 0.2s ease;
}
.gen-chevron.open { transform: rotate(180deg); }

.gen-body {
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--s1);
}

.gen-textarea { min-height: 70px; resize: vertical; font-size: 14px; }

.gen-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.gen-error {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--danger);
  flex: 1;
}

.gen-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.gen-model-select {
  height: 32px;
  padding: 0 10px;
  font-size: 12px;
  max-width: 200px;
}

.btn-generate {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  height: 32px;
  background: var(--accent);
  border: none;
  border-radius: var(--r);
  color: var(--bg);
  font-family: var(--font-ui);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s ease;
}

.btn-generate:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-generate:not(:disabled):hover { opacity: 0.85; }

/* Expand transition */
.gen-expand-enter-active,
.gen-expand-leave-active { transition: opacity 0.15s ease; }
.gen-expand-enter-from,
.gen-expand-leave-to { opacity: 0; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.9s linear infinite; }

/* ── Emoji picker ── */
.emoji-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.emoji-display {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--s1);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  width: 100%;
  text-align: left;
}

[data-theme="signal"] .emoji-display { border-radius: var(--r); }

.emoji-display:hover {
  border-color: var(--border-hi);
  background: var(--s2);
}

.emoji-display-char {
  font-size: 22px;
  line-height: 1;
  width: 28px;
  text-align: center;
  color: var(--text-3);
}

.emoji-display-hint {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-2);
  flex: 1;
}

.emoji-chevron {
  color: var(--text-3);
  transition: transform 0.18s ease;
  flex-shrink: 0;
}
.emoji-chevron.open { transform: rotate(180deg); }

.emoji-picker-wrap {
  border-radius: var(--r-lg);
  overflow: hidden;
  border: 1px solid var(--border);
}

[data-theme="signal"] .emoji-picker-wrap { border-radius: var(--r); }

.emoji-picker-wrap em-emoji-picker {
  --border-radius: 0;
  --font-family: var(--font-ui);
  width: 100%;
  max-height: 340px;
}

/* ── Footer ── */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
</style>
