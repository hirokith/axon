import { useEffect, useState } from 'react'
import { useAgentConfigStore, AgentConfig } from '../stores/agentConfigStore'
import { useMcpConfigStore, McpServerConfig, McpTransport } from '../stores/mcpConfigStore'

interface AgentFormData {
  name: string
  command: string
  args: string
  cwd: string
  env: string
}

const emptyForm: AgentFormData = { name: '', command: '', args: '', cwd: '', env: '' }

enum McpMode {
  Form = 'form',
  Json = 'json',
}

interface McpFormData {
  name: string
  transport: McpTransport
  command: string
  args: string
  env: string
  url: string
}

const emptyMcpForm: McpFormData = { name: '', transport: McpTransport.Stdio, command: '', args: '', env: '', url: '' }

function parseEnv(envStr: string): Record<string, string> | undefined {
  const lines = envStr.trim().split('\n').filter(Boolean)
  if (lines.length === 0) return undefined
  const env: Record<string, string> = {}
  for (const line of lines) {
    const idx = line.indexOf('=')
    if (idx > 0) {
      env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }
  return Object.keys(env).length > 0 ? env : undefined
}

function envToString(env?: Record<string, string>): string {
  if (!env) return ''
  return Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')
}

export default function Settings() {
  const { agents, loading, fetchAgents, addAgent, updateAgent, deleteAgent } = useAgentConfigStore()
  const { servers: mcpServers, loading: mcpLoading, fetchServers, addServer, updateServer, deleteServer } = useMcpConfigStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AgentFormData>(emptyForm)

  const [showMcpForm, setShowMcpForm] = useState(false)
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null)
  const [mcpForm, setMcpForm] = useState<McpFormData>(emptyMcpForm)
  const [mcpMode, setMcpMode] = useState<McpMode>(McpMode.Form)
  const [mcpJson, setMcpJson] = useState('')
  const [mcpJsonError, setMcpJsonError] = useState('')

  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => { fetchAgents(); fetchServers() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      name: form.name,
      command: form.command,
      args: form.args.split(',').map(s => s.trim()).filter(Boolean),
      cwd: form.cwd || undefined,
      env: parseEnv(form.env),
    }
    if (editingId) {
      await updateAgent(editingId, data)
    } else {
      await addAgent(data)
    }
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleEdit = (agent: AgentConfig) => {
    setEditingId(agent.id)
    setForm({
      name: agent.name,
      command: agent.command,
      args: agent.args.join(', '),
      cwd: agent.cwd || '',
      env: envToString(agent.env),
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await deleteAgent(id)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setTestResult(null)
  }

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setTestResult(null)
    try {
      const config = {
        command: form.command,
        args: form.args.split(',').map(s => s.trim()).filter(Boolean),
        cwd: form.cwd || undefined,
        env: parseEnv(form.env),
      }
      const result = await (window as any).acpApi.testConnection(config)
      setTestResult(result)
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || 'Test connection failed' })
    } finally {
      setTestingConnection(false)
    }
  }

  const handleMcpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data: any = {
      name: mcpForm.name,
      transport: mcpForm.transport,
    }
    if (mcpForm.transport === McpTransport.Stdio) {
      data.command = mcpForm.command
      data.args = mcpForm.args.split(/\s+/).filter(Boolean)
      data.env = parseEnv(mcpForm.env)
    } else {
      data.url = mcpForm.url
    }
    if (editingMcpId) {
      await updateServer(editingMcpId, data)
    } else {
      await addServer(data)
    }
    setShowMcpForm(false)
    setEditingMcpId(null)
    setMcpForm(emptyMcpForm)
  }

  const handleMcpEdit = (server: McpServerConfig) => {
    setEditingMcpId(server.id)
    setMcpForm({
      name: server.name,
      transport: (server.transport || McpTransport.Stdio) as McpTransport,
      command: server.command || '',
      args: server.args?.join(' ') || '',
      env: envToString(server.env),
      url: server.url || '',
    })
    setShowMcpForm(true)
  }

  const handleMcpDelete = async (id: string) => {
    await deleteServer(id)
  }

  const handleMcpCancel = () => {
    setShowMcpForm(false)
    setEditingMcpId(null)
    setMcpForm(emptyMcpForm)
  }

  const handleMcpJsonImport = async () => {
    setMcpJsonError('')
    try {
      const parsed = JSON.parse(mcpJson)
      const servers = parsed.mcpServers || parsed
      if (typeof servers !== 'object' || Array.isArray(servers)) {
        setMcpJsonError('Expected format: { "serverName": { "command": "...", "args": [...] } } or { "mcpServers": { ... } }')
        return
      }
      for (const [name, config] of Object.entries(servers) as [string, any][]) {
        if (config.url) {
          await addServer({ name, transport: McpTransport.Http, url: config.url })
        } else {
          await addServer({
            name,
            transport: McpTransport.Stdio,
            command: config.command || '',
            args: Array.isArray(config.args) ? config.args : [],
            env: config.env,
          })
        }
      }
      setMcpJson('')
      setMcpMode(McpMode.Form)
    } catch (e: any) {
      setMcpJsonError(e.message || 'Invalid JSON')
    }
  }

  const inputClass = "w-full bg-panel-bg border border-border text-text text-xs px-2 py-1.5 rounded-sm placeholder:text-text-subtle focus:outline-none focus:border-accent font-mono"

  return (
    <div className="p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-text">Agent Configuration</h2>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm) }}
            className="px-2 py-1 text-xs bg-accent text-panel-bg rounded-sm hover:opacity-90 font-medium"
          >
            + Add Agent
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-3 border border-border rounded-sm bg-sidebar-bg space-y-2.5">
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Name</label>
            <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Command</label>
            <input type="text" required value={form.command} onChange={e => setForm({ ...form, command: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Args (comma-separated)</label>
            <input type="text" value={form.args} onChange={e => setForm({ ...form, args: e.target.value })} className={inputClass} placeholder="--port, 3000" />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Working Directory</label>
            <div className="flex gap-1">
              <input type="text" value={form.cwd} onChange={e => setForm({ ...form, cwd: e.target.value })} className={`${inputClass} flex-1`} placeholder="/path/to/dir" />
              <button
                type="button"
                onClick={async () => {
                  const dir = await (window as any).acpApi.selectDirectory()
                  if (dir) setForm({ ...form, cwd: dir })
                }}
                className="px-2 py-1 text-xs bg-panel-bg border border-border text-text-muted rounded-sm hover:text-text hover:border-accent transition-colors"
              >
                Browse
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Environment Variables</label>
            <textarea value={form.env} onChange={e => setForm({ ...form, env: e.target.value })} className={`${inputClass} resize-none`} rows={3} placeholder="KEY=value" />
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConnection || !form.command}
              className="w-full px-3 py-1.5 text-xs border border-border text-text rounded-sm hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </button>
            {testResult && (
              <div className={`mt-2 px-3 py-2 rounded-sm text-xs ${testResult.success ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                <span className="mr-1.5">{testResult.success ? '\u2705' : '\u274C'}</span>
                {testResult.message}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="px-3 py-1 text-xs bg-accent text-panel-bg rounded-sm hover:opacity-90 font-medium">
              {editingId ? 'Update' : 'Add'}
            </button>
            <button type="button" onClick={handleCancel} className="px-3 py-1 text-xs text-text-muted border border-border rounded-sm hover:bg-surface-hover">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-text-subtle text-xs">Loading...</p>
      ) : agents.length === 0 ? (
        <p className="text-text-subtle text-xs">No agents configured.</p>
      ) : (
        <div className="space-y-1">
          {agents.map(agent => (
            <div key={agent.id} className="group flex items-center justify-between px-3 py-2 border border-border rounded-sm bg-sidebar-bg hover:bg-surface-hover transition-colors">
              <div>
                <p className="text-xs font-medium text-text">{agent.name}</p>
                <p className="text-[11px] text-text-muted font-mono">{agent.command} {agent.args.join(' ')}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(agent)}
                  className="px-2 py-0.5 text-[10px] text-text-muted border border-border rounded-sm hover:border-accent hover:text-accent"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(agent.id)}
                  className="px-2 py-0.5 text-[10px] text-text-muted border border-border rounded-sm hover:border-error hover:text-error"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MCP Servers Section */}
      <div className="flex items-center justify-between mb-4 mt-8">
        <h2 className="text-sm font-medium text-text">MCP Servers</h2>
        {!showMcpForm && mcpMode !== McpMode.Json && (
          <button
            onClick={() => { setShowMcpForm(true); setEditingMcpId(null); setMcpForm(emptyMcpForm); setMcpMode(McpMode.Form) }}
            className="px-2 py-1 text-xs bg-accent text-panel-bg rounded-sm hover:opacity-90 font-medium"
          >
            + Add
          </button>
        )}
      </div>

      {(showMcpForm || mcpMode === McpMode.Json) && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex text-[10px] border border-border rounded-sm overflow-hidden">
            <button
              onClick={() => setMcpMode(McpMode.Form)}
              className={`px-2 py-1 ${mcpMode === McpMode.Form ? 'bg-accent text-panel-bg' : 'text-text-muted hover:text-text'}`}
            >
              Form
            </button>
            <button
              onClick={() => setMcpMode(McpMode.Json)}
              className={`px-2 py-1 ${mcpMode === McpMode.Json ? 'bg-accent text-panel-bg' : 'text-text-muted hover:text-text'}`}
            >
              JSON
            </button>
          </div>
        </div>
      )}

      {mcpMode === McpMode.Json && (
        <div className="mb-4 p-3 border border-border rounded-sm bg-sidebar-bg space-y-2">
          <textarea
            value={mcpJson}
            onChange={(e) => { setMcpJson(e.target.value); setMcpJsonError('') }}
            className={`${inputClass} resize-none h-48 font-mono`}
            placeholder={`{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]\n    },\n    "remote-server": {\n      "url": "http://localhost:3000/mcp"\n    }\n  }\n}`}
          />
          {mcpJsonError && <p className="text-[10px] text-error">{mcpJsonError}</p>}
          <button
            onClick={handleMcpJsonImport}
            className="px-3 py-1 text-xs bg-accent text-panel-bg rounded-sm hover:opacity-90 font-medium"
          >
            Import
          </button>
        </div>
      )}

      {mcpMode === McpMode.Form && showMcpForm && (
        <form onSubmit={handleMcpSubmit} className="mb-4 p-3 border border-border rounded-sm bg-sidebar-bg space-y-2.5">
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Name</label>
            <input type="text" required value={mcpForm.name} onChange={e => setMcpForm({ ...mcpForm, name: e.target.value })} className={inputClass} placeholder="e.g. filesystem" />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Transport</label>
            <select
              value={mcpForm.transport}
              onChange={e => setMcpForm({ ...mcpForm, transport: e.target.value as McpTransport })}
              className={inputClass}
            >
              <option value={McpTransport.Stdio}>stdio (local command)</option>
              <option value={McpTransport.Http}>HTTP / SSE (remote URL)</option>
            </select>
          </div>
          {mcpForm.transport === McpTransport.Stdio ? (
            <>
              <div>
                <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Command</label>
                <input type="text" required value={mcpForm.command} onChange={e => setMcpForm({ ...mcpForm, command: e.target.value })} className={inputClass} placeholder="npx" />
              </div>
              <div>
                <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Args (space-separated)</label>
                <input type="text" value={mcpForm.args} onChange={e => setMcpForm({ ...mcpForm, args: e.target.value })} className={inputClass} placeholder="-y @modelcontextprotocol/server-filesystem /path" />
              </div>
              <div>
                <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Environment Variables</label>
                <textarea value={mcpForm.env} onChange={e => setMcpForm({ ...mcpForm, env: e.target.value })} className={`${inputClass} resize-none`} rows={2} placeholder="KEY=value" />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">URL</label>
              <input type="url" required value={mcpForm.url} onChange={e => setMcpForm({ ...mcpForm, url: e.target.value })} className={inputClass} placeholder="http://localhost:3000/mcp" />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" className="px-3 py-1 text-xs bg-accent text-panel-bg rounded-sm hover:opacity-90 font-medium">
              {editingMcpId ? 'Update' : 'Add'}
            </button>
            <button type="button" onClick={handleMcpCancel} className="px-3 py-1 text-xs text-text-muted border border-border rounded-sm hover:bg-surface-hover">
              Cancel
            </button>
          </div>
        </form>
      )}

      {mcpLoading ? (
        <p className="text-text-subtle text-xs">Loading...</p>
      ) : mcpServers.length === 0 ? (
        <p className="text-text-subtle text-xs">No MCP servers configured.</p>
      ) : (
        <div className="space-y-1">
          {mcpServers.map(server => (
            <div key={server.id} className="group flex items-center justify-between px-3 py-2 border border-border rounded-sm bg-sidebar-bg hover:bg-surface-hover transition-colors">
              <div>
                <p className="text-xs font-medium text-text">{server.name}</p>
                <p className="text-[11px] text-text-muted font-mono">
                  {server.transport === McpTransport.Http ? server.url : `${server.command} ${(server.args || []).join(' ')}`}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleMcpEdit(server)}
                  className="px-2 py-0.5 text-[10px] text-text-muted border border-border rounded-sm hover:border-accent hover:text-accent"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleMcpDelete(server.id)}
                  className="px-2 py-0.5 text-[10px] text-text-muted border border-border rounded-sm hover:border-error hover:text-error"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
