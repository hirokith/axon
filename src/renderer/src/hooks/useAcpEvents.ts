import { useEffect, useRef } from 'react'
import { useLogStore, LogEntryType, StructuredLogEntry } from '../stores/logStore'
import { useChatStore } from '../stores/chatStore'

const acpApi = (window as any).acpApi

function classifySessionUpdate(data: any): StructuredLogEntry {
  const base = {
    id: data.id || crypto.randomUUID(),
    timestamp: Date.now()
  }

  const update = data.update
  const sessionUpdate = update?.sessionUpdate

  // Classify based on sessionUpdate type
  if (sessionUpdate === 'agent_thought_chunk' || sessionUpdate === 'thought_message_chunk') {
    return {
      ...base,
      type: 'thought' as LogEntryType,
      title: 'Thought',
      content: update.content?.text || JSON.stringify(update.content)
    }
  }

  if (sessionUpdate === 'agent_message_chunk') {
    return {
      ...base,
      type: 'message' as LogEntryType,
      title: 'Agent Message',
      content: update.content?.text || JSON.stringify(update.content)
    }
  }

  if (sessionUpdate === 'tool_call') {
    return {
      ...base,
      type: 'tool_call' as LogEntryType,
      title: update.title || update.toolCallId || 'Tool Call',
      status: update.status,
      rawInput: update.rawInput,
      kind: update.kind
    }
  }

  if (sessionUpdate === 'tool_call_update') {
    return {
      ...base,
      type: 'tool_call' as LogEntryType,
      title: update.title || update.toolCallId || 'Tool Update',
      status: update.status,
      rawInput: update.rawInput,
      rawOutput: update.rawOutput,
      kind: update.kind
    }
  }

  if (sessionUpdate === 'turn_end' || sessionUpdate === 'done') {
    return {
      ...base,
      type: 'message' as LogEntryType,
      title: 'Turn End',
      content: ''
    }
  }

  // Fallback
  return {
    ...base,
    type: 'other' as LogEntryType,
    title: sessionUpdate || data.method || 'Event',
    rawInput: data
  }
}

export function useAcpEvents(): void {
  const addStructuredLog = useLogStore((s) => s.addStructuredLog)
  const addRawLog = useLogStore((s) => s.addRawLog)
  const loadRawLogs = useLogStore((s) => s.loadRawLogs)

  const setConnected = useChatStore((s) => s.setConnected)
  const appendAgentText = useChatStore((s) => s.appendAgentText)
  const appendThoughtText = useChatStore((s) => s.appendThoughtText)
  const addToolCall = useChatStore((s) => s.addToolCall)
  const updateToolCall = useChatStore((s) => s.updateToolCall)
  const addPermissionRequest = useChatStore((s) => s.addPermissionRequest)
  const setIsPrompting = useChatStore((s) => s.setIsPrompting)

  const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!acpApi) return

    // Load existing raw logs
    acpApi.getLogEntries().then((entries: any[]) => {
      if (entries && entries.length > 0) {
        loadRawLogs(entries)
      }
    })

    // Subscribe to session updates - dispatch to both logStore and chatStore
    const unsubSession = acpApi.onSessionUpdate((params: any) => {
      const { update } = params

      // Add as structured log
      const structured = classifySessionUpdate(params)
      addStructuredLog(structured)

      // Also add as raw log if it contains JSON-RPC message
      if (params.message || params.jsonrpc) {
        addRawLog({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          direction: params.direction || 'incoming',
          message: params.message || params
        })
      }

      // Reset turn idle timer on every session update
      if (turnTimerRef.current) {
        clearTimeout(turnTimerRef.current)
      }
      turnTimerRef.current = setTimeout(() => {
        setIsPrompting(false)
      }, 1500)

      // Dispatch to chatStore with sessionId
      if (update) {
        const sid = params.sessionId as string | undefined
        switch (update.sessionUpdate) {
          case 'agent_message_chunk':
            if (update.content?.text) {
              appendAgentText(update.content.text, sid)
            }
            break
          case 'agent_thought_chunk':
            if (update.content?.text) {
              appendThoughtText(update.content.text, sid)
            }
            break
          case 'thought_message_chunk':
            if (update.content?.text) {
              appendThoughtText(update.content.text, sid)
            }
            break
          case 'tool_call':
            addToolCall({
              toolCallId: update.toolCallId || '',
              title: update.title || '',
              kind: update.kind || 'other',
              status: update.status === 'running' ? 'in_progress' : ((update.status as any) || 'pending'),
              rawInput: update.rawInput,
            }, sid)
            break
          case 'tool_call_update':
            updateToolCall(update.toolCallId || '', {
              ...(update.status ? { status: update.status === 'running' ? 'in_progress' : update.status as any } : {}),
              ...(update.rawInput ? { rawInput: update.rawInput } : {}),
              ...(update.rawOutput ? { rawOutput: update.rawOutput } : {}),
              ...(update.content ? { content: update.content } : {}),
            }, sid)
            break
          case 'turn_end':
          case 'done':
            // Explicit turn-end signal
            if (turnTimerRef.current) clearTimeout(turnTimerRef.current)
            setIsPrompting(false)
            break
        }
      }
    })

    // Subscribe to connection status - dispatch to chatStore
    const unsubConnection = acpApi.onConnectionStatus((status: { connected: boolean }) => {
      setConnected(status.connected)
      // Don't clear sessions on disconnect - they are persisted for history
    })

    // Subscribe to permission requests - dispatch to chatStore
    const unsubPermission = acpApi.onPermissionRequest((req: any) => {
      addPermissionRequest(req)
    })

    return () => {
      unsubSession()
      unsubConnection()
      unsubPermission()
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current)
    }
  }, [])
}
