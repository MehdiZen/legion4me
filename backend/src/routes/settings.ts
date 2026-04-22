import { Router } from 'express'
import { db } from '../db'
import { appSettings } from '../db/schema'
import { eq } from 'drizzle-orm'

export const settingsRouter = Router()

const PUBLIC_KEYS = ['google_client_id', 'google_client_secret']

settingsRouter.get('/', (_req, res) => {
  const rows = db.select().from(appSettings).all()
  const result: Record<string, string> = {}
  for (const row of rows) {
    if (PUBLIC_KEYS.includes(row.key)) {
      result[row.key] = row.key === 'google_client_secret' && row.value
        ? '••••••••'
        : row.value
    }
  }
  res.json(result)
})

settingsRouter.post('/', (req, res) => {
  const body = req.body as Record<string, string>
  for (const [key, value] of Object.entries(body)) {
    if (!PUBLIC_KEYS.includes(key)) continue
    if (!value?.trim()) continue
    const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
    if (existing) {
      db.update(appSettings).set({ value: value.trim() }).where(eq(appSettings.key, key)).run()
    } else {
      db.insert(appSettings).values({ key, value: value.trim() }).run()
    }
  }
  res.json({ ok: true })
})

settingsRouter.get('/google-configured', (_req, res) => {
  const clientId     = db.select().from(appSettings).where(eq(appSettings.key, 'google_client_id')).get()?.value
  const clientSecret = db.select().from(appSettings).where(eq(appSettings.key, 'google_client_secret')).get()?.value
  res.json({ configured: !!(clientId && clientSecret) })
})
