import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IpcChannel } from '../shared/constants'

const acpApi = {
  connectAgent: (config: { agentId: string; command: string; args?: string[]; cwd?: string; env?: Record<string, string> }) =>
    ipcRenderer.invoke(IpcChannel.AcpConnect, config),
  disconnect: (agentId: string) => ipcRenderer.invoke(IpcChannel.AcpDisconnect, agentId),
  testConnection: (config: { command: string; args?: string[]; cwd?: string; env?: Record<string, string> }) =>
    ipcRenderer.invoke(IpcChannel.AcpTestConnection, config),
  createSession: (agentId: string, options?: { cwd?: string; mcpServers?: any[] }) => ipcRenderer.invoke(IpcChannel.AcpCreateSession, agentId, options),
  sendPrompt: (agentId: string, sessionId: string, text: string) =>
    ipcRenderer.invoke(IpcChannel.AcpSendPrompt, agentId, sessionId, text),
  cancelPrompt: (agentId: string, sessionId: string) =>
    ipcRenderer.invoke(IpcChannel.AcpCancelPrompt, agentId, sessionId),
  respondPermission: (agentId: string, id: number | string, outcome: string) =>
    ipcRenderer.invoke(IpcChannel.AcpRespondPermission, agentId, id, outcome),
  getLogEntries: (options?: { limit?: number; offset?: number }) => ipcRenderer.invoke(IpcChannel.AcpGetLogEntries, options),
  logs: {
    query: (options?: any) => ipcRenderer.invoke(IpcChannel.LogsQuery, options),
    clear: (options?: any) => ipcRenderer.invoke(IpcChannel.LogsClear, options),
  },
  structuredLogs: {
    insert: (entry: any) => ipcRenderer.invoke(IpcChannel.StructuredLogsInsert, entry),
    query: (options?: any) => ipcRenderer.invoke(IpcChannel.StructuredLogsQuery, options),
  },
  agentConfig: {
    list: () => ipcRenderer.invoke(IpcChannel.AgentsList),
    add: (agent: any) => ipcRenderer.invoke(IpcChannel.AgentsAdd, agent),
    update: (id: string, updates: any) => ipcRenderer.invoke(IpcChannel.AgentsUpdate, id, updates),
    delete: (id: string) => ipcRenderer.invoke(IpcChannel.AgentsDelete, id),
  },
  mcpConfig: {
    list: () => ipcRenderer.invoke(IpcChannel.McpServersList),
    add: (server: any) => ipcRenderer.invoke(IpcChannel.McpServersAdd, server),
    update: (id: string, updates: any) => ipcRenderer.invoke(IpcChannel.McpServersUpdate, id, updates),
    delete: (id: string) => ipcRenderer.invoke(IpcChannel.McpServersDelete, id),
  },
  selectDirectory: () => ipcRenderer.invoke(IpcChannel.DialogSelectDirectory),
  openExternal: (url: string) => ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url),
  fs: {
    listFiles: (dirPath: string) => ipcRenderer.invoke(IpcChannel.FsListFiles, dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke(IpcChannel.FsReadFile, filePath),
    startStaticServer: (rootDir: string) => ipcRenderer.invoke(IpcChannel.FsStartStaticServer, rootDir),
    stopStaticServer: (rootDir: string) => ipcRenderer.invoke(IpcChannel.FsStopStaticServer, rootDir),
  },
  onSessionUpdate: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any): void => callback(data)
    ipcRenderer.on('acp:session-update', listener)
    return (): void => {
      ipcRenderer.removeListener('acp:session-update', listener)
    }
  },
  onPermissionRequest: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any): void => callback(data)
    ipcRenderer.on('acp:permission-request', listener)
    return (): void => {
      ipcRenderer.removeListener('acp:permission-request', listener)
    }
  },
  onConnectionStatus: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any): void => callback(data)
    ipcRenderer.on('acp:connection-status', listener)
    return (): void => {
      ipcRenderer.removeListener('acp:connection-status', listener)
    }
  },
  onStderrLog: (callback: (data: { agentId: string; text: string }) => void) => {
    const listener = (_event: any, data: { agentId: string; text: string }): void => callback(data)
    ipcRenderer.on('acp:stderr', listener)
    return (): void => {
      ipcRenderer.removeListener('acp:stderr', listener)
    }
  },
  onTurnComplete: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any): void => callback(data)
    ipcRenderer.on('acp:turn-complete', listener)
    return (): void => {
      ipcRenderer.removeListener('acp:turn-complete', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('acpApi', acpApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.acpApi = acpApi
}
