import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useChatStore, ChatMessage, MessageRole } from '../stores/chatStore'
import ToolCallCard from './ToolCallCard'

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') !== 'light')
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

const EMPTY_MESSAGES: ChatMessage[] = []

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* */ }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="text-text-subtle hover:text-text-muted transition-colors"
      title="Copy"
    >
      {copied ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="group px-4 py-2 hover:bg-surface-hover/50 bg-accent/5 border-l-2 border-l-accent">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-accent">You</span>
        <span className="text-xs text-text-subtle">{formatTime(message.timestamp)}</span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={message.text} />
        </div>
      </div>
      <div className="text-sm text-text whitespace-pre-wrap">{message.text}</div>
    </div>
  )
}

function AgentGroup({ items }: { items: ChatMessage[] }) {
  const [showThoughts, setShowThoughts] = useState(false)
  const isDark = useIsDark()
  const combinedText = items.filter((m) => !m.isThought && m.text).map((m) => m.text).join('')
  const lastTimestamp = items[items.length - 1]?.timestamp

  // Collect consecutive thoughts into collapsible blocks, render others inline
  const segments: Array<{ type: 'thought'; text: string } | { type: 'msg'; msg: ChatMessage }> = []
  let thoughtBuf = ''

  const flushThought = () => {
    if (thoughtBuf) {
      segments.push({ type: 'thought', text: thoughtBuf })
      thoughtBuf = ''
    }
  }

  for (const msg of items) {
    if (msg.isThought) {
      thoughtBuf += msg.text || ''
    } else {
      flushThought()
      segments.push({ type: 'msg', msg })
    }
  }
  flushThought()

  // Compute a global tool call offset for each segment so numbering is continuous
  const segmentToolOffsets: number[] = []
  let toolCounter = 0
  for (const seg of segments) {
    segmentToolOffsets.push(toolCounter)
    if (seg.type === 'msg' && seg.msg.toolCalls) {
      toolCounter += seg.msg.toolCalls.length
    }
  }

  return (
    <div className="group px-4 py-2 hover:bg-surface-hover/50">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-success">Agent</span>
        {lastTimestamp && <span className="text-xs text-text-subtle">{formatTime(lastTimestamp)}</span>}
        {combinedText && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={combinedText} />
          </div>
        )}
      </div>

      {segments.map((seg, si) =>
        seg.type === 'thought' ? (
          <div key={si} className="mb-1.5">
            <button
              onClick={() => setShowThoughts(!showThoughts)}
              className="flex items-center gap-1 text-[11px] text-thought/60 hover:text-thought/80 transition-colors"
            >
              <span>{showThoughts ? '▾' : '▸'}</span>
              <span>Thinking</span>
              {!showThoughts && (
                <span className="text-text-subtle ml-1 truncate max-w-[300px]">
                  {seg.text.slice(0, 60)}...
                </span>
              )}
            </button>
            {showThoughts && (
              <div className="mt-1 ml-3 pl-2 border-l border-thought/20 text-xs text-text-muted/70 italic whitespace-pre-wrap">
                {seg.text}
              </div>
            )}
          </div>
        ) : (
          <div key={si}>
            {seg.msg.text && (
              <div className={`text-sm text-text prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''} [&_pre]:bg-panel-bg [&_pre]:border [&_pre]:border-border [&_code]:text-warning [&_a]:text-accent`}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{seg.msg.text}</ReactMarkdown>
              </div>
            )}
            {seg.msg.toolCalls && seg.msg.toolCalls.length > 0 && (
              <div className="mt-2 mb-2 space-y-1">
                {seg.msg.toolCalls.map((tc, i) => (
                  <ToolCallCard key={tc.toolCallId} toolCall={tc} index={segmentToolOffsets[si] + i + 1} />
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

export default function MessageList() {
  const messages = useChatStore((s) =>
    s.sessions.find((ses) => ses.sessionId === s.activeSessionId)?.messages ?? EMPTY_MESSAGES
  )
  const isPrompting = useChatStore((s) =>
    s.sessions.find((ses) => ses.sessionId === s.activeSessionId)?.isPrompting ?? false
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleScroll = () => {
      const threshold = 80
      isUserScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > threshold
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  })

  useEffect(() => {
    if (!isUserScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isPrompting])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-subtle">
        <div className="text-center">
          <p className="text-sm">No messages yet</p>
          <p className="text-xs mt-1">Send a message to start the conversation</p>
        </div>
      </div>
    )
  }

  // Group messages: consecutive non-user messages merge into one agent block, preserving order
  const renderGroups: Array<{ type: 'user'; msg: ChatMessage } | { type: 'agent'; items: ChatMessage[] }> = []
  let pendingItems: ChatMessage[] = []

  const flushAgent = () => {
    if (pendingItems.length > 0) {
      renderGroups.push({ type: 'agent', items: pendingItems })
      pendingItems = []
    }
  }

  for (const msg of messages) {
    if (msg.role === MessageRole.User) {
      flushAgent()
      renderGroups.push({ type: 'user', msg })
    } else {
      pendingItems.push(msg)
    }
  }
  flushAgent()

  // Show loading when prompting and no agent response yet
  const lastMsg = messages[messages.length - 1]
  const showLoading = isPrompting && (!lastMsg || lastMsg.role === MessageRole.User)

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {renderGroups.map((group, gi) => (
        <div key={gi} className="border-b border-border">
          {group.type === 'user' ? (
            <MessageBubble message={group.msg} />
          ) : (
            <AgentGroup items={group.items} />
          )}
        </div>
      ))}
      {showLoading && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-success">Agent</span>
            <span className="text-xs shimmer-loading">Generating...</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
