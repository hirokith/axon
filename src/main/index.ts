import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { StdioTransport } from './acp/transport'
import { AcpClient } from './acp/client'
import { MessageLogger } from './acp/logger'
import { AgentConfig } from './acp/types'
import { JsonRpcMessage } from './acp/jsonrpc'
import { getAgents, addAgent, updateAgent, deleteAgent, AgentConfig as StoredAgentConfig } from './store'

let mainWindow: BrowserWindow | null = null
let transport: StdioTransport | null = null
let client: AcpClient | null = null
let connectedCwd: string | null = null
const logger = new MessageLogger()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

function setupAcpHandlers(): void {
  ipcMain.handle('acp:connect', async (_event, config: AgentConfig) => {
    // Disconnect existing connection
    if (client) {
      transport?.close()
      transport = null
      client = null
    }
    logger.clear()

    transport = new StdioTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: config.env
    })
    connectedCwd = config.cwd || null

    // Wrap transport send to log outgoing messages
    const originalSend = transport.send.bind(transport)
    transport.send = (msg: JsonRpcMessage) => {
      logger.log('outgoing', msg)
      console.log('[ACP outgoing]', JSON.stringify(msg))
      originalSend(msg)
    }

    transport.on('message', (msg: JsonRpcMessage) => {
      logger.log('incoming', msg)
      console.log('[ACP incoming]', JSON.stringify(msg))
    })

    transport.on('stderr', (text: string) => {
      console.log('[ACP stderr]', text)
      sendToRenderer('acp:stderr', text)
    })

    transport.on('close', (code: number | null) => {
      sendToRenderer('acp:connection-status', { connected: false, code })
      client = null
      transport = null
    })

    transport.on('error', (err: Error) => {
      sendToRenderer('acp:connection-status', { connected: false, error: err.message })
    })

    transport.start()
    client = new AcpClient(transport)

    client.on('session-update', (params: any) => {
      sendToRenderer('acp:session-update', params)
    })

    client.on('incoming-request', (msg: any) => {
      // Agent sent a request (e.g. _d2c_agent/session/report_result)
      // Respond with success and notify renderer that turn is done
      console.log('[ACP incoming-request]', msg.method)
      if (transport) {
        try {
          transport.send({ jsonrpc: '2.0', id: msg.id, result: {} })
        } catch (err) {
          console.error('[ACP] Failed to send response:', err)
        }
      }
      sendToRenderer('acp:turn-complete', {
        sessionId: msg.params?.sessionId,
        method: msg.method,
        params: msg.params
      })
    })

    client.on('permission-request', (msg: any) => {
      sendToRenderer('acp:permission-request', {
        id: msg.id,
        ...msg.params
      })
    })

    client.on('error', (err: Error) => {
      sendToRenderer('acp:connection-status', { connected: false, error: err.message })
    })

    // Initialize
    try {
      const result = await client.initialize()
      sendToRenderer('acp:connection-status', { connected: true })
      return result
    } catch (err: any) {
      const message = err instanceof Error ? err.message : JSON.stringify(err)
      transport?.close()
      transport = null
      client = null
      throw new Error(`ACP initialize failed: ${message}`)
    }
  })

  ipcMain.handle('acp:disconnect', async () => {
    if (transport) {
      transport.close()
      transport = null
      client = null
    }
    sendToRenderer('acp:connection-status', { connected: false })
  })

  ipcMain.handle('acp:create-session', async () => {
    if (!client) throw new Error('Not connected')
    return client.createSession(connectedCwd || undefined)
  })

  ipcMain.handle('acp:send-prompt', async (_event, sessionId: string, text: string) => {
    if (!client) throw new Error('Not connected')
    client.sendPrompt(sessionId, text)
    return { sent: true }
  })

  ipcMain.handle('acp:cancel-prompt', async (_event, sessionId: string) => {
    if (!client) throw new Error('Not connected')
    client.cancelPrompt(sessionId)
  })

  ipcMain.handle(
    'acp:respond-permission',
    async (_event, id: number | string, optionId: string) => {
      if (!client) throw new Error('Not connected')
      client.respondPermission(id, optionId)
    }
  )

  ipcMain.handle('acp:get-log-entries', async () => {
    return logger.getEntries()
  })
}

app.whenReady().then(() => {
  setupAcpHandlers()

  // Agent config IPC handlers
  ipcMain.handle('agents:list', () => getAgents())
  ipcMain.handle('agents:add', (_, agent: StoredAgentConfig) => { addAgent(agent); return getAgents() })
  ipcMain.handle('agents:update', (_, id: string, updates: Partial<StoredAgentConfig>) => { updateAgent(id, updates); return getAgents() })
  ipcMain.handle('agents:delete', (_, id: string) => { deleteAgent(id); return getAgents() })

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
