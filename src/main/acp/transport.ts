import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { JsonRpcMessage, encodeMessage, decodeMessage } from './jsonrpc'

export interface TransportOptions {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}

export class StdioTransport extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer: string = ''

  constructor(private options: TransportOptions) {
    super()
  }

  start(): void {
    const { command, args = [], cwd, env } = this.options

    this.process = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8')
      this.processBuffer()
    })

    this.process.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      this.emit('stderr', text)
    })

    this.process.on('error', (err: Error) => {
      this.emit('error', err)
    })

    this.process.on('close', (code: number | null) => {
      this.flushBuffer()
      this.process = null
      this.emit('close', code)
    })
  }

  private processBuffer(): void {
    let newlineIndex: number
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (line.length === 0) continue
      try {
        const msg = decodeMessage(line)
        this.emit('message', msg)
      } catch (err) {
        this.emit('error', new Error(`Failed to parse message: ${line}`))
      }
    }
  }

  private flushBuffer(): void {
    const remaining = this.buffer.trim()
    this.buffer = ''
    if (remaining.length === 0) return
    try {
      const msg = decodeMessage(remaining)
      this.emit('message', msg)
    } catch (err) {
      this.emit('error', new Error(`Failed to parse message: ${remaining}`))
    }
  }

  send(message: JsonRpcMessage): void {
    if (!this.process || !this.process.stdin || this.process.stdin.destroyed) {
      throw new Error('Transport is not connected')
    }
    const encoded = encodeMessage(message) + '\n'
    this.process.stdin.write(encoded)
  }

  close(): void {
    if (this.process) {
      this.process.stdin?.end()
      this.process.kill()
      this.process = null
    }
  }

  get connected(): boolean {
    return this.process !== null && !this.process.killed
  }
}
