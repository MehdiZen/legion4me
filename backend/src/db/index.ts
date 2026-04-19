import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'asmodeus.db')
const sqlite = new Database(dbPath)

sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// ── Base tables ───────────────────────────────────────────────────────────────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL DEFAULT 0.7,
    color TEXT DEFAULT '#7c3aed',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    persona_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    persona_id TEXT,
    model TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    persona_id TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation_summaries (
    conversation_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    covers_up_to_msg_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

// ── Incremental migrations ────────────────────────────────────────────────────

try { sqlite.exec('ALTER TABLE messages ADD COLUMN images TEXT') } catch { /* already exists */ }
try { sqlite.exec('ALTER TABLE messages ADD COLUMN tool_calls TEXT') } catch { /* already exists */ }
try { sqlite.exec('ALTER TABLE messages ADD COLUMN files TEXT') } catch { /* already exists */ }
try { sqlite.exec('ALTER TABLE messages ADD COLUMN tokens_in INTEGER') } catch { /* already exists */ }
try { sqlite.exec('ALTER TABLE messages ADD COLUMN tokens_out INTEGER') } catch { /* already exists */ }
try { sqlite.exec('ALTER TABLE conversations ADD COLUMN pinned INTEGER DEFAULT 0') } catch { /* already exists */ }
try { sqlite.exec("ALTER TABLE conversations ADD COLUMN mode TEXT DEFAULT 'chat'") } catch { /* already exists */ }
try { sqlite.exec('ALTER TABLE conversations ADD COLUMN salon_persona_ids TEXT') } catch { /* already exists */ }
try { sqlite.exec("ALTER TABLE memories ADD COLUMN source TEXT DEFAULT 'tool'") } catch { /* already exists */ }

// ── Indexes ───────────────────────────────────────────────────────────────────

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_persona_id ON messages (persona_id);
  CREATE INDEX IF NOT EXISTS idx_memories_persona_id ON memories (persona_id);
  CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type);
`)

export const db = drizzle(sqlite, { schema })
