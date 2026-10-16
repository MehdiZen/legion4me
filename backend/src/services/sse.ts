import type { Request, Response } from 'express'

export interface SseChannel {
  /** Émet un événement vers le client. No-op si la connexion est fermée. */
  send: (data: object) => void
  /** Déclenché quand le client se déconnecte — à propager jusqu'à Ollama. */
  signal: AbortSignal
  /** Vrai si le client a coupé la connexion. */
  readonly aborted: boolean
}

/**
 * Prépare une réponse en Server-Sent Events.
 *
 * Le `signal` retourné est abandonné dès que le client ferme la connexion
 * (bouton Stop, onglet fermé, navigation). Le passer aux appels Ollama évite
 * de continuer à générer — et à consommer du GPU — pour personne.
 */
export function setupSSE(req: Request, res: Response): SseChannel {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.socket?.setNoDelay(true)
  res.flushHeaders()

  const controller = new AbortController()

  // Détection de déconnexion client : écouter 'close' sur la RÉPONSE, pas sur
  // la requête. Sur un POST, `req` (flux en lecture) émet 'close' dès que le
  // corps est consommé — donc immédiatement — ce qui avorterait chaque stream
  // avant même qu'il démarre. `res` n'émet 'close' qu'à la fin de la réponse
  // ou à la rupture de la connexion ; `writableFinished` distingue les deux.
  res.on('close', () => {
    if (!res.writableFinished) {
      console.log('[sse] client disconnected — aborting generation')
      controller.abort()
    }
  })

  return {
    send(data: object) {
      if (controller.signal.aborted || res.writableEnded) return  // .end() déjà appelé
      try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch { /* client gone */ }
    },
    signal: controller.signal,
    get aborted() { return controller.signal.aborted },
  }
}

/** Vrai si l'erreur provient d'une annulation plutôt que d'un vrai échec. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
}
