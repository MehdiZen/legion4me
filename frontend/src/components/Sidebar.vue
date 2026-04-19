<template>
  <aside class="sidebar">
    <!-- Brand -->
    <div class="brand">
      <span class="brand-name">ASMODEUS</span>
      <span class="brand-sub">Local Intelligence</span>
    </div>

    <!-- New chat -->
    <div class="new-chat-wrap">
      <button
        @click="newChat"
        :disabled="!personaStore.activePersona"
        class="new-chat-btn"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Nouvelle invocation</span>
      </button>
      <p v-if="!personaStore.activePersona" class="no-persona-hint">
        Sélectionne un persona
      </p>
    </div>

    <div class="divider" />

    <!-- Search -->
    <div class="search-wrap">
      <input
        v-model="search"
        class="search-input"
        placeholder="Rechercher…"
        type="text"
      />
    </div>

    <!-- Conversations -->
    <div class="conv-section">
      <nav class="conv-list">
        <button
          v-for="conv in filteredConversations"
          :key="conv.id"
          @click="selectConv(conv)"
          :class="['conv-item', { active: convStore.active?.id === conv.id }]"
        >
          <span
            class="conv-indicator"
            :style="convPersona(conv) ? { background: convPersona(conv)!.color ?? 'var(--accent)' } : {}"
          />
          <span class="conv-text">
            <span class="conv-title">{{ conv.title || 'Nouvelle invocation' }}</span>
            <span v-if="convPersona(conv)" class="conv-persona-name">{{ convPersona(conv)!.name }}</span>
          </span>
          <button @click.stop="convStore.togglePin(conv)" class="conv-action" :title="conv.pinned ? 'Désépingler' : 'Épingler'">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" :stroke="conv.pinned ? 'var(--accent)' : 'currentColor'" stroke-width="2.5">
              <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
            </svg>
          </button>
          <button @click.stop="deleteConv(conv.id)" class="conv-action" title="Supprimer">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </button>

        <div v-if="!filteredConversations.length" class="conv-empty">
          {{ search ? 'Aucun résultat' : 'Aucune séance' }}
        </div>
      </nav>
    </div>

    <!-- Footer -->
    <div class="sidebar-footer">
      <div class="divider" style="margin-bottom: 8px" />
      <ThemeSwitcher />
      <div class="divider" style="margin: 8px 0" />
      <RouterLink to="/personas" class="footer-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
        <span>Grimoire</span>
        <span class="footer-count">{{ personaStore.personas.length }}</span>
      </RouterLink>
      <RouterLink to="/stats" class="footer-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        <span>Statistiques</span>
      </RouterLink>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePersonaStore } from '@/stores/persona'
import { useConversationStore } from '@/stores/conversation'
import ThemeSwitcher from './ThemeSwitcher.vue'
import type { Conversation } from '@/types'

const personaStore = usePersonaStore()
const convStore    = useConversationStore()
const search       = ref('')

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

const filteredConversations = computed(() => {
  if (!search.value.trim()) return convStore.conversations
  const q = search.value.toLowerCase()
  return convStore.conversations.filter(c =>
    (c.title || 'Nouvelle invocation').toLowerCase().includes(q)
  )
})

async function newChat() {
  if (!personaStore.activePersona) return
  const conv = await convStore.createConversation(personaStore.activePersona.id)
  await convStore.selectConversation(conv)
}

async function selectConv(conv: Conversation) {
  await convStore.selectConversation(conv)
}

async function deleteConv(id: string) {
  await convStore.deleteConversation(id)
}

function convPersona(conv: Conversation) {
  if (!conv.personaId) return null
  return personaStore.personas.find(p => p.id === conv.personaId) ?? null
}
</script>

<style scoped>
.sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--s1);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Brand ── */
.brand {
  padding: 24px 20px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-name {
  font-family: var(--font-brand);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.35em;
  color: var(--accent);
  display: block;
}

[data-theme="signal"] .brand-name {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.2em;
}

.brand-sub {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--text-3);
  text-transform: uppercase;
}

[data-theme="signal"] .brand-sub {
  font-family: var(--font-brand);
  font-size: 9px;
  letter-spacing: 0.18em;
}

/* ── New chat ── */
.new-chat-wrap {
  padding: 12px;
}

.new-chat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-bd);
  border-radius: var(--r);
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 14px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

[data-theme="signal"] .new-chat-btn {
  font-family: var(--font-brand);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-radius: var(--r);
}

.new-chat-btn:hover:not(:disabled) {
  background: rgba(200, 164, 90, 0.15);
  border-color: var(--accent);
}

[data-theme="signal"] .new-chat-btn:hover:not(:disabled) {
  background: rgba(0, 229, 176, 0.12);
  box-shadow: 0 0 10px rgba(0, 229, 176, 0.12);
}

.new-chat-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.no-persona-hint {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-3);
  text-align: center;
  margin-top: 6px;
  letter-spacing: 0.04em;
}

/* ── Search ── */
.search-wrap {
  padding: 8px 10px 4px;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  background: var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.search-input::placeholder { color: var(--text-3); }
.search-input:focus { border-color: var(--accent); }

/* ── Conversations ── */
.conv-section {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
}

.conv-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 8px;
}

.conv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--r);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
  color: var(--text-2);
  transition: background 0.12s ease, color 0.12s ease;
  position: relative;
}

.conv-item:hover {
  background: var(--s3);
  color: var(--text);
}

.conv-item.active {
  background: var(--s3);
  color: var(--text);
}

.conv-indicator {
  width: 2px;
  min-height: 14px;
  align-self: stretch;
  border-radius: 2px;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.conv-item:hover .conv-indicator,
.conv-item.active .conv-indicator {
  background: var(--accent);
}

.conv-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.conv-title {
  font-family: var(--font-ui);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-theme="signal"] .conv-title {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.conv-persona-name {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.04em;
  opacity: 0.75;
}

.conv-size {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  opacity: 0;
  transition: opacity 0.12s;
  flex-shrink: 0;
}
.conv-item:hover .conv-size { opacity: 1; }

.conv-action {
  opacity: 0;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  flex-shrink: 0;
  transition: opacity 0.12s ease, color 0.12s ease;
  display: flex;
  align-items: center;
}

.conv-item:hover .conv-action { opacity: 1; }
.conv-action:last-child:hover { color: var(--danger); }
.conv-action:first-of-type:hover { color: var(--accent); }

.conv-empty {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
  padding: 24px 12px;
  letter-spacing: 0.06em;
}

/* ── Footer ── */
.sidebar-footer {
  padding: 4px 0 8px;
  flex-shrink: 0;
}

.footer-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  color: var(--text-2);
  text-decoration: none;
  transition: color 0.12s ease;
  font-family: var(--font-ui);
  font-size: 15px;
  letter-spacing: 0.05em;
}

[data-theme="signal"] .footer-link {
  font-family: var(--font-brand);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.footer-link:hover { color: var(--text); }

.footer-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  background: var(--s3);
  padding: 1px 6px;
  border-radius: var(--r);
}
</style>
