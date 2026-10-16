import { execFile } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { MAX_FILE_CHARS, MIN_PDF_TEXT_CHARS, PDF_DPI, PDF_TIMEOUT_MS, MAX_PDF_VISION_PAGES } from '../../constants'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

const execFileAsync = promisify(execFile)

export type ExtractedFile =
  | { mode: 'text'; content: string; truncated: boolean; chars: number }
  | { mode: 'vision'; images: string[]; truncated: false; chars: 0 }

/** Convertit un PDF non textuel en PNG base64, une image par page. */
async function pdfToImages(buffer: Buffer): Promise<string[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legion4me-pdf-'))
  const inputPath = path.join(tmpDir, 'input.pdf')
  try {
    await fs.writeFile(inputPath, buffer)
    await execFileAsync(
      'pdftoppm',
      ['-r', String(PDF_DPI), '-png', inputPath, path.join(tmpDir, 'page')],
      { timeout: PDF_TIMEOUT_MS },
    )
    // Chaque page rendue pèse 1 à 2 Mo en base64 et est stockée telle quelle :
    // sans plafond, un PDF de 30 pages produit un message de 40 Mo.
    const all = (await fs.readdir(tmpDir))
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort()
    if (all.length > MAX_PDF_VISION_PAGES) {
      console.warn(`[extract-file] ${all.length} pages → tronqué à ${MAX_PDF_VISION_PAGES}`)
    }
    const files = all.slice(0, MAX_PDF_VISION_PAGES)
    return await Promise.all(
      files.map(async f => {
        const buf = await fs.readFile(path.join(tmpDir, f))
        return `data:image/png;base64,${buf.toString('base64')}`
      }),
    )
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

function asText(raw: string): ExtractedFile {
  return {
    mode: 'text',
    content: raw.slice(0, MAX_FILE_CHARS).trim(),
    truncated: raw.length > MAX_FILE_CHARS,
    chars: raw.length,
  }
}

/**
 * Extrait le contenu exploitable d'un fichier.
 *
 * Les PDF sont traités en deux temps : extraction texte d'abord, et bascule en
 * mode vision (rendu image) si le PDF s'avère être un scan.
 */
export async function extractFile(name: string, buffer: Buffer, mimeType: string): Promise<ExtractedFile> {
  if (mimeType === 'application/pdf') {
    const data = await pdfParse(buffer)
    const rawText = data.text?.trim() ?? ''

    if (rawText.length >= MIN_PDF_TEXT_CHARS) return asText(rawText)

    console.log(`[extract-file] "${name}" — no text layer, converting to images`)
    const images = await pdfToImages(buffer)
    console.log(`[extract-file] "${name}" — ${images.length} pages as images`)
    return { mode: 'vision', images, chars: 0, truncated: false }
  }

  // texte / code / csv / markdown
  return asText(buffer.toString('utf-8'))
}
