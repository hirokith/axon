import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, ExternalLink } from 'lucide-react'

interface BrowserPanelProps {
  url: string
  onClose: () => void
}

export default function BrowserPanel({ url, onClose }: BrowserPanelProps) {
  const webviewRef = useRef<Electron.WebviewTag>(null)
  const [currentUrl, setCurrentUrl] = useState(url)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onNavStart = () => setIsLoading(true)
    const onNavDone = () => {
      setIsLoading(false)
      setCurrentUrl(wv.getURL())
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }
    const onUrlChange = (e: any) => {
      setCurrentUrl(e.url)
    }

    wv.addEventListener('did-start-loading', onNavStart)
    wv.addEventListener('did-stop-loading', onNavDone)
    wv.addEventListener('did-navigate', onUrlChange)
    wv.addEventListener('did-navigate-in-page', onUrlChange)

    return () => {
      wv.removeEventListener('did-start-loading', onNavStart)
      wv.removeEventListener('did-stop-loading', onNavDone)
      wv.removeEventListener('did-navigate', onUrlChange)
      wv.removeEventListener('did-navigate-in-page', onUrlChange)
    }
  }, [])

  const handleBack = () => webviewRef.current?.goBack()
  const handleForward = () => webviewRef.current?.goForward()
  const handleReload = () => webviewRef.current?.reload()
  const handleOpenExternal = () => (window as any).acpApi.openExternal(currentUrl)

  return (
    <div className="flex flex-col h-full bg-editor-bg">
      {/* Navigation toolbar */}
      <div className="flex items-center gap-1 h-9 px-2 bg-sidebar-bg border-b border-border shrink-0">
        <button
          onClick={handleBack}
          disabled={!canGoBack}
          className="p-1 rounded-sm text-text-muted hover:text-text hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleForward}
          disabled={!canGoForward}
          className="p-1 rounded-sm text-text-muted hover:text-text hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleReload}
          className="p-1 rounded-sm text-text-muted hover:text-text hover:bg-surface-hover"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
        <div className="flex-1 mx-2 px-2 py-1 bg-panel-bg border border-border rounded-sm text-xs text-text-muted truncate select-text">
          {currentUrl}
        </div>
        <button
          onClick={handleOpenExternal}
          className="p-1 rounded-sm text-text-muted hover:text-text hover:bg-surface-hover"
          title="Open in system browser"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded-sm text-text-muted hover:text-text hover:bg-surface-hover"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Webview */}
      <webview
        ref={webviewRef as any}
        src={url}
        className="flex-1"
        style={{ width: '100%', height: '100%' }}
        {...({ partition: 'persist:browser' } as any)}
      />
    </div>
  )
}
