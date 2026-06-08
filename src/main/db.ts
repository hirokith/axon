import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { LogDirection } from '../shared/constants'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'

export interface LogRow {
  id: string
  timestamp: number
  direction: string
  sessionId: string | null
  agentId: string | null
  method: string | null
  message: string
}

let db: SqlJsDatabase | null = null
let dbPath: string = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
let dbInitPromise: Promise<SqlJsDatabase> | null = null

async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    const SQL = await initSqlJs()

    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    dbPath = join(userDataPath, 'axon-logs.db')

    if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath)
      db = new SQL.Database(buffer)
    } else {
      db = new SQL.Database()
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        direction TEXT NOT NULL,
        session_id TEXT,
        agent_id TEXT,
        method TEXT,
        message TEXT NOT NULL
      )
    `)
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_logs_agent ON logs(agent_id)`)

    db.run(`
      CREATE TABLE IF NOT EXISTS structured_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        session_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT,
        content TEXT,
        kind TEXT,
        raw_input TEXT,
        raw_output TEXT
      )
    `)
    db.run(`CREATE INDEX IF NOT EXISTS idx_slogs_timestamp ON structured_logs(timestamp)`)
    db.run(`CREATE INDEX IF NOT EXISTS idx_slogs_session ON structured_logs(session_id)`)

    db.run(`
      CREATE TABLE IF NOT EXISTS chat_history (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_name TEXT,
        label TEXT NOT NULL DEFAULT 'New Session',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        timestamp INTEGER NOT NULL,
        is_thought INTEGER NOT NULL DEFAULT 0,
        tool_calls TEXT,
        seq INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      )
    `)
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages(session_id, seq ASC)`)

    return db
  })()

  return dbInitPromise
}

function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistDb()
  }, 2000)
}

function persistDb(): void {
  if (!db || !dbPath) return
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

export async function insertLog(entry: {
  id: string
  timestamp: number
  direction: LogDirection
  sessionId?: string | null
  agentId?: string | null
  method?: string | null
  message: any
}): Promise<void> {
  const d = await getDb()
  d.run(
    `INSERT OR IGNORE INTO logs (id, timestamp, direction, session_id, agent_id, method, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.timestamp,
      entry.direction,
      entry.sessionId ?? null,
      entry.agentId ?? null,
      entry.method ?? null,
      typeof entry.message === 'string' ? entry.message : JSON.stringify(entry.message)
    ]
  )
  scheduleSave()
}

export async function queryLogs(options: {
  limit?: number
  offset?: number
  sessionId?: string
  agentId?: string
  direction?: LogDirection
  since?: number
  until?: number
  keyword?: string
}): Promise<LogRow[]> {
  const d = await getDb()
  const conditions: string[] = []
  const params: any[] = []

  if (options.sessionId) {
    conditions.push('session_id = ?')
    params.push(options.sessionId)
  }
  if (options.agentId) {
    conditions.push('agent_id = ?')
    params.push(options.agentId)
  }
  if (options.direction) {
    conditions.push('direction = ?')
    params.push(options.direction)
  }
  if (options.since) {
    conditions.push('timestamp >= ?')
    params.push(options.since)
  }
  if (options.until) {
    conditions.push('timestamp <= ?')
    params.push(options.until)
  }
  if (options.keyword) {
    conditions.push('message LIKE ?')
    params.push(`%${options.keyword}%`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options.limit || 500
  const offset = options.offset || 0

  const stmt = d.prepare(`
    SELECT id, timestamp, direction, session_id as sessionId, agent_id as agentId, method, message
    FROM logs ${where}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `)
  params.push(limit, offset)
  stmt.bind(params)

  const rows: LogRow[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as any
    rows.push(row as LogRow)
  }
  stmt.free()
  return rows
}

export async function getLogCount(options?: { sessionId?: string; agentId?: string }): Promise<number> {
  const d = await getDb()
  const conditions: string[] = []
  const params: any[] = []

  if (options?.sessionId) {
    conditions.push('session_id = ?')
    params.push(options.sessionId)
  }
  if (options?.agentId) {
    conditions.push('agent_id = ?')
    params.push(options.agentId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const stmt = d.prepare(`SELECT COUNT(*) as count FROM logs ${where}`)
  stmt.bind(params)
  stmt.step()
  const result = stmt.getAsObject() as any
  stmt.free()
  return result.count as number
}

export async function clearLogs(options?: { before?: number; sessionId?: string }): Promise<void> {
  const d = await getDb()
  if (options?.before) {
    d.run('DELETE FROM logs WHERE timestamp < ?', [options.before])
    d.run('DELETE FROM structured_logs WHERE timestamp < ?', [options.before])
  } else if (options?.sessionId) {
    d.run('DELETE FROM logs WHERE session_id = ?', [options.sessionId])
    d.run('DELETE FROM structured_logs WHERE session_id = ?', [options.sessionId])
  } else {
    d.run('DELETE FROM logs')
    d.run('DELETE FROM structured_logs')
  }
  scheduleSave()
}

export interface StructuredLogRow {
  id: string
  timestamp: number
  sessionId: string | null
  type: string
  title: string
  status: string | null
  content: string | null
  kind: string | null
  rawInput: string | null
  rawOutput: string | null
}

export async function insertStructuredLog(entry: {
  id: string
  timestamp: number
  sessionId?: string | null
  type: string
  title: string
  status?: string | null
  content?: string | null
  kind?: string | null
  rawInput?: any
  rawOutput?: any
}): Promise<void> {
  const d = await getDb()
  d.run(
    `INSERT OR IGNORE INTO structured_logs (id, timestamp, session_id, type, title, status, content, kind, raw_input, raw_output)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.timestamp,
      entry.sessionId ?? null,
      entry.type,
      entry.title,
      entry.status ?? null,
      entry.content ?? null,
      entry.kind ?? null,
      entry.rawInput != null ? JSON.stringify(entry.rawInput) : null,
      entry.rawOutput != null ? JSON.stringify(entry.rawOutput) : null
    ]
  )
  scheduleSave()
}

export async function queryStructuredLogs(options?: {
  sessionId?: string
  limit?: number
  offset?: number
}): Promise<StructuredLogRow[]> {
  const d = await getDb()
  const conditions: string[] = []
  const params: any[] = []

  if (options?.sessionId) {
    conditions.push('session_id = ?')
    params.push(options.sessionId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options?.limit || 5000
  const offset = options?.offset || 0

  const stmt = d.prepare(`
    SELECT id, timestamp, session_id as sessionId, type, title, status, content, kind, raw_input as rawInput, raw_output as rawOutput
    FROM structured_logs ${where}
    ORDER BY timestamp ASC
    LIMIT ? OFFSET ?
  `)
  params.push(limit, offset)
  stmt.bind(params)

  const rows: StructuredLogRow[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as any
    if (row.rawInput) {
      try { row.rawInput = JSON.parse(row.rawInput) } catch {}
    }
    if (row.rawOutput) {
      try { row.rawOutput = JSON.parse(row.rawOutput) } catch {}
    }
    rows.push(row as StructuredLogRow)
  }
  stmt.free()
  return rows
}

export function closeDb(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (db) {
    persistDb()
    db.close()
    db = null
  }
}

// Chat history persistence (stored in SQLite instead of config.json)

export async function getChatHistory(): Promise<any> {
  const d = await getDb()
  const stmt = d.prepare('SELECT value FROM chat_history WHERE key = ?')
  stmt.bind(['state'])
  let result = null
  if (stmt.step()) {
    const row = stmt.getAsObject() as any
    try { result = JSON.parse(row.value) } catch {}
  }
  stmt.free()
  return result
}

export async function setChatHistory(data: any): Promise<void> {
  const d = await getDb()
  if (data == null) {
    d.run('DELETE FROM chat_history WHERE key = ?', ['state'])
  } else {
    d.run(
      'INSERT OR REPLACE INTO chat_history (key, value) VALUES (?, ?)',
      ['state', JSON.stringify(data)]
    )
  }
  scheduleSave()
}

// --- Per-session storage (new architecture) ---

export interface SessionMetaRow {
  sessionId: string
  agentId: string
  agentName: string | null
  label: string
  createdAt: number
  updatedAt: number
}

export interface MessageRow {
  id: string
  sessionId: string
  role: string
  text: string
  timestamp: number
  isThought: boolean
  toolCalls: any[] | null
  seq: number
}

export async function getAllSessionMetas(): Promise<SessionMetaRow[]> {
  const d = await getDb()
  const stmt = d.prepare(
    `SELECT session_id as sessionId, agent_id as agentId, agent_name as agentName,
            label, created_at as createdAt, updated_at as updatedAt
     FROM sessions ORDER BY updated_at DESC`
  )
  const rows: SessionMetaRow[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as any)
  }
  stmt.free()
  return rows
}

export async function getSessionMessages(sessionId: string): Promise<MessageRow[]> {
  const d = await getDb()
  const stmt = d.prepare(
    `SELECT id, session_id as sessionId, role, text, timestamp,
            is_thought as isThought, tool_calls as toolCalls, seq
     FROM messages WHERE session_id = ? ORDER BY seq ASC`
  )
  stmt.bind([sessionId])
  const rows: MessageRow[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as any
    row.isThought = !!row.isThought
    if (row.toolCalls) {
      try { row.toolCalls = JSON.parse(row.toolCalls) } catch { row.toolCalls = null }
    }
    rows.push(row)
  }
  stmt.free()
  return rows
}

export async function upsertSessionMeta(meta: SessionMetaRow): Promise<void> {
  const d = await getDb()
  d.run(
    `INSERT OR REPLACE INTO sessions (session_id, agent_id, agent_name, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [meta.sessionId, meta.agentId, meta.agentName, meta.label, meta.createdAt, meta.updatedAt]
  )
  scheduleSave()
}

export async function deleteSessionFromDb(sessionId: string): Promise<void> {
  const d = await getDb()
  d.run('DELETE FROM messages WHERE session_id = ?', [sessionId])
  d.run('DELETE FROM sessions WHERE session_id = ?', [sessionId])
  scheduleSave()
}

export async function saveSessionMessages(sessionId: string, messages: MessageRow[]): Promise<void> {
  const d = await getDb()
  d.run('DELETE FROM messages WHERE session_id = ?', [sessionId])
  if (messages.length === 0) { scheduleSave(); return }
  const insertStmt = d.prepare(
    `INSERT OR REPLACE INTO messages (id, session_id, role, text, timestamp, is_thought, tool_calls, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const msg of messages) {
    insertStmt.run([
      msg.id,
      sessionId,
      msg.role,
      msg.text,
      msg.timestamp,
      msg.isThought ? 1 : 0,
      msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
      msg.seq
    ])
  }
  insertStmt.free()
  scheduleSave()
}

export async function updateSessionLabel(sessionId: string, label: string): Promise<void> {
  const d = await getDb()
  d.run('UPDATE sessions SET label = ?, updated_at = ? WHERE session_id = ?', [label, Date.now(), sessionId])
  scheduleSave()
}

export async function migrateFromBlobIfNeeded(): Promise<boolean> {
  const d = await getDb()

  const stmt = d.prepare('SELECT value FROM chat_history WHERE key = ?')
  stmt.bind(['state'])
  let oldData: any = null
  if (stmt.step()) {
    const row = stmt.getAsObject() as any
    try { oldData = JSON.parse(row.value) } catch {}
  }
  stmt.free()

  if (!oldData || !Array.isArray(oldData.sessions) || oldData.sessions.length === 0) {
    return false
  }

  const countStmt = d.prepare('SELECT COUNT(*) as cnt FROM sessions')
  countStmt.step()
  const count = (countStmt.getAsObject() as any).cnt
  countStmt.free()
  if (count > 0) {
    d.run('DELETE FROM chat_history WHERE key = ?', ['state'])
    scheduleSave()
    return false
  }

  d.run('BEGIN TRANSACTION')
  try {
    for (const session of oldData.sessions) {
      const now = Date.now()
      const createdAt = session.messages?.[0]?.timestamp || now

      d.run(
        `INSERT OR IGNORE INTO sessions (session_id, agent_id, agent_name, label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [session.sessionId, session.agentId, session.agentName || null, session.label || 'New Session', createdAt, now]
      )

      if (session.messages && session.messages.length > 0) {
        const insertMsg = d.prepare(
          `INSERT OR IGNORE INTO messages (id, session_id, role, text, timestamp, is_thought, tool_calls, seq)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        for (let idx = 0; idx < session.messages.length; idx++) {
          const msg = session.messages[idx]
          insertMsg.run([
            msg.id,
            session.sessionId,
            msg.role,
            msg.text || '',
            msg.timestamp,
            msg.isThought ? 1 : 0,
            msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
            idx
          ])
        }
        insertMsg.free()
      }
    }

    d.run('DELETE FROM chat_history WHERE key = ?', ['state'])
    d.run('COMMIT')
  } catch (e) {
    d.run('ROLLBACK')
    throw e
  }

  persistDb()
  return true
}
