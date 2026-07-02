import { create } from 'zustand'
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
  images?: string[]
}

export interface PermissionRequestInfo {
  id: number | string
  agentId: string
  sessionId: string
  toolCall: { toolCallId: string; title?: string; rawInput?: any }
  options: Array<{ optionId: string; name: string; kind: string }>
}

export interface SessionMeta {
  sessionId: string
  agentId: string
  agentName?: string
  label: string
  createdAt: number
  updatedAt: number
}

export interface ConnectedAgent {
  agentId: string
  name: string
  models?: string[]
}

interface ChatState {
  connectedAgents: ConnectedAgent[]
  sessionMetas: SessionMeta[]
  activeSessionId: string | null
  activeMessages: ChatMessage[]
  isLoadingMessages: boolean
  isPromptingMap: Record<string, boolean>
  permissionRequests: PermissionRequestInfo[]
  sessionCounter: number
  pendingNewSessionAgentId: string | null

  initFromDb: () => Promise<void>

  addConnectedAgent: (agentId: string, name: string, models?: string[]) => void
  updateConnectedAgentModels: (agentId: string, models: string[]) => void
  removeConnectedAgent: (agentId: string) => void
  isAgentConnected: (agentId: string) => boolean

  addSession: (sessionId: string, agentId: string, agentName?: string) => void
  switchSession: (sessionId: string) => Promise<void>
  removeSession: (sessionId: string) => void
  updateSessionId: (oldSessionId: string, newSessionId: string) => void
  setPendingNewSessionAgentId: (agentId: string | null) => void

  addUserMessage: (text: string, sessionId?: string, images?: string[]) => void
  appendAgentText: (text: string, sessionId?: string) => void
  appendThoughtText: (text: string, sessionId?: string) => void
  addToolCall: (tc: ToolCallInfo, sessionId?: string) => void
  updateToolCall: (toolCallId: string, updates: Partial<ToolCallInfo>, sessionId?: string) => void
  setIsPrompting: (v: boolean, sessionId?: string) => void

  addPermissionRequest: (req: PermissionRequestInfo) => void
  removePermissionRequest: (id: number | string) => void
  clearSessions: () => void
}

// --- Persistence helpers (module-level) ---

const acpApi = () => (window as any).acpApi

let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_DEBOUNCE_MS = 3000

function schedulePersist() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushActiveMessages()
  }, FLUSH_DEBOUNCE_MS)
}

function flushActiveMessages() {
  const { activeSessionId, activeMessages } = useChatStore.getState()
  if (!activeSessionId || activeMessages.length === 0) return
  const rows = activeMessages.map((msg, idx) => ({
    id: msg.id,
    sessionId: activeSessionId,
    role: msg.role,
    text: msg.text,
    timestamp: msg.timestamp,
    isThought: msg.isThought || false,
    toolCalls: msg.toolCalls || null,
    seq: idx,
  }))
  acpApi().messages.sync(activeSessionId, rows).catch((e: any) => {
    console.error('[chatStore] Failed to persist messages:', e)
  })
}

// Buffer for messages targeting non-active sessions during streaming
const inactiveBuffers = new Map<string, ChatMessage[]>()

// Microtask batching for streaming text appends
let pendingAgentText = ''
let pendingAgentTextScheduled = false
let pendingThoughtText = ''
let pendingThoughtTextScheduled = false

function flushInactiveBuffer(sessionId: string) {
  const buffer = inactiveBuffers.get(sessionId)
  if (!buffer || buffer.length === 0) return
  const rows = buffer.map((msg, idx) => ({
    id: msg.id,
    sessionId,
    role: msg.role,
    text: msg.text,
    timestamp: msg.timestamp,
    isThought: msg.isThought || false,
    toolCalls: msg.toolCalls || null,
    seq: 10000 + idx, // high seq to append after existing messages; will be rewritten on next full sync
  }))
  acpApi().messages.sync(sessionId, rows).catch((e: any) => {
    console.error('[chatStore] Failed to flush inactive buffer:', e)
  })
  inactiveBuffers.delete(sessionId)
}

// For inactive sessions: append text or create message
function appendToInactiveBuffer(sessionId: string, text: string, isThought?: boolean) {
  let buffer = inactiveBuffers.get(sessionId) || []
  const last = buffer[buffer.length - 1]
  const matchesLast = last && last.role === MessageRole.Agent && !!last.isThought === !!isThought && !(last.toolCalls?.length)
  if (matchesLast) {
    buffer[buffer.length - 1] = { ...last, text: last.text + text }
  } else {
    buffer.push({
      id: crypto.randomUUID(),
      role: MessageRole.Agent,
      text,
      timestamp: Date.now(),
      ...(isThought ? { isThought: true } : {}),
    })
  }
  inactiveBuffers.set(sessionId, buffer)
}

export const useChatStore = create<ChatState>()((set, get) => ({
  connectedAgents: [],
  sessionMetas: [],
  activeSessionId: null,
  activeMessages: [],
  isLoadingMessages: false,
  isPromptingMap: {},
  permissionRequests: [],
  sessionCounter: 0,
  pendingNewSessionAgentId: null,

  initFromDb: async () => {
    try {
      const metas: any[] = await acpApi().sessions.getAllMetas()
      const sessionMetas: SessionMeta[] = metas.map((m) => ({
        sessionId: m.sessionId,
        agentId: m.agentId,
        agentName: m.agentName || undefined,
        label: m.label,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }))
      set({ sessionMetas, sessionCounter: sessionMetas.length })

      // Load active session's messages if we have a stored one
      const stored = localStorage.getItem('axon-active-session-id')
      if (stored && sessionMetas.some((m) => m.sessionId === stored)) {
        set({ activeSessionId: stored, isLoadingMessages: true })
        const rows = await acpApi().sessions.getMessages(stored)
        if (get().activeSessionId === stored) {
          set({
            activeMessages: rows.map((r: any) => ({
              id: r.id,
              role: r.role as MessageRole,
              text: r.text,
              timestamp: r.timestamp,
              isThought: r.isThought || undefined,
              toolCalls: r.toolCalls || undefined,
            })),
            isLoadingMessages: false,
          })
        }
      } else if (sessionMetas.length > 0) {
        const first = sessionMetas[0]
        set({ activeSessionId: first.sessionId, isLoadingMessages: true })
        localStorage.setItem('axon-active-session-id', first.sessionId)
        const rows = await acpApi().sessions.getMessages(first.sessionId)
        if (get().activeSessionId === first.sessionId) {
          set({
            activeMessages: rows.map((r: any) => ({
              id: r.id,
              role: r.role as MessageRole,
              text: r.text,
              timestamp: r.timestamp,
              isThought: r.isThought || undefined,
              toolCalls: r.toolCalls || undefined,
            })),
            isLoadingMessages: false,
          })
        }
      }
    } catch (e) {
      console.error('[chatStore] initFromDb failed:', e)
    }
  },

  addConnectedAgent: (agentId, name, models?) =>
    set((state) => {
      if (state.connectedAgents.some((a) => a.agentId === agentId)) return state
      return { connectedAgents: [...state.connectedAgents, { agentId, name, models }] }
    }),

  updateConnectedAgentModels: (agentId, models) =>
    set((state) => ({
      connectedAgents: state.connectedAgents.map((a) =>
        a.agentId === agentId ? { ...a, models } : a
      ),
    })),

  removeConnectedAgent: (agentId) =>
    set((state) => ({
      connectedAgents: state.connectedAgents.filter((a) => a.agentId !== agentId),
    })),

  isAgentConnected: (agentId) => get().connectedAgents.some((a) => a.agentId === agentId),

  addSession: (sessionId, agentId, agentName?) => {
    const now = Date.now()
    const meta: SessionMeta = {
      sessionId,
      agentId,
      agentName,
      label: 'New Session',
      createdAt: now,
      updatedAt: now,
    }

    // Flush current active session first
    if (get().activeSessionId && get().activeMessages.length > 0) {
      flushActiveMessages()
    }

    set((state) => ({
      sessionMetas: [meta, ...state.sessionMetas],
      activeSessionId: sessionId,
      activeMessages: [],
      isLoadingMessages: false,
      sessionCounter: state.sessionCounter + 1,
    }))
    localStorage.setItem('axon-active-session-id', sessionId)

    // Persist meta to DB
    acpApi().sessions.upsertMeta({
      sessionId, agentId, agentName: agentName || null, label: 'New Session', createdAt: now, updatedAt: now
    }).catch((e: any) => console.error('[chatStore] upsertMeta failed:', e))
  },

  switchSession: async (sessionId: string) => {
    const state = get()

    // Merge any buffered messages even if already active
    const pendingBuffer = inactiveBuffers.get(sessionId)
    if (state.activeSessionId === sessionId && state.activeMessages.length > 0 && !state.isLoadingMessages) {
      if (pendingBuffer && pendingBuffer.length > 0) {
        inactiveBuffers.delete(sessionId)
        set((s) => ({ activeMessages: [...s.activeMessages, ...pendingBuffer] }))
      }
      return
    }

    // Flush current session's messages
    if (state.activeSessionId && state.activeMessages.length > 0) {
      flushActiveMessages()
    }

    set({ activeSessionId: sessionId, isLoadingMessages: true, activeMessages: [] })
    localStorage.setItem('axon-active-session-id', sessionId)

    try {
      const rows = await acpApi().sessions.getMessages(sessionId)

      // Race condition guard
      if (get().activeSessionId !== sessionId) return

      // Merge any inactive buffer
      const buffer = inactiveBuffers.get(sessionId) || []
      inactiveBuffers.delete(sessionId)

      const messages: ChatMessage[] = rows.map((r: any) => ({
        id: r.id,
        role: r.role as MessageRole,
        text: r.text,
        timestamp: r.timestamp,
        isThought: r.isThought || undefined,
        toolCalls: r.toolCalls || undefined,
      }))

      set({ activeMessages: [...messages, ...buffer], isLoadingMessages: false })
    } catch (e) {
      console.error('[chatStore] switchSession load failed:', e)
      if (get().activeSessionId === sessionId) {
        set({ isLoadingMessages: false })
      }
    }
  },

  removeSession: (sessionId) => {
    set((state) => {
      const sessionMetas = state.sessionMetas.filter((s) => s.sessionId !== sessionId)
      let activeSessionId = state.activeSessionId
      let activeMessages = state.activeMessages
      if (activeSessionId === sessionId) {
        activeSessionId = sessionMetas.length > 0 ? sessionMetas[0].sessionId : null
        activeMessages = []
      }
      if (activeSessionId) {
        localStorage.setItem('axon-active-session-id', activeSessionId)
      } else {
        localStorage.removeItem('axon-active-session-id')
      }
      return { sessionMetas, activeSessionId, activeMessages }
    })

    // Delete from DB
    acpApi().sessions.delete(sessionId).catch((e: any) => console.error('[chatStore] delete failed:', e))
    inactiveBuffers.delete(sessionId)

    // Load new active session messages if needed
    const { activeSessionId } = get()
    if (activeSessionId && get().activeMessages.length === 0) {
      get().switchSession(activeSessionId)
    }
  },

  updateSessionId: (oldSessionId, newSessionId) => {
    set((state) => {
      const newPromptingMap = { ...state.isPromptingMap }
      if (oldSessionId in newPromptingMap) {
        newPromptingMap[newSessionId] = newPromptingMap[oldSessionId]
        delete newPromptingMap[oldSessionId]
      }
      return {
        sessionMetas: state.sessionMetas.map((s) =>
          s.sessionId === oldSessionId ? { ...s, sessionId: newSessionId } : s
        ),
        activeSessionId: state.activeSessionId === oldSessionId ? newSessionId : state.activeSessionId,
        isPromptingMap: newPromptingMap,
      }
    })
    if (get().activeSessionId === newSessionId) {
      localStorage.setItem('axon-active-session-id', newSessionId)
    }
    // Update in DB: delete old, insert new
    const meta = get().sessionMetas.find((m) => m.sessionId === newSessionId)
    if (meta) {
      acpApi().sessions.delete(oldSessionId).catch(() => {})
      acpApi().sessions.upsertMeta({
        sessionId: newSessionId, agentId: meta.agentId, agentName: meta.agentName || null,
        label: meta.label, createdAt: meta.createdAt, updatedAt: Date.now()
      }).catch(() => {})
    }
  },

  addUserMessage: (text, sessionId?, images?) => {
    const state = get()
    const targetSid = sessionId || state.activeSessionId
    if (!targetSid) return

    if (targetSid !== state.activeSessionId) {
      // Non-active session: buffer it
      const buffer = inactiveBuffers.get(targetSid) || []
      buffer.push({ id: crypto.randomUUID(), role: MessageRole.User, text, timestamp: Date.now(), images })
      inactiveBuffers.set(targetSid, buffer)
      return
    }

    set((s) => {
      const isFirstUserMessage = !s.activeMessages.some((m) => m.role === MessageRole.User)
      const newLabel = isFirstUserMessage ? text.slice(0, 30) + (text.length > 30 ? '...' : '') : undefined

      const newMessages = [
        ...s.activeMessages,
        { id: crypto.randomUUID(), role: MessageRole.User, text, timestamp: Date.now(), images },
      ]

      const updates: Partial<ChatState> = { activeMessages: newMessages }
      if (newLabel) {
        updates.sessionMetas = s.sessionMetas.map((m) =>
          m.sessionId === targetSid ? { ...m, label: newLabel, updatedAt: Date.now() } : m
        )
        // Persist label
        acpApi().sessions.updateLabel(targetSid, newLabel).catch(() => {})
      }
      return updates as any
    })
    schedulePersist()
  },

  appendAgentText: (text, sessionId?) => {
    const state = get()
    const targetSid = sessionId || state.activeSessionId
    if (!targetSid) return

    if (targetSid !== state.activeSessionId) {
      appendToInactiveBuffer(targetSid, text)
      return
    }

    pendingAgentText += text
    if (!pendingAgentTextScheduled) {
      pendingAgentTextScheduled = true
      queueMicrotask(() => {
        const buffered = pendingAgentText
        pendingAgentText = ''
        pendingAgentTextScheduled = false
        set((s) => {
          const msgs = s.activeMessages
          const last = msgs[msgs.length - 1]
          if (last && last.role === MessageRole.Agent && !last.isThought && !(last.toolCalls && last.toolCalls.length > 0)) {
            const newMsgs = msgs.slice()
            newMsgs[newMsgs.length - 1] = { ...last, text: last.text + buffered }
            return { activeMessages: newMsgs }
          } else {
            return { activeMessages: [...msgs, { id: crypto.randomUUID(), role: MessageRole.Agent, text: buffered, timestamp: Date.now() }] }
          }
        })
        schedulePersist()
      })
    }
  },

  appendThoughtText: (text, sessionId?) => {
    const state = get()
    const targetSid = sessionId || state.activeSessionId
    if (!targetSid) return

    if (targetSid !== state.activeSessionId) {
      appendToInactiveBuffer(targetSid, text, true)
      return
    }

    pendingThoughtText += text
    if (!pendingThoughtTextScheduled) {
      pendingThoughtTextScheduled = true
      queueMicrotask(() => {
        const buffered = pendingThoughtText
        pendingThoughtText = ''
        pendingThoughtTextScheduled = false
        set((s) => {
          const msgs = s.activeMessages
          const last = msgs[msgs.length - 1]
          if (last && last.role === MessageRole.Agent && last.isThought) {
            const newMsgs = msgs.slice()
            newMsgs[newMsgs.length - 1] = { ...last, text: last.text + buffered }
            return { activeMessages: newMsgs }
          } else {
            return { activeMessages: [...msgs, { id: crypto.randomUUID(), role: MessageRole.Agent, text: buffered, timestamp: Date.now(), isThought: true }] }
          }
        })
        schedulePersist()
      })
    }
  },

  addToolCall: (tc, sessionId?) => {
    const state = get()
    const targetSid = sessionId || state.activeSessionId
    if (!targetSid || targetSid !== state.activeSessionId) return

    set((s) => {
      const msgs = s.activeMessages
      const last = msgs[msgs.length - 1]
      const tcWithTime = { ...tc, startTime: Date.now() }
      if (last && last.role === MessageRole.Agent && !last.isThought && !last.text) {
        const toolCalls = [...(last.toolCalls || []), tcWithTime]
        const newMsgs = msgs.slice()
        newMsgs[newMsgs.length - 1] = { ...last, toolCalls }
        return { activeMessages: newMsgs }
      } else {
        return { activeMessages: [...msgs, { id: crypto.randomUUID(), role: MessageRole.Agent, text: '', timestamp: Date.now(), toolCalls: [tcWithTime] }] }
      }
    })
    schedulePersist()
  },

  updateToolCall: (toolCallId, updates, sessionId?) => {
    const state = get()
    const targetSid = sessionId || state.activeSessionId
    if (!targetSid || targetSid !== state.activeSessionId) return

    set((s) => {
      const msgs = s.activeMessages.map((msg) => {
        if (!msg.toolCalls) return msg
        const idx = msg.toolCalls.findIndex((tc) => tc.toolCallId === toolCallId)
        if (idx === -1) return msg
        const toolCalls = [...msg.toolCalls]
        const endTime = (updates.status === ToolCallStatus.Completed || updates.status === ToolCallStatus.Failed) ? Date.now() : undefined
        toolCalls[idx] = { ...toolCalls[idx], ...updates, ...(endTime ? { endTime } : {}) }
        return { ...msg, toolCalls }
      })
      return { activeMessages: msgs }
    })
    schedulePersist()
  },

  setIsPrompting: (v, sessionId?) => {
    const targetSid = sessionId || get().activeSessionId
    if (!targetSid) return
    set((s) => ({ isPromptingMap: { ...s.isPromptingMap, [targetSid]: v } }))
  },

  addPermissionRequest: (req) =>
    set((state) => ({
      permissionRequests: [...state.permissionRequests, req],
    })),

  removePermissionRequest: (id) =>
    set((state) => ({
      permissionRequests: state.permissionRequests.filter((r) => r.id !== id),
    })),

  clearSessions: () => {
    set({ sessionMetas: [], activeSessionId: null, activeMessages: [], sessionCounter: 0, permissionRequests: [], isPromptingMap: {} })
    localStorage.removeItem('axon-active-session-id')
  },

  setPendingNewSessionAgentId: (agentId) => set({ pendingNewSessionAgentId: agentId }),
}))

// Legacy compat: export SessionData type for components that may still reference it
export interface SessionData {
  sessionId: string
  agentId: string
  messages: ChatMessage[]
  isPrompting: boolean
  label: string
  agentName?: string
}
