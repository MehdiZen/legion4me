/**
 * Couche d'accès au backend — seam unique entre le frontend et le serveur.
 *
 * Aucun composant ni store ne doit appeler `fetch` directement : tout passe
 * par ce module. Le jour où le backend Express est remplacé (Tauri IPC,
 * autre transport…), c'est ce fichier — et lui seul — qui est réécrit.
 */

const BASE = '/api'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Extrait le message d'erreur du corps de réponse, quel que soit son format. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string }
    if (body?.error) return body.error
  } catch {
    // corps non-JSON (ex. page HTML) — on retombe sur le statut
  }
  return `Erreur ${res.status}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status)
  if (res.status === 204) return undefined as T
  return await res.json() as T
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const api = {
  get:   <T>(path: string)                => request<T>(path),
  post:  <T>(path: string, body: unknown) => request<T>(path, jsonInit('POST', body)),
  put:   <T>(path: string, body: unknown) => request<T>(path, jsonInit('PUT', body)),
  patch: <T>(path: string, body: unknown) => request<T>(path, jsonInit('PATCH', body)),
  del:   (path: string)                   => request<void>(path, { method: 'DELETE' }),
}

// ── Streaming ─────────────────────────────────────────────────────────────────

/** Événement SSE émis par le backend. `type` discrimine la charge utile. */
export interface StreamEvent {
  type: string
  [key: string]: unknown
}

/**
 * Ouvre un flux SSE et invoque `onEvent` pour chaque événement reçu.
 *
 * Encapsule le parsing `data: …` afin que les appelants ne manipulent que des
 * événements typés — c'est aussi ce qui permettra de remplacer SSE par des
 * events Tauri sans toucher aux stores.
 *
 * L'abort du client est silencieux (pas d'exception propagée) : arrêter un
 * stream est une action utilisateur normale, pas une erreur.
 */
export async function stream(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { ...jsonInit('POST', body), signal })
  } catch (err) {
    if (signal?.aborted) return
    throw err
  }

  if (!response.ok) throw new ApiError(await errorMessage(response), response.status)
  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          onEvent(JSON.parse(line.slice(6)) as StreamEvent)
        } catch {
          // événement malformé — on ignore et on continue le flux
        }
      }
    }
  } catch (err) {
    // Un abort pendant la lecture n'est pas une erreur
    if (signal?.aborted) return
    throw err
  }
}
