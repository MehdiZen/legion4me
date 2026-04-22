<template>
  <div class="persona-card" @click="$emit('select', persona)">
    <div class="card-header">
      <div
        class="card-sigil"
        :class="{ 'card-sigil--emoji': !!persona.emoji }"
        :style="persona.emoji ? {} : { background: persona.color || 'var(--accent)' }"
      >
        {{ persona.emoji || persona.name[0].toUpperCase() }}
      </div>
      <div class="card-info">
        <span class="card-name">{{ persona.name }}</span>
        <span class="card-model">{{ persona.model }}</span>
      </div>
      <div class="card-actions" @click.stop>
        <button @click="$emit('edit', persona)" class="card-action" title="Modifier">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button @click="$emit('delete', persona.id)" class="card-action card-action--danger" title="Supprimer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
    </div>

    <p v-if="persona.description" class="card-description">{{ persona.description }}</p>

    <div class="card-prompt">
      <span class="section-label">Système</span>
      <p class="card-prompt-text">{{ persona.systemPrompt }}</p>
    </div>

    <div class="card-footer">
      <span class="card-temp">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/>
        </svg>
        {{ persona.temperature }}
      </span>
      <button @click="usePersona" class="card-use-btn">
        Utiliser
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { usePersonaStore } from '@/stores/persona'
import type { Persona } from '@/types'

const props = defineProps<{ persona: Persona }>()
defineEmits<{ edit: [p: Persona]; delete: [id: string]; select: [p: Persona] }>()

const router       = useRouter()
const personaStore = usePersonaStore()

function usePersona() {
  personaStore.setActivePersona(props.persona)
  router.push('/')
}
</script>

<style scoped>
.persona-card {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.15s ease, transform 0.15s ease;
  cursor: pointer;
}

[data-theme="signal"] .persona-card {
  border-radius: var(--r);
  border-left: 2px solid var(--border);
}

.persona-card:hover {
  border-color: var(--border-hi);
}

[data-theme="signal"] .persona-card:hover {
  border-left-color: var(--accent);
}

[data-theme="grimoire"] .persona-card:hover {
  transform: translateY(-1px);
}

/* ── Header ── */
.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-sigil {
  width: 38px;
  height: 38px;
  border-radius: var(--r);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-brand);
  font-size: 15px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.65);
}

[data-theme="grimoire"] .card-sigil { border-radius: 50%; }

.card-sigil--emoji {
  background: var(--s3) !important;
  border: 1px solid var(--border);
  font-size: 20px;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.card-name {
  font-family: var(--font-ui);
  font-size: 17px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-theme="signal"] .card-name {
  font-family: var(--font-brand);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.card-model {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
}

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.persona-card:hover .card-actions { opacity: 1; }

.card-action {
  width: 28px;
  height: 28px;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: var(--s3);
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.card-action:hover { background: var(--s4); color: var(--text); border-color: var(--border-hi); }
.card-action--danger:hover { color: var(--danger); border-color: var(--danger); background: var(--danger-bg); }

/* ── Description ── */
.card-description {
  font-family: var(--font-ui);
  font-size: 15px;
  color: var(--text-2);
  line-height: 1.55;
  margin: 0;
}

[data-theme="signal"] .card-description {
  font-family: var(--font-mono);
  font-size: 13px;
}

/* ── System prompt preview ── */
.card-prompt {
  background: var(--s1);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-prompt-text {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-3);
  line-height: 1.55;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Footer ── */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-temp {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.card-use-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-bd);
  border-radius: var(--r);
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  letter-spacing: 0.05em;
}

[data-theme="signal"] .card-use-btn {
  font-family: var(--font-brand);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.card-use-btn:hover {
  background: var(--accent-bg);
  border-color: var(--accent);
}

[data-theme="signal"] .card-use-btn:hover {
  box-shadow: 0 0 10px rgba(0, 229, 176, 0.15);
}
</style>
