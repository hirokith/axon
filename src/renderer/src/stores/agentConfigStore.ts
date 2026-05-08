import { create } from 'zustand'

export interface AgentConfig {
  id: string
  name: string
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

interface AgentConfigState {
  agents: AgentConfig[]
  loading: boolean
  fetchAgents: () => Promise<void>
  addAgent: (agent: Omit<AgentConfig, 'id'>) => Promise<void>
  updateAgent: (id: string, updates: Partial<Omit<AgentConfig, 'id'>>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
}

export const useAgentConfigStore = create<AgentConfigState>((set) => ({
  agents: [],
  loading: false,
  fetchAgents: async () => {
    set({ loading: true })
    try {
      const agents = await (window as any).acpApi.agentConfig.list()
      set({ agents, loading: false })
    } catch (e) {
      set({ loading: false })
      throw e
    }
  },
  addAgent: async (agent) => {
    const id = crypto.randomUUID()
    const agents = await (window as any).acpApi.agentConfig.add({ ...agent, id })
    set({ agents })
  },
  updateAgent: async (id, updates) => {
    const agents = await (window as any).acpApi.agentConfig.update(id, updates)
    set({ agents })
  },
  deleteAgent: async (id) => {
    const agents = await (window as any).acpApi.agentConfig.delete(id)
    set({ agents })
  },
}))
