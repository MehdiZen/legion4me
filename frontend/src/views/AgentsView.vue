<template>
  <div class="agents-view">
    <header class="agents-header">
      <div>
        <h1 class="agents-title">Agents</h1>
        <p class="agents-sub">Workflows déclenchables manuellement</p>
      </div>
      <button class="btn-primary" @click="openCreate">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nouvel agent
      </button>
    </header>

    <div v-if="!store.agents.length" class="agents-empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.25">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      <span>Aucun agent configuré</span>
      <button class="btn-ghost" @click="openCreate">Créer mon premier agent</button>
    </div>

    <div v-else class="agents-grid">
      <AgentCard
        v-for="agent in store.agents"
        :key="agent.id"
        :agent="agent"
        :runs="store.agentRuns[agent.id] ?? []"
        :is-running="runningAgentId === agent.id"
        @edit="openEdit(agent)"
        @delete="confirmDelete(agent)"
        @run="handleRun(agent)"
        @view="openRun(agent, $event)"
      />
    </div>

    <!-- Output panel -->
    <Teleport to="body">
      <Transition name="panel">
        <div v-if="activeRun" class="output-backdrop" @click.self="closeOutput">
          <div class="output-panel">
            <div class="output-header">
              <span class="output-title">{{ activeRunAgentName }}</span>
              <div class="output-header-right">
                <span v-if="activeRun.status === 'running'" class="output-status running">En cours…</span>
                <span v-else-if="activeRun.status === 'error'" class="output-status error">Erreur</span>
                <span v-else class="output-status done">Terminé</span>
                <button class="output-close" @click="closeOutput">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="output-body">
              <div v-if="activeRun.status === 'running'" class="output-loading">
                <span class="pulse" />
                <span>Exécution en cours…</span>
              </div>
              <div v-else-if="activeRun.output" class="output-markdown" v-html="renderMd(activeRun.output)" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Create/Edit modal -->
    <AgentModal
      v-if="modalOpen"
      :agent="editingAgent"
      @close="modalOpen = false"
      @saved="onSaved"
    />

    <!-- Meeting transcript modal -->
    <Teleport to="body">
      <Transition name="panel">
        <div v-if="transcriptModal" class="output-backdrop" @click.self="transcriptModal = false">
          <div class="transcript-modal">
            <div class="output-header">
              <span class="output-title">Coller la transcription</span>
              <button class="output-close" @click="transcriptModal = false">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <textarea v-model="transcriptText" class="transcript-input" placeholder="Collez la transcription de votre réunion ici…" />
            <div class="transcript-footer">
              <button class="btn-ghost" @click="transcriptModal = false">Annuler</button>
              <button class="btn-primary" :disabled="!transcriptText.trim()" @click="submitTranscript">
                Analyser
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useAgentsStore, type Agent, type AgentRun } from '@/stores/agents'
import AgentCard from '@/components/AgentCard.vue'
import AgentModal from '@/components/AgentModal.vue'

const store = useAgentsStore()
const modalOpen    = ref(false)
const editingAgent = ref<Agent | null>(null)
const activeRun    = ref<AgentRun | null>(null)
const activeRunAgentName = ref('')
const pollInterval = ref<ReturnType<typeof setInterval> | null>(null)
const runningAgentId = ref<string | null>(null)

const transcriptModal  = ref(false)
const transcriptText   = ref('')
const pendingTranscriptAgent = ref<Agent | null>(null)

onMounted(async () => {
  await store.fetchAgents()
  store.loadAllRuns()
})

function openCreate() { editingAgent.value = null; modalOpen.value = true }
function openEdit(agent: Agent) { editingAgent.value = agent; modalOpen.value = true }
function onSaved() { modalOpen.value = false; store.fetchAgents() }

async function confirmDelete(agent: Agent) {
  if (!confirm(`Supprimer l'agent "${agent.name}" ?`)) return
  await store.deleteAgent(agent.id)
}

async function handleRun(agent: Agent) {
  if (agent.type === 'meeting_summary') {
    pendingTranscriptAgent.value = agent
    transcriptText.value = ''
    transcriptModal.value = true
    return
  }
  await launchRun(agent, {})
}

async function submitTranscript() {
  if (!pendingTranscriptAgent.value || !transcriptText.value.trim()) return
  transcriptModal.value = false
  await launchRun(pendingTranscriptAgent.value, { transcript: transcriptText.value })
  pendingTranscriptAgent.value = null
}

function openRun(agent: Agent, run: AgentRun) {
  activeRunAgentName.value = agent.name
  activeRun.value = run
}

async function launchRun(agent: Agent, extra: { transcript?: string }) {
  try {
    activeRunAgentName.value = agent.name
    runningAgentId.value = agent.id
    const runId = await store.runAgent(agent.id, extra)
    activeRun.value = { id: runId, agentId: agent.id, status: 'running', output: null, createdAt: Date.now() }

    if (pollInterval.value) clearInterval(pollInterval.value)
    pollInterval.value = setInterval(async () => {
      const run = await store.pollRun(runId)
      activeRun.value = run
      if (run.status !== 'running') {
        clearInterval(pollInterval.value!)
        pollInterval.value = null
        runningAgentId.value = null
        await store.loadRuns(agent.id)
      }
    }, 1500)
  } catch (err) {
    runningAgentId.value = null
    alert(err instanceof Error ? err.message : 'Erreur lors du lancement')
  }
}

function closeOutput() {
  if (pollInterval.value) clearInterval(pollInterval.value)
  activeRun.value = null
}

// La sortie d'un agent dérive de contenus tiers (corps d'emails, pages web) :
// elle doit être sanitisée avant tout rendu en v-html.
function renderMd(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }) as string)
}
</script>

<style scoped>
.agents-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--bg);
}

.agents-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32px 40px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.agents-title {
  font-family: var(--font-brand);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text);
  margin: 0 0 4px;
}

.agents-sub {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
  letter-spacing: 0.04em;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-bd);
  border-radius: var(--r);
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-primary:hover { background: color-mix(in srgb, var(--accent) 15%, transparent); border-color: var(--accent); }

.btn-ghost {
  padding: 8px 16px;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--r);
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.btn-ghost:hover { background: var(--s3); color: var(--text); }

.agents-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-3);
  font-family: var(--font-ui);
  font-size: 13px;
  letter-spacing: 0.04em;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  padding: 32px 40px;
}

/* ── Output panel ── */
.output-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

.output-panel {
  width: min(680px, 100vw);
  background: var(--s1);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.output-title {
  font-family: var(--font-brand);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
}

.output-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.output-status {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border-radius: var(--r);
}
.output-status.running { color: var(--accent); background: var(--accent-bg); }
.output-status.done    { color: #4ade80; background: rgba(74, 222, 128, 0.1); }
.output-status.error   { color: var(--danger); background: rgba(239,68,68,0.1); }

.output-close {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--border);
  border-radius: var(--r); color: var(--text-3); cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.output-close:hover { background: var(--s3); color: var(--text); }

.output-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.output-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
  font-family: var(--font-ui);
  font-size: 13px;
  padding: 40px 0;
  justify-content: center;
}

.pulse {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }

.output-markdown {
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
}
.output-markdown :deep(h1),
.output-markdown :deep(h2),
.output-markdown :deep(h3) {
  font-family: var(--font-brand);
  letter-spacing: 0.06em;
  color: var(--text);
  margin: 1.4em 0 0.6em;
}
.output-markdown :deep(h1) { font-size: 18px; }
.output-markdown :deep(h2) { font-size: 15px; }
.output-markdown :deep(h3) { font-size: 13px; color: var(--accent); }
.output-markdown :deep(p)  { margin: 0.6em 0; }
.output-markdown :deep(ul),
.output-markdown :deep(ol) { padding-left: 20px; margin: 0.5em 0; }
.output-markdown :deep(li) { margin: 0.3em 0; }
.output-markdown :deep(strong) { color: var(--text); font-weight: 600; }
.output-markdown :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
.output-markdown :deep(code) {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--s3);
  padding: 1px 5px;
  border-radius: 3px;
}

/* ── Transcript modal ── */
.transcript-modal {
  width: min(600px, 90vw);
  background: var(--s1);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  display: flex;
  flex-direction: column;
  gap: 0;
  align-self: center;
  max-height: 80vh;
}

.transcript-input {
  flex: 1;
  min-height: 300px;
  padding: 16px 20px;
  background: var(--s2);
  border: none;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
}
.transcript-input::placeholder { color: var(--text-3); }

.transcript-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
}

/* ── Transitions ── */
.panel-enter-active { transition: opacity 0.2s ease; }
.panel-leave-active { transition: opacity 0.15s ease; }
.panel-enter-from,
.panel-leave-to     { opacity: 0; }
</style>
