<template>
  <!-- Trigger -->
  <button class="theme-trigger" @click="open = true">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
    <span>Thème</span>
    <span class="trigger-dot" :style="{ background: currentTheme.accent }" />
  </button>

  <!-- Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="tm-backdrop" @click.self="open = false">
        <div class="tm-modal">
          <div class="tm-header">
            <span class="tm-title">Apparence</span>
            <button class="tm-close" @click="open = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="tm-group">
            <span class="tm-group-label">Original</span>
            <div class="tm-cards">
              <button
                v-for="t in originalThemes"
                :key="t.id"
                :class="['tm-card', { active: themeStore.current === t.id }]"
                @click="select(t.id)"
              >
                <div class="tm-preview" :style="{ background: t.bg }">
                  <div class="tm-sidebar" :style="{ background: t.s1, borderRight: `1px solid ${t.border}` }">
                    <div class="tm-sidebar-item tm-sidebar-item--active" :style="{ background: t.accent + '22' }" />
                    <div class="tm-sidebar-item" :style="{ background: t.s3 }" />
                    <div class="tm-sidebar-item" :style="{ background: t.s3 }" />
                    <div class="tm-sidebar-item tm-sidebar-item--sm" :style="{ background: t.s3 }" />
                  </div>
                  <div class="tm-chat">
                    <div class="tm-bubble tm-bubble--asst" :style="{ background: t.s2, border: `1px solid ${t.border}` }">
                      <div class="tm-line" :style="{ background: t.text + '55', width: '80%' }" />
                      <div class="tm-line" :style="{ background: t.text + '33', width: '60%' }" />
                      <div class="tm-line" :style="{ background: t.text + '22', width: '70%' }" />
                    </div>
                    <div class="tm-bubble tm-bubble--user" :style="{ background: t.accent + '18', border: `1px solid ${t.accent}44` }">
                      <div class="tm-line" :style="{ background: t.accent + '88', width: '75%' }" />
                      <div class="tm-line" :style="{ background: t.accent + '55', width: '45%' }" />
                    </div>
                    <div class="tm-input-bar" :style="{ background: t.s2, border: `1px solid ${t.border}` }">
                      <div class="tm-input-line" :style="{ background: t.border }" />
                      <div class="tm-input-send" :style="{ background: t.accent }" />
                    </div>
                  </div>
                </div>
                <div class="tm-card-footer" :style="{ background: t.s1, borderTop: `1px solid ${t.border}` }">
                  <span class="tm-card-name" :style="{ color: t.text }">{{ t.name }}</span>
                  <span class="tm-card-label" :style="{ color: t.accent }">{{ t.label }}</span>
                </div>
                <div v-if="themeStore.current === t.id" class="tm-card-active-ring" :style="{ borderColor: t.accent }" />
              </button>
            </div>
          </div>

          <div class="tm-group">
            <span class="tm-group-label">Basic</span>
            <div class="tm-cards">
              <button
                v-for="t in inspiredThemes"
                :key="t.id"
                :class="['tm-card', { active: themeStore.current === t.id }]"
                @click="select(t.id)"
              >
                <div class="tm-preview" :style="{ background: t.bg }">
                  <div class="tm-sidebar" :style="{ background: t.s1, borderRight: `1px solid ${t.border}` }">
                    <div class="tm-sidebar-item tm-sidebar-item--active" :style="{ background: t.accent + '22' }" />
                    <div class="tm-sidebar-item" :style="{ background: t.s3 }" />
                    <div class="tm-sidebar-item" :style="{ background: t.s3 }" />
                    <div class="tm-sidebar-item tm-sidebar-item--sm" :style="{ background: t.s3 }" />
                  </div>
                  <div class="tm-chat">
                    <div class="tm-bubble tm-bubble--asst" :style="{ background: t.s2, border: `1px solid ${t.border}` }">
                      <div class="tm-line" :style="{ background: t.text + '55', width: '80%' }" />
                      <div class="tm-line" :style="{ background: t.text + '33', width: '60%' }" />
                      <div class="tm-line" :style="{ background: t.text + '22', width: '70%' }" />
                    </div>
                    <div class="tm-bubble tm-bubble--user" :style="{ background: t.accent + '18', border: `1px solid ${t.accent}44` }">
                      <div class="tm-line" :style="{ background: t.accent + '88', width: '75%' }" />
                      <div class="tm-line" :style="{ background: t.accent + '55', width: '45%' }" />
                    </div>
                    <div class="tm-input-bar" :style="{ background: t.s2, border: `1px solid ${t.border}` }">
                      <div class="tm-input-line" :style="{ background: t.border }" />
                      <div class="tm-input-send" :style="{ background: t.accent }" />
                    </div>
                  </div>
                </div>
                <div class="tm-card-footer" :style="{ background: t.s1, borderTop: `1px solid ${t.border}` }">
                  <span class="tm-card-name" :style="{ color: t.text }">{{ t.name }}</span>
                  <span class="tm-card-label" :style="{ color: t.accent }">{{ t.label }}</span>
                </div>
                <div v-if="themeStore.current === t.id" class="tm-card-active-ring" :style="{ borderColor: t.accent }" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const open = ref(false)

const currentTheme = computed(() => themeStore.themes.find(t => t.id === themeStore.current)!)
const originalThemes = computed(() => themeStore.themes.filter(t => t.group === 'original'))
const inspiredThemes = computed(() => themeStore.themes.filter(t => t.group === 'inspired'))

function select(id: typeof themeStore.current) {
  themeStore.apply(id)
  setTimeout(() => { open.value = false }, 180)
}
</script>

<style scoped>
/* ── Trigger ── */
.theme-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  background: none;
  border: none;
  border-radius: var(--r);
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  text-align: left;
}
.theme-trigger:hover {
  background: var(--s3);
  color: var(--text);
}
.trigger-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: auto;
  flex-shrink: 0;
}

/* ── Backdrop ── */
.tm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Modal ── */
.tm-modal {
  background: var(--s1);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: 24px;
  width: min(720px, calc(100vw - 32px));
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.tm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tm-title {
  font-family: var(--font-brand);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
}

.tm-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--r);
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
}
.tm-close:hover { background: var(--s3); color: var(--text); }

/* ── Groups ── */
.tm-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tm-group-label {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-3);
}

/* ── Cards grid ── */
.tm-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

/* ── Individual card ── */
.tm-card {
  position: relative;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.15s, border-color 0.15s;
  text-align: left;
}
.tm-card:hover { transform: translateY(-2px); border-color: var(--border-hi); }
.tm-card.active { border-color: transparent; }

.tm-card-active-ring {
  position: absolute;
  inset: 0;
  border: 2px solid;
  border-radius: var(--r-lg);
  pointer-events: none;
}

/* ── Mini preview ── */
.tm-preview {
  display: flex;
  height: 130px;
  overflow: hidden;
}

.tm-sidebar {
  width: 34%;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 6px;
  flex-shrink: 0;
}

.tm-sidebar-item {
  height: 8px;
  border-radius: 3px;
  width: 100%;
}
.tm-sidebar-item--sm { width: 65%; }
.tm-sidebar-item--active { height: 10px; }

.tm-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 5px;
  padding: 8px 7px;
  overflow: hidden;
}

.tm-bubble {
  border-radius: 5px;
  padding: 5px 7px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tm-bubble--user { align-self: flex-end; width: 80%; }
.tm-bubble--asst { align-self: flex-start; width: 90%; }

.tm-line {
  height: 3px;
  border-radius: 2px;
}

.tm-input-bar {
  border-radius: 4px;
  padding: 5px 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}
.tm-input-line {
  flex: 1;
  height: 3px;
  border-radius: 2px;
}
.tm-input-send {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex-shrink: 0;
  opacity: 0.85;
}

/* ── Card footer ── */
.tm-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
}
.tm-card-name {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
}
.tm-card-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ── Transition ── */
.modal-enter-active { transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.16, 1, 0.3, 1); }
.modal-leave-active { transition: opacity 0.14s ease; }
.modal-enter-from  { opacity: 0; }
.modal-leave-to    { opacity: 0; }
.modal-enter-from .tm-modal { transform: scale(0.96) translateY(8px); }
</style>
