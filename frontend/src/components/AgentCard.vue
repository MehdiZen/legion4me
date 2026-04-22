<template>
  <div class="agent-card">
    <div class="card-header">
      <div class="card-icon" :style="{ background: typeColor + '18', color: typeColor }">
        <component :is="typeIcon" />
      </div>
      <div class="card-meta">
        <span class="card-name">{{ agent.name }}</span>
        <span class="card-type">{{ typeLabel }}</span>
      </div>
      <div class="card-actions">
        <button class="card-action" @click="$emit('edit')" title="Configurer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="card-action danger" @click="$emit('delete')" title="Supprimer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="card-summary">
      <span v-for="tag in summaryTags" :key="tag" class="tag">{{ tag }}</span>
    </div>

    <div class="card-footer">
      <button class="run-btn" :disabled="isRunning" @click="$emit('run')">
        <svg v-if="!isRunning" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span v-if="isRunning" class="run-spinner" />
        {{ isRunning ? 'En cours…' : 'Lancer' }}
      </button>
    </div>

    <div v-if="runs.length" class="runs-history">
      <button
        v-for="run in runs"
        :key="run.id"
        class="run-pill"
        :class="run.status"
        :title="formatDate(run.createdAt, true)"
        @click="$emit('view', run)"
      >
        <span class="pill-dot" :class="run.status" />
        {{ formatDate(run.createdAt) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, defineComponent } from 'vue'
import type { Agent, AgentRun } from '@/stores/agents'

const props = defineProps<{ agent: Agent; runs?: AgentRun[]; isRunning?: boolean }>()
defineEmits<{ edit: []; delete: []; run: []; view: [run: AgentRun] }>()

const runs = computed(() => [...(props.runs ?? [])].reverse())

const TYPE_META: Record<string, { label: string; color: string }> = {
  email_digest:     { label: 'Email Digest',     color: '#4f8ef5' },
  morning_briefing: { label: 'Morning Briefing', color: '#f59e0b' },
  veille:           { label: 'Veille',           color: '#10b981' },
  meeting_summary:  { label: 'Résumé Réunion',   color: '#a78bfa' },
  weekly_review:    { label: 'Weekly Review',    color: '#f97316' },
}

const typeLabel = computed(() => TYPE_META[props.agent.type]?.label ?? props.agent.type)
const typeColor = computed(() => TYPE_META[props.agent.type]?.color ?? 'var(--accent)')

const typeIcon = computed(() => {
  const icons: Record<string, ReturnType<typeof defineComponent>> = {
    email_digest: defineComponent({ render: () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' }),
      h('polyline', { points: '22,6 12,13 2,6' }),
    ]) }),
    morning_briefing: defineComponent({ render: () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('circle', { cx: 12, cy: 12, r: 5 }),
      h('line', { x1: 12, y1: 1, x2: 12, y2: 3 }),
      h('line', { x1: 12, y1: 21, x2: 12, y2: 23 }),
      h('line', { x1: 4.22, y1: 4.22, x2: 5.64, y2: 5.64 }),
      h('line', { x1: 18.36, y1: 18.36, x2: 19.78, y2: 19.78 }),
      h('line', { x1: 1, y1: 12, x2: 3, y2: 12 }),
      h('line', { x1: 21, y1: 12, x2: 23, y2: 12 }),
    ]) }),
    veille: defineComponent({ render: () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('circle', { cx: 11, cy: 11, r: 8 }),
      h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
    ]) }),
    meeting_summary: defineComponent({ render: () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('line', { x1: 16, y1: 13, x2: 8, y2: 13 }),
      h('line', { x1: 16, y1: 17, x2: 8, y2: 17 }),
      h('polyline', { points: '10 9 9 9 8 9' }),
    ]) }),
    weekly_review: defineComponent({ render: () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('rect', { x: 3, y: 4, width: 18, height: 18, rx: 2, ry: 2 }),
      h('line', { x1: 16, y1: 2, x2: 16, y2: 6 }),
      h('line', { x1: 8, y1: 2, x2: 8, y2: 6 }),
      h('line', { x1: 3, y1: 10, x2: 21, y2: 10 }),
    ]) }),
  }
  return icons[props.agent.type] ?? icons.veille
})

const summaryTags = computed(() => {
  const cfg = props.agent.config
  const tags: string[] = []
  if (props.agent.type === 'email_digest') {
    const ids = (cfg.gmailAccountIds as string[]) ?? []
    if (ids.length) tags.push(`${ids.length} compte${ids.length > 1 ? 's' : ''}`)
    if (cfg.period) tags.push(String(cfg.period))
    if (cfg.format) tags.push(String(cfg.format))
  } else if (props.agent.type === 'morning_briefing') {
    if (cfg.city) tags.push(String(cfg.city))
    const topics = (cfg.topics as string[]) ?? []
    if (topics.length) tags.push(`${topics.length} topic${topics.length > 1 ? 's' : ''}`)
  } else if (props.agent.type === 'veille') {
    const topics = (cfg.topics as string[]) ?? []
    topics.slice(0, 3).forEach(t => tags.push(t))
    if (topics.length > 3) tags.push(`+${topics.length - 3}`)
  } else if (props.agent.type === 'meeting_summary') {
    const sections = (cfg.sections as string[]) ?? []
    if (sections.length) tags.push(`${sections.length} sections`)
    if (cfg.customTemplate) tags.push('template custom')
  } else if (props.agent.type === 'weekly_review') {
    if (cfg.period) tags.push(String(cfg.period))
  }
  return tags
})

function formatDate(ts: number, long = false): string {
  const d = new Date(ts)
  if (long) {
    return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.agent-card {
  background: var(--s1);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.15s, transform 0.15s;
}
.agent-card:hover {
  border-color: var(--border-hi);
  transform: translateY(-1px);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--r);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.card-name {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-type {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.12s;
}
.agent-card:hover .card-actions { opacity: 1; }

.card-action {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  border-radius: var(--r); color: var(--text-3); cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.card-action:hover { background: var(--s3); color: var(--text); }
.card-action.danger:hover { color: var(--danger); }

.card-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;
}

.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--text-3);
  background: var(--s3);
  padding: 2px 8px;
  border-radius: 100px;
  border: 1px solid var(--border);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.run-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-bd);
  border-radius: var(--r);
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.run-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 18%, transparent); border-color: var(--accent); }
.run-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.run-spinner {
  width: 10px; height: 10px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Runs history ── */
.runs-history {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.run-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: 100px;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.run-pill:hover { background: var(--s3); color: var(--text); border-color: var(--border-hi); }
.run-pill.error { color: var(--danger); border-color: rgba(239,68,68,0.25); }
.run-pill.error:hover { background: rgba(239,68,68,0.08); }

.pill-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pill-dot.done    { background: #4ade80; }
.pill-dot.running { background: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
.pill-dot.error   { background: var(--danger); }

@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
