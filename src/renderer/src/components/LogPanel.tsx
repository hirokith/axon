import { useEffect, useRef, useMemo } from 'react'
import { useLogStore, LogEntryType } from '../stores/logStore'
import StructuredLogItem from './StructuredLogItem'
import RawLogItem from './RawLogItem'

export default function LogPanel() {
  const {
    structuredLogs,
    rawLogs,
    debugMode,
    filter,
    setDebugMode,
    setFilter,
    clearLogs,
    loadRawLogs,
    loadStructuredLogs
  } = useLogStore()

  const scrollRef = useRef<HTMLDivElement>(null)

  // Load persisted structured logs on mount
  useEffect(() => {
    const acpApi = (window as any).acpApi
    if (acpApi?.structuredLogs?.query) {
      acpApi.structuredLogs.query().then((entries: any[]) => {
        if (entries && entries.length > 0) {
          loadStructuredLogs(entries)
        }
      }).catch(() => {})
    }
  }, [loadStructuredLogs])

  useEffect(() => {
    if (debugMode) {
      const acpApi = (window as any).acpApi
      if (acpApi?.getLogEntries) {
        acpApi.getLogEntries().then((entries: any[]) => {
          if (entries && entries.length > 0) {
            loadRawLogs(entries)
          }
        }).catch((err: any) => {
          console.error('[LogPanel] Failed to load log entries:', err)
        })
      }
    }
  }, [debugMode, loadRawLogs])

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [structuredLogs.length, rawLogs.length, debugMode])

  const filteredStructured = useMemo(() => {
    let logs = structuredLogs
    if (filter.type) {
      logs = logs.filter((l) => l.type === filter.type)
    }
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase()
      logs = logs.filter(
        (l) =>
          l.title.toLowerCase().includes(kw) ||
          l.content?.toLowerCase().includes(kw)
      )
    }
    return logs
  }, [structuredLogs, filter])

  const filteredRaw = useMemo(() => {
    if (!filter.keyword) return rawLogs
    const kw = filter.keyword.toLowerCase()
    return rawLogs.filter(
      (l) => JSON.stringify(l.message).toLowerCase().includes(kw)
    )
  }, [rawLogs, filter.keyword])

  return (
    <div className="flex flex-col h-full bg-panel-bg text-text">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-7 border-b border-border shrink-0">
        <span className="text-xs text-text-muted uppercase tracking-wide">Output</span>

        <div className="flex items-center gap-1 ml-3">
          <button
            onClick={() => setDebugMode(!debugMode)}
            className={`px-1.5 py-0.5 text-[10px] rounded-sm font-medium transition-colors ${
              debugMode
                ? 'bg-warning/20 text-warning border border-warning/40'
                : 'text-text-subtle hover:text-text-muted border border-transparent'
            }`}
          >
            RAW
          </button>

          {!debugMode && (
            <select
              value={filter.type || ''}
              onChange={(e) =>
                setFilter({ ...filter, type: (e.target.value || undefined) as LogEntryType | undefined })
              }
              className="text-[10px] bg-transparent border border-border text-text-muted rounded-sm px-1 py-0.5"
            >
              <option value="">All</option>
              <option value="tool_call">Tools</option>
              <option value="thought">Thoughts</option>
              <option value="message">Messages</option>
              <option value="plan">Plan</option>
              <option value="other">Other</option>
            </select>
          )}
        </div>

        <input
          type="text"
          placeholder="Filter..."
          value={filter.keyword || ''}
          onChange={(e) => setFilter({ ...filter, keyword: e.target.value || undefined })}
          className="text-[10px] bg-transparent border border-border text-text-muted rounded-sm px-1.5 py-0.5 w-24 ml-auto placeholder:text-text-subtle focus:outline-none focus:border-accent"
        />

        <button
          onClick={clearLogs}
          className="text-[10px] text-text-subtle hover:text-error transition-colors"
        >
          {'Clear'}
        </button>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {debugMode ? (
          filteredRaw.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-subtle text-xs">
              No raw logs
            </div>
          ) : (
            filteredRaw.map((entry) => <RawLogItem key={entry.id} entry={entry} />)
          )
        ) : filteredStructured.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-subtle text-xs">
            No log entries
          </div>
        ) : (
          filteredStructured.map((entry) => <StructuredLogItem key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  )
}
