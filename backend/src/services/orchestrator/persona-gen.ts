import { chatOnce } from '../ollama'

const PERSONA_GEN_SYSTEM = `Tu es un générateur de personas pour une interface LLM personnelle.
L'utilisateur décrit un besoin, tu génères un persona complet.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication, sans balises.

Format attendu :
{
  "name": "Nom court du persona (2-3 mots max)",
  "description": "Une phrase décrivant le rôle du persona",
  "systemPrompt": "Prompt système complet et détaillé, en français sauf si le contexte impose une autre langue",
  "temperature": 0.7,
  "color": "#hexcolor",
  "emoji": "🤖"
}

Règles :
- temperature : 0.1-0.3 pour du technique/précis, 0.4-0.6 pour de l'équilibré, 0.7-1.0 pour du créatif
- color : couleur hex qui correspond à l'ambiance du persona (ex: #3b82f6 pour technique, #10b981 pour créatif, #f59e0b pour stratégique)
- emoji : UN SEUL emoji unicode qui représente visuellement le persona (ex: 💻 dev, 📊 data, ✍️ rédacteur, 🏋️ coach sportif, ⚖️ juriste, 🎨 créatif, 🔬 scientifique)
- systemPrompt : détaillé, avec le rôle, le style de réponse, les contraintes éventuelles`

export class PersonaGenError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/** Génère un persona à partir d'une description en langage naturel. */
export async function generatePersona(description: string, model: string): Promise<unknown> {
  const { content } = await chatOnce(model, [
    { role: 'system', content: PERSONA_GEN_SYSTEM },
    { role: 'user', content: description },
  ])

  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new PersonaGenError("Le modèle n'a pas retourné de JSON valide", 422)

  try {
    return JSON.parse(match[0])
  } catch {
    throw new PersonaGenError('Le modèle a retourné un JSON malformé', 422)
  }
}
