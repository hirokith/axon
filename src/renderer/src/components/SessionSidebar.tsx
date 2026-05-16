import { useState, useCallback, useEffect, useMemo } from 'react'
import { useChatStore, SessionData } from '../stores/chatStore'
import { useAgentConfigStore } from '../stores/agentConfigStore'
import { useMcpConfigStore } from '../stores/mcpConfigStore'
import { McpTransport } from '@shared/constants'
import { FolderOpen, Plus } from 'lucide-react'

export default function SessionSidebar({ activeAgentId }: { activeAgentId: string | null }) {
  const connectedAgents = useChatStore((s) => s.connectedAgents)
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const addSession = useChatStore((s) => s.addSession)
  const switchSession = useChatStore((s) => s.switchSession)
  const removeSession = useChatStore((s) => s.removeSession)
  const pendingNewSessionAgentId = useChatStore((s) => s.pendingNewSessionAgentId)
  const setPendingNewSessionAgentId = useChatStore((s) => s.setPendingNewSessionAgentId)
  const agents = useAgentConfigStore((s) => s.agents)

  // New session dialog state
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [dialogAgentId, setDialogAgentId] = useState<string | null>(null)
  const [newCwd, setNewCwd] = useState('')
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([])

  const mcpServersAll = useMcpConfigStore((s) => s.servers)
  const fetchServers = useMcpConfigStore((s) => s.fetchServers)

  // React to pending new session trigger (from connect)
  useEffect(() => {
    if (pendingNewSessionAgentId) {
      setDialogAgentId(pendingNewSessionAgentId)
      const agentConfig = agents.find((a) => a.id === pendingNewSessionAgentId)
      setNewCwd(agentConfig?.cwd || '')
      setSelectedMcpIds([])
      fetchServers()
      setShowNewDialog(true)
      setPendingNewSessionAgentId(null)
    }
  }, [pendingNewSessionAgentId, setPendingNewSessionAgentId, agents, fetchServers])

  const handleCreateSession = useCallback(async () => {
    if (!dialogAgentId) return
    setShowNewDialog(false)

    const options: { cwd?: string; mcpServers?: any[] } = {}
    if (newCwd.trim()) {
      options.cwd = newCwd.trim()
    }
    if (selectedMcpIds.length > 0) {
      options.mcpServers = mcpServersAll
        .filter((s) => selectedMcpIds.includes(s.id))
        .map((s) => {
          if (s.transport === McpTransport.Http) {
            return { name: s.name, url: s.url }
          }
          return { name: s.name, command: s.command, args: s.args || [], env: s.env }
        })
    }

    const agentName = connectedAgents.find((a) => a.agentId === dialogAgentId)?.name
    try {
      const result = await (window as any).acpApi.createSession(
        dialogAgentId,
        Object.keys(options).length > 0 ? options : undefined
      )
      addSession(result.sessionId, dialogAgentId, agentName)
    } catch (e) {
      console.error('createSession error:', e)
    }
  }, [dialogAgentId, newCwd, selectedMcpIds, mcpServersAll, addSession, connectedAgents])

  if (!activeAgentId && sessions.length === 0 && !showNewDialog) return null

  const activeAgentSessions = activeAgentId
    ? sessions.filter((s) => s.agentId === activeAgentId).slice().reverse()
    : []

  const groupedSessions = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterdayStart = todayStart - 86400000

    const groups: { label: string; sessions: SessionData[] }[] = [
      { label: 'Today', sessions: [] },
      { label: 'Yesterday', sessions: [] },
      { label: 'Earlier', sessions: [] },
    ]

    for (const s of activeAgentSessions) {
      const ts = s.messages.length > 0 ? s.messages[0].timestamp : Date.now()
      if (ts >= todayStart) {
        groups[0].sessions.push(s)
      } else if (ts >= yesterdayStart) {
        groups[1].sessions.push(s)
      } else {
        groups[2].sessions.push(s)
      }
    }

    return groups.filter((g) => g.sessions.length > 0)
  }, [activeAgentSessions])

  const activeAgent = connectedAgents.find((a) => a.agentId === activeAgentId)

  const openNewDialog = () => {
    const agentSessions = activeAgentId
      ? sessions.filter((s) => s.agentId === activeAgentId)
      : []
    const emptySession = agentSessions.find(
      (s) => !s.messages.some((m) => m.role === 'user')
    )
    if (emptySession) {
      switchSession(emptySession.sessionId)
      return
    }
    setDialogAgentId(activeAgentId)
    const agentConfig = agents.find((a) => a.id === activeAgentId)
    setNewCwd(agentConfig?.cwd || '')
    setSelectedMcpIds([])
    fetchServers()
    setShowNewDialog(true)
  }

  const handleBrowseCwd = async () => {
    try {
      const dir = await (window as any).acpApi.selectDirectory()
      if (dir) setNewCwd(dir)
    } catch (e) {
      console.error('selectDirectory error:', e)
    }
  }

  return (
    <div className="flex shrink-0 h-full">
      {/* Session list */}
      <div className="w-[170px] bg-sidebar-bg border-r border-border flex flex-col h-full">
        <div className="flex items-center justify-between px-3 h-8 border-b border-border">
          <span className="text-[10px] text-text-muted uppercase tracking-wide truncate">
            Sessions
          </span>
          {activeAgentId && connectedAgents.some((a) => a.agentId === activeAgentId) && (
            <button
              onClick={openNewDialog}
              className="text-text-muted hover:text-accent flex items-center justify-center"
              title="New Session"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-0.5">
          {groupedSessions.map((group) => (
            <div key={group.label}>
              <div className="px-3 pt-2 pb-1">
                <span className="text-[9px] text-text-subtle uppercase tracking-wider">{group.label}</span>
              </div>
              {group.sessions.map((session) => (
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSession(session.sessionId)
                    }}
                    className="hidden group-hover:block text-text-muted hover:text-error text-xs shrink-0 ml-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* New Session Dialog */}
      {showNewDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowNewDialog(false)
            if (e.key === 'Enter') handleCreateSession()
          }}
        >
          <div className="bg-panel-bg border border-border rounded-lg shadow-xl w-[420px] max-h-[80vh] overflow-y-auto" ref={(el) => el?.focus()} tabIndex={-1}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-text">New Session</h3>
              <button
                onClick={() => setShowNewDialog(false)}
                className="text-text-muted hover:text-text text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Working Directory */}
              <div>
                <label className="block text-xs text-text-muted mb-1">Working Directory</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCwd}
                    onChange={(e) => setNewCwd(e.target.value)}
                    placeholder="Leave empty to use agent default"
                    className="flex-1 bg-input-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder-text-muted focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleBrowseCwd}
                    className="px-2 py-1.5 bg-surface-hover border border-border rounded hover:border-accent text-text-muted hover:text-accent"
                    title="Browse"
                  >
                    <FolderOpen size={14} />
                  </button>
                </div>
              </div>

              {/* MCP Servers */}
              <div>
                <label className="block text-xs text-text-muted mb-1">MCP Servers</label>
                {mcpServersAll.length === 0 ? (
                  <p className="text-[10px] text-text-muted italic">No MCP servers configured. Add them in Settings.</p>
                ) : (
                  <div className="space-y-1">
                    {mcpServersAll.map((server) => (
                      <label key={server.id} className="flex items-center gap-2 text-xs text-text cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedMcpIds.includes(server.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMcpIds([...selectedMcpIds, server.id])
                            } else {
                              setSelectedMcpIds(selectedMcpIds.filter((id) => id !== server.id))
                            }
                          }}
                          className="rounded border-border"
                        />
                        <span>{server.name}</span>
                        <span className="text-text-muted text-[10px]">
                          {server.transport === McpTransport.Http ? server.url : `${server.command} ${(server.args || []).join(' ')}`}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setShowNewDialog(false)}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text border border-border rounded hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                className="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent/90"
              >
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
