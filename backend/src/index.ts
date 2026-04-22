import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { personasRouter } from './routes/personas'
import { conversationsRouter } from './routes/conversations'
import { chatRouter } from './routes/chat'
import { modelsRouter } from './routes/models'
import { memoriesRouter } from './routes/memories'
import { statsRouter } from './routes/stats'
import { settingsRouter } from './routes/settings'
import { gmailRouter } from './routes/gmail'
import { agentsRouter } from './routes/agents'

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json({ limit: '20mb' }))

app.use('/api/personas', personasRouter)
app.use('/api/conversations', conversationsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/models', modelsRouter)
app.use('/api/memories', memoriesRouter)
app.use('/api/stats', statsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/gmail', gmailRouter)
app.use('/api/agents', agentsRouter)

// Serve frontend static files in production
const frontendDist = path.join(__dirname, '../../frontend/dist')
app.use(express.static(frontendDist))
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`ASMODEUS → http://localhost:${PORT}`)
})
