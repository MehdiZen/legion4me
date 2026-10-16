<template>
  <header class="chat-header">
    <!-- Persona selector -->
    <div class="persona-selector" ref="selectorRef">
      <button @click="open = !open" class="persona-btn" :class="{ 'has-persona': !!personaStore.activePersona }">
        <span v-if="personaStore.activePersona" class="persona-dot" :style="{ background: personaStore.activePersona.color || 'var(--accent)' }" />
        <span v-else class="persona-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
          </svg>
        </span>
        <span class="persona-name">{{ personaStore.activePersona?.name || 'Choisir un persona' }}</span>
        <span v-if="personaStore.activePersona" class="persona-model">{{ personaStore.activePersona.model }}</span>
        <svg class="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <!-- Dropdown -->
      <Transition name="dropdown">
        <div v-if="open" class="persona-dropdown">
          <div v-if="personaStore.personas.length === 0" class="dropdown-empty">
            Aucun persona —
            <RouterLink to="/personas" @click="open = false" class="dropdown-link">créer</RouterLink>
          </div>
          <button
            v-for="p in personaStore.personas"
            :key="p.id"
            @click="selectPersona(p)"
            :class="['dropdown-item', { active: personaStore.activePersona?.id === p.id }]"
          >
            <span class="dropdown-sigil" :style="{ background: p.color || 'var(--accent)' }">
              {{ p.name[0].toUpperCase() }}
            </span>
            <span class="dropdown-info">
              <span class="dropdown-pname">{{ p.name }}</span>
              <span class="dropdown-pmodel">{{ p.model }}</span>
            </span>
            <span v-if="personaStore.activePersona?.id === p.id" class="dropdown-check">✓</span>
          </button>
        </div>
      </Transition>
    </div>

    <!-- Conversation title -->
    <div class="header-center">
      <span v-if="convStore.active?.title" class="conv-title">{{ convStore.active.title }}</span>
    </div>

    <div class="header-right">
      <RouterLink to="/personas" class="header-icon-btn" title="Gérer les personas">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      </RouterLink>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePersonaStore } from '@/stores/persona'
import { useConversationStore } from '@/stores/conversation'
import type { Persona } from '@/types'
import { api } from '@/lib/api'

const personaStore = usePersonaStore()
const convStore    = useConversationStore()
const open         = ref(false)
const selectorRef  = ref<HTMLElement | null>(null)

async function selectPersona(p: Persona) {
  personaStore.setActivePersona(p)
  open.value = false
  if (convStore.active) {
    convStore.active.personaId = p.id
    await api.patch(`/conversations/${convStore.active.id}`, { personaId: p.id })
  }
}

function onClickOutside(e: MouseEvent) {
  if (selectorRef.value && !selectorRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(()  => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--s1);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  min-height: 52px;
}

/* ── Persona selector ── */
.persona-selector { position: relative; }

.persona-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  background: var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  max-width: 340px;
}

.persona-btn.has-persona {
  border-color: var(--border-hi);
}

.persona-btn:hover {
  border-color: var(--accent);
  background: var(--s4);
}

[data-theme="signal"] .persona-btn:hover {
  box-shadow: 0 0 12px var(--accent-bg);
}

.persona-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

[data-theme="signal"] .persona-dot {
  border-radius: 1px;
}

.persona-icon {
  color: var(--text-3);
  display: flex;
  align-items: center;
}

.persona-name {
  font-family: var(--font-ui);
  font-size: 15px;
  color: var(--text);
  white-space: nowrap;
}

[data-theme="signal"] .persona-name {
  font-family: var(--font-brand);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.persona-model {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  padding: 1px 6px;
  background: var(--s1);
  border-radius: var(--r);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.chevron {
  color: var(--text-3);
  flex-shrink: 0;
  margin-left: 2px;
}

/* ── Dropdown ── */
.persona-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 300px;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 100;
  padding: 6px;
}

[data-theme="signal"] .persona-dropdown {
  border-radius: var(--r);
  border-color: var(--border-hi);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 10px;
  background: none;
  border: none;
  border-radius: var(--r);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.dropdown-item:hover { background: var(--s4); }
.dropdown-item.active { background: var(--s3); }

.dropdown-sigil {
  width: 32px;
  height: 32px;
  border-radius: var(--r);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-brand);
  font-size: 13px;
  font-weight: 600;
  color: rgba(0,0,0,0.7);
}

[data-theme="signal"] .dropdown-sigil {
  border-radius: var(--r);
  width: 28px;
  height: 28px;
  font-size: 12px;
}

.dropdown-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.dropdown-pname {
  font-family: var(--font-ui);
  font-size: 15px;
  color: var(--text);
}

[data-theme="signal"] .dropdown-pname {
  font-family: var(--font-brand);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.dropdown-pmodel {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-check {
  font-size: 12px;
  color: var(--accent);
  margin-left: auto;
}

.dropdown-empty {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-2);
  padding: 12px;
  text-align: center;
}

.dropdown-link { color: var(--accent); text-decoration: none; }
.dropdown-link:hover { text-decoration: underline; }

/* ── Center / Right ── */
.header-center {
  flex: 1;
  text-align: center;
}

.conv-title {
  font-family: var(--font-ui);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--text-3);
  text-transform: uppercase;
}

[data-theme="signal"] .conv-title {
  font-family: var(--font-brand);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.15em;
}

.header-right { display: flex; align-items: center; gap: 4px; }

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r);
  color: var(--text-3);
  text-decoration: none;
  transition: background 0.12s ease, color 0.12s ease;
}

.header-icon-btn:hover {
  background: var(--s3);
  color: var(--text);
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.dropdown-enter-from   { opacity: 0; transform: translateY(-6px); }
.dropdown-leave-to     { opacity: 0; transform: translateY(-6px); }
</style>
