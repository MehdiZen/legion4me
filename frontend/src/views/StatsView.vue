<template>
  <div class="stats-page">
    <div class="stats-header">
      <RouterLink to="/" class="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </RouterLink>
      <h1 class="stats-title">Statistiques</h1>
    </div>

    <div v-if="loading" class="stats-loading">Chargement…</div>

    <div v-else class="stats-body">
      <!-- Global totals -->
      <section class="stats-section">
        <h2 class="section-label">Global</h2>
        <div class="totals-grid">
          <div class="total-card">
            <span class="total-value">{{ fmt(stats.total.tokensIn) }}</span>
            <span class="total-label">tokens contexte</span>
          </div>
          <div class="total-card">
            <span class="total-value">{{ fmt(stats.total.tokensOut) }}</span>
            <span class="total-label">tokens générés</span>
          </div>
          <div class="total-card">
            <span class="total-value">{{ fmt(stats.total.messages) }}</span>
            <span class="total-label">réponses</span>
          </div>
          <div class="total-card">
            <span class="total-value">{{ fmtSize(stats.total.sizeBytes) }}</span>
            <span class="total-label">taille totale</span>
          </div>
        </div>
      </section>

      <!-- Per persona -->
      <section class="stats-section">
        <h2 class="section-label">Par persona</h2>
        <div v-if="!stats.byPersona.length" class="empty">Aucune donnée</div>
        <div v-else class="persona-list">
          <div v-for="row in stats.byPersona" :key="row.personaId ?? 'none'" class="persona-row">
            <div class="persona-sigil" :style="{ background: row.personaColor }">
              {{ row.personaName[0]?.toUpperCase() }}
            </div>
            <div class="persona-info">
              <span class="persona-name">{{ row.personaName }}</span>
              <div class="persona-bar-wrap">
                <div
                  class="persona-bar"
                  :style="{ width: barWidth(row.sizeBytes) + '%', background: row.personaColor }"
                />
              </div>
            </div>
            <div class="persona-nums">
              <span class="num-out">{{ fmt(row.tokensOut) }}<span class="num-unit"> out</span></span>
              <span class="num-in">{{ fmt(row.tokensIn) }}<span class="num-unit"> in</span></span>
              <span class="num-size">{{ fmtSize(row.sizeBytes) }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/lib/api'

interface PersonaStats {
  personaId: string | null
  personaName: string
  personaColor: string
  tokensIn: number
  tokensOut: number
  messages: number
  sizeBytes: number
}

interface Stats {
  total: { tokensIn: number; tokensOut: number; messages: number; sizeBytes: number }
  byPersona: PersonaStats[]
}

const loading = ref(true)
const stats = ref<Stats>({ total: { tokensIn: 0, tokensOut: 0, messages: 0, sizeBytes: 0 }, byPersona: [] })

onMounted(async () => {
  try {
    stats.value = await api.get<Stats>('/stats')
  } finally {
    loading.value = false
  }
})

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

const maxSize = computed(() => Math.max(...stats.value.byPersona.map(r => r.sizeBytes), 1))
function barWidth(n: number): number {
  return Math.round((n / maxSize.value) * 100)
}
</script>

<style scoped>
.stats-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 32px;
  color: var(--text);
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 40px;
}

.back-link {
  color: var(--text-3);
  display: flex;
  align-items: center;
  transition: color 0.12s;
}
.back-link:hover { color: var(--text); }

.stats-title {
  font-family: var(--font-brand);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--text);
  margin: 0;
}

.stats-loading {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-3);
}

.stats-body { display: flex; flex-direction: column; gap: 40px; }

.stats-section { display: flex; flex-direction: column; gap: 16px; }

.section-label {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-3);
  margin: 0;
}

/* Totals */
.totals-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.total-card {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.total-value {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 600;
  color: var(--accent);
}

.total-label {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.06em;
}

/* Per persona */
.persona-list { display: flex; flex-direction: column; gap: 10px; }

.persona-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r);
}

.persona-sigil {
  width: 28px;
  height: 28px;
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

.persona-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.persona-name {
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--text);
}

.persona-bar-wrap {
  height: 3px;
  background: var(--s4);
  border-radius: 2px;
  overflow: hidden;
}

.persona-bar {
  height: 100%;
  border-radius: 2px;
  opacity: 0.7;
  transition: width 0.4s ease;
}

.persona-nums {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.num-out {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text);
}

.num-in {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.num-unit {
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--text-3);
}

.num-size {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
}

.empty {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--text-3);
}
</style>
