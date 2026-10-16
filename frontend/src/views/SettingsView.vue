<template>
  <div class="settings-view">
    <header class="settings-header">
      <h1 class="settings-title">Paramètres</h1>
    </header>

    <div class="settings-body">

      <!-- Google OAuth -->
      <section class="section">
        <h2 class="section-title">Google OAuth</h2>
        <p class="section-desc">Requis pour connecter des comptes Gmail. Crée une application sur <a href="https://console.cloud.google.com" target="_blank" class="link">Google Cloud Console</a>, active l'API Gmail, et récupère les credentials OAuth 2.0.</p>

        <div class="fields">
          <div class="field">
            <label>Client ID</label>
            <input v-model="googleClientId" class="input" placeholder="123456789.apps.googleusercontent.com" />
          </div>
          <div class="field">
            <label>Client Secret</label>
            <input v-model="googleClientSecret" class="input" type="password" placeholder="GOCSPX-…" />
          </div>
          <div class="field">
            <label>Redirect URI <span class="hint-inline">(à enregistrer dans Google Cloud Console)</span></label>
            <div class="copy-field">
              <span class="copy-value">{{ redirectUri }}</span>
              <button class="copy-btn" @click="copy(redirectUri)" title="Copier">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <button class="btn-primary" :disabled="!googleClientId || !googleClientSecret" @click="saveGoogle">
          Enregistrer
        </button>
        <span v-if="googleSaved" class="saved-msg">✓ Enregistré</span>
      </section>

      <div class="divider" />

      <!-- Gmail accounts -->
      <section class="section">
        <h2 class="section-title">Comptes Gmail connectés</h2>
        <p class="section-desc">Les comptes connectés peuvent être utilisés par les agents Email Digest.</p>

        <div v-if="gmailAccounts.length" class="accounts-list">
          <div v-for="acc in gmailAccounts" :key="acc.id" class="account-item">
            <div class="account-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <span class="account-email">{{ acc.email }}</span>
            <button class="account-remove" @click="removeAccount(acc.id)" title="Déconnecter">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <p v-else class="empty-msg">Aucun compte connecté.</p>

        <a v-if="gmailAuthUrl" :href="gmailAuthUrl" target="_blank" class="btn-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          Connecter un compte Gmail
        </a>
        <p v-else class="hint">Configure Google OAuth ci-dessus pour activer la connexion Gmail.</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/lib/api'

const route = useRoute()

const googleClientId     = ref('')
const googleClientSecret = ref('')
const googleSaved        = ref(false)
const gmailAccounts      = ref<{ id: string; email: string }[]>([])
const gmailAuthUrl       = ref('')
const redirectUri        = `${window.location.origin}/api/gmail/callback`

onMounted(async () => {
  await loadSettings()
  await loadGmailAccounts()
  await loadGmailAuthUrl()

  if (route.query.gmail === 'connected') {
    await loadGmailAccounts()
  }
})

async function loadSettings() {
  try {
    const data = await api.get<Record<string, string>>('/settings')
    googleClientId.value     = data.google_client_id ?? ''
    googleClientSecret.value = ''
  } catch {}
}

async function saveGoogle() {
  const body: Record<string, string> = {}
  if (googleClientId.value.trim())     body.google_client_id     = googleClientId.value.trim()
  if (googleClientSecret.value.trim()) body.google_client_secret = googleClientSecret.value.trim()

  await api.post('/settings', body)
  googleSaved.value = true
  setTimeout(() => { googleSaved.value = false }, 2500)
  await loadGmailAuthUrl()
}

async function loadGmailAccounts() {
  try {
    gmailAccounts.value = await api.get('/gmail/accounts')
  } catch {}
}

async function loadGmailAuthUrl() {
  try {
    const data = await api.get<{ url: string }>('/gmail/auth-url')
    gmailAuthUrl.value = data.url
  } catch {
    gmailAuthUrl.value = ''
  }
}

async function removeAccount(id: string) {
  if (!confirm('Déconnecter ce compte ?')) return
  await api.del(`/gmail/accounts/${id}`)
  gmailAccounts.value = gmailAccounts.value.filter(a => a.id !== id)
}

function copy(text: string) {
  navigator.clipboard.writeText(text)
}
</script>

<style scoped>
.settings-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--bg);
}

.settings-header {
  padding: 32px 40px 24px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.settings-title {
  font-family: var(--font-brand);
  font-size: 18px; font-weight: 600;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--text); margin: 0;
}

.settings-body {
  padding: 32px 40px;
  display: flex; flex-direction: column; gap: 32px;
  max-width: 640px;
}

.section {
  display: flex; flex-direction: column; gap: 16px;
}

.section-title {
  font-family: var(--font-brand);
  font-size: 13px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text); margin: 0;
}

.section-desc {
  font-family: var(--font-ui); font-size: 13px;
  color: var(--text-3); line-height: 1.6; margin: 0;
}

.fields { display: flex; flex-direction: column; gap: 14px; }

.field { display: flex; flex-direction: column; gap: 6px; }

label {
  font-family: var(--font-ui); font-size: 12px; font-weight: 500;
  color: var(--text-2); letter-spacing: 0.04em;
}

.hint-inline { font-weight: 400; color: var(--text-3); font-size: 11px; }

.input {
  padding: 8px 12px;
  background: var(--s1); border: 1px solid var(--border);
  border-radius: var(--r); color: var(--text);
  font-family: var(--font-ui); font-size: 13px;
  outline: none; transition: border-color 0.15s;
  width: 100%; box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.input::placeholder { color: var(--text-3); }

.copy-field {
  display: flex; align-items: center;
  background: var(--s1); border: 1px solid var(--border);
  border-radius: var(--r); overflow: hidden;
}
.copy-value {
  flex: 1; padding: 8px 12px;
  font-family: var(--font-mono); font-size: 12px;
  color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.copy-btn {
  padding: 8px 12px; background: none; border: none;
  border-left: 1px solid var(--border); color: var(--text-3);
  cursor: pointer; transition: background 0.12s, color 0.12s; flex-shrink: 0;
}
.copy-btn:hover { background: var(--s3); color: var(--text); }

.btn-primary {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 18px;
  background: var(--accent-bg); border: 1px solid var(--accent-bd);
  border-radius: var(--r); color: var(--accent);
  font-family: var(--font-ui); font-size: 13px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s; width: fit-content;
}
.btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 18%, transparent); border-color: var(--accent); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-secondary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  background: var(--s1); border: 1px solid var(--border);
  border-radius: var(--r); color: var(--text-2);
  font-family: var(--font-ui); font-size: 13px;
  text-decoration: none; cursor: pointer; width: fit-content;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.btn-secondary:hover { background: var(--s3); color: var(--text); border-color: var(--border-hi); }

.saved-msg {
  font-family: var(--font-ui); font-size: 12px;
  color: #4ade80;
}

.accounts-list { display: flex; flex-direction: column; gap: 8px; }

.account-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: var(--s1); border: 1px solid var(--border);
  border-radius: var(--r);
}

.account-icon {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-bg); border-radius: var(--r);
  color: var(--accent); flex-shrink: 0;
}

.account-email {
  flex: 1; font-family: var(--font-ui); font-size: 13px; color: var(--text-2);
}

.account-remove {
  background: none; border: none; color: var(--text-3);
  cursor: pointer; padding: 4px; border-radius: var(--r);
  transition: color 0.12s, background 0.12s;
  display: flex; align-items: center; justify-content: center;
}
.account-remove:hover { color: var(--danger); background: rgba(239,68,68,0.1); }

.empty-msg, .hint {
  font-family: var(--font-ui); font-size: 13px;
  color: var(--text-3); margin: 0;
}

.link {
  color: var(--accent); text-decoration: none;
  transition: opacity 0.12s;
}
.link:hover { opacity: 0.8; }

.divider { height: 1px; background: var(--border); }
</style>
