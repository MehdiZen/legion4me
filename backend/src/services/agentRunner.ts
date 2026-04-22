import { db } from '../db'
import { agents, agentRuns, personas, memories, gmailAccounts } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { chatOnce } from './ollama'
import { fetchEmails } from './gmail'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentType = 'email_digest' | 'morning_briefing' | 'veille' | 'meeting_summary' | 'weekly_review'

export interface EmailDigestConfig {
  gmailAccountIds: string[]
  labels: string[]
  period: 'today' | '24h' | '48h' | 'week'
  format: 'short' | 'detailed'
}

export interface MorningBriefingConfig {
  city: string
  topics: string[]
  language: string
}

export interface VeilleConfig {
  topics: string[]
  specificSites: string[]
}

export interface MeetingSummaryConfig {
  sections: string[]
  customTemplate: string
}

export interface WeeklyReviewConfig {
  period: '7d' | '30d'
  includeConversations: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodToMs(period: EmailDigestConfig['period']): number {
  switch (period) {
    case 'today': {
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return now.getTime() - midnight.getTime()
    }
    case '24h':  return 24 * 60 * 60 * 1000
    case '48h':  return 48 * 60 * 60 * 1000
    case 'week': return 7 * 24 * 60 * 60 * 1000
  }
}

function getPersonaModel(personaId: string | null | undefined): string {
  if (!personaId) return 'qwen3.5:9b'
  return db.select().from(personas).where(eq(personas.id, personaId)).get()?.model ?? 'qwen3.5:9b'
}

async function fetchWeather(city: string): Promise<string> {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`,
      { signal: AbortSignal.timeout(8000) }
    )
    const geoData = await geoRes.json() as { results?: { latitude: number; longitude: number; name: string; country: string }[] }
    const loc = geoData.results?.[0]
    if (!loc) return `[Météo indisponible pour "${city}"]`

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_mean,weather_code&timezone=auto&forecast_days=3`,
      { signal: AbortSignal.timeout(8000) }
    )
    const w = await weatherRes.json() as {
      current: { temperature_2m: number; weather_code: number; wind_speed_10m: number; relative_humidity_2m: number }
      daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_mean: number[] }
    }

    const wmoCode: Record<number, string> = {
      0: 'Ciel dégagé', 1: 'Principalement dégagé', 2: 'Partiellement nuageux', 3: 'Couvert',
      45: 'Brouillard', 48: 'Brouillard givrant', 51: 'Bruine légère', 53: 'Bruine modérée',
      61: 'Pluie légère', 63: 'Pluie modérée', 65: 'Pluie forte', 71: 'Neige légère',
      80: 'Averses légères', 81: 'Averses modérées', 95: 'Orage',
    }
    const desc = wmoCode[w.current.weather_code] ?? `Code ${w.current.weather_code}`

    const lines = [
      `Météo à ${loc.name}, ${loc.country} :`,
      `Actuellement : ${w.current.temperature_2m}°C, ${desc}, vent ${w.current.wind_speed_10m} km/h, humidité ${w.current.relative_humidity_2m}%`,
    ]
    for (let i = 0; i < Math.min(3, w.daily.time.length); i++) {
      lines.push(`${w.daily.time[i]} : ${w.daily.temperature_2m_min[i]}–${w.daily.temperature_2m_max[i]}°C, précip. ${w.daily.precipitation_probability_mean[i]}%`)
    }
    return lines.join('\n')
  } catch {
    return `[Météo indisponible pour "${city}"]`
  }
}

interface SearchResult {
  title: string
  url: string
  content: string
}

async function searchWeb(query: string): Promise<{ answer: string; results: SearchResult[] } | null> {
  const tavilyKey = process.env.TAVILY_API_KEY
  if (!tavilyKey) return null
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: 'advanced',
        max_results: 6,
        include_answer: true,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const data = await res.json() as { answer?: string; results: { title: string; url: string; content: string }[] }
    return {
      answer:  data.answer ?? '',
      results: data.results.map(r => ({ title: r.title, url: r.url, content: r.content })),
    }
  } catch {
    return null
  }
}

function formatSearchResults(data: { answer: string; results: SearchResult[] }): string {
  const lines: string[] = []
  if (data.answer) lines.push(`Synthèse : ${data.answer}\n`)
  for (const r of data.results) {
    lines.push(`Source : ${r.title}\nURL : ${r.url}\n${r.content.slice(0, 800)}`)
  }
  return lines.join('\n\n---\n\n')
}

// ── Runners ───────────────────────────────────────────────────────────────────

async function runEmailDigest(config: EmailDigestConfig, personaId: string | null | undefined): Promise<string> {
  if (!config.gmailAccountIds?.length) return '# Digest email\n\nAucun compte Gmail configuré.'

  const periodMs = periodToMs(config.period)
  const labels   = config.labels?.length ? config.labels : ['INBOX']

  const allEmails: string[] = []
  for (const accountId of config.gmailAccountIds) {
    const account = db.select().from(gmailAccounts).where(eq(gmailAccounts.id, accountId)).get()
    if (!account) continue
    const emails = await fetchEmails(accountId, labels, periodMs)
    if (emails.length) {
      allEmails.push(`## ${account.email} (${emails.length} email${emails.length > 1 ? 's' : ''})\n`)
      for (const e of emails) {
        allEmails.push(`**De :** ${e.from}\n**Objet :** ${e.subject}\n**Date :** ${e.date}\n${e.body || e.snippet}`)
      }
    }
  }

  if (!allEmails.length) return '# Digest email\n\nAucun email reçu sur la période sélectionnée.'

  const emailsText = allEmails.join('\n\n---\n\n').slice(0, 20000)
  const systemPrompt = config.format === 'short'
    ? `Tu es un assistant de synthèse email. Résume ces emails de façon concise : pour chaque email, une ligne avec expéditeur, sujet et l'essentiel. Groupe par compte si plusieurs. Formate en Markdown.`
    : `Tu es un assistant de synthèse email. Analyse ces emails et produis un digest structuré : pour chaque email, indique l'expéditeur, le sujet, et un résumé de 2-3 phrases. Identifie les emails nécessitant une action. Formate en Markdown.`

  const model = getPersonaModel(personaId)
  const { content } = await chatOnce(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: emailsText },
  ], 0.3, undefined, false)

  return content
}

async function runMorningBriefing(config: MorningBriefingConfig, personaId: string | null | undefined): Promise<string> {
  const parts: string[] = []

  if (config.city) {
    const weather = await fetchWeather(config.city)
    parts.push(`### Météo\n${weather}`)
  }

  if (config.topics?.length) {
    const dateTag = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
    for (const topic of config.topics.slice(0, 4)) {
      const data = await searchWeb(`${topic} actualités ${dateTag}`)
      if (data) {
        parts.push(`### ${topic}\n\n${formatSearchResults(data)}`)
      } else {
        parts.push(`### ${topic}\n[Recherche indisponible]`)
      }
    }
  }

  if (!parts.length) return '# Morning Briefing\n\nAucune source configurée.'

  const contextText = parts.join('\n\n')
  const lang = config.language === 'fr' ? 'français' : config.language || 'français'
  const model = getPersonaModel(personaId)
  const { content } = await chatOnce(model, [
    {
      role: 'system',
      content: `Tu es un assistant de briefing matinal. Rédige un briefing du matin en ${lang} à partir des données fournies.
RÈGLES : Utilise UNIQUEMENT les informations des sources fournies. Cite les sources clés. Ne génère rien de ta mémoire d'entraînement.
Structure : météo brève, puis une synthèse par topic (3-4 lignes, faits concrets avec sources). Formate en Markdown.`,
    },
    { role: 'user', content: contextText },
  ], 0.3, undefined, false)

  return content
}

async function runVeille(config: VeilleConfig, personaId: string | null | undefined): Promise<string> {
  if (!config.topics?.length) return '# Veille\n\nAucun sujet configuré.'

  const tavilyKey = process.env.TAVILY_API_KEY
  if (!tavilyKey) return '# Veille\n\n⚠️ Clé Tavily manquante — configure `TAVILY_API_KEY` dans le `.env` pour activer la recherche web.'

  const topicResults: { topic: string; data: { answer: string; results: SearchResult[] } | null }[] = []

  for (const topic of config.topics.slice(0, 5)) {
    const dateTag = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
    let query = `${topic} actualités ${dateTag}`
    if (config.specificSites?.length) {
      query += ` (${config.specificSites.map(s => `site:${s}`).join(' OR ')})`
    }
    const data = await searchWeb(query)
    topicResults.push({ topic, data })
  }

  const allFailed = topicResults.every(t => !t.data)
  if (allFailed) return '# Veille\n\n⚠️ Toutes les recherches ont échoué. Vérifie ta clé Tavily et ta connexion.'

  // Build context with sources clearly labeled
  const contextParts: string[] = []
  for (const { topic, data } of topicResults) {
    if (!data) {
      contextParts.push(`## ${topic}\n[Recherche échouée pour ce sujet]`)
      continue
    }
    contextParts.push(`## ${topic}\n\n${formatSearchResults(data)}`)
  }

  const contextText = contextParts.join('\n\n===\n\n').slice(0, 25000)
  const model = getPersonaModel(personaId)

  const { content } = await chatOnce(model, [
    {
      role: 'system',
      content: `Tu es un assistant de veille. Tu reçois des résultats de recherche web réels avec leurs sources et URLs.

RÈGLES IMPÉRATIVES :
- Base-toi UNIQUEMENT sur les sources fournies ci-dessous. N'utilise jamais tes données d'entraînement.
- Pour chaque fait mentionné, cite la source avec son URL au format [Titre](URL).
- Si les sources ne contiennent pas d'information récente sur un sujet, dis-le explicitement.
- Ne fais aucune généralité vague — sois précis sur ce que les sources disent.

FORMAT : Pour chaque sujet, structure en : faits clés (avec sources), tendances observées, points à surveiller.`,
    },
    { role: 'user', content: contextText },
  ], 0.2, undefined, false)

  return content
}

async function runMeetingSummary(config: MeetingSummaryConfig, transcript: string, personaId: string | null | undefined): Promise<string> {
  if (!transcript?.trim()) return '# Résumé de réunion\n\nAucune transcription fournie.'

  const defaultSections = ['decisions', 'actions', 'participants', 'open_points']
  const sections = config.sections?.length ? config.sections : defaultSections

  const sectionLabels: Record<string, string> = {
    decisions:    'Décisions prises',
    actions:      "Points d'action (qui fait quoi)",
    participants: 'Participants et rôles',
    open_points:  'Points ouverts / à traiter',
    summary:      'Résumé général',
    key_points:   'Points clés',
  }

  let systemPrompt: string
  if (config.customTemplate?.trim()) {
    systemPrompt = `Tu analyses des transcriptions de réunion. Utilise ce template pour structurer ta réponse:\n\n${config.customTemplate}\n\nFormate en Markdown.`
  } else {
    const sectionList = sections.map(s => `- ${sectionLabels[s] ?? s}`).join('\n')
    systemPrompt = `Tu analyses des transcriptions de réunion. Extrais et structure les informations suivantes:\n${sectionList}\n\nSois précis, factuel et concis. Formate en Markdown.`
  }

  const model = getPersonaModel(personaId)
  const { content } = await chatOnce(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: transcript.slice(0, 25000) },
  ], 0.2, undefined, false)

  return content
}

async function runWeeklyReview(config: WeeklyReviewConfig, personaId: string | null | undefined): Promise<string> {
  const periodMs = config.period === '30d' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  const since = Date.now() - periodMs

  let contextText = ''

  if (config.includeConversations) {
    const { messages: messagesTable, conversations: convsTable } = await import('../db/schema')
    const { gte } = await import('drizzle-orm')
    const recentMessages = db.select({
      content: messagesTable.content,
      role: messagesTable.role,
      conversationId: messagesTable.conversationId,
      createdAt: messagesTable.createdAt,
    }).from(messagesTable)
      .where(gte(messagesTable.createdAt, since))
      .all()
      .filter(m => m.role === 'user')
      .slice(0, 100)

    if (recentMessages.length) {
      contextText = recentMessages.map(m => `- ${m.content.slice(0, 200)}`).join('\n')
    }
  }

  if (!contextText) return `# Weekly Review\n\nAucune activité trouvée sur les ${config.period === '30d' ? '30' : '7'} derniers jours.`

  const label = config.period === '30d' ? '30 derniers jours' : '7 derniers jours'
  const model = getPersonaModel(personaId)
  const { content } = await chatOnce(model, [
    { role: 'system', content: `Tu es un assistant de revue hebdomadaire. À partir de l'historique des questions et sujets traités par l'utilisateur, génère une weekly review structurée : thèmes principaux abordés, patterns observés, points récurrents, suggestions pour la semaine à venir. Formate en Markdown.` },
    { role: 'user', content: `Historique des ${label} :\n\n${contextText}` },
  ], 0.5, undefined, false)

  return content
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runAgent(agentId: string, extra?: { transcript?: string }): Promise<{ runId: string }> {
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()
  if (!agent) throw new Error(`Agent ${agentId} introuvable`)

  const runId = crypto.randomUUID()
  db.insert(agentRuns).values({
    id: runId, agentId, status: 'running', output: null, createdAt: Date.now(),
  }).run()

  const config = JSON.parse(agent.config)

  ;(async () => {
    try {
      let output = ''
      switch (agent.type as AgentType) {
        case 'email_digest':    output = await runEmailDigest(config, agent.personaId); break
        case 'morning_briefing': output = await runMorningBriefing(config, agent.personaId); break
        case 'veille':          output = await runVeille(config, agent.personaId); break
        case 'meeting_summary': output = await runMeetingSummary(config, extra?.transcript ?? '', agent.personaId); break
        case 'weekly_review':   output = await runWeeklyReview(config, agent.personaId); break
        default: output = '# Erreur\n\nType d\'agent inconnu.'
      }
      db.update(agentRuns).set({ status: 'done', output }).where(eq(agentRuns.id, runId)).run()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      db.update(agentRuns).set({ status: 'error', output: `# Erreur\n\n${msg}` }).where(eq(agentRuns.id, runId)).run()
    }
    // keep only 6 most recent runs per agent
    const allRuns = db.select({ id: agentRuns.id })
      .from(agentRuns)
      .where(eq(agentRuns.agentId, agentId))
      .orderBy(desc(agentRuns.createdAt))
      .all()
    for (const old of allRuns.slice(6)) {
      db.delete(agentRuns).where(eq(agentRuns.id, old.id)).run()
    }
  })()

  return { runId }
}
