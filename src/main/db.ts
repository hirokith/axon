import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { LogDirection } from '../shared/constants'

export interface LogRow {
  id: string
  timestamp: number
  direction: string
  sessionId: string | null
  agentId: string | null
  method: string | null
  message: string
}

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'axon-logs.db')
  db = new Database(dbPath)

  // WAL mode for better concurrent read/write performance
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      direction TEXT NOT NULL,
      session_id TEXT,
      agent_id TEXT,
      method TEXT,
      message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_logs_agent ON logs(agent_id);
  `)

  return db
}

export function insertLog(entry: {
  id: string
  timestamp: number
  direction: LogDirection
  sessionId?: string | null
  agentId?: string | null
  method?: string | null
  message: any
}): void {
  const d = getDb()
  const stmt = d.prepare(`
    INSERT OR IGNORE INTO logs (id, timestamp, direction, session_id, agent_id, method, message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    entry.id,
    entry.timestamp,
    entry.direction,
    entry.sessionId || null,
    entry.agentId || null,
    entry.method || null,
    typeof entry.message === 'string' ? entry.message : JSON.stringify(entry.message)
  )
}

export function queryLogs(options: {
  limit?: number
  offset?: number
  sessionId?: string
  agentId?: string
  direction?: LogDirection
  since?: number
  until?: number
  keyword?: string
}): LogRow[] {
  const d = getDb()
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

  return stmt.all(...params) as LogRow[]
}

export function getLogCount(options?: { sessionId?: string; agentId?: string }): number {
  const d = getDb()
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
  const result = stmt.get(...params) as { count: number }
  return result.count
}

export function clearLogs(options?: { before?: number; sessionId?: string }): void {
  const d = getDb()
  if (options?.before) {
    d.prepare('DELETE FROM logs WHERE timestamp < ?').run(options.before)
  } else if (options?.sessionId) {
    d.prepare('DELETE FROM logs WHERE session_id = ?').run(options.sessionId)
  } else {
    d.prepare('DELETE FROM logs').run()
  }
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
