import { useChatStore } from '../stores/chatStore'

export default function SessionSidebar() {
  const connected = useChatStore((s) => s.connected)
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const addSession = useChatStore((s) => s.addSession)
  const switchSession = useChatStore((s) => s.switchSession)
  const removeSession = useChatStore((s) => s.removeSession)

  if (!connected && sessions.length === 0) return null

  const handleNewSession = async () => {
    try {
      const result = await (window as any).acpApi.createSession()
      addSession(result.sessionId)
    } catch (e) {
      console.error('createSession error:', e)
    }
  }

  return (
    <div className="w-[180px] flex-shrink-0 bg-sidebar-bg border-r border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-8 border-b border-border">
        <span className="text-xs text-text-muted uppercase tracking-wide">Sessions</span>
        <button
          onClick={handleNewSession}
          disabled={!connected}
          className="text-text-muted hover:text-accent text-lg leading-none disabled:opacity-30 disabled:cursor-not-allowed"
          title="New Session"
        >
          +
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-0.5">
        {sessions.map((session) => (
          <div
            key={session.sessionId}
            onClick={() => switchSession(session.sessionId)}
            className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs ${
              session.sessionId === activeSessionId
                ? 'bg-surface-hover text-text border-l-2 border-l-accent'
                : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
          >
            <span className="truncate">{session.label}</span>
            {session.agentName && (
              <span className="text-[10px] text-text-subtle truncate ml-1">({session.agentName})</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeSession(session.sessionId)
              }}
              className="hidden group-hover:block text-text-muted hover:text-error text-xs flex-shrink-0 ml-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
