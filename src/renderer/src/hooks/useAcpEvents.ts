import { useEffect, useRef } from 'react'
import { useLogStore, LogEntryType, StructuredLogEntry } from '../stores/logStore'
import { useChatStore } from '../stores/chatStore'
import { SessionUpdateKind, ToolCallStatus, LogDirection } from '@shared/constants'

const acpApi = (window as any).acpApi

const TEXT_BATCH_INTERVAL = 100 // ms - 攒 100ms 的 chunk 再一次性更新 store

interface TextBatch {
  text: string
  timer: ReturnType<typeof setTimeout> | null
}


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

  const removeConnectedAgent = useChatStore((s) => s.removeConnectedAgent)
  const appendAgentText = useChatStore((s) => s.appendAgentText)
  const appendThoughtText = useChatStore((s) => s.appendThoughtText)
  const addToolCall = useChatStore((s) => s.addToolCall)
  const updateToolCall = useChatStore((s) => s.updateToolCall)
  const addPermissionRequest = useChatStore((s) => s.addPermissionRequest)
  const setIsPrompting = useChatStore((s) => s.setIsPrompting)

  const turnTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Batching buffers for text chunks: key = sessionId, value = accumulated text + flush timer
  const agentTextBatchRef = useRef<Map<string, TextBatch>>(new Map())
  const thoughtTextBatchRef = useRef<Map<string, TextBatch>>(new Map())

  useEffect(() => {
    if (!acpApi) return

    function flushAgentText(sid: string) {
      const batch = agentTextBatchRef.current.get(sid)
      if (!batch) return
      if (batch.timer) {
        clearTimeout(batch.timer)
        batch.timer = null
      }
      if (batch.text) {
        appendAgentText(batch.text, sid)
        batch.text = ''
      }
    }

    function flushThoughtText(sid: string) {
      const batch = thoughtTextBatchRef.current.get(sid)
      if (!batch) return
      if (batch.timer) {
        clearTimeout(batch.timer)
        batch.timer = null
      }
      if (batch.text) {
        appendThoughtText(batch.text, sid)
        batch.text = ''
      }
    }

    function batchAgentText(text: string, sid: string | undefined) {
      const key = sid || useChatStore.getState().activeSessionId || '__default'
      let batch = agentTextBatchRef.current.get(key)
      if (!batch) {
        batch = { text: '', timer: null }
        agentTextBatchRef.current.set(key, batch)
      }
      batch.text += text
      if (!batch.timer) {
        batch.timer = setTimeout(() => flushAgentText(key), TEXT_BATCH_INTERVAL)
      }
    }

    function batchThoughtText(text: string, sid: string | undefined) {
      const key = sid || useChatStore.getState().activeSessionId || '__default'
      let batch = thoughtTextBatchRef.current.get(key)
      if (!batch) {
        batch = { text: '', timer: null }
        thoughtTextBatchRef.current.set(key, batch)
      }
      batch.text += text
      if (!batch.timer) {
        batch.timer = setTimeout(() => flushThoughtText(key), TEXT_BATCH_INTERVAL)
      }
    }

    // Subscribe to session updates - dispatch to both logStore and chatStore
    const unsubSession = acpApi.onSessionUpdate((params: any) => {
      const { update } = params
      const sid = params.sessionId as string | undefined

      // Add as structured log (in-memory + persist to SQLite)
      const structured = classifySessionUpdate(params)
      const resolvedSessionId = sid || useChatStore.getState().activeSessionId || null
      addStructuredLog({ ...structured, sessionId: resolvedSessionId })
      acpApi.structuredLogs?.insert({
        ...structured,
        sessionId: resolvedSessionId
      }).catch(() => {})

      // Also add as raw log if it contains JSON-RPC message
      if (params.message || params.jsonrpc) {
        addRawLog({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          direction: params.direction || LogDirection.Incoming,
          message: params.message || params,
          sessionId: resolvedSessionId
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
              batchAgentText(update.content.text, sid)
            }
            break
          case SessionUpdateKind.AgentThoughtChunk:
            if (update.content?.text) {
              batchThoughtText(update.content.text, sid)
            }
            break
          case SessionUpdateKind.ThoughtMessageChunk:
            if (update.content?.text) {
              batchThoughtText(update.content.text, sid)
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
            // Flush any pending batched text before marking turn as done
            const endKey = sid || useChatStore.getState().activeSessionId || '__default'
            flushAgentText(endKey)
            flushThoughtText(endKey)
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
      // Flush remaining batched text
      agentTextBatchRef.current.forEach((batch, key) => {
        if (batch.timer) clearTimeout(batch.timer)
        if (batch.text) appendAgentText(batch.text, key)
      })
      agentTextBatchRef.current.clear()
      thoughtTextBatchRef.current.forEach((batch, key) => {
        if (batch.timer) clearTimeout(batch.timer)
        if (batch.text) appendThoughtText(batch.text, key)
      })
      thoughtTextBatchRef.current.clear()
    }
  }, [])
}
