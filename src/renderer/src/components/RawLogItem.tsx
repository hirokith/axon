import { useState } from 'react'
import { RawLogEntry } from '../stores/logStore'
import { highlightJson } from '../utils/jsonHighlight'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export default function RawLogItem({ entry }: { entry: RawLogEntry }) {
  const [expanded, setExpanded] = useState(false)

  const isOutgoing = entry.direction === 'outgoing'
  const msg = entry.message
  const label = msg?.method
    ? msg.method
    : msg?.id != null
      ? `Response #${msg.id}`
      : 'Notification'

  return (
    <div
      className="border-b border-gray-700 px-3 py-2 hover:bg-gray-800/50 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500 font-mono text-xs shrink-0">
          {formatTime(entry.timestamp)}
        </span>
        <span className={`text-lg leading-none ${isOutgoing ? 'text-blue-400' : 'text-green-400'}`}>
          {isOutgoing ? '→' : '←'}
        </span>
        <span className="text-gray-200 font-mono text-xs truncate">{label}</span>
      </div>

      {!expanded && (
        <p className="text-gray-500 text-xs mt-0.5 truncate pl-20 font-mono">
          {JSON.stringify(msg).slice(0, 120)}
        </p>
      )}

      {expanded && (
        <pre
          className="text-xs bg-gray-900 rounded p-2 mt-2 ml-20 overflow-x-auto max-h-96 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          dangerouslySetInnerHTML={{ __html: highlightJson(msg) }}
        />
      )}
    </div>
  )
}
