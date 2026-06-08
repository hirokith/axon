import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
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

const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
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
})

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex]

const MemoMarkdown = memo(function MemoMarkdown({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <div className={`text-sm text-text prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''} [&_pre]:bg-panel-bg [&_pre]:border [&_pre]:border-border [&_code]:text-warning [&_a]:text-accent`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>{text}</ReactMarkdown>
    </div>
  )
})

function ThoughtBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-thought/60 hover:text-thought/80 transition-colors"
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>Thinking</span>
        {!expanded && (
          <span className="text-text-subtle ml-1 truncate max-w-[300px]">
            {text.slice(0, 60)}...
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1 ml-3 pl-2 border-l border-thought/20 text-xs text-text-muted/70 italic whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}

const AgentGroup = memo(function AgentGroup({ items }: { items: ChatMessage[] }) {
  const isDark = useIsDark()
  const combinedText = items.filter((m) => !m.isThought && m.text).map((m) => m.text).join('')
  const lastTimestamp = items[items.length - 1]?.timestamp

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
          <ThoughtBlock key={si} text={seg.text} />
        ) : (
          <div key={si}>
            {seg.msg.text && (
              <MemoMarkdown text={seg.msg.text} isDark={isDark} />
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
}, (prev, next) => {
  if (prev.items.length !== next.items.length) return false
  const prevLast = prev.items[prev.items.length - 1]
  const nextLast = next.items[next.items.length - 1]
  if (!prevLast || !nextLast) return false
  if (prevLast.id !== nextLast.id) return false
  if (prevLast.text !== nextLast.text) return false
  if ((prevLast.toolCalls?.length || 0) !== (nextLast.toolCalls?.length || 0)) return false
  const prevTC = prevLast.toolCalls?.[prevLast.toolCalls.length - 1]
  const nextTC = nextLast.toolCalls?.[nextLast.toolCalls.length - 1]
  if (prevTC?.status !== nextTC?.status) return false
  if (prevTC?.rawOutput !== nextTC?.rawOutput) return false
  return true
})

type RenderGroup =
  | { type: 'user'; msg: ChatMessage; key: string }
  | { type: 'agent'; items: ChatMessage[]; key: string }

function useRenderGroups(messages: ChatMessage[]): RenderGroup[] {
  return useMemo(() => {
    const groups: RenderGroup[] = []
    let pendingItems: ChatMessage[] = []

    const flushAgent = () => {
      if (pendingItems.length > 0) {
        const key = pendingItems[0].id
        groups.push({ type: 'agent', items: [...pendingItems], key })
        pendingItems = []
      }
    }

    for (const msg of messages) {
      if (msg.role === MessageRole.User) {
        flushAgent()
        groups.push({ type: 'user', msg, key: msg.id })
      } else {
        pendingItems.push(msg)
      }
    }
    flushAgent()
    return groups
  }, [messages])
}

export default function MessageList() {
  const messages = useChatStore((s) => s.activeMessages)
  const isPrompting = useChatStore((s) => {
    const sid = s.activeSessionId
    return sid ? (s.isPromptingMap[sid] ?? false) : false
  })
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages)

  const parentRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)
  const renderGroups = useRenderGroups(messages)

  const virtualizer = useVirtualizer({
    count: renderGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (index) => renderGroups[index]?.key || index,
  })

  // Auto-scroll to bottom
  useEffect(() => {
    if (!isUserScrolledUp.current && renderGroups.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(renderGroups.length - 1, { align: 'end' })
      })
    }
  }, [renderGroups.length, messages[messages.length - 1]?.text])

  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    const threshold = 80
    isUserScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > threshold
  }, [])

  if (isLoadingMessages) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-subtle">
        <span className="text-sm">Loading messages...</span>
      </div>
    )
  }

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

  const lastMsg = messages[messages.length - 1]
  const showLoading = isPrompting && (!lastMsg || lastMsg.role === MessageRole.User)

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto select-text"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const group = renderGroups[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="border-b border-border">
                {group.type === 'user' ? (
                  <MessageBubble message={group.msg} />
                ) : (
                  <AgentGroup items={group.items} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      {showLoading && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-success">Agent</span>
            <span className="text-xs shimmer-loading">Generating...</span>
          </div>
        </div>
      )}
    </div>
  )
}
