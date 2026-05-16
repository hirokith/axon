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

async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db

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

  return db
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
      entry.sessionId || null,
      entry.agentId || null,
      entry.method || null,
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
      entry.sessionId || null,
      entry.type,
      entry.title,
      entry.status || null,
      entry.content || null,
      entry.kind || null,
      entry.rawInput ? JSON.stringify(entry.rawInput) : null,
      entry.rawOutput ? JSON.stringify(entry.rawOutput) : null
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
