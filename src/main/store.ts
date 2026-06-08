import Store from 'electron-store'
import { safeStorage } from 'electron'

export interface AgentConfig {
  id: string
  name: string
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  enabled?: boolean
}

interface StoredAgentConfig {
  id: string
  name: string
  command: string
  args: string[]
  cwd?: string
  encryptedEnv?: Record<string, string>
  enabled?: boolean
}

export interface McpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
}

interface StoredMcpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  encryptedEnv?: Record<string, string>
}

interface StoreSchema {
  agents: StoredAgentConfig[]
  mcpServers: StoredMcpServerConfig[]
}

const store = new Store<StoreSchema>({
  defaults: {
    agents: [],
    mcpServers: []
  }
})

function encryptEnv(env: Record<string, string>): Record<string, string> {
  if (!safeStorage.isEncryptionAvailable()) {
    return env
  }
  const encrypted: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    encrypted[key] = safeStorage.encryptString(value).toString('base64')
  }
  return encrypted
}

function decryptEnv(encrypted: Record<string, string>): Record<string, string> {
  if (!safeStorage.isEncryptionAvailable()) {
    return encrypted
  }
  const decrypted: Record<string, string> = {}
  for (const [key, value] of Object.entries(encrypted)) {
    decrypted[key] = safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  return decrypted
}

function toStored(agent: AgentConfig): StoredAgentConfig {
  const { env, ...rest } = agent
  const stored: StoredAgentConfig = { ...rest }
  if (env && Object.keys(env).length > 0) {
    stored.encryptedEnv = encryptEnv(env)
  }
  return stored
}

function fromStored(stored: StoredAgentConfig): AgentConfig {
  const { encryptedEnv, ...rest } = stored
  const agent: AgentConfig = { ...rest, enabled: stored.enabled !== false }
  if (encryptedEnv && Object.keys(encryptedEnv).length > 0) {
    agent.env = decryptEnv(encryptedEnv)
  }
  return agent
}

export function getAgents(): AgentConfig[] {
  return store.get('agents').map(fromStored)
}

export function addAgent(agent: AgentConfig): void {
  const agents = store.get('agents')
  agents.push(toStored(agent))
  store.set('agents', agents)
}

export function updateAgent(id: string, updates: Partial<Omit<AgentConfig, 'id'>>): void {
  const agents = store.get('agents')
  const idx = agents.findIndex(a => a.id === id)
  if (idx !== -1) {
    const current = fromStored(agents[idx])
    const updated = { ...current, ...updates }
    agents[idx] = toStored(updated)
    store.set('agents', agents)
  }
}

export function deleteAgent(id: string): void {
  const agents = store.get('agents').filter(a => a.id !== id)
  store.set('agents', agents)
}

// MCP Server config helpers

function mcpToStored(server: McpServerConfig): StoredMcpServerConfig {
  const { env, ...rest } = server
  const stored: StoredMcpServerConfig = { ...rest }
  if (env && Object.keys(env).length > 0) {
    stored.encryptedEnv = encryptEnv(env)
  }
  return stored
}

function mcpFromStored(stored: StoredMcpServerConfig): McpServerConfig {
  const { encryptedEnv, ...rest } = stored
  const server: McpServerConfig = { ...rest }
  if (encryptedEnv && Object.keys(encryptedEnv).length > 0) {
    server.env = decryptEnv(encryptedEnv)
  }
  return server
}

export function getMcpServers(): McpServerConfig[] {
  return store.get('mcpServers').map(mcpFromStored)
}

export function addMcpServer(server: McpServerConfig): void {
  const servers = store.get('mcpServers')
  servers.push(mcpToStored(server))
  store.set('mcpServers', servers)
}

export function updateMcpServer(id: string, updates: Partial<Omit<McpServerConfig, 'id'>>): void {
  const servers = store.get('mcpServers')
  const idx = servers.findIndex(s => s.id === id)
  if (idx !== -1) {
    const current = mcpFromStored(servers[idx])
    const updated = { ...current, ...updates }
    servers[idx] = mcpToStored(updated)
    store.set('mcpServers', servers)
  }
}

export function deleteMcpServer(id: string): void {
  const servers = store.get('mcpServers').filter(s => s.id !== id)
  store.set('mcpServers', servers)
}
