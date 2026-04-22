import { Router } from 'express'
import { db } from '../db'
import { gmailAccounts } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getAuthUrl, exchangeCodeForTokens } from '../services/gmail'

export const gmailRouter = Router()

gmailRouter.get('/auth-url', (_req, res) => {
  try {
    const url = getAuthUrl()
    res.json({ url })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erreur' })
  }
})

gmailRouter.get('/callback', async (req, res) => {
  const code = req.query.code as string
  if (!code) return res.status(400).send('Code manquant')
  try {
    await exchangeCodeForTokens(code)
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?gmail=connected`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur OAuth'
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?gmail=error&msg=${encodeURIComponent(msg)}`)
  }
})

gmailRouter.get('/accounts', (_req, res) => {
  const accounts = db.select({
    id: gmailAccounts.id,
    email: gmailAccounts.email,
    createdAt: gmailAccounts.createdAt,
  }).from(gmailAccounts).all()
  res.json(accounts)
})

gmailRouter.delete('/accounts/:id', (req, res) => {
  db.delete(gmailAccounts).where(eq(gmailAccounts.id, req.params.id)).run()
  res.json({ ok: true })
})
