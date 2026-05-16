import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { MessageRole, ToolCallStatus } from '@shared/constants'

export { MessageRole, ToolCallStatus }

export interface ToolCallInfo {
  toolCallId: string
  title: string
  kind: string
  status: ToolCallStatus
  rawInput?: any
  rawOutput?: any
  content?: any[]
  startTime?: number
  endTime?: number
}

export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  timestamp: number
  toolCalls?: ToolCallInfo[]
  isThought?: boolean
}

export interface PermissionRequestInfo {
  id: number | string
  agentId: string
  sessionId: string
  toolCall: { toolCallId: string; title?: string; rawInput?: any }
  options: Array<{ optionId: string; name: string; kind: string }>
}

export interface SessionData {
  sessionId: string
  agentId: string
  messages: ChatMessage[]
  isPrompting: boolean
  label: string
  agentName?: string
}

export interface ConnectedAgent {
  agentId: string
  name: string
}

interface ChatState {
  connectedAgents: ConnectedAgent[]
  sessions: SessionData[]
  activeSessionId: string | null
  permissionRequests: PermissionRequestInfo[]
  sessionCounter: number
  pendingNewSessionAgentId: string | null

  addConnectedAgent: (agentId: string, name: string) => void
  removeConnectedAgent: (agentId: string) => void
  isAgentConnected: (agentId: string) => boolean

  addSession: (sessionId: string, agentId: string, agentName?: string) => void
  switchSession: (sessionId: string) => void
  removeSession: (sessionId: string) => void
  updateSessionId: (oldSessionId: string, newSessionId: string) => void
  setPendingNewSessionAgentId: (agentId: string | null) => void

  addUserMessage: (text: string, sessionId?: string) => void
  appendAgentText: (text: string, sessionId?: string) => void
  appendThoughtText: (text: string, sessionId?: string) => void
  addToolCall: (tc: ToolCallInfo, sessionId?: string) => void
  updateToolCall: (toolCallId: string, updates: Partial<ToolCallInfo>, sessionId?: string) => void
  setIsPrompting: (v: boolean, sessionId?: string) => void

  addPermissionRequest: (req: PermissionRequestInfo) => void
  removePermissionRequest: (id: number | string) => void
  clearSessions: () => void
}

function updateSession(
  sessions: SessionData[],
  targetId: string | null | undefined,
  activeSessionId: string | null,
  updater: (session: SessionData) => SessionData
): SessionData[] {
  const id = targetId || activeSessionId
  if (!id) return sessions
  return sessions.map((s) => (s.sessionId === id ? updater(s) : s))
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      connectedAgents: [],
      sessions: [],
      activeSessionId: null,
      permissionRequests: [],
      sessionCounter: 0,
      pendingNewSessionAgentId: null,

      addConnectedAgent: (agentId, name) =>
        set((state) => {
          if (state.connectedAgents.some((a) => a.agentId === agentId)) return state
          return { connectedAgents: [...state.connectedAgents, { agentId, name }] }
        }),

      removeConnectedAgent: (agentId) =>
        set((state) => ({
          connectedAgents: state.connectedAgents.filter((a) => a.agentId !== agentId),
        })),

      isAgentConnected: (agentId) => get().connectedAgents.some((a) => a.agentId === agentId),

      addSession: (sessionId, agentId, agentName?) =>
        set((state) => {
          const newCounter = state.sessionCounter + 1
          const newSession: SessionData = {
            sessionId,
            agentId,
            messages: [],
            isPrompting: false,
            label: 'New Session',
            agentName,
          }
          return {
            sessions: [...state.sessions, newSession],
            activeSessionId: sessionId,
            sessionCounter: newCounter,
          }
        }),

      switchSession: (sessionId) => set({ activeSessionId: sessionId }),

      removeSession: (sessionId) =>
        set((state) => {
          const sessions = state.sessions.filter((s) => s.sessionId !== sessionId)
          let activeSessionId = state.activeSessionId
          if (activeSessionId === sessionId) {
            activeSessionId = sessions.length > 0 ? sessions[sessions.length - 1].sessionId : null
          }
          return { sessions, activeSessionId }
        }),

      updateSessionId: (oldSessionId, newSessionId) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.sessionId === oldSessionId ? { ...s, sessionId: newSessionId } : s
          ),
          activeSessionId: state.activeSessionId === oldSessionId ? newSessionId : state.activeSessionId,
        })),

      addUserMessage: (text, sessionId?) =>
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, state.activeSessionId, (s) => {
            const isFirstUserMessage = !s.messages.some((m) => m.role === MessageRole.User)
            const newLabel = isFirstUserMessage ? text.slice(0, 30) + (text.length > 30 ? '...' : '') : s.label
            return {
              ...s,
              label: newLabel,
              messages: [
                ...s.messages,
                {
                  id: crypto.randomUUID(),
                  role: MessageRole.User,
                  text,
                  timestamp: Date.now(),
                },
              ],
            }
          }),
        })),

      appendAgentText: (text, sessionId?) =>
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, state.activeSessionId, (s) => {
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            if (last && last.role === MessageRole.Agent && !last.isThought && !(last.toolCalls && last.toolCalls.length > 0)) {
              msgs[msgs.length - 1] = { ...last, text: last.text + text }
            } else {
              msgs.push({
                id: crypto.randomUUID(),
                role: MessageRole.Agent,
                text,
                timestamp: Date.now(),
              })
            }
            return { ...s, messages: msgs }
          }),
        })),

      appendThoughtText: (text, sessionId?) =>
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, state.activeSessionId, (s) => {
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            if (last && last.role === MessageRole.Agent && last.isThought) {
              msgs[msgs.length - 1] = { ...last, text: last.text + text }
            } else {
              msgs.push({
                id: crypto.randomUUID(),
                role: MessageRole.Agent,
                text,
                timestamp: Date.now(),
                isThought: true,
              })
            }
            return { ...s, messages: msgs }
          }),
        })),

      addToolCall: (tc, sessionId?) =>
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, state.activeSessionId, (s) => {
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            const tcWithTime = { ...tc, startTime: Date.now() }
            if (last && last.role === MessageRole.Agent && !last.isThought && !last.text) {
              const toolCalls = [...(last.toolCalls || []), tcWithTime]
              msgs[msgs.length - 1] = { ...last, toolCalls }
            } else {
              msgs.push({
                id: crypto.randomUUID(),
                role: MessageRole.Agent,
                text: '',
                timestamp: Date.now(),
                toolCalls: [tcWithTime],
              })
            }
            return { ...s, messages: msgs }
          }),
        })),

      updateToolCall: (toolCallId, updates, sessionId?) =>
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, state.activeSessionId, (s) => {
            const msgs = s.messages.map((msg) => {
              if (!msg.toolCalls) return msg
              const idx = msg.toolCalls.findIndex((tc) => tc.toolCallId === toolCallId)
              if (idx === -1) return msg
              const toolCalls = [...msg.toolCalls]
              const endTime = (updates.status === ToolCallStatus.Completed || updates.status === ToolCallStatus.Failed) ? Date.now() : undefined
              toolCalls[idx] = { ...toolCalls[idx], ...updates, ...(endTime ? { endTime } : {}) }
              return { ...msg, toolCalls }
            })
            return { ...s, messages: msgs }
          }),
        })),

      setIsPrompting: (v, sessionId?) =>
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, state.activeSessionId, (s) => ({
            ...s,
            isPrompting: v,
          })),
        })),

      addPermissionRequest: (req) =>
        set((state) => ({
          permissionRequests: [...state.permissionRequests, req],
        })),

      removePermissionRequest: (id) =>
        set((state) => ({
          permissionRequests: state.permissionRequests.filter((r) => r.id !== id),
        })),

      clearSessions: () => set({ sessions: [], activeSessionId: null, sessionCounter: 0, permissionRequests: [] }),
      setPendingNewSessionAgentId: (agentId) => set({ pendingNewSessionAgentId: agentId }),
    }),
    {
      name: 'acp-chat-history',
      storage: createJSONStorage(() => ({
        getItem: async (_name: string) => {
          const data = await (window as any).acpApi.chatHistory.get()
          return data ? JSON.stringify({ state: data }) : null
        },
        setItem: async (_name: string, value: string) => {
          const parsed = JSON.parse(value)
          await (window as any).acpApi.chatHistory.set(parsed.state)
        },
        removeItem: async () => {
          await (window as any).acpApi.chatHistory.set(null)
        },
      })),
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({ ...s, isPrompting: false })),
        activeSessionId: state.activeSessionId,
        sessionCounter: state.sessionCounter,
      }),
    }
  )
)
