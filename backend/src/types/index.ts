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
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  personaId?: string | null
  model?: string | null
  createdAt: number
}

export type OllamaToolCall = {
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

export type OllamaMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string; images?: string[] }
  | { role: 'assistant'; content: string; tool_calls?: OllamaToolCall[] }
  | { role: 'tool'; content: string }
