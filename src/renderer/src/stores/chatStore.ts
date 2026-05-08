import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MessageRole = 'user' | 'agent'

export interface ToolCallInfo {
  toolCallId: string
  title: string
  kind: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
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
  sessionId: string
  toolCall: { toolCallId: string; title?: string; rawInput?: any }
  options: Array<{ optionId: string; name: string; kind: string }>
}

export interface SessionData {
  sessionId: string
  messages: ChatMessage[]
  isPrompting: boolean
  label: string
  agentName?: string
}

interface ChatState {
  connected: boolean
  connectedAgentName: string | null
  sessions: SessionData[]
  activeSessionId: string | null
  permissionRequests: PermissionRequestInfo[]
  sessionCounter: number

  setConnected: (connected: boolean, agentName?: string) => void
  addSession: (sessionId: string) => void
  switchSession: (sessionId: string) => void
  removeSession: (sessionId: string) => void

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
    (set) => ({
      connected: false,
      connectedAgentName: null,
      sessions: [],
      activeSessionId: null,
      permissionRequests: [],
      sessionCounter: 0,

      setConnected: (connected, agentName) => set({ connected, connectedAgentName: connected ? (agentName || null) : null }),

      addSession: (sessionId) =>
        set((state) => {
          const newCounter = state.sessionCounter + 1
          const newSession: SessionData = {
            sessionId,
            messages: [],
            isPrompting: false,
            label: `Session ${newCounter}`,
            agentName: state.connectedAgentName || undefined,
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

      addUserMessage: (text, sessionId?) =>
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, state.activeSessionId, (s) => ({
            ...s,
            messages: [
              ...s.messages,
              {
                id: crypto.randomUUID(),
                role: 'user' as MessageRole,
                text,
                timestamp: Date.now(),
              },
            ],
          })),
        })),

      appendAgentText: (text, sessionId?) =>
        set((state) => ({
          sessions: updateSession(state.sessions, sessionId, state.activeSessionId, (s) => {
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            if (last && last.role === 'agent' && !last.isThought) {
              msgs[msgs.length - 1] = { ...last, text: last.text + text }
            } else {
              msgs.push({
                id: crypto.randomUUID(),
                role: 'agent',
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
            if (last && last.role === 'agent' && last.isThought) {
              msgs[msgs.length - 1] = { ...last, text: last.text + text }
            } else {
              msgs.push({
                id: crypto.randomUUID(),
                role: 'agent',
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
            if (last && last.role === 'agent' && !last.isThought) {
              const toolCalls = [...(last.toolCalls || []), tcWithTime]
              msgs[msgs.length - 1] = { ...last, toolCalls }
            } else {
              msgs.push({
                id: crypto.randomUUID(),
                role: 'agent',
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
              const endTime = (updates.status === 'completed' || updates.status === 'failed') ? Date.now() : undefined
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
    }),
    {
      name: 'acp-chat-history',
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({ ...s, isPrompting: false })),
        activeSessionId: state.activeSessionId,
        sessionCounter: state.sessionCounter,
      }),
    }
  )
)
