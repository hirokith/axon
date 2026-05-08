import { useState } from 'react'
import { StructuredLogEntry } from '../stores/logStore'
import { highlightJson } from '../utils/jsonHighlight'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

const typeBadgeColors: Record<string, string> = {
  tool_call: 'text-accent',
  thought: 'text-thought',
  message: 'text-success',
  plan: 'text-warning',
  other: 'text-text-subtle'
}

export default function StructuredLogItem({ entry }: { entry: StructuredLogEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="border-b border-border px-3 py-1 hover:bg-surface-hover cursor-pointer"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded(!expanded)
        }
      }}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-subtle font-mono text-[10px] shrink-0">
          {formatTime(entry.timestamp)}
        </span>
        <span className={`font-medium ${typeBadgeColors[entry.type] || typeBadgeColors.other}`}>
          {entry.type === 'tool_call' ? '⚡' : entry.type === 'thought' ? '💭' : entry.type === 'message' ? '💬' : '•'}
        </span>
        <span className="text-text truncate">{entry.title}</span>
        {entry.status && (
          <span className="text-text-subtle text-[10px]">[{entry.status}]</span>
        )}
      </div>

      {entry.type === 'thought' && entry.content && !expanded && (
        <p className="text-thought/60 italic text-[11px] mt-0.5 truncate pl-16">{entry.content}</p>
      )}

      {expanded && (
        <div className="mt-1.5 pl-16 space-y-1.5 pb-1">
          {entry.content && (
            <div className="text-xs text-thought/80 italic whitespace-pre-wrap">{entry.content}</div>
          )}
          {entry.rawInput != null && (
            <div>
              <span className="text-[10px] text-text-subtle uppercase">Input</span>
              <pre
                className="text-[11px] bg-panel-bg border border-border rounded-sm p-1.5 mt-0.5 overflow-x-auto font-mono"
                dangerouslySetInnerHTML={{ __html: highlightJson(entry.rawInput) }}
              />
            </div>
          )}
          {entry.rawOutput != null && (
            <div>
              <span className="text-[10px] text-text-subtle uppercase">Output</span>
              <pre
                className="text-[11px] bg-panel-bg border border-border rounded-sm p-1.5 mt-0.5 overflow-x-auto font-mono"
                dangerouslySetInnerHTML={{ __html: highlightJson(entry.rawOutput) }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
