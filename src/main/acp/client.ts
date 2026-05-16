import { EventEmitter } from 'events'
import {
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  isRequest,
  isResponse,
  isNotification
} from './jsonrpc'
import { StdioTransport } from './transport'

export class AcpClient extends EventEmitter {
  private nextId: number = 1
  private pendingRequests: Map<
    number | string,
    { resolve: (result: any) => void; reject: (err: any) => void }
  > = new Map()

  constructor(private transport: StdioTransport) {
    super()

    this.transport.on('message', (msg: JsonRpcMessage) => {
      this.handleMessage(msg)
    })

    this.transport.on('error', (err: Error) => {
      this.emit('error', err)
    })

    this.transport.on('close', (code: number | null) => {
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error(`Transport closed with code ${code}`))
      }
      this.pendingRequests.clear()
      this.emit('close', code)
    })
  }

  private handleMessage(msg: JsonRpcMessage): void {
    if (isResponse(msg)) {
      // Try both number and string forms of id for matching
      let pending = this.pendingRequests.get(msg.id!)
      if (!pending && typeof msg.id === 'string') {
        pending = this.pendingRequests.get(Number(msg.id))
      }
      if (!pending && typeof msg.id === 'number') {
        pending = this.pendingRequests.get(String(msg.id))
      }
      if (pending) {
        this.pendingRequests.delete(msg.id!)
        // Also clean up the alternate key form
        if (typeof msg.id === 'string') this.pendingRequests.delete(Number(msg.id))
        if (typeof msg.id === 'number') this.pendingRequests.delete(String(msg.id))
        if (msg.error) {
          const err = new Error(msg.error.message || JSON.stringify(msg.error))
          ;(err as any).code = msg.error.code
          ;(err as any).data = msg.error.data
          pending.reject(err)
        } else {
          pending.resolve(msg.result)
        }
      }
    } else if (isRequest(msg)) {
      // Incoming request from agent (e.g. session/request_permission)
      if (msg.method === 'session/request_permission') {
        this.emit('permission-request', msg)
      } else {
        this.emit('incoming-request', msg)
      }
    } else if (isNotification(msg)) {
      // Incoming notification from agent (e.g. session/update)
      if (msg.method === 'session/update') {
        this.emit('session-update', msg.params)
      } else {
        this.emit('notification', msg)
      }
    }
  }

  private sendRequest(method: string, params?: any): Promise<any> {
    const id = this.nextId++
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      try {
        this.transport.send(request)
      } catch (err) {
        this.pendingRequests.delete(id)
        reject(err)
      }
    })
  }

  private sendNotification(method: string, params?: any): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params
    }
    this.transport.send(notification)
  }

  async initialize(): Promise<any> {
    return this.sendRequest('initialize', {
      clientInfo: { name: 'Axon', version: '1.0.0' },
      protocolVersion: 1,
      capabilities: {
        prompts: { text: true, embeddedContext: true }
      }
    })
  }

  async createSession(cwd?: string, mcpServers?: any[]): Promise<any> {
    return this.sendRequest('session/new', {
      cwd: cwd || process.cwd(),
      mcpServers: mcpServers || []
    })
  }

  sendPrompt(sessionId: string, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method: 'session/prompt',
        params: {
          sessionId,
          prompt: [{ type: 'text', text }]
        }
      }
      this.pendingRequests.set(id, {
        resolve: () => resolve(),
        reject: (err: any) => {
          this.emit('prompt-error', err)
          reject(err)
        }
      })
      try {
        this.transport.send(request)
      } catch (err) {
        this.pendingRequests.delete(id)
        this.emit('prompt-error', err)
        reject(err)
      }
    })
  }

  cancelPrompt(sessionId: string): void {
    this.sendNotification('session/cancel', { sessionId })
  }

  respondPermission(id: number | string, optionId: string): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result: { outcome: 'selected', optionId }
    }
    this.transport.send(response)
  }
}
