import { useState, useCallback, useRef, useEffect } from 'react'
import Settings from './components/Settings'
import Chat from './components/Chat'
import LogPanel from './components/LogPanel'
import { useAcpEvents } from './hooks/useAcpEvents'
import { useAgentConfigStore } from './stores/agentConfigStore'
import { useChatStore } from './stores/chatStore'
import { Settings as SettingsIcon } from 'lucide-react'

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('acp-theme') as 'dark' | 'light') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('acp-theme', theme)
  }, [theme])

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="text-text-muted hover:text-text p-1 rounded-sm hover:bg-surface-hover transition-colors no-drag"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  )
}

function App(): JSX.Element {
  const [view, setView] = useState<'agents' | 'settings'>('agents')
  const [logPanelHeight, setLogPanelHeight] = useState(240)
  const [showLogPanel, setShowLogPanel] = useState(false)
  const draggingRef = useRef(false)

  const { agents, fetchAgents } = useAgentConfigStore()
  const connectedAgents = useChatStore((s) => s.connectedAgents)
  const addConnectedAgent = useChatStore((s) => s.addConnectedAgent)
  const setPendingNewSessionAgentId = useChatStore((s) => s.setPendingNewSessionAgentId)
  const switchSession = useChatStore((s) => s.switchSession)
  const sessions = useChatStore((s) => s.sessions)

  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [connectingAgents, setConnectingAgents] = useState<Set<string>>(new Set())
  const [failedAgents, setFailedAgents] = useState<Set<string>>(new Set())

  useAcpEvents()

  useEffect(() => {
    fetchAgents()
  }, [])

  // Auto-connect agents on startup
  useEffect(() => {
    if (agents.length === 0) return
    agents.forEach((agent) => {
      const alreadyConnected = connectedAgents.some((c) => c.agentId === agent.id)
      if (!alreadyConnected && !connectingAgents.has(agent.id) && !failedAgents.has(agent.id)) {
        connectAgent(agent.id)
      }
    })
  }, [agents])

  // Set active agent tab to first available
  useEffect(() => {
    if (agents.length === 0) {
      setActiveAgentId(null)
      return
    }
    if (!activeAgentId || !agents.some((a) => a.id === activeAgentId)) {
      setActiveAgentId(agents[0].id)
    }
  }, [agents, activeAgentId])

  const connectAgent = async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    setConnectingAgents((s) => new Set(s).add(agentId))
    setFailedAgents((s) => { const n = new Set(s); n.delete(agentId); return n })
    try {
      await (window as any).acpApi.connectAgent({
        agentId: agent.id,
        command: agent.command,
        args: agent.args,
        cwd: agent.cwd,
        env: agent.env,
      })
      addConnectedAgent(agent.id, agent.name)
      // Only trigger "New Session" dialog if the agent has no existing sessions
      const existingSessions = useChatStore.getState().sessions.filter((s) => s.agentId === agent.id)
      if (existingSessions.length === 0) {
        setPendingNewSessionAgentId(agent.id)
      }
    } catch (e: any) {
      console.error('connectAgent error:', e)
      setFailedAgents((s) => new Set(s).add(agentId))
    } finally {
      setConnectingAgents((s) => { const n = new Set(s); n.delete(agentId); return n })
    }
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const startY = e.clientY
    const startHeight = logPanelHeight

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      const delta = startY - ev.clientY
      const newHeight = Math.max(80, Math.min(window.innerHeight - 200, startHeight + delta))
      setLogPanelHeight(newHeight)
    }

    const onMouseUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [logPanelHeight])

  const hasAgents = agents.length > 0

  return (
    <div className="flex flex-col h-screen bg-editor-bg text-text select-none">
      {/* Title bar / Tab bar */}
      <div className="flex items-center h-9 bg-sidebar-bg border-b border-border shrink-0 draggable">
        <div className="flex items-center h-full no-drag overflow-x-auto">
          {agents.map((agent) => {
            const isConnected = connectedAgents.some((c) => c.agentId === agent.id)
            const isConnecting = connectingAgents.has(agent.id)
            const isFailed = failedAgents.has(agent.id)
            return (
              <button
                key={agent.id}
                onClick={() => {
                  setActiveAgentId(agent.id); setView('agents')
                  const agentSessions = sessions.filter((s) => s.agentId === agent.id)
                  if (agentSessions.length > 0) {
                    switchSession(agentSessions[agentSessions.length - 1].sessionId)
                  } else if (connectedAgents.some((a) => a.agentId === agent.id)) {
                    setPendingNewSessionAgentId(agent.id)
                  }
                }}
                className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium border-r border-border transition-colors ${
                  view === 'agents' && activeAgentId === agent.id
                    ? 'bg-editor-bg text-text border-t-2 border-t-accent'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ring-2 ${
                    isConnected ? 'bg-success ring-success/30' : isConnecting ? 'bg-warning ring-warning/30 animate-pulse' : isFailed ? 'bg-error ring-error/30' : 'bg-text-subtle ring-text-subtle/20'
                  }`}
                />
                {agent.name}
                {isFailed && (
                  <button
                    onClick={(e) => { e.stopPropagation(); connectAgent(agent.id) }}
                    className="text-[10px] text-error hover:text-warning ml-1"
                    title="Retry connection"
                  >
                    ↻
                  </button>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 pr-3 no-drag">
          <ThemeToggle />
          <button
            onClick={() => setView(view === 'settings' ? 'agents' : 'settings')}
            className={`p-1 rounded-sm transition-colors ${
              view === 'settings' ? 'text-accent bg-surface-hover' : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
            title="Settings"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {view === 'settings' ? (
          <div className="h-full overflow-auto">
            <Settings />
          </div>
        ) : !hasAgents ? (
          <div className="flex-1 h-full flex items-center justify-center">
            <div className="text-center max-w-sm">
              <p className="text-sm text-text-muted mb-2">No agents configured yet</p>
              <p className="text-xs text-text-subtle mb-4">Add an agent in Settings to get started.</p>
              <button
                onClick={() => setView('settings')}
                className="px-3 py-1.5 text-xs bg-accent text-panel-bg rounded-sm hover:opacity-90 font-medium"
              >
                Go to Settings
              </button>
            </div>
          </div>
        ) : (
          <Chat activeAgentId={activeAgentId} showLogPanel={showLogPanel} onToggleLogPanel={() => setShowLogPanel(!showLogPanel)} />
        )}
      </div>

      {/* Resize handle */}
      {showLogPanel && (
        <div
          onMouseDown={handleMouseDown}
          className="h-px bg-border hover:bg-accent cursor-row-resize shrink-0 transition-colors"
        />
      )}

      {/* Log Panel */}
      {showLogPanel && (
        <div style={{ height: logPanelHeight }} className="shrink-0 overflow-hidden">
          <LogPanel />
        </div>
      )}
    </div>
  )
}

export default App
