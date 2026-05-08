import { useEffect, useState } from 'react'
import { useAgentConfigStore, AgentConfig } from '../stores/agentConfigStore'

interface AgentFormData {
  name: string
  command: string
  args: string
  cwd: string
  env: string
}

const emptyForm: AgentFormData = { name: '', command: '', args: '', cwd: '', env: '' }

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
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AgentFormData>(emptyForm)

  useEffect(() => { fetchAgents() }, [])

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
            <input type="text" value={form.cwd} onChange={e => setForm({ ...form, cwd: e.target.value })} className={inputClass} placeholder="/path/to/dir" />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Environment Variables</label>
            <textarea value={form.env} onChange={e => setForm({ ...form, env: e.target.value })} className={`${inputClass} resize-none`} rows={3} placeholder={"KEY=value"} />
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
    </div>
  )
}
