import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useChatStore, ChatMessage } from '../stores/chatStore'
import ToolCallCard from './ToolCallCard'

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
  if (message.role === 'user') {
    return (
      <div className="group px-4 py-2 hover:bg-surface-hover bg-accent/5 border-l-2 border-l-accent">
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

  if (message.isThought) {
    // Should not render standalone — handled by AgentGroup
    return null
  }

  return (
    <div className="group px-4 py-2 hover:bg-surface-hover">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-success">Agent</span>
        <span className="text-xs text-text-subtle">{formatTime(message.timestamp)}</span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={message.text} />
        </div>
      </div>
      {message.text && (
        <div className="text-sm text-text prose prose-sm prose-invert max-w-none [&_pre]:bg-panel-bg [&_pre]:border [&_pre]:border-border [&_code]:text-warning [&_a]:text-accent">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{message.text}</ReactMarkdown>
        </div>
      )}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1">
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.toolCallId} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentGroup({ thoughts, agentMsgs }: { thoughts: ChatMessage[]; agentMsgs: ChatMessage[] }) {
  const [showThoughts, setShowThoughts] = useState(false)
  const thoughtText = thoughts.map((t) => t.text).join('')
  const combinedText = agentMsgs.map((m) => m.text).filter(Boolean).join('')
  const allToolCalls = agentMsgs.flatMap((m) => m.toolCalls || [])
  const lastTimestamp = agentMsgs.length > 0 ? agentMsgs[agentMsgs.length - 1].timestamp : thoughts[0]?.timestamp

  return (
    <div className="group px-4 py-2 hover:bg-surface-hover">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-success">Agent</span>
        {lastTimestamp && <span className="text-xs text-text-subtle">{formatTime(lastTimestamp)}</span>}
        {combinedText && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={combinedText} />
          </div>
        )}
      </div>

      {/* Collapsible thinking */}
      {thoughtText && (
        <div className="mb-1.5">
          <button
            onClick={() => setShowThoughts(!showThoughts)}
            className="flex items-center gap-1 text-[11px] text-thought/60 hover:text-thought/80 transition-colors"
          >
            <span>{showThoughts ? '▾' : '▸'}</span>
            <span>💭 Thinking</span>
            {!showThoughts && (
              <span className="text-text-subtle ml-1 truncate max-w-[300px]">
                {thoughtText.slice(0, 60)}...
              </span>
            )}
          </button>
          {showThoughts && (
            <div className="mt-1 ml-3 pl-2 border-l border-thought/20 text-xs text-text-muted/70 italic whitespace-pre-wrap">
              {thoughtText}
            </div>
          )}
        </div>
      )}

      {/* Agent response */}
      {combinedText && (
        <div className="text-sm text-text prose prose-sm prose-invert max-w-none [&_pre]:bg-panel-bg [&_pre]:border [&_pre]:border-border [&_code]:text-warning [&_a]:text-accent">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{combinedText}</ReactMarkdown>
        </div>
      )}
      {allToolCalls.length > 0 && (
        <div className="mt-2 space-y-1">
          {allToolCalls.map((tc) => (
            <ToolCallCard key={tc.toolCallId} toolCall={tc} />
          ))}
        </div>
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  // Group messages: consecutive thinking + assistant messages merge into one agent block
  const renderGroups: Array<{ type: 'user'; msg: ChatMessage } | { type: 'agent'; thoughts: ChatMessage[]; agentMsgs: ChatMessage[] }> = []
  let pendingThoughts: ChatMessage[] = []
  let pendingAgentMsgs: ChatMessage[] = []

  const flushAgent = () => {
    if (pendingThoughts.length > 0 || pendingAgentMsgs.length > 0) {
      renderGroups.push({ type: 'agent', thoughts: pendingThoughts, agentMsgs: pendingAgentMsgs })
      pendingThoughts = []
      pendingAgentMsgs = []
    }
  }

  for (const msg of messages) {
    if (msg.isThought) {
      pendingThoughts.push(msg)
    } else if (msg.role === 'agent' || msg.role === 'assistant') {
      pendingAgentMsgs.push(msg)
    } else {
      flushAgent()
      renderGroups.push({ type: 'user', msg })
    }
  }
  flushAgent()

  // Show loading when prompting and no agent response yet
  const lastMsg = messages[messages.length - 1]
  const showLoading = isPrompting && (!lastMsg || lastMsg.role === 'user')

  return (
    <div className="flex-1 overflow-y-auto">
      {renderGroups.map((group, gi) => (
        <div key={gi} className="border-b border-border">
          {group.type === 'user' ? (
            <MessageBubble message={group.msg} />
          ) : (
            <AgentGroup thoughts={group.thoughts} agentMsgs={group.agentMsgs} />
          )}
        </div>
      ))}
      {showLoading && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-success">Agent</span>
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-[pulse_1.2s_0ms_infinite]" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-[pulse_1.2s_200ms_infinite]" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-[pulse_1.2s_400ms_infinite]" />
            </span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
