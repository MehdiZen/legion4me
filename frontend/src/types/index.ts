export interface Persona {
  id: string
  name: string
  description?: string | null
  systemPrompt: string
  model: string
  temperature: number
  color?: string | null
  emoji?: string | null
  createdAt: number
  updatedAt: number
}

export interface Conversation {
  id: string
  title?: string | null
  personaId?: string | null
  pinned?: number | null // 1 = pinned
  mode?: 'chat' | 'salon' | null
  salonPersonaIds?: string[] | null
  sizeBytes?: number
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  images?: string[] | null // URLs servies par l'API, pas du base64 (cf. services/files/images.ts)
  files?: Array<{ name: string; mode: 'text' | 'vision'; chars: number; truncated: boolean }> | null
  personaId?: string | null
  model?: string | null
  toolCalls?: string | null // JSON — present on intermediate assistant messages, never displayed
  tokensIn?: number | null
  tokensOut?: number | null
  createdAt: number
}
