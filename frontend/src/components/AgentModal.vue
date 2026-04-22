<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="$emit('close')">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{{ isEdit ? 'Modifier l\'agent' : 'Nouvel agent' }}</span>
          <button class="modal-close" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- Name + type -->
          <div class="field">
            <label>Nom</label>
            <input v-model="form.name" class="input" placeholder="Mon agent email…" />
          </div>

          <div class="field">
            <label>Type</label>
            <select v-model="form.type" class="input" :disabled="isEdit">
              <option value="email_digest">Email Digest</option>
              <option value="morning_briefing">Morning Briefing</option>
              <option value="veille">Veille thématique</option>
              <option value="meeting_summary">Résumé de réunion</option>
              <option value="weekly_review">Weekly Review</option>
            </select>
          </div>

          <div class="field">
            <label>Persona</label>
            <select v-model="form.personaId" class="input">
              <option value="">Aucun (modèle par défaut)</option>
              <option v-for="p in personaStore.personas" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>

          <div class="divider" />

          <!-- Email digest config -->
          <template v-if="form.type === 'email_digest'">
            <div class="field">
              <label>Comptes Gmail</label>
              <div v-if="!gmailAccounts.length" class="hint">
                Aucun compte connecté —
                <a :href="gmailAuthUrl" target="_blank" class="link" @click="pendingGmailConnect = true">Connecter un compte</a>
              </div>
              <div v-else class="checkboxes">
                <label v-for="acc in gmailAccounts" :key="acc.id" class="checkbox-item">
                  <input type="checkbox" :value="acc.id" v-model="emailConfig.gmailAccountIds" />
                  {{ acc.email }}
                </label>
                <a :href="gmailAuthUrl" target="_blank" class="link small">+ Ajouter un compte</a>
              </div>
            </div>
            <div class="field">
              <label>Labels</label>
              <div class="checkboxes">
                <label v-for="label in gmailLabels" :key="label.value" class="checkbox-item">
                  <input type="checkbox" :value="label.value" v-model="emailConfig.labels" />
                  {{ label.name }}
                </label>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Période</label>
                <select v-model="emailConfig.period" class="input">
                  <option value="today">Aujourd'hui</option>
                  <option value="24h">24 heures</option>
                  <option value="48h">48 heures</option>
                  <option value="week">7 jours</option>
                </select>
              </div>
              <div class="field">
                <label>Format</label>
                <select v-model="emailConfig.format" class="input">
                  <option value="short">Court</option>
                  <option value="detailed">Détaillé</option>
                </select>
              </div>
            </div>
          </template>

          <!-- Morning briefing config -->
          <template v-if="form.type === 'morning_briefing'">
            <div class="field">
              <label>Ville (météo)</label>
              <input v-model="morningConfig.city" class="input" placeholder="Paris" />
            </div>
            <div class="field">
              <label>Topics <span class="hint-inline">(un par ligne)</span></label>
              <textarea v-model="morningTopicsText" class="input textarea" placeholder="Intelligence artificielle&#10;Crypto&#10;Tech" />
            </div>
            <div class="field">
              <label>Langue du briefing</label>
              <select v-model="morningConfig.language" class="input">
                <option value="fr">Français</option>
                <option value="en">Anglais</option>
              </select>
            </div>
          </template>

          <!-- Veille config -->
          <template v-if="form.type === 'veille'">
            <div class="field">
              <label>Sujets <span class="hint-inline">(un par ligne)</span></label>
              <textarea v-model="veilleTopicsText" class="input textarea" placeholder="IA générative&#10;Startups France&#10;Cybersécurité" />
            </div>
            <div class="field">
              <label>Sites spécifiques <span class="hint-inline">(optionnel, un par ligne)</span></label>
              <textarea v-model="veilleSitesText" class="input textarea small" placeholder="techcrunch.com&#10;01net.com" />
            </div>
          </template>

          <!-- Meeting summary config -->
          <template v-if="form.type === 'meeting_summary'">
            <div class="field">
              <label>Sections à extraire</label>
              <div class="checkboxes">
                <label v-for="s in meetingSections" :key="s.value" class="checkbox-item">
                  <input type="checkbox" :value="s.value" v-model="meetingConfig.sections" />
                  {{ s.label }}
                </label>
              </div>
            </div>
            <div class="field">
              <label>Template custom <span class="hint-inline">(optionnel — remplace les sections)</span></label>
              <textarea v-model="meetingConfig.customTemplate" class="input textarea" placeholder="## Actions&#10;- ...&#10;## Décisions&#10;- ..." />
            </div>
          </template>

          <!-- Weekly review config -->
          <template v-if="form.type === 'weekly_review'">
            <div class="field">
              <label>Période</label>
              <select v-model="weeklyConfig.period" class="input">
                <option value="7d">7 derniers jours</option>
                <option value="30d">30 derniers jours</option>
              </select>
            </div>
            <div class="field">
              <label class="checkbox-item">
                <input type="checkbox" v-model="weeklyConfig.includeConversations" />
                Inclure l'historique des conversations Asmodeus
              </label>
            </div>
          </template>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" @click="$emit('close')">Annuler</button>
          <button class="btn-primary" :disabled="!isValid" @click="save">
            {{ isEdit ? 'Enregistrer' : 'Créer' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAgentsStore, type Agent, type AgentType } from '@/stores/agents'
import { usePersonaStore } from '@/stores/persona'

const props = defineProps<{ agent: Agent | null }>()
const emit  = defineEmits<{ close: []; saved: [] }>()

const store       = useAgentsStore()
const personaStore = usePersonaStore()

const isEdit = computed(() => !!props.agent)

const form = ref({ name: '', type: 'email_digest' as AgentType, personaId: '' })

// Type-specific configs
const emailConfig   = ref({ gmailAccountIds: [] as string[], labels: ['INBOX'], period: '24h', format: 'short' })
const morningConfig = ref({ city: '', language: 'fr' })
const morningTopicsText = ref('')
const veilleTopicsText  = ref('')
const veilleSitesText   = ref('')
const meetingConfig = ref({ sections: ['decisions', 'actions', 'open_points'], customTemplate: '' })
const weeklyConfig  = ref({ period: '7d', includeConversations: true })

// Gmail
const gmailAccounts  = ref<{ id: string; email: string }[]>([])
const gmailAuthUrl   = ref('')
const pendingGmailConnect = ref(false)

const gmailLabels = [
  { name: 'Boîte de réception', value: 'INBOX' },
  { name: 'Important',          value: 'IMPORTANT' },
  { name: 'Non lu',             value: 'UNREAD' },
]

const meetingSections = [
  { label: 'Décisions prises',    value: 'decisions' },
  { label: "Points d'action",     value: 'actions' },
  { label: 'Participants',        value: 'participants' },
  { label: 'Points ouverts',      value: 'open_points' },
  { label: 'Résumé général',      value: 'summary' },
  { label: 'Points clés',         value: 'key_points' },
]

onMounted(async () => {
  if (props.agent) {
    form.value.name      = props.agent.name
    form.value.type      = props.agent.type
    form.value.personaId = props.agent.personaId ?? ''
    loadConfig(props.agent.config)
  }
  await loadGmailAccounts()
  await loadGmailAuthUrl()
})

function loadConfig(config: Record<string, unknown>) {
  if (form.value.type === 'email_digest') {
    emailConfig.value = {
      gmailAccountIds: (config.gmailAccountIds as string[]) ?? [],
      labels:          (config.labels as string[]) ?? ['INBOX'],
      period:          (config.period as string) ?? '24h',
      format:          (config.format as string) ?? 'short',
    }
  } else if (form.value.type === 'morning_briefing') {
    morningConfig.value.city     = (config.city as string) ?? ''
    morningConfig.value.language = (config.language as string) ?? 'fr'
    morningTopicsText.value      = ((config.topics as string[]) ?? []).join('\n')
  } else if (form.value.type === 'veille') {
    veilleTopicsText.value = ((config.topics as string[]) ?? []).join('\n')
    veilleSitesText.value  = ((config.specificSites as string[]) ?? []).join('\n')
  } else if (form.value.type === 'meeting_summary') {
    meetingConfig.value = {
      sections:       (config.sections as string[]) ?? ['decisions', 'actions', 'open_points'],
      customTemplate: (config.customTemplate as string) ?? '',
    }
  } else if (form.value.type === 'weekly_review') {
    weeklyConfig.value = {
      period:               (config.period as string) ?? '7d',
      includeConversations: (config.includeConversations as boolean) ?? true,
    }
  }
}

async function loadGmailAccounts() {
  try {
    const res = await fetch('/api/gmail/accounts')
    gmailAccounts.value = await res.json()
  } catch { gmailAccounts.value = [] }
}

async function loadGmailAuthUrl() {
  try {
    const res = await fetch('/api/gmail/auth-url')
    if (res.ok) {
      const data = await res.json()
      gmailAuthUrl.value = data.url
    }
  } catch { /* Google not configured */ }
}

function buildConfig(): Record<string, unknown> {
  if (form.value.type === 'email_digest') {
    return { ...emailConfig.value }
  } else if (form.value.type === 'morning_briefing') {
    return {
      city:     morningConfig.value.city,
      language: morningConfig.value.language,
      topics:   morningTopicsText.value.split('\n').map(s => s.trim()).filter(Boolean),
    }
  } else if (form.value.type === 'veille') {
    return {
      topics:        veilleTopicsText.value.split('\n').map(s => s.trim()).filter(Boolean),
      specificSites: veilleSitesText.value.split('\n').map(s => s.trim()).filter(Boolean),
    }
  } else if (form.value.type === 'meeting_summary') {
    return { ...meetingConfig.value }
  } else {
    return { ...weeklyConfig.value }
  }
}

const isValid = computed(() => form.value.name.trim().length > 0 && form.value.type)

async function save() {
  const data = {
    name:      form.value.name.trim(),
    type:      form.value.type,
    config:    buildConfig(),
    personaId: form.value.personaId || null,
  }
  if (isEdit.value && props.agent) {
    await store.updateAgent(props.agent.id, data)
  } else {
    await store.createAgent(data)
  }
  emit('saved')
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}

.modal {
  width: min(560px, calc(100vw - 32px));
  max-height: 88vh;
  background: var(--s1);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal-title {
  font-family: var(--font-brand);
  font-size: 14px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text);
}

.modal-close {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--border);
  border-radius: var(--r); color: var(--text-3); cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.modal-close:hover { background: var(--s3); color: var(--text); }

.modal-body {
  flex: 1; overflow-y: auto;
  padding: 24px;
  display: flex; flex-direction: column; gap: 18px;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

label {
  font-family: var(--font-ui);
  font-size: 12px; font-weight: 500;
  color: var(--text-2);
  letter-spacing: 0.04em;
}

.input {
  padding: 8px 12px;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.input::placeholder { color: var(--text-3); }

.textarea {
  min-height: 90px;
  resize: vertical;
  line-height: 1.5;
}
.textarea.small { min-height: 60px; }

select.input { cursor: pointer; }
select.input:disabled { opacity: 0.5; }

.checkboxes { display: flex; flex-direction: column; gap: 8px; }
.checkbox-item {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-ui); font-size: 13px;
  color: var(--text-2); cursor: pointer;
}
.checkbox-item input[type=checkbox] { accent-color: var(--accent); width: 14px; height: 14px; }

.hint {
  font-family: var(--font-ui); font-size: 12px;
  color: var(--text-3);
}
.hint-inline {
  font-weight: 400; color: var(--text-3); font-size: 11px;
}

.link {
  color: var(--accent); text-decoration: none;
  transition: opacity 0.12s;
}
.link:hover { opacity: 0.8; }
.link.small { font-size: 12px; margin-top: 4px; display: inline-block; }

.divider { height: 1px; background: var(--border); }

.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.btn-primary {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 18px;
  background: var(--accent-bg); border: 1px solid var(--accent-bd);
  border-radius: var(--r); color: var(--accent);
  font-family: var(--font-ui); font-size: 13px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 18%, transparent); border-color: var(--accent); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-ghost {
  padding: 8px 16px;
  background: none; border: 1px solid var(--border);
  border-radius: var(--r); color: var(--text-2);
  font-family: var(--font-ui); font-size: 13px; cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.btn-ghost:hover { background: var(--s3); color: var(--text); }
</style>
