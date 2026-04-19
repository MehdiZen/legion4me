import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core'

export const personas = sqliteTable('personas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').notNull(),
  temperature: real('temperature').default(0.7),
  color: text('color').default('#7c3aed'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),       // 'global' | 'persona'
  source: text('source').notNull().default('tool'), // 'tool' | 'user'
  personaId: text('persona_id'),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title'),
  personaId: text('persona_id'),
  pinned: integer('pinned').default(0), // 0 = false, 1 = true
  mode: text('mode').default('chat'),          // 'chat' | 'salon'
  salonPersonaIds: text('salon_persona_ids'),  // JSON array of persona IDs, null if not salon
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const conversationSummaries = sqliteTable('conversation_summaries', {
  conversationId: text('conversation_id').primaryKey(),
  content: text('content').notNull(),
  coversUpToMsgId: text('covers_up_to_msg_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  images: text('images'),    // JSON array of base64 strings
  files: text('files'),      // JSON array of { name, content?, chars, truncated, isVision }
  toolCalls: text('tool_calls'), // JSON array of tool calls (for assistant messages)
  personaId: text('persona_id'),
  model: text('model'),
  tokensIn: integer('tokens_in'),   // prompt_eval_count from Ollama
  tokensOut: integer('tokens_out'), // eval_count from Ollama
  createdAt: integer('created_at').notNull(),
})
