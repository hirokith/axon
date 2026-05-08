import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const acpApi = {
  connectAgent: (config: { command: string; args?: string[]; cwd?: string; env?: Record<string, string> }) =>
    ipcRenderer.invoke('acp:connect', config),
  disconnect: () => ipcRenderer.invoke('acp:disconnect'),
  createSession: () => ipcRenderer.invoke('acp:create-session'),
  sendPrompt: (sessionId: string, text: string) =>
    ipcRenderer.invoke('acp:send-prompt', sessionId, text),
  cancelPrompt: (sessionId: string) => ipcRenderer.invoke('acp:cancel-prompt', sessionId),
  respondPermission: (id: number | string, outcome: string) =>
    ipcRenderer.invoke('acp:respond-permission', id, outcome),
  getLogEntries: () => ipcRenderer.invoke('acp:get-log-entries'),
  agentConfig: {
    list: () => ipcRenderer.invoke('agents:list'),
    add: (agent: any) => ipcRenderer.invoke('agents:add', agent),
    update: (id: string, updates: any) => ipcRenderer.invoke('agents:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('agents:delete', id),
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
  onStderrLog: (callback: (text: string) => void) => {
    const listener = (_event: any, text: string): void => callback(text)
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
