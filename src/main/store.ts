import Store from 'electron-store'
import { safeStorage } from 'electron'

export interface AgentConfig {
  id: string
  name: string
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

interface StoredAgentConfig {
  id: string
  name: string
  command: string
  args: string[]
  cwd?: string
  encryptedEnv?: Record<string, string>
}

interface StoreSchema {
  agents: StoredAgentConfig[]
}

const store = new Store<StoreSchema>({
  defaults: {
    agents: []
  }
})

function encryptEnv(env: Record<string, string>): Record<string, string> {
  const encrypted: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    encrypted[key] = safeStorage.encryptString(value).toString('base64')
  }
  return encrypted
}

function decryptEnv(encrypted: Record<string, string>): Record<string, string> {
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
  const agent: AgentConfig = { ...rest }
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
