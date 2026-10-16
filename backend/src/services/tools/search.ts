import { fetchUrlContent } from './browser'
import { WEB_CONTENT_CHARS, TAVILY_TIMEOUT_MS } from '../../constants'

const FULL_FETCH_COUNT = 2  // nombre de résultats dont on charge la page complète

/**
 * Recherche Tavily, enrichie du contenu réel des premiers résultats.
 *
 * Tavily ne renvoie que des extraits ; on charge les `FULL_FETCH_COUNT`
 * premières pages via Puppeteer pour donner au modèle du contenu exploitable.
 */
export async function webSearch(query: string): Promise<string> {
  const dateTag = new Date().toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: 'long', day: 'numeric',
  })
  // Ancrer la requête dans le temps, sauf si elle porte déjà une année
  const enrichedQuery = /\b\d{4}\b/.test(query) ? query : `${query} (${dateTag})`

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: enrichedQuery,
      search_depth: 'basic',
      max_results: 5,
      include_answer: true,
    }),
    signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)

  const data = await res.json() as {
    answer?: string
    results: { title: string; url: string; content: string }[]
  }

  const lines: string[] = []
  if (data.answer) lines.push(`Résumé Tavily : ${data.answer}\n`)

  const topUrls = data.results.slice(0, FULL_FETCH_COUNT).map(r => r.url)
  const fetched = await Promise.allSettled(topUrls.map(url => fetchUrlContent(url)))

  for (let i = 0; i < data.results.length; i++) {
    const r = data.results[i]
    const settled = fetched[i]
    const full = i < FULL_FETCH_COUNT && settled?.status === 'fulfilled' ? settled.value : null
    lines.push(`[${r.title}](${r.url})\n${full ?? r.content}`)
  }

  console.log(`[tools] web_search — fetched ${fetched.filter(f => f.status === 'fulfilled').length}/${topUrls.length} top URLs`)
  return lines.join('\n\n').slice(0, WEB_CONTENT_CHARS)
}
