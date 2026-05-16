import { useState, useEffect } from 'react'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import PermissionDialog from './PermissionDialog'
import SessionSidebar from './SessionSidebar'
import OutputPreviewSidebar from './OutputPreviewSidebar'
import { PanelRight, Terminal } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'

interface ChatProps {
  activeAgentId: string | null
  showLogPanel: boolean
  onToggleLogPanel: () => void
}

export default function Chat({ activeAgentId, showLogPanel, onToggleLogPanel }: ChatProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const activeSessionId = useChatStore((s) => s.activeSessionId)

  // Close preview sidebar when switching sessions
  useEffect(() => {
    setShowPreview(false)
    setPreviewExpanded(false)
  }, [activeSessionId])

  return (
    <div className="flex flex-col h-full">
      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        <SessionSidebar activeAgentId={activeAgentId} />
        {!previewExpanded && (
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center justify-end gap-0.5 px-2 py-0.5 border-b border-border">
              <button
                onClick={onToggleLogPanel}
                className={`p-1 rounded-sm text-xs transition-colors ${
                  showLogPanel ? 'text-accent bg-surface-hover' : 'text-text-subtle hover:text-text-muted hover:bg-surface-hover'
                }`}
                title="Toggle log panel"
              >
                <Terminal className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`p-1 rounded-sm text-xs transition-colors ${
                  showPreview ? 'text-accent bg-surface-hover' : 'text-text-subtle hover:text-text-muted hover:bg-surface-hover'
                }`}
                title="Toggle output preview"
              >
                <PanelRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <MessageList />
            <ChatInput />
          </div>
        )}
        {showPreview && (
          <OutputPreviewSidebar
            activeAgentId={activeAgentId}
            onClose={() => { setShowPreview(false); setPreviewExpanded(false) }}
            expanded={previewExpanded}
            onToggleExpand={() => setPreviewExpanded(!previewExpanded)}
          />
        )}
      </div>

      <PermissionDialog />
    </div>
  )
}
