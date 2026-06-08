import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, ChevronDown } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

export default function ChatInput() {
  const [text, setText] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const connectedAgents = useChatStore((s) => s.connectedAgents)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sessionMetas = useChatStore((s) => s.sessionMetas)
  const isPrompting = useChatStore((s) => {
    const sid = s.activeSessionId
    return sid ? (s.isPromptingMap[sid] ?? false) : false
  })

  const activeMeta = sessionMetas.find((m) => m.sessionId === activeSessionId)
  const activeAgentId = activeMeta?.agentId
  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const setIsPrompting = useChatStore((s) => s.setIsPrompting)
  const updateSessionId = useChatStore((s) => s.updateSessionId)

  const activeConnectedAgent = connectedAgents.find((a) => a.agentId === activeAgentId)
  const availableModels = activeConnectedAgent?.models || []

  const isAgentConnected = !!activeConnectedAgent
  const canSend = isAgentConnected && activeSessionId && text.trim() && !isPrompting

  // Auto-focus input when active session changes
  useEffect(() => {
    if (activeSessionId && isAgentConnected) {
      textareaRef.current?.focus()
    }
  }, [activeSessionId, isAgentConnected])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    if (showModelDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showModelDropdown])

  // Reset model selection when agent changes
  useEffect(() => {
    setSelectedModel('')
  }, [activeAgentId])

  const handleSend = useCallback(async () => {
    if (!canSend || !activeSessionId || !activeAgentId) return
    const prompt = text.trim()
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    addUserMessage(prompt)
    setIsPrompting(true)
    const model = selectedModel || (availableModels.length > 0 ? availableModels[0] : undefined)
    try {
      await (window as any).acpApi.sendPrompt(activeAgentId, activeSessionId, prompt, model)
    } catch (e: any) {
      const errMsg = e?.message || String(e)
      if (errMsg.toLowerCase().includes('not found')) {
        console.log('[ChatInput] Session not found, recreating...')
        try {
          const result = await (window as any).acpApi.createSession(activeAgentId)
          updateSessionId(activeSessionId, result.sessionId)
          await (window as any).acpApi.sendPrompt(activeAgentId, result.sessionId, prompt, model)
          return
        } catch (retryErr) {
          console.error('[ChatInput] Retry after recreate failed:', retryErr)
        }
      }
      console.error('sendPrompt error:', e)
      setIsPrompting(false)
    }
  }, [canSend, activeSessionId, activeAgentId, text, selectedModel, addUserMessage, setIsPrompting, updateSessionId])

  const handleCancel = useCallback(async () => {
    if (!activeSessionId || !activeAgentId) return
    try {
      await (window as any).acpApi.cancelPrompt(activeAgentId, activeSessionId)
    } catch (e) {
      console.error('cancelPrompt error:', e)
    }
  }, [activeSessionId, activeAgentId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="border-t border-border bg-sidebar-bg px-2 py-1.5">
      <div className="flex flex-col gap-1.5">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isAgentConnected ? 'Message... (Enter to send)' : 'Connect to an agent first'}
          disabled={!isAgentConnected || !activeSessionId}
          rows={3}
          className="flex-1 min-w-0 resize-none bg-surface border border-border text-text text-xs px-2 py-1.5 rounded-sm placeholder:text-text-subtle focus:outline-none focus:border-accent disabled:opacity-40 font-[inherit] leading-[1.4]"
        />
        <div className="flex items-center justify-end gap-1.5">
          {availableModels.length > 0 && (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-text-muted border border-border rounded-sm hover:bg-surface-hover transition-colors"
              >
                <span className="max-w-[120px] truncate">{selectedModel || availableModels[0]}</span>
                <ChevronDown size={10} />
              </button>
              {showModelDropdown && (
                <div className="absolute bottom-full mb-1 right-0 bg-panel-bg border border-border rounded-sm shadow-lg z-10 min-w-[140px] max-h-[200px] overflow-y-auto">
                  {availableModels.map((model) => (
                    <button
                      key={model}
                      onClick={() => { setSelectedModel(model); setShowModelDropdown(false) }}
                      className={`w-full text-left px-2 py-1 text-[11px] hover:bg-surface-hover transition-colors ${
                        (selectedModel || availableModels[0]) === model ? 'text-accent' : 'text-text-muted'
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {isPrompting ? (
            <button
              onClick={handleCancel}
              className="shrink-0 px-1.5 py-0.5 text-[10px] bg-error/20 text-error border border-error/40 rounded-sm hover:bg-error/30 font-medium"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              className="shrink-0 p-1 bg-accent text-panel-bg rounded-sm hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
