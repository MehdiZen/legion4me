import { db } from '../../db'
import { conversations, messages } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { chatOnce } from '../ollama'

/** Consigne de format appliquée à tous les personas, tous modes confondus. */
export const FORMAT_ADDENDUM = `\n\nFormat : Réponds en prose, sans listes à puces ni titres sauf si l'utilisateur en fait explicitement la demande. Sois concis et direct.`

/** Bloc décrivant les outils et la date — ajouté au system prompt en mode chat. */
export function getToolSystemAddendum(): string {
  const dateStr = new Date().toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  return `\n\n---
Date du jour : ${dateStr}

Tu as accès aux outils suivants :
- \`save_memory\` : mémorise un fait important sur l'utilisateur pour les futures conversations. Utilise-le dès que l'utilisateur révèle une préférence, contrainte, projet ou info personnelle utile à retenir.
- \`get_datetime\` : retourne la date et l'heure actuelles. Utilise-le dès qu'une question porte sur la date ou le temps.
- \`web_search\` : recherche web pour des informations récentes quand tu n'as pas d'URL précise. Inclus toujours la date ou la période pertinente dans ta query pour obtenir des résultats à jour.
- \`fetch_url\` : lit le contenu complet d'une page via un navigateur réel. **Priorité absolue** dès qu'une URL est connue ou fournie.
- \`youtube_transcript\` : récupère la transcription d'une vidéo YouTube depuis une URL ou un ID.
- \`wikipedia\` : recherche Wikipedia, plus fiable que web_search pour les faits encyclopédiques.

Règles impératives :
- Si tu as besoin d'un outil, **appelle-le immédiatement** — ne génère aucun texte avant.
- N'annonce jamais "je vais faire une recherche" ou "je vais consulter". Fais-le, c'est tout.
- **TOUJOURS appeler \`web_search\` en premier** pour : prix (carburant, immobilier, bourse, crypto…), actualités, météo, résultats sportifs, classements, taux de change, événements récents, sorties (films, jeux, albums…), ou toute donnée susceptible d'avoir changé depuis 2024.
- Ne jamais répondre d'après ta mémoire d'entraînement pour ces sujets, même si tu "crois" connaître la réponse.
- Pour \`save_memory\` : appelle-le en plus de ta réponse, pas à la place. Sauvegarde en silence, continue de répondre normalement.

---
Instruction de focus : **le dernier message de l'utilisateur est ta tâche principale**. L'historique ci-dessus est du contexte secondaire — consulte-le uniquement si le dernier message y fait implicitement référence (anaphore, ellipse, "comme on disait", etc.). Ne reformule pas ce qui a déjà été dit et ne répète pas les conclusions passées sauf si explicitement demandé.`
}

/** Insertion d'un message de conversation (rôles internes compris). */
export function saveMessage(fields: {
  conversationId: string
  role: string
  content: string
  personaId?: string | null
  model?: string | null
  toolCalls?: string | null
}) {
  db.insert(messages).values({
    id: crypto.randomUUID(),
    conversationId: fields.conversationId,
    role: fields.role,
    content: fields.content,
    personaId: fields.personaId ?? null,
    model: fields.model ?? null,
    toolCalls: fields.toolCalls ?? null,
    createdAt: Date.now(),
  }).run()
}

const TITLE_SYSTEM = 'Génère un titre court (5 mots max) pour cette conversation. Réponds UNIQUEMENT avec le titre, sans guillemets, sans ponctuation finale.'

/**
 * Génère le titre d'une conversation en tâche de fond, si elle n'en a pas.
 *
 * Pose immédiatement un titre sentinelle `…` pour qu'une requête concurrente
 * ne relance pas une seconde génération.
 */
export function generateTitle(conversationId: string, model: string, userContent: string) {
  const conv = db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
  if (!conv || conv.title) return

  db.update(conversations).set({ title: '…', updatedAt: Date.now() }).where(eq(conversations.id, conversationId)).run()

  chatOnce(model, [
    { role: 'system', content: TITLE_SYSTEM },
    { role: 'user', content: userContent },
  ], 0.3, undefined, false)
    .then(({ content: title }) => {
      const clean = title.trim().slice(0, 60)
      db.update(conversations)
        .set({ title: clean || userContent.slice(0, 50), updatedAt: Date.now() })
        .where(eq(conversations.id, conversationId)).run()
    })
    .catch((err) => {
      console.error('[title] generation failed:', err instanceof Error ? err.message : err)
      db.update(conversations)
        .set({ title: userContent.slice(0, 50), updatedAt: Date.now() })
        .where(eq(conversations.id, conversationId)).run()
    })
}
