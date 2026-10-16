import { WEB_CONTENT_CHARS, WIKI_TIMEOUT_MS } from '../../constants'

const API = 'https://en.wikipedia.org/w/api.php'

/** Cherche le meilleur article correspondant puis en retourne l'extrait complet. */
export async function searchWikipedia(query: string): Promise<string> {
  const searchUrl = `${API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`
  const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(WIKI_TIMEOUT_MS) })
  if (!searchRes.ok) throw new Error(`Wikipedia search error: ${searchRes.status}`)
  const searchData = await searchRes.json() as { query: { search: { title: string }[] } }
  const title = searchData.query.search[0]?.title
  if (!title) return `[Aucun article Wikipedia trouvé pour "${query}"]`

  const extractUrl = `${API}?action=query&prop=extracts&exintro=false&explaintext=true&titles=${encodeURIComponent(title)}&format=json`
  const extractRes = await fetch(extractUrl, { signal: AbortSignal.timeout(WIKI_TIMEOUT_MS) })
  if (!extractRes.ok) throw new Error(`Wikipedia extract error: ${extractRes.status}`)
  const extractData = await extractRes.json() as { query: { pages: Record<string, { title: string; extract?: string }> } }
  const page = Object.values(extractData.query.pages)[0]
  if (!page?.extract) return `[Article "${title}" trouvé mais sans contenu extractible]`

  const result = `Wikipedia — ${page.title}\n\n${page.extract}`
  console.log(`[tools] wikipedia — "${title}", ${result.length} chars`)
  return result.slice(0, WEB_CONTENT_CHARS)
}
