import { WEB_CONTENT_CHARS } from '../../constants'

const BLOCK_MS = 30_000  // regroupement des segments en blocs de ~30 s

interface TranscriptSegment { text: string; offset: number; duration: number }
interface YoutubeTranscriptImpl {
  fetchTranscript: (url: string) => Promise<TranscriptSegment[]>
}

// Le package `youtube-transcript` est mal empaqueté : `package.json` déclare
// `type: "module"` mais son champ `main` pointe vers un fichier CJS, et il n'a
// pas de table `exports`. Résultat : `import('youtube-transcript')` charge le
// fichier CJS en contexte ESM → `ReferenceError: exports is not defined`.
// On cible donc directement le build ESM. `new Function` empêche tsc (sortie
// CommonJS) de réécrire cet `import()` en `require()`.
const ESM_ENTRY = 'youtube-transcript/dist/youtube-transcript.esm.js'
const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>

async function loadYoutubeTranscript(): Promise<YoutubeTranscriptImpl> {
  const mod = await dynamicImport(ESM_ENTRY) as { YoutubeTranscript?: YoutubeTranscriptImpl }
  if (!mod.YoutubeTranscript?.fetchTranscript) {
    throw new Error('youtube-transcript : build ESM introuvable (le package a peut-être changé de structure)')
  }
  return mod.YoutubeTranscript
}

export async function fetchYoutubeTranscript(url: string): Promise<string> {
  const YoutubeTranscript = await loadYoutubeTranscript()
  const segments = await YoutubeTranscript.fetchTranscript(url)
  if (!segments.length) return '[Aucune transcription disponible pour cette vidéo]'

  const blocks: string[] = []
  let blockText = ''
  let blockStart = segments[0].offset

  const flush = () => {
    const ts = new Date(blockStart).toISOString().slice(11, 19)
    blocks.push(`[${ts}] ${blockText.trim()}`)
  }

  for (const seg of segments) {
    blockText += (blockText ? ' ' : '') + seg.text
    if (seg.offset - blockStart >= BLOCK_MS) {
      flush()
      blockText = ''
      blockStart = seg.offset
    }
  }
  if (blockText) flush()

  const result = blocks.join('\n')
  console.log(`[tools] youtube_transcript — ${segments.length} segments, ${result.length} chars`)
  return result.slice(0, WEB_CONTENT_CHARS)
}
