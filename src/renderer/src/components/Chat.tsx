import { useEffect, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useAgentConfigStore } from '../stores/agentConfigStore'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import PermissionDialog from './PermissionDialog'
import SessionSidebar from './SessionSidebar'

export default function Chat() {
  const connected = useChatStore((s) => s.connected)
  const connectedAgentName = useChatStore((s) => s.connectedAgentName)
  const setConnected = useChatStore((s) => s.setConnected)
  const addSession = useChatStore((s) => s.addSession)
  const sessions = useChatStore((s) => s.sessions)

  const { agents, fetchAgents } = useAgentConfigStore()
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    fetchAgents()
  }, [])

  useEffect(() => {
    if (connected && sessions.length === 0) {
      ;(async () => {
        try {
          const result = await (window as any).acpApi.createSession()
          addSession(result.sessionId)
        } catch (e) {
          console.error('createSession error:', e)
        }
      })()
    }
  }, [connected, sessions.length])

  const handleConnect = async () => {
    if (!selectedAgentId) return
    const agent = agents.find((a) => a.id === selectedAgentId)
    if (!agent) return
    setConnecting(true)
    try {
      await (window as any).acpApi.connectAgent({
        command: agent.command,
        args: agent.args,
        cwd: agent.cwd,
        env: agent.env,
      })
      setConnected(true, agent.name)
    } catch (e: any) {
      const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e))
      console.error('connectAgent error:', msg)
      alert(`Connection failed: ${msg}`)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await (window as any).acpApi.disconnect()
    } catch (e) {
      console.error('disconnect error:', e)
    }
    setConnected(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 h-8 bg-sidebar-bg border-b border-border shrink-0">
        {connected ? (
          <>
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs text-text-muted">
              Connected{connectedAgentName && <span className="text-text font-medium ml-1">{connectedAgentName}</span>}
            </span>
            <button
              onClick={handleDisconnect}
              className="ml-auto px-2 py-0.5 text-xs text-text-muted hover:text-error border border-border rounded-sm hover:border-error transition-colors"
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-text-subtle" />
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="text-xs bg-panel-bg border border-border text-text rounded-sm px-2 py-0.5 max-w-[200px]"
            >
              <option value="">Select agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleConnect}
              disabled={!selectedAgentId || connecting}
              className="px-2 py-0.5 text-xs bg-accent text-panel-bg rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        <SessionSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <MessageList />
          <ChatInput />
        </div>
      </div>

      <PermissionDialog />
    </div>
  )
}
