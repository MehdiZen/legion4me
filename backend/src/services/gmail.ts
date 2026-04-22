import { google } from 'googleapis'
import { db } from '../db'
import { appSettings, gmailAccounts } from '../db/schema'
import { eq } from 'drizzle-orm'

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email']

function getRedirectUri(): string {
  return process.env.GMAIL_REDIRECT_URI || 'http://localhost:3001/api/gmail/callback'
}

export function getOAuthClient() {
  const clientId     = db.select().from(appSettings).where(eq(appSettings.key, 'google_client_id')).get()?.value
  const clientSecret = db.select().from(appSettings).where(eq(appSettings.key, 'google_client_secret')).get()?.value
  if (!clientId || !clientSecret) throw new Error('Google OAuth non configuré — ajoute Client ID et Client Secret dans les paramètres.')
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri())
}

export function getAuthUrl(): string {
  const oauth2 = getOAuthClient()
  return oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' })
}

export async function exchangeCodeForTokens(code: string): Promise<{ email: string }> {
  const oauth2 = getOAuthClient()
  const { tokens } = await oauth2.getToken(code)
  oauth2.setCredentials(tokens)

  const gmail = google.oauth2({ version: 'v2', auth: oauth2 })
  const info  = await gmail.userinfo.get()
  const email = info.data.email!

  const existing = db.select().from(gmailAccounts).where(eq(gmailAccounts.email, email)).get()
  const now = Date.now()

  if (existing) {
    db.update(gmailAccounts).set({
      accessToken:  tokens.access_token!,
      refreshToken: tokens.refresh_token || existing.refreshToken,
      expiresAt:    tokens.expiry_date ?? (now + 3600_000),
    }).where(eq(gmailAccounts.email, email)).run()
  } else {
    db.insert(gmailAccounts).values({
      id:           crypto.randomUUID(),
      email,
      accessToken:  tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt:    tokens.expiry_date ?? (now + 3600_000),
      createdAt:    now,
    }).run()
  }

  return { email }
}

async function getAuthenticatedClient(accountId: string) {
  const account = db.select().from(gmailAccounts).where(eq(gmailAccounts.id, accountId)).get()
  if (!account) throw new Error(`Compte Gmail ${accountId} introuvable`)

  const oauth2 = getOAuthClient()
  oauth2.setCredentials({ access_token: account.accessToken, refresh_token: account.refreshToken, expiry_date: account.expiresAt })

  oauth2.on('tokens', (tokens) => {
    if (tokens.access_token) {
      db.update(gmailAccounts).set({
        accessToken: tokens.access_token,
        expiresAt:   tokens.expiry_date ?? (Date.now() + 3600_000),
      }).where(eq(gmailAccounts.id, accountId)).run()
    }
  })

  return oauth2
}

export interface FetchedEmail {
  id: string
  from: string
  subject: string
  date: string
  snippet: string
  body: string
}

function decodeBody(part: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): string {
  if (part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8')
  }
  if (part.parts && Array.isArray(part.parts)) {
    for (const p of part.parts as typeof part[]) {
      if (p.mimeType === 'text/plain') {
        const text = decodeBody(p)
        if (text) return text
      }
    }
    for (const p of part.parts as typeof part[]) {
      const text = decodeBody(p)
      if (text) return text
    }
  }
  return ''
}

export async function fetchEmails(accountId: string, labels: string[], periodMs: number, maxResults = 30): Promise<FetchedEmail[]> {
  const auth  = await getAuthenticatedClient(accountId)
  const gmail = google.gmail({ version: 'v1', auth })

  const after = Math.floor((Date.now() - periodMs) / 1000)
  const q     = `after:${after} -category:promotions -category:social`

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: labels,
    q,
    maxResults,
  })

  const messageIds = listRes.data.messages ?? []
  if (!messageIds.length) return []

  const emails = await Promise.all(
    messageIds.map(async (m) => {
      const msg = await gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' })
      const headers = msg.data.payload?.headers ?? []
      const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

      const body = decodeBody(msg.data.payload as Parameters<typeof decodeBody>[0])
      const cleanBody = body.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 2000)

      return {
        id:      m.id!,
        from:    get('From'),
        subject: get('Subject'),
        date:    get('Date'),
        snippet: msg.data.snippet ?? '',
        body:    cleanBody,
      }
    })
  )

  return emails
}
