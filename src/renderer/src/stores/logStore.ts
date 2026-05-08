import { create } from 'zustand'

export type LogEntryType = 'tool_call' | 'thought' | 'message' | 'plan' | 'other'

export interface StructuredLogEntry {
  id: string
  timestamp: number
  type: LogEntryType
  title: string
  status?: string
  rawInput?: any
  rawOutput?: any
  content?: string
  kind?: string
}

export interface RawLogEntry {
  id: string
  timestamp: number
  direction: 'outgoing' | 'incoming'
  message: any
}

interface LogState {
  structuredLogs: StructuredLogEntry[]
  rawLogs: RawLogEntry[]
  debugMode: boolean
  filter: { type?: LogEntryType; keyword?: string }

  addStructuredLog: (entry: StructuredLogEntry) => void
  addRawLog: (entry: RawLogEntry) => void
  setDebugMode: (enabled: boolean) => void
  setFilter: (filter: { type?: LogEntryType; keyword?: string }) => void
  clearLogs: () => void
  loadRawLogs: (entries: RawLogEntry[]) => void
}

export const useLogStore = create<LogState>((set) => ({
  structuredLogs: [],
  rawLogs: [],
  debugMode: false,
  filter: {},

  addStructuredLog: (entry) =>
    set((state) => ({
      structuredLogs: [...state.structuredLogs, entry].slice(-5000)
    })),

  addRawLog: (entry) =>
    set((state) => ({
      rawLogs: [...state.rawLogs, entry].slice(-10000)
    })),

  setDebugMode: (enabled) => set({ debugMode: enabled }),

  setFilter: (filter) => set({ filter }),

  clearLogs: () => set({ structuredLogs: [], rawLogs: [] }),

  loadRawLogs: (entries) =>
    set({ rawLogs: entries.slice(-10000) })
}))
