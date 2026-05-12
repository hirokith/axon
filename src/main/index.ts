import { app, BrowserWindow, shell, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { execFileSync } from 'child_process'
import { is } from '@electron-toolkit/utils'
import { StdioTransport } from './acp/transport'
import { AcpClient } from './acp/client'
import { MessageLogger } from './acp/logger'
import { AgentConfig } from './acp/types'
import { JsonRpcMessage } from './acp/jsonrpc'
import { getAgents, addAgent, updateAgent, deleteAgent, AgentConfig as StoredAgentConfig, getMcpServers, addMcpServer, updateMcpServer, deleteMcpServer, McpServerConfig as StoredMcpServerConfig } from './store'
import { IpcChannel, LogDirection } from '../shared/constants'

// Fix PATH for packaged app (macOS/Linux GUI launches don't inherit shell PATH)
function fixPath(): void {
  if (process.platform === 'win32') return
  if (!app.isPackaged) return
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const result = execFileSync(shell, ['-ilc', 'echo -n "_DELIMITER_"; printenv PATH; echo -n "_DELIMITER_"'], {
      encoding: 'utf-8',
      timeout: 5000
    })
    const match = result.match(/_DELIMITER_([\s\S]*?)_DELIMITER_/)
    if (match?.[1]) {
      process.env.PATH = match[1].trim()
    }
  } catch {
    // Fallback: append common binary paths
    const extra = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      `${process.env.HOME}/.nvm/versions/node/current/bin`,
      `${process.env.HOME}/.local/bin`
    ]
    process.env.PATH = [...extra, process.env.PATH].filter(Boolean).join(':')
  }
}

fixPath()

interface AgentConnection {
  transport: StdioTransport
  client: AcpClient
  cwd: string | null
}

let mainWindow: BrowserWindow | null = null
const connections = new Map<string, AgentConnection>()
const logger = new MessageLogger()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendToRenderer(channel: string, ...args: any[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function disconnectAgent(agentId: string): void {
  const conn = connections.get(agentId)
  if (conn) {
    conn.transport.close()
    connections.delete(agentId)
  }
}

function setupAcpHandlers(): void {
  ipcMain.handle(IpcChannel.AcpConnect, async (_event, config: AgentConfig & { agentId: string }) => {
    const { agentId } = config

    // Disconnect existing connection for this agent
    if (connections.has(agentId)) {
      disconnectAgent(agentId)
    }
    logger.clear()

    const transport = new StdioTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: config.env
    })
    const cwd = config.cwd || null

    // Wrap transport send to log outgoing messages
    const originalSend = transport.send.bind(transport)
    transport.send = (msg: JsonRpcMessage) => {
      logger.log(LogDirection.Outgoing, msg)
      console.log('[ACP outgoing]', JSON.stringify(msg))
      originalSend(msg)
    }

    transport.on('message', (msg: JsonRpcMessage) => {
      logger.log(LogDirection.Incoming, msg)
      console.log('[ACP incoming]', JSON.stringify(msg))
    })

    transport.on('stderr', (text: string) => {
      console.log('[ACP stderr]', text)
      sendToRenderer('acp:stderr', { agentId, text })
    })

    transport.on('close', (code: number | null) => {
      // Only handle if this transport is still the active one (avoid race with reconnect)
      const currentConn = connections.get(agentId)
      if (!currentConn || currentConn.transport === transport) {
        sendToRenderer('acp:connection-status', { agentId, connected: false, code })
        connections.delete(agentId)
      }
    })

    transport.on('error', (err: Error) => {
      // Log errors but don't treat them as disconnections.
      // Only the 'close' event means the connection is truly gone.
      console.error('[ACP transport error]', agentId, err.message)
    })

    transport.start()
    const client = new AcpClient(transport)

    client.on('session-update', (params: any) => {
      sendToRenderer('acp:session-update', { agentId, ...params })
    })

    client.on('incoming-request', (msg: any) => {
      console.log('[ACP incoming-request]', msg.method)
      const conn = connections.get(agentId)
      if (conn) {
        try {
          conn.transport.send({ jsonrpc: '2.0', id: msg.id, result: {} })
        } catch (err) {
          console.error('[ACP] Failed to send response:', err)
        }
      }
      sendToRenderer('acp:turn-complete', {
        agentId,
        sessionId: msg.params?.sessionId,
        method: msg.method,
        params: msg.params
      })
    })

    client.on('permission-request', (msg: any) => {
      sendToRenderer('acp:permission-request', {
        agentId,
        id: msg.id,
        ...msg.params
      })
    })

    client.on('error', (err: Error) => {
      console.error('[ACP client error]', agentId, err.message)
    })

    connections.set(agentId, { transport, client, cwd })

    // Initialize
    try {
      const result = await client.initialize()
      sendToRenderer('acp:connection-status', { agentId, connected: true })
      return result
    } catch (err: any) {
      const message = err instanceof Error ? err.message : JSON.stringify(err)
      disconnectAgent(agentId)
      throw new Error(`ACP initialize failed: ${message}`)
    }
  })

  ipcMain.handle(IpcChannel.AcpDisconnect, async (_event, agentId: string) => {
    disconnectAgent(agentId)
    sendToRenderer('acp:connection-status', { agentId, connected: false })
  })

  ipcMain.handle(IpcChannel.AcpCreateSession, async (_event, agentId: string, options?: { cwd?: string; mcpServers?: any[] }) => {
    const conn = connections.get(agentId)
    if (!conn) throw new Error('Not connected')
    const cwd = options?.cwd || conn.cwd || undefined
    const mcpServers = options?.mcpServers
    return conn.client.createSession(cwd, mcpServers)
  })

  ipcMain.handle(IpcChannel.AcpSendPrompt, async (_event, agentId: string, sessionId: string, text: string) => {
    const conn = connections.get(agentId)
    if (!conn) throw new Error('Not connected')
    conn.client.sendPrompt(sessionId, text)
    return { sent: true }
  })

  ipcMain.handle(IpcChannel.AcpCancelPrompt, async (_event, agentId: string, sessionId: string) => {
    const conn = connections.get(agentId)
    if (!conn) throw new Error('Not connected')
    conn.client.cancelPrompt(sessionId)
  })

  ipcMain.handle(
    IpcChannel.AcpRespondPermission,
    async (_event, agentId: string, id: number | string, optionId: string) => {
      const conn = connections.get(agentId)
      if (!conn) throw new Error('Not connected')
      conn.client.respondPermission(id, optionId)
    }
  )

  ipcMain.handle(IpcChannel.AcpGetLogEntries, async () => {
    return logger.getEntries()
  })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
    app.dock.setIcon(icon)
  }

  setupAcpHandlers()

  // Agent config IPC handlers
  ipcMain.handle(IpcChannel.AgentsList, () => getAgents())
  ipcMain.handle(IpcChannel.AgentsAdd, (_, agent: StoredAgentConfig) => { addAgent(agent); return getAgents() })
  ipcMain.handle(IpcChannel.AgentsUpdate, (_, id: string, updates: Partial<StoredAgentConfig>) => { updateAgent(id, updates); return getAgents() })
  ipcMain.handle(IpcChannel.AgentsDelete, (_, id: string) => { deleteAgent(id); return getAgents() })

  // MCP Server config IPC handlers
  ipcMain.handle(IpcChannel.McpServersList, () => getMcpServers())
  ipcMain.handle(IpcChannel.McpServersAdd, (_, server: StoredMcpServerConfig) => { addMcpServer(server); return getMcpServers() })
  ipcMain.handle(IpcChannel.McpServersUpdate, (_, id: string, updates: Partial<StoredMcpServerConfig>) => { updateMcpServer(id, updates); return getMcpServers() })
  ipcMain.handle(IpcChannel.McpServersDelete, (_, id: string) => { deleteMcpServer(id); return getMcpServers() })

  ipcMain.handle(IpcChannel.DialogSelectDirectory, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannel.FsListFiles, async (_event, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      return entries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
    } catch {
      return []
    }
  })

  ipcMain.handle(IpcChannel.FsReadFile, async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return content
    } catch {
      return null
    }
  })

  // Static file server for HTML preview
  const staticServers = new Map<string, { server: http.Server; port: number }>()

  const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wasm': 'application/wasm',
  }

  ipcMain.handle(IpcChannel.FsStartStaticServer, async (_event, rootDir: string) => {
    // Reuse existing server for same dir
    const existing = staticServers.get(rootDir)
    if (existing) {
      return { port: existing.port }
    }

    return new Promise<{ port: number }>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        let urlPath = decodeURIComponent(req.url || '/')
        if (urlPath.includes('?')) urlPath = urlPath.split('?')[0]
        if (urlPath === '/') urlPath = '/index.html'

        const filePath = join(rootDir, urlPath)
        // Prevent directory traversal
        if (!filePath.startsWith(rootDir + '/')) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }

        try {
          if (!fs.existsSync(filePath)) {
            res.writeHead(404)
            res.end('Not Found')
            return
          }
          const stat = fs.statSync(filePath)
          if (stat.isDirectory()) {
            const indexPath = join(filePath, 'index.html')
            if (fs.existsSync(indexPath)) {
              const content = fs.readFileSync(indexPath)
              res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' })
              res.end(content)
            } else {
              res.writeHead(404)
              res.end('Not Found')
            }
            return
          }
          const ext = '.' + (filePath.split('.').pop() || '').toLowerCase()
          const mimeType = MIME_TYPES[ext] || 'application/octet-stream'
          const content = fs.readFileSync(filePath)
          res.writeHead(200, { 'Content-Type': mimeType, 'Access-Control-Allow-Origin': '*' })
          res.end(content)
        } catch {
          res.writeHead(500)
          res.end('Internal Server Error')
        }
      })

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          staticServers.set(rootDir, { server, port: addr.port })
          resolve({ port: addr.port })
        } else {
          reject(new Error('Failed to start server'))
        }
      })

      server.on('error', reject)
    })
  })

  ipcMain.handle(IpcChannel.FsStopStaticServer, async (_event, rootDir: string) => {
    const entry = staticServers.get(rootDir)
    if (entry) {
      entry.server.close()
      staticServers.delete(rootDir)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
