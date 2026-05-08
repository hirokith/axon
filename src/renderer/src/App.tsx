import { useState, useCallback, useRef, useEffect } from 'react'
import Settings from './components/Settings'
import Chat from './components/Chat'
import LogPanel from './components/LogPanel'
import { useAcpEvents } from './hooks/useAcpEvents'

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
  const [tab, setTab] = useState<'chat' | 'settings'>('chat')
  const [logPanelHeight, setLogPanelHeight] = useState(240)
  const draggingRef = useRef(false)

  useAcpEvents()

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

  return (
    <div className="flex flex-col h-screen bg-editor-bg text-text select-none">
      {/* Title bar / Tab bar */}
      <div className="flex items-center h-9 bg-sidebar-bg border-b border-border shrink-0 draggable">
        <div className="flex items-center h-full no-drag">
          <button
            onClick={() => setTab('chat')}
            className={`px-4 h-full text-xs font-medium border-r border-border transition-colors ${
              tab === 'chat'
                ? 'bg-editor-bg text-text border-t-2 border-t-accent'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-4 h-full text-xs font-medium border-r border-border transition-colors ${
              tab === 'settings'
                ? 'bg-editor-bg text-text border-t-2 border-t-accent'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Settings
          </button>
        </div>
        <div className="flex-1" />
        <ThemeToggle />
        <span className="text-text-muted text-xs pr-3 no-drag">Acorn</span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'chat' && <Chat />}
        {tab === 'settings' && (
          <div className="h-full overflow-auto">
            <Settings />
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-[3px] bg-border hover:bg-accent cursor-row-resize shrink-0 transition-colors"
      />

      {/* Log Panel */}
      <div style={{ height: logPanelHeight }} className="shrink-0 overflow-hidden">
        <LogPanel />
      </div>
    </div>
  )
}

export default App
