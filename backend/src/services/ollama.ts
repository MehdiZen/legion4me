import { execSync } from 'child_process'
import type { OllamaMessage, OllamaToolCall } from '../types'
import { OLLAMA_TIMEOUT_MS } from '../constants'

/**
 * Combine le timeout interne avec un éventuel signal d'annulation appelant,
 * pour qu'une déconnexion client interrompe la génération immédiatement.
 */
function requestSignal(external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(OLLAMA_TIMEOUT_MS)
  return external ? AbortSignal.any([external, timeout]) : timeout
}

function resolveOllamaUrl(): string {
  if (process.env.OLLAMA_URL) return process.env.OLLAMA_URL
  if (process.env.OLLAMA_HOST) return `http://${process.env.OLLAMA_HOST}`
  try {
    const winIp = execSync("ip route show | grep default | awk '{print $3}'").toString().trim()
    if (winIp) return `http://${winIp}:11434`
  } catch {
    // ignore
  }
  return 'http://localhost:11434'
}

const OLLAMA_URL = resolveOllamaUrl()
console.log(`[Ollama] Connecting to ${OLLAMA_URL}`)

export async function getModels(): Promise<string[]> {
  const res = await fetch(`${OLLAMA_URL}/api/tags`)
  if (!res.ok) throw new Error(`Ollama responded with ${res.status}`)
  const data = await res.json() as { models: { name: string }[] }
  return data.models.map(m => m.name)
}

export async function chatOnce(
  model: string,
  messages: OllamaMessage[],
  temperature = 0.5,
  tools?: object[],
  think?: boolean,
  signal?: AbortSignal,
): Promise<{ content: string; toolCalls?: OllamaToolCall[] }> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      tools: tools?.length ? tools : undefined,
      options: { temperature },
      ...(think !== undefined ? { think } : {}),
    }),
    signal: requestSignal(signal),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama ${res.status}${body ? ': ' + body.slice(0, 300) : ''}`)
  }
  const data = await res.json() as { message?: { content: string; tool_calls?: OllamaToolCall[] } }
  return {
    content: data.message?.content ?? '',
    toolCalls: data.message?.tool_calls?.length ? data.message.tool_calls : undefined,
  }
}

export async function streamChat(
  model: string,
  messages: OllamaMessage[],
  temperature: number,
  tools: object[],
  onChunk: (content: string) => void,
  onThinking?: (thinking: string) => void,
  extraOptions?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ toolCalls?: OllamaToolCall[]; fullContent: string; tokensIn?: number; tokensOut?: number }> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      tools: tools.length ? tools : undefined,
      options: { temperature, ...extraOptions },
    }),
    signal: requestSignal(signal),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama ${res.status}${body ? ': ' + body.slice(0, 300) : ''}`)
  }
  if (!res.body) throw new Error('No response body from Ollama')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let chunkCount = 0
  let contentCount = 0
  let fullContent = ''
  let tokensIn: number | undefined
  let tokensOut: number | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      console.log(`[streamChat] reader done — chunks=${chunkCount} contentChunks=${contentCount}`)
      break
    }

    chunkCount++
    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n').filter(l => l.trim())

    for (const line of lines) {
      try {
        const json = JSON.parse(line) as {
          message?: { content: string; thinking?: string; tool_calls?: OllamaToolCall[] }
          done: boolean
          error?: string
          prompt_eval_count?: number
          eval_count?: number
        }
        if (json.error) {
          console.error(`[streamChat] Ollama error: ${json.error}`)
          throw new Error(json.error)
        }
        if (json.message?.thinking) {
          onThinking?.(json.message.thinking)
        }
        if (json.message?.content) {
          contentCount++
          fullContent += json.message.content
          onChunk(json.message.content)
        }
        if (json.done) {
          if (json.prompt_eval_count) tokensIn = json.prompt_eval_count
          if (json.eval_count) tokensOut = json.eval_count
          console.log(`[streamChat] done — chunks=${chunkCount} contentChunks=${contentCount} toolCalls=${json.message?.tool_calls?.length ?? 0} tokensIn=${tokensIn} tokensOut=${tokensOut}`)
          const toolCalls = json.message?.tool_calls?.length ? json.message.tool_calls : undefined
          return { toolCalls, fullContent, tokensIn, tokensOut }
        }
      } catch (e) {
        console.error(`[streamChat] parse error on line: ${line.slice(0, 80)}`, e)
      }
    }
  }

  return { fullContent }
}
