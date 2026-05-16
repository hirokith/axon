import { useEffect, useRef } from 'react'
import { useLogStore, LogEntryType, StructuredLogEntry } from '../stores/logStore'
import { useChatStore } from '../stores/chatStore'
import { SessionUpdateKind, ToolCallStatus, LogDirection } from '@shared/constants'

const acpApi = (window as any).acpApi

function classifySessionUpdate(data: any): StructuredLogEntry {
  const base = {
    id: data.id || crypto.randomUUID(),
    timestamp: Date.now()
  }

  const update = data.update

  // Classify based on sessionUpdate type
  if (update?.sessionUpdate === SessionUpdateKind.AgentThoughtChunk || update?.sessionUpdate === SessionUpdateKind.ThoughtMessageChunk) {
    return {
      ...base,
      type: LogEntryType.Thought,
      title: 'Thought',
      content: update.content?.text || JSON.stringify(update.content)
    }
  }

  if (update?.sessionUpdate === SessionUpdateKind.AgentMessageChunk) {
    return {
      ...base,
      type: LogEntryType.Message,
      title: 'Agent Message',
      content: update.content?.text || JSON.stringify(update.content)
    }
  }

  if (update?.sessionUpdate === SessionUpdateKind.ToolCall) {
    return {
      ...base,
      type: LogEntryType.ToolCall,
      title: update.title || update.toolCallId || 'Tool Call',
      status: update.status,
      rawInput: update.rawInput,
      kind: update.kind
    }
  }

  if (update?.sessionUpdate === SessionUpdateKind.ToolCallUpdate) {
    return {
      ...base,
      type: LogEntryType.ToolCall,
      title: update.title || update.toolCallId || 'Tool Update',
      status: update.status,
      rawInput: update.rawInput,
      rawOutput: update.rawOutput,
      kind: update.kind
    }
  }

  if (update?.sessionUpdate === SessionUpdateKind.TurnEnd || update?.sessionUpdate === SessionUpdateKind.Done) {
    return {
      ...base,
      type: LogEntryType.Message,
      title: 'Turn End',
      content: ''
    }
  }

  // Fallback
  return {
    ...base,
    type: LogEntryType.Other,
    title: update?.sessionUpdate || data.method || 'Event',
    rawInput: data
  }
}

export function useAcpEvents(): void {
  const addStructuredLog = useLogStore((s) => s.addStructuredLog)
  const addRawLog = useLogStore((s) => s.addRawLog)
  const loadRawLogs = useLogStore((s) => s.loadRawLogs)

  const removeConnectedAgent = useChatStore((s) => s.removeConnectedAgent)
  const appendAgentText = useChatStore((s) => s.appendAgentText)
  const appendThoughtText = useChatStore((s) => s.appendThoughtText)
  const addToolCall = useChatStore((s) => s.addToolCall)
  const updateToolCall = useChatStore((s) => s.updateToolCall)
  const addPermissionRequest = useChatStore((s) => s.addPermissionRequest)
  const setIsPrompting = useChatStore((s) => s.setIsPrompting)

  const turnTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!acpApi) return

    // Load existing raw logs
    acpApi.getLogEntries().then((entries: any[]) => {
      if (entries && entries.length > 0) {
        loadRawLogs(entries)
      }
    }).catch((err: any) => {
      console.error('[useAcpEvents] Failed to load log entries:', err)
    })

    // Subscribe to session updates - dispatch to both logStore and chatStore
    const unsubSession = acpApi.onSessionUpdate((params: any) => {
      const { update } = params
      const sid = params.sessionId as string | undefined

      // Add as structured log (in-memory + persist to SQLite)
      const structured = classifySessionUpdate(params)
      addStructuredLog(structured)
      acpApi.structuredLogs?.insert({
        ...structured,
        sessionId: sid || useChatStore.getState().activeSessionId || null
      }).catch(() => {})

      // Also add as raw log if it contains JSON-RPC message
      if (params.message || params.jsonrpc) {
        addRawLog({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          direction: params.direction || LogDirection.Incoming,
          message: params.message || params
        })
      }

      // Reset turn idle timer per session
      const resolvedSid = sid || useChatStore.getState().activeSessionId || '__default'
      const existingTimer = turnTimersRef.current.get(resolvedSid)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }
      turnTimersRef.current.set(resolvedSid, setTimeout(() => {
        setIsPrompting(false, resolvedSid)
        turnTimersRef.current.delete(resolvedSid)
      }, 1500))

      // Dispatch to chatStore with sessionId
      if (update) {
        console.log('[useAcpEvents] session-update:', { sessionUpdate: update.sessionUpdate, sid, activeSessionId: useChatStore.getState().activeSessionId, text: update.content?.text?.slice(0, 20) })
        switch (update.sessionUpdate) {
          case SessionUpdateKind.AgentMessageChunk:
            if (update.content?.text) {
              appendAgentText(update.content.text, sid)
            }
            break
          case SessionUpdateKind.AgentThoughtChunk:
            if (update.content?.text) {
              appendThoughtText(update.content.text, sid)
            }
            break
          case SessionUpdateKind.ThoughtMessageChunk:
            if (update.content?.text) {
              appendThoughtText(update.content.text, sid)
            }
            break
          case SessionUpdateKind.ToolCall:
            addToolCall({
              toolCallId: update.toolCallId || '',
              title: update.title || '',
              kind: update.kind || 'other',
              status: update.status === ToolCallStatus.Running ? ToolCallStatus.InProgress : ((update.status as any) || ToolCallStatus.Pending),
              rawInput: update.rawInput,
            }, sid)
            break
          case SessionUpdateKind.ToolCallUpdate:
            updateToolCall(update.toolCallId || '', {
              ...(update.status ? { status: update.status === ToolCallStatus.Running ? ToolCallStatus.InProgress : update.status as any } : {}),
              ...(update.rawInput ? { rawInput: update.rawInput } : {}),
              ...(update.rawOutput ? { rawOutput: update.rawOutput } : {}),
              ...(update.content ? { content: update.content } : {}),
            }, sid)
            break
          case SessionUpdateKind.TurnEnd:
          case SessionUpdateKind.Done:
            // Explicit turn-end signal
            const endKey = sid || useChatStore.getState().activeSessionId || '__default'
            const endTimer = turnTimersRef.current.get(endKey)
            if (endTimer) {
              clearTimeout(endTimer)
              turnTimersRef.current.delete(endKey)
            }
            setIsPrompting(false, sid)
            break
        }
      }
    })

    // Subscribe to connection status - handle per-agent disconnection
    const unsubConnection = acpApi.onConnectionStatus((status: { connected: boolean; agentId?: string }) => {
      if (!status.connected && status.agentId) {
        removeConnectedAgent(status.agentId)
      }
    })

    // Subscribe to permission requests - dispatch to chatStore
    const unsubPermission = acpApi.onPermissionRequest((req: any) => {
      addPermissionRequest(req)
    })

    // Subscribe to stderr - only show agent-level errors in chat (not tool output errors)
    const unsubStderr = acpApi.onStderrLog((data: { agentId: string; text: string }) => {
      const text = data.text?.trim()
      if (!text) return
      // Only surface agent infrastructure errors, not tool execution output
      const isAgentError = /Error in agent stream|Transport closed|ACP.*failed|rate_limit|ELIFECYCLE|Cannot find module|ECONNREFUSED|SIGTERM|SIGKILL|spawn.*ENOENT/.test(text)
      if (isAgentError) {
        appendAgentText(`\n\n**Error:** ${text}\n`, undefined)
        setIsPrompting(false, undefined)
      }
    })

    return () => {
      unsubSession()
      unsubConnection()
      unsubPermission()
      unsubStderr()
      turnTimersRef.current.forEach((t) => clearTimeout(t))
      turnTimersRef.current.clear()
    }
  }, [])
}
