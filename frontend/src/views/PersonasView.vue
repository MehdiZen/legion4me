<template>
  <div class="personas-view">

    <!-- Header -->
    <header class="pv-header">
      <RouterLink to="/" class="back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </RouterLink>
      <h1 class="pv-title">Grimoire</h1>
      <span class="pv-count">{{ personaStore.personas.length }}</span>
      <div class="pv-header-spacer" />
      <button @click="openCreate" class="btn-primary">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nouveau persona
      </button>
    </header>

    <!-- Body -->
    <div class="pv-body">

      <!-- Grid -->
      <div class="pv-content">

        <!-- Memory chips overview -->
        <div class="mem-overview">
          <div class="mem-overview-header">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            <span>Mémoire active</span>
            <span class="mem-overview-count">{{ allMemories.length }}</span>
          </div>

          <!-- User info chips -->
          <div class="mem-user-section">
            <div class="mem-user-label">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              À propos de moi
            </div>
            <div class="mem-user-chips">
              <div
                v-for="m in userMemories"
                :key="m.id"
                class="mem-chip chip-user"
              >
                <span class="chip-text">{{ m.content }}</span>
                <button class="chip-delete" @click="deleteAnyMemory(m.id)">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <form class="mem-add-form" @submit.prevent="addUserChip">
                <input
                  v-model="newChipText"
                  class="mem-add-input"
                  placeholder="Ajouter une info sur moi…"
                  maxlength="200"
                />
                <button type="submit" class="mem-add-btn" :disabled="!newChipText.trim()">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </form>
            </div>
          </div>

          <!-- Model-extracted memories -->
          <div v-if="toolMemories.length" class="mem-tool-section">
            <div class="mem-user-label">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
              Retenu par l'IA
            </div>
            <div class="mem-chips">
              <div
                v-for="m in toolMemories"
                :key="m.id"
                :class="['mem-chip', m.type === 'global' ? 'chip-global' : 'chip-persona']"
              >
                <span
                  v-if="m.type === 'persona' && m.personaId"
                  class="chip-persona-dot"
                  :style="{ background: getPersonaColor(m.personaId) }"
                  :title="getPersonaName(m.personaId)"
                />
                <span class="chip-text">{{ m.content }}</span>
                <span v-if="m.type === 'persona' && m.personaId" class="chip-persona-label">{{ getPersonaName(m.personaId) }}</span>
                <button class="chip-delete" @click="deleteAnyMemory(m.id)">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <p v-if="!allMemories.length" class="mem-empty-hint">Aucun souvenir pour l'instant — les mémoires se forment au fil des conversations.</p>
        </div>

        <div v-if="personaStore.personas.length === 0" class="pv-empty">
          <div class="pv-empty-glyph">◈</div>
          <p class="pv-empty-title">Grimoire vide</p>
          <p class="pv-empty-sub">Crée ton premier persona pour commencer</p>
          <button @click="openCreate" class="btn-primary" style="margin-top: 8px">
            Créer un persona
          </button>
        </div>

        <div v-else class="pv-grid">
          <PersonaCard
            v-for="p in personaStore.personas"
            :key="p.id"
            :persona="p"
            :class="{ 'card-selected': selectedPersona?.id === p.id }"
            @select="selectPersona"
            @edit="openEdit"
            @delete="confirmDelete"
          />
        </div>
      </div>

      <!-- Detail panel -->
      <Transition name="panel">
        <aside v-if="selectedPersona" class="conv-panel">
          <div class="panel-header">
            <div class="panel-sigil" :style="{ background: selectedPersona.color || 'var(--accent)' }">
              {{ selectedPersona.name[0].toUpperCase() }}
            </div>
            <div class="panel-title-wrap">
              <span class="panel-title">{{ selectedPersona.name }}</span>
              <span class="panel-count">{{ filteredConvs.length }} séance{{ filteredConvs.length !== 1 ? 's' : '' }}</span>
            </div>
            <button class="panel-close" @click="selectedPersona = null">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <!-- Tabs -->
          <div class="panel-tabs">
            <button :class="['panel-tab', { active: panelTab === 'convs' }]" @click="panelTab = 'convs'">
              Séances
            </button>
            <button :class="['panel-tab', { active: panelTab === 'memory' }]" @click="panelTab = 'memory'; loadMemories()">
              Mémoire
            </button>
          </div>

          <!-- Conversations tab -->
          <div v-if="panelTab === 'convs'" class="panel-body">
            <div v-if="filteredConvs.length === 0" class="panel-empty">
              Aucune séance avec ce persona
            </div>
            <button
              v-for="conv in filteredConvs"
              :key="conv.id"
              class="panel-conv"
              @click="openConversation(conv)"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="panel-conv-icon">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              <span class="panel-conv-title">{{ conv.title || 'Nouvelle invocation' }}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="panel-conv-arrow">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          <!-- Memory tab -->
          <div v-if="panelTab === 'memory'" class="panel-body">
            <div v-if="memStore.globalMemories.length" class="mem-section">
              <span class="mem-label">Général</span>
              <div
                v-for="m in memStore.globalMemories"
                :key="m.id"
                class="mem-item"
              >
                <span class="mem-content">{{ m.content }}</span>
                <button class="mem-delete" @click="memStore.deleteMemory(m.id)" title="Oublier">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="memStore.personaMemories.length" class="mem-section">
              <span class="mem-label">{{ selectedPersona.name }}</span>
              <div
                v-for="m in memStore.personaMemories"
                :key="m.id"
                class="mem-item"
              >
                <span class="mem-content">{{ m.content }}</span>
                <button class="mem-delete" @click="memStore.deleteMemory(m.id)" title="Oublier">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="!memStore.globalMemories.length && !memStore.personaMemories.length" class="panel-empty">
              Aucun souvenir pour l'instant.<br>Les mémoires se forment au fil des conversations.
            </div>
          </div>
        </aside>
      </Transition>

    </div>

    <!-- Modal -->
    <PersonaModal
      v-if="modalOpen"
      :editing-persona="editingPersona"
      @close="closeModal"
      @save="handleSave"
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePersonaStore } from '@/stores/persona'
import { useConversationStore } from '@/stores/conversation'
import { useMemoryStore } from '@/stores/memory'
import PersonaCard  from '@/components/PersonaCard.vue'
import PersonaModal from '@/components/PersonaModal.vue'
import type { Persona, Conversation } from '@/types'

const personaStore  = usePersonaStore()
const convStore     = useConversationStore()
const memStore      = useMemoryStore()
const router        = useRouter()

const modalOpen       = ref(false)
const editingPersona  = ref<Persona | null>(null)
const selectedPersona = ref<Persona | null>(null)
const panelTab        = ref<'convs' | 'memory'>('convs')

const filteredConvs = computed(() =>
  convStore.conversations.filter(c => c.personaId === selectedPersona.value?.id)
)

function selectPersona(p: Persona) {
  if (selectedPersona.value?.id === p.id) { selectedPersona.value = null; return }
  selectedPersona.value = p
  panelTab.value = 'convs'
}

function loadMemories() {
  if (selectedPersona.value) memStore.fetchForPersona(selectedPersona.value.id)
}

// All memories for the overview chips
const allMemories = ref<import('@/stores/memory').Memory[]>([])
const newChipText = ref('')

const userMemories = computed(() => allMemories.value.filter(m => m.source === 'user'))
const toolMemories = computed(() => allMemories.value.filter(m => m.source !== 'user'))

async function loadAllMemories() {
  const res = await fetch('/api/memories')
  allMemories.value = await res.json()
}

async function deleteAnyMemory(id: string) {
  await fetch(`/api/memories/${id}`, { method: 'DELETE' })
  allMemories.value = allMemories.value.filter(m => m.id !== id)
  memStore.globalMemories  = memStore.globalMemories.filter(m => m.id !== id)
  memStore.personaMemories = memStore.personaMemories.filter(m => m.id !== id)
}

async function addUserChip() {
  const text = newChipText.value.trim()
  if (!text) return
  const mem = await memStore.addUserMemory(text)
  allMemories.value.push(mem)
  newChipText.value = ''
}

function getPersonaName(personaId: string | null): string {
  return personaStore.personas.find(p => p.id === personaId)?.name ?? '?'
}

function getPersonaColor(personaId: string | null): string {
  return personaStore.personas.find(p => p.id === personaId)?.color ?? 'var(--accent)'
}

onMounted(loadAllMemories)

async function openConversation(conv: Conversation) {
  await convStore.selectConversation(conv)
  router.push('/')
}

function openCreate()           { editingPersona.value = null; modalOpen.value = true }
function openEdit(p: Persona)   { editingPersona.value = p;    modalOpen.value = true }
function closeModal()           { modalOpen.value = false; editingPersona.value = null }

async function handleSave(data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) {
  if (editingPersona.value) await personaStore.updatePersona(editingPersona.value.id, data)
  else                       await personaStore.createPersona(data)
  closeModal()
}

async function confirmDelete(id: string) {
  if (confirm('Supprimer ce persona ?')) {
    await personaStore.deletePersona(id)
    if (selectedPersona.value?.id === id) selectedPersona.value = null
  }
}
</script>

<style scoped>
.personas-view {
  height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.pv-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 28px;
  background: var(--s1);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r);
  color: var(--text-3);
  text-decoration: none;
  border: 1px solid var(--border);
  background: var(--s2);
  transition: color 0.12s ease, border-color 0.12s ease;
}
.back-btn:hover { color: var(--text); border-color: var(--border-hi); }

.pv-title {
  font-family: var(--font-brand);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0;
}
[data-theme="signal"] .pv-title { font-size: 18px; font-weight: 800; letter-spacing: 0.2em; }

.pv-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  background: var(--s3);
  border: 1px solid var(--border);
  padding: 1px 8px;
  border-radius: var(--r);
}

.pv-header-spacer { flex: 1; }

/* ── Body ── */
.pv-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Content ── */
.pv-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px;
}

.pv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.card-selected {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 1px var(--accent);
}

/* ── Empty state ── */
.pv-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  min-height: 300px;
}

.pv-empty-glyph { font-size: 32px; color: var(--text-3); margin-bottom: 4px; }

.pv-empty-title {
  font-family: var(--font-brand);
  font-size: 14px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-2);
  margin: 0;
}

.pv-empty-sub {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-3);
  margin: 0;
  letter-spacing: 0.04em;
}

/* ── Conversations panel ── */
.conv-panel {
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--s1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel-sigil {
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
  color: rgba(0,0,0,0.65);
}
[data-theme="grimoire"] .panel-sigil { border-radius: 50%; }

.panel-title-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.panel-title {
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-theme="signal"] .panel-title {
  font-family: var(--font-brand);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
}

.panel-close {
  width: 26px;
  height: 26px;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: var(--s3);
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.12s, border-color 0.12s;
}
.panel-close:hover { color: var(--text); border-color: var(--border-hi); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-empty {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
  padding: 32px 16px;
  letter-spacing: 0.04em;
}

.panel-conv {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  background: none;
  border: none;
  border-radius: var(--r);
  cursor: pointer;
  text-align: left;
  color: var(--text-2);
  transition: background 0.12s, color 0.12s;
}
.panel-conv:hover { background: var(--s3); color: var(--text); }

.panel-conv-icon { color: var(--text-3); flex-shrink: 0; }

.panel-conv-title {
  flex: 1;
  font-family: var(--font-ui);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-theme="signal"] .panel-conv-title { font-family: var(--font-mono); font-size: 12px; }

.panel-conv-arrow { color: var(--text-3); flex-shrink: 0; opacity: 0; transition: opacity 0.12s; }
.panel-conv:hover .panel-conv-arrow { opacity: 1; }

/* ── Memory overview ── */
.mem-overview {
  margin-bottom: 24px;
  padding: 14px 16px;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
}

.mem-overview-header {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mem-overview-count {
  margin-left: auto;
  background: var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 1px 7px;
  font-size: 10px;
}

.mem-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mem-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-family: var(--font-ui);
  font-size: 12px;
  max-width: 320px;
}

.chip-global {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-color: color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--text-2);
}

.chip-persona {
  background: var(--s3);
  color: var(--text-2);
}

.chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-persona-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chip-persona-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  opacity: 0.8;
  padding: 0 2px;
  border-left: 1px solid var(--border);
  margin-left: 2px;
  padding-left: 6px;
}

.chip-delete {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  transition: color 0.12s, background 0.12s;
}
.chip-delete:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 15%, transparent); }

.mem-empty-hint {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
  letter-spacing: 0.03em;
}

/* ── User info section ── */
.mem-user-section {
  margin-bottom: 14px;
}

.mem-tool-section {
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.mem-user-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 8px;
}

.mem-user-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.chip-user {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--text);
}

.mem-add-form {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mem-add-input {
  height: 26px;
  padding: 0 10px;
  background: var(--s3);
  border: 1px dashed var(--border);
  border-radius: 999px;
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: 12px;
  outline: none;
  width: 180px;
  transition: border-color 0.12s, width 0.15s ease;
}
.mem-add-input::placeholder { color: var(--text-3); }
.mem-add-input:focus {
  border-color: var(--accent);
  border-style: solid;
  width: 220px;
  color: var(--text);
}

.mem-add-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--s3);
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color 0.12s, background 0.12s, border-color 0.12s;
}
.mem-add-btn:not(:disabled):hover {
  color: var(--accent);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.mem-add-btn:disabled { opacity: 0.4; cursor: default; }

/* ── Tabs ── */
.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel-tab {
  flex: 1;
  padding: 8px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
  margin-bottom: -1px;
}
.panel-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.panel-tab:hover:not(.active) { color: var(--text-2); }

/* ── Memory items ── */
.mem-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.mem-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  padding: 0 2px;
  margin-bottom: 2px;
}

.mem-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 8px;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  group: true;
}

.mem-content {
  flex: 1;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
}

.mem-delete {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
  display: flex;
  align-items: center;
}
.mem-item:hover .mem-delete { opacity: 1; }
.mem-delete:hover { color: var(--danger); }

/* Panel transition */
.panel-enter-active,
.panel-leave-active { transition: width 0.2s ease, opacity 0.2s ease; overflow: hidden; }
.panel-enter-from,
.panel-leave-to { width: 0; opacity: 0; }
.panel-enter-to,
.panel-leave-from { width: 300px; opacity: 1; }
</style>
