import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useChatStore, ChatMessage, MessageRole, ToolCallInfo } from '../stores/chatStore'
import ToolCallCard from './ToolCallCard'
import { copyToClipboard } from '../utils/clipboard'

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

function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m${seconds.toString().padStart(2, '0')}s`
}

function AgentElapsedTimer({ startTime, isStreaming, endTime }: { startTime: number; isStreaming: boolean; endTime?: number }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!isStreaming) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isStreaming])

  const elapsed = isStreaming ? now - startTime : (endTime ? endTime - startTime : 0)
  if (elapsed <= 0) return null

  return (
    <span className="text-[11px] text-text-subtle font-mono">
      {formatElapsedTime(elapsed)}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(text)
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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <div className="group px-4 py-2 hover:bg-surface-hover/50 bg-accent/5 border-l-2 border-l-accent">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-accent">You</span>
        <span className="text-xs text-text-subtle">{formatTime(message.timestamp)}</span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={message.text} />
        </div>
      </div>
      {message.images && message.images.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {message.images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              className="w-20 h-20 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setLightboxSrc(src)}
            />
          ))}
        </div>
      )}
      {message.text && <div className="text-sm text-text whitespace-pre-wrap">{message.text}</div>}
      {lightboxSrc && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
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

const AgentGroup = memo(function AgentGroup({ items, isStreaming }: { items: ChatMessage[]; isStreaming: boolean }) {
  const isDark = useIsDark()
  const combinedText = items.filter((m) => !m.isThought && m.text).map((m) => m.text).join('')
  const lastTimestamp = items[items.length - 1]?.timestamp
  const firstTimestamp = items[0]?.timestamp
  const computedEndTime = (() => {
    let end = lastTimestamp || 0
    for (const item of items) {
      if (item.toolCalls) {
        for (const tc of item.toolCalls) {
          if (tc.endTime && tc.endTime > end) end = tc.endTime
        }
      }
    }
    return end
  })()

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
  // Collect all tool calls in order to compute prevEndTime for each
  const allToolCalls: ToolCallInfo[] = []
  for (const seg of segments) {
    segmentToolOffsets.push(toolCounter)
    if (seg.type === 'msg' && seg.msg.toolCalls) {
      toolCounter += seg.msg.toolCalls.length
      allToolCalls.push(...seg.msg.toolCalls)
    }
  }
  const prevEndTimeMap = new Map<string, number | undefined>()
  for (let ti = 0; ti < allToolCalls.length; ti++) {
    prevEndTimeMap.set(allToolCalls[ti].toolCallId, ti > 0 ? allToolCalls[ti - 1].endTime : undefined)
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
        <div className="ml-auto">
          <AgentElapsedTimer startTime={firstTimestamp} isStreaming={isStreaming} endTime={computedEndTime} />
        </div>
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
                  <ToolCallCard key={tc.toolCallId} toolCall={tc} index={segmentToolOffsets[si] + i + 1} prevEndTime={prevEndTimeMap.get(tc.toolCallId)} />
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}, (prev, next) => {
  if (prev.isStreaming !== next.isStreaming) return false
  if (prev.items.length !== next.items.length) return false
  for (let i = 0; i < prev.items.length; i++) {
    const a = prev.items[i]
    const b = next.items[i]
    if (a.id !== b.id) return false
    if (a.text !== b.text) return false
    if (a.isThought !== b.isThought) return false
    const aTC = a.toolCalls || []
    const bTC = b.toolCalls || []
    if (aTC.length !== bTC.length) return false
    if (aTC.length > 0) {
      const lastA = aTC[aTC.length - 1]
      const lastB = bTC[bTC.length - 1]
      if (lastA?.status !== lastB?.status) return false
      if (lastA?.rawOutput !== lastB?.rawOutput) return false
    }
  }
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
        parentRef.current?.scrollTo({ top: parentRef.current.scrollHeight })
      })
    }
  }, [renderGroups.length, messages[messages.length - 1]?.text, messages[messages.length - 1]?.toolCalls, isPrompting])

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
                  <AgentGroup items={group.items} isStreaming={isPrompting && virtualItem.index === renderGroups.length - 1} />
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
