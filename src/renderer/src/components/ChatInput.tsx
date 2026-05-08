import { useState, useRef, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'

export default function ChatInput() {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const connected = useChatStore((s) => s.connected)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const isPrompting = useChatStore((s) =>
    s.sessions.find((ses) => ses.sessionId === s.activeSessionId)?.isPrompting ?? false
  )
  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const setIsPrompting = useChatStore((s) => s.setIsPrompting)

  const canSend = connected && activeSessionId && text.trim() && !isPrompting

  const handleSend = useCallback(async () => {
    if (!canSend || !activeSessionId) return
    const prompt = text.trim()
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    addUserMessage(prompt)
    setIsPrompting(true)
    try {
      await (window as any).acpApi.sendPrompt(activeSessionId, prompt)
    } catch (e) {
      console.error('sendPrompt error:', e)
      setIsPrompting(false)
    }
  }, [canSend, activeSessionId, text, addUserMessage, setIsPrompting])

  const handleCancel = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await (window as any).acpApi.cancelPrompt(activeSessionId)
    } catch (e) {
      console.error('cancelPrompt error:', e)
    }
  }, [activeSessionId])

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
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className="border-t border-border bg-sidebar-bg px-3 py-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={connected ? 'Message... (Enter to send)' : 'Connect to an agent first'}
          disabled={!connected || !activeSessionId}
          rows={1}
          className="flex-1 resize-none bg-panel-bg border border-border text-text text-sm px-3 py-1.5 rounded-sm placeholder:text-text-subtle focus:outline-none focus:border-accent disabled:opacity-40 font-[inherit]"
        />
        {isPrompting ? (
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs bg-error/20 text-error border border-error/40 rounded-sm hover:bg-error/30 font-medium"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="px-3 py-1.5 text-xs bg-accent text-panel-bg rounded-sm hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
