import { v4 as uuidv4 } from 'uuid'
import { JsonRpcMessage } from './jsonrpc'
import { LogDirection } from '../../shared/constants'
import { insertLog, queryLogs, getLogCount, clearLogs as dbClearLogs, LogRow } from '../db'

export interface LogEntry {
  id: string
  timestamp: number
  direction: LogDirection
  message: JsonRpcMessage
  sessionId?: string
  agentId?: string
}

export class MessageLogger {
  private agentId: string | null = null
  private sessionId: string | null = null

  setContext(agentId?: string, sessionId?: string): void {
    if (agentId !== undefined) this.agentId = agentId
    if (sessionId !== undefined) this.sessionId = sessionId
  }

  log(direction: LogDirection, message: JsonRpcMessage): void {
    const entry = {
      id: uuidv4(),
      timestamp: Date.now(),
      direction,
      sessionId: this.sessionId,
      agentId: this.agentId,
      method: (message as any).method || null,
      message
    }
    insertLog(entry)
  }

  getEntries(options?: { limit?: number; offset?: number }): LogRow[] {
    return queryLogs({
      limit: options?.limit || 500,
      offset: options?.offset || 0,
      agentId: this.agentId || undefined
    })
  }

  getCount(): number {
    return getLogCount({ agentId: this.agentId || undefined })
  }

  clear(): void {
    dbClearLogs(this.agentId ? { sessionId: this.agentId } : undefined)
  }
}
