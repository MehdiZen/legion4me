export interface Persona {
  id: string
  name: string
  description?: string | null
  systemPrompt: string
  model: string
  temperature: number
  color?: string | null
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
  images?: string[] | null // base64 data URIs for display
  files?: Array<{ name: string; mode: 'text' | 'vision'; chars: number; truncated: boolean }> | null
  personaId?: string | null
  model?: string | null
  toolCalls?: string | null // JSON — present on intermediate assistant messages, never displayed
  tokensIn?: number | null
  tokensOut?: number | null
  createdAt: number
}
