import { useState, useCallback, useEffect } from 'react'
import { ToolCallInfo } from '../stores/chatStore'
import { ToolCallStatus } from '@shared/constants'
import ShikiCodeBlock from './ShikiCodeBlock'

const statusColors: Record<string, string> = {
  [ToolCallStatus.Pending]: 'text-warning',
  [ToolCallStatus.InProgress]: 'text-accent',
  [ToolCallStatus.Completed]: 'text-success',
  [ToolCallStatus.Failed]: 'text-error',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(Date.now() - startTime)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime)
    }, 100)
    return () => clearInterval(interval)
  }, [startTime])

  return <span className="text-[10px] text-text-subtle font-mono">{formatDuration(elapsed)}</span>
}

function LoadingDots() {
  return (
    <span className="ml-1 text-[10px] shimmer-loading">running...</span>
  )
}

function formatOutput(data: any): string {
  if (data == null) return ''
  if (typeof data === 'string') {
    return data.replace(/^[ \t]*\d+→/gm, '')
  }
  if (Array.isArray(data)) {
    return data.map((item) => {
      if (typeof item === 'string') return item.replace(/^[ \t]*\d+→/gm, '')
      if (item != null && typeof item === 'object' && item.type === 'text' && item.text) return item.text.replace(/^[ \t]*\d+→/gm, '')
      return JSON.stringify(item, null, 2)
    }).join('\n')
  }
  return JSON.stringify(data, null, 2)
}

function formatInput(data: any): string {
  if (data == null) return ''
  if (typeof data === 'string') return data
  return JSON.stringify(data, null, 2)
}

function CodeBlock({ label, content, maxHeight = 250 }: { label: string; content: string; maxHeight?: number }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* */ }
  }, [content])

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-text-subtle uppercase tracking-wide">{label}</span>
        <button onClick={handleCopy} className="text-xs text-text-subtle hover:text-text-muted transition-colors">
          {copied ? '✓' : 'copy'}
        </button>
      </div>
      <pre
        className="bg-panel-bg border border-border text-text text-xs p-2 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed rounded-sm"
        style={{ maxHeight }}
      >
        {content}
      </pre>
    </div>
  )
}

function formatEndTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export default function ToolCallCard({ toolCall, index }: { toolCall: ToolCallInfo; index?: number }) {
  const [expanded, setExpanded] = useState(false)
  const statusClass = statusColors[toolCall.status] || 'text-text-muted'
  const isRunning = toolCall.status === 'pending' || toolCall.status === 'in_progress'
  const duration = toolCall.startTime && toolCall.endTime
    ? toolCall.endTime - toolCall.startTime
    : undefined

  const inputText = formatInput(toolCall.rawInput)
  const outputText = formatOutput(toolCall.rawOutput)
  const contentText = toolCall.content ? formatOutput(toolCall.content) : ''

  return (
    <div className="border border-border rounded-sm bg-sidebar-bg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-hover text-xs transition-colors"
      >
        {isRunning && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
        )}
        {index != null && (
          <span className="text-[10px] text-text-subtle font-mono shrink-0">#{index}</span>
        )}
        <span className="flex-1 text-text-muted truncate font-mono">
          {toolCall.title || toolCall.toolCallId}
        </span>
        {isRunning && toolCall.startTime && <ElapsedTimer startTime={toolCall.startTime} />}
        {isRunning && <LoadingDots />}
        {!isRunning && duration != null && (
          <span className="text-[10px] text-text-subtle font-mono">{formatDuration(duration)}</span>
        )}
        {!isRunning && toolCall.endTime && (
          <span className="text-[10px] text-text-subtle font-mono">{formatEndTime(toolCall.endTime)}</span>
        )}
        {!isRunning && <span className={`text-xs ${statusClass}`}>{toolCall.status === ToolCallStatus.Completed ? '✓' : '✗'}</span>}
        <span className="text-text-subtle">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-border pt-2">
          {inputText && <ShikiCodeBlock label="Input" content={inputText} maxHeight={150} />}
          {contentText && <ShikiCodeBlock label="Content" content={contentText} />}
          {outputText && <ShikiCodeBlock label="Output" content={outputText} />}
        </div>
      )}
    </div>
  )
}
