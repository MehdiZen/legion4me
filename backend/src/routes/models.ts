import { Router } from 'express'
import { getModels } from '../services/ollama'

export const modelsRouter = Router()

modelsRouter.get('/', async (_req, res) => {
  try {
    const models = await getModels()
    res.json(models)
  } catch {
    res.status(503).json({ error: 'Cannot reach Ollama. Is it running on localhost:11434?' })
  }
})
