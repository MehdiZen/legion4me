import puppeteer, { type Browser } from 'puppeteer'
import { WEB_CONTENT_CHARS, PAGE_TIMEOUT_MS } from '../../constants'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'

let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    if (browser) {
      try { await browser.close() } catch { /* already dead */ }
    }
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  }
  return browser
}

process.on('exit', () => { try { browser?.close() } catch { /* ignore */ } })

/** Charge une page dans un vrai navigateur et en extrait le texte lisible. */
export async function fetchUrlContent(url: string): Promise<string> {
  const b = await getBrowser()
  const page = await b.newPage()
  try {
    await page.setUserAgent(USER_AGENT)
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT_MS })
    const status = response?.status() ?? 0
    const finalUrl = page.url()

    const text = await page.evaluate(() => {
      document.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove())
      return document.body?.innerText ?? ''
    })

    const clean = text.replace(/\s+/g, ' ').trim()
    const prefix = finalUrl !== url ? `[Redirigé vers: ${finalUrl}] [HTTP ${status}]\n\n` : `[HTTP ${status}]\n\n`
    const result = prefix + (clean || '[Page vide ou contenu non lisible]')
    console.log(`[tools] fetchUrlContent — ${clean.length} chars, status=${status}`)
    return result.slice(0, WEB_CONTENT_CHARS)
  } finally {
    await page.close()
  }
}
