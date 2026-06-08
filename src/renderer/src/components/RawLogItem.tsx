import { useState } from 'react'
import { RawLogEntry } from '../stores/logStore'
import { LogDirection } from '@shared/constants'
import { highlightJson } from '../utils/jsonHighlight'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export default function RawLogItem({ entry }: { entry: RawLogEntry }) {
  const [expanded, setExpanded] = useState(false)

  const isOutgoing = entry.direction === LogDirection.Outgoing
  const msg = entry.message
  const label = msg?.method
    ? msg.method
    : msg?.id != null
      ? `Response #${msg.id}`
      : 'Notification'

  return (
    <div
      className="border-b border-border px-3 py-2 hover:bg-surface-hover cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="text-text-subtle font-mono text-xs shrink-0">
          {formatTime(entry.timestamp)}
        </span>
        <span className={`text-lg leading-none ${isOutgoing ? 'text-accent' : 'text-success'}`}>
          {isOutgoing ? '→' : '←'}
        </span>
        <span className="text-text font-mono text-xs truncate">{label}</span>
      </div>

      {!expanded && (
        <p className="text-text-subtle text-xs mt-0.5 truncate pl-20 font-mono">
          {JSON.stringify(msg).slice(0, 120)}
        </p>
      )}

      {expanded && (
        <pre
          className="text-xs bg-panel-bg border border-border rounded p-2 mt-2 ml-20 overflow-x-auto whitespace-pre-wrap break-words max-h-96 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          dangerouslySetInnerHTML={{ __html: highlightJson(msg) }}
        />
      )}
    </div>
  )
}
