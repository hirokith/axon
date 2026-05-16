import { useState, useEffect, useCallback, useMemo } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useAgentConfigStore } from '../stores/agentConfigStore'
import { ToolCallStatus } from '@shared/constants'
import { ChevronRight, ChevronDown, RefreshCw, X, Code, Eye, Maximize2, Minimize2, ExternalLink } from 'lucide-react'
import { MultiFileDiff } from '@pierre/diffs/react'
import { generateManifest, type Manifest } from 'material-icon-theme'
import { getHighlighter } from '../utils/shikiHighlighter'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface FileEntry {
  name: string
  isDirectory: boolean
}

interface FileDiff {
  filePath: string
  oldString: string
  newString: string
  title: string
}

type PreviewItem =
  | { type: 'file'; path: string; content: string | null; loading: boolean }
  | { type: 'diff'; diff: FileDiff }

function extractDiffsFromSession(messages: any[]): FileDiff[] {
  const diffs: FileDiff[] = []
  for (const msg of messages) {
    if (!msg.toolCalls) continue
    for (const tc of msg.toolCalls) {
      if (tc.status === ToolCallStatus.Pending || tc.status === ToolCallStatus.Failed) continue
      const input = tc.rawInput
      if (!input) continue
      const title = tc.title || tc.kind || ''
      const titleLower = title.toLowerCase()

      const filePath = input.file_path || input.path || input.filePath || input.filename || ''

      if (filePath && input.old_string !== undefined && input.new_string !== undefined) {
        diffs.push({
          filePath,
          oldString: input.old_string,
          newString: input.new_string,
          title: title || 'Edit',
        })
      } else if (filePath && (input.content !== undefined || input.text !== undefined || input.code !== undefined)) {
        const content = input.content || input.text || input.code || ''
        diffs.push({
          filePath,
          oldString: '',
          newString: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
          title: title || 'Write',
        })
      } else if (titleLower.includes('write') || titleLower.includes('create')) {
        const possiblePath = filePath || Object.values(input).find((v) => typeof v === 'string' && (v.includes('/') || v.includes('\\'))) || ''
        const possibleContent = Object.values(input).find((v) => typeof v === 'string' && v.length > 20 && v !== possiblePath) || ''
        if (possiblePath && possibleContent) {
          diffs.push({
            filePath: possiblePath as string,
            oldString: '',
            newString: possibleContent as string,
            title: title || 'Write',
          })
        }
      }
    }
  }
  return diffs
}

const FILE_ICONS_PATH = '/file-icons/'
const manifest: Manifest = generateManifest()

// Map common file extensions to VS Code language IDs (for extensions not in manifest.fileExtensions)
const extToLanguageId: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
  swift: 'swift', cs: 'csharp', cpp: 'cpp', c: 'c', h: 'cpp', hpp: 'cpp',
  php: 'php', sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', r: 'r', lua: 'lua',
  dart: 'dart', scala: 'scala', vue: 'vue', svelte: 'svelte',
}

function resolveIconSvg(iconId: string | undefined): string {
  if (!iconId) return 'file.svg'
  const def = manifest.iconDefinitions?.[iconId]
  if (!def?.iconPath) return 'file.svg'
  return def.iconPath.replace('./../icons/', '')
}

function getIconPath(name: string, isDirectory?: boolean, isOpen?: boolean): string {
  if (isDirectory) {
    const folderIcon = isOpen
      ? manifest.folderNamesExpanded?.[name.toLowerCase()] || manifest.folderExpanded
      : manifest.folderNames?.[name.toLowerCase()] || manifest.folder
    return resolveIconSvg(folderIcon)
  }
  const lowerName = name.toLowerCase()
  // 1. Try exact file name match
  let iconId = manifest.fileNames?.[lowerName]
  // 2. Try full compound extension (e.g. spec.ts, module.css)
  if (!iconId) {
    const parts = lowerName.split('.')
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join('.')
      iconId = manifest.fileExtensions?.[ext]
      if (iconId) break
    }
  }
  // 3. Try language ID mapping
  if (!iconId) {
    const ext = lowerName.split('.').pop() || ''
    const langId = extToLanguageId[ext]
    if (langId) iconId = manifest.languageIds?.[langId]
  }
  // 4. Fallback to default file icon
  if (!iconId) iconId = manifest.file
  return resolveIconSvg(iconId)
}

function VSCodeIcon({ name, isDirectory, isOpen, className = 'w-4 h-4' }: { name: string; isDirectory?: boolean; isOpen?: boolean; className?: string }) {
  const iconFile = getIconPath(name, isDirectory, isOpen)
  return <img src={`${FILE_ICONS_PATH}${iconFile}`} alt="" className={`${className} shrink-0`} />
}

function detectLangFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    html: 'html', css: 'css', json: 'json', md: 'markdown',
    py: 'python', sh: 'bash', bash: 'bash', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', rs: 'rust', go: 'go', java: 'java',
  }
  return map[ext] || 'plaintext'
}

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') !== 'light')
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

function HighlightedCode({ content, filePath }: { content: string; filePath: string }) {
  const [htmlDark, setHtmlDark] = useState<string>('')
  const [htmlLight, setHtmlLight] = useState<string>('')
  const isDark = useIsDark()

  useEffect(() => {
    let cancelled = false
    const lang = detectLangFromPath(filePath)

    // Clear previous highlight immediately so plain text shows first
    setHtmlDark('')
    setHtmlLight('')

    // Skip highlighting for very large files (>100KB)
    if (content.length > 100_000) {
      return
    }

    // Defer highlighting to next idle period so plain text renders first
    const scheduleHighlight = (cb: () => void) => {
      if ('requestIdleCallback' in window) {
        return (window as any).requestIdleCallback(cb, { timeout: 300 })
      }
      return setTimeout(cb, 16)
    }

    const idleId = scheduleHighlight(() => {
      if (cancelled) return
      getHighlighter().then((highlighter) => {
        if (cancelled) return
        try {
          setHtmlDark(highlighter.codeToHtml(content, { lang, theme: 'github-dark' }))
        } catch {
          // keep empty — plain text fallback will show
        }
        try {
          setHtmlLight(highlighter.codeToHtml(content, { lang, theme: 'github-light' }))
        } catch {
          // keep empty — plain text fallback will show
        }
      }).catch((e) => {
        console.warn('[HighlightedCode] getHighlighter failed:', e)
      })
    })

    return () => {
      cancelled = true
      if ('cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId)
      } else {
        clearTimeout(idleId)
      }
    }
  }, [content, filePath])

  const html = isDark ? htmlDark : htmlLight

  // Inject line numbers into highlighted HTML
  const htmlWithLineNumbers = useMemo(() => {
    if (!html) return ''
    const lineMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
    if (!lineMatch) return html

    const codeContent = lineMatch[1]
    const lines = codeContent.split('\n')
    if (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop()
    }
    const gutterWidth = String(lines.length).length

    const numberedLines = lines.map((line, i) => {
      const num = `<span class="line-number" style="display:inline-block;min-width:${gutterWidth + 1}ch;text-align:right;padding-right:12px;color:var(--text-subtle);user-select:none">${i + 1}</span>`
      return num + line
    }).join('\n')

    return html.replace(/<code([^>]*)>[\s\S]*?<\/code>/, `<code$1>${numberedLines}</code>`)
  }, [html])

  // Plain text fallback — renders immediately while highlighting is in progress
  if (!html) {
    const lines = content.split('\n')
    const gutterWidth = String(lines.length).length
    return (
      <div className="flex text-[11px] font-mono leading-[1.5] p-2 select-text">
        <div className="select-none text-right pr-3 text-text-subtle" style={{ minWidth: `${gutterWidth + 1}ch` }}>
          {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <pre className="text-text whitespace-pre-wrap break-words flex-1 min-w-0 m-0">
          {content}
        </pre>
      </div>
    )
  }

  return (
    <div
      className="text-[11px] leading-[1.5] select-text [&_pre]:!bg-transparent [&_pre]:p-2 [&_pre]:m-0 [&_pre]:min-w-full [&_pre]:w-fit [&_code]:!bg-transparent"
      dangerouslySetInnerHTML={{ __html: htmlWithLineNumbers }}
    />
  )
}

type PreviewMode = 'code' | 'preview'

function getPreviewableType(filePath: string): 'svg' | 'markdown' | 'html' | null {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  if (ext === 'svg') return 'svg'
  if (ext === 'md' || ext === 'mdx') return 'markdown'
  if (ext === 'html' || ext === 'htm') return 'html'
  return null
}

function SvgPreview({ content }: { content: string }) {
  const dataUrl = useMemo(() => {
    return 'data:image/svg+xml,' + encodeURIComponent(content)
  }, [content])

  return (
    <div className="flex items-center justify-center h-full p-4 bg-[repeating-conic-gradient(#80808015_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
      <img src={dataUrl} alt="SVG Preview" className="max-w-full max-h-full object-contain" />
    </div>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  const isDark = useIsDark()
  return (
    <div className={`p-4 overflow-auto prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function HtmlPreview({ filePath, cwd }: { filePath: string; cwd: string }) {
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const startServer = async () => {
      try {
        const { port } = await (window as any).acpApi.fs.startStaticServer(cwd)
        if (cancelled) return
        // Build relative path from cwd
        const relativePath = filePath.startsWith(cwd) ? filePath.slice(cwd.length) : '/' + filePath.split('/').pop()
        setIframeUrl(`http://127.0.0.1:${port}${relativePath}`)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to start server')
      }
    }
    startServer()
    return () => { cancelled = true }
  }, [filePath, cwd])

  if (error) {
    return <p className="text-xs text-error p-2">{error}</p>
  }
  if (!iframeUrl) {
    return <p className="text-xs text-text-subtle p-2">Starting server...</p>
  }
  return (
    <iframe
      src={iframeUrl}
      className="w-full h-full border-0"
      sandbox="allow-scripts allow-forms"
      title="HTML Preview"
    />
  )
}

function PreviewPanel({ item, cwd }: { item: PreviewItem; cwd: string }) {
  const [mode, setMode] = useState<PreviewMode>('code')
  const isDark = useIsDark()
  const previewableType = item.type === 'file' ? getPreviewableType(item.path) : null

  // Auto-switch to preview for previewable file types
  useEffect(() => {
    if (previewableType) {
      setMode('preview')
    } else {
      setMode('code')
    }
  }, [item.type === 'file' ? item.path : '', previewableType])

  if (item.type === 'file') {
    const fileName = item.path.split('/').pop() || item.path
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-1.5 border-b border-border bg-panel-bg flex items-center gap-1.5">
          <VSCodeIcon name={fileName} className="w-3.5 h-3.5" />
          <span className="text-xs text-text-muted font-mono flex-1 truncate">{fileName}</span>
          {previewableType && (
            <div className="flex items-center gap-0.5 ml-auto">
              <button
                onClick={() => setMode('code')}
                className={`p-1 rounded-sm transition-colors ${mode === 'code' ? 'bg-surface-hover text-text' : 'text-text-subtle hover:text-text-muted'}`}
                title="Code"
              >
                <Code className="w-3 h-3" />
              </button>
              <button
                onClick={() => setMode('preview')}
                className={`p-1 rounded-sm transition-colors ${mode === 'preview' ? 'bg-surface-hover text-text' : 'text-text-subtle hover:text-text-muted'}`}
                title="Preview"
              >
                <Eye className="w-3 h-3" />
              </button>
              <button
                onClick={async () => {
                  const { port } = await (window as any).acpApi.fs.startStaticServer(cwd)
                  const relativePath = item.path.startsWith(cwd) ? item.path.slice(cwd.length) : '/' + item.path.split('/').pop()
                  window.acpApi.openExternal(`http://127.0.0.1:${port}${relativePath}`)
                }}
                className="p-1 rounded-sm transition-colors text-text-subtle hover:text-text-muted"
                title="Open in browser"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {item.loading ? (
            <p className="text-xs text-text-subtle p-2">Loading...</p>
          ) : item.content === null ? (
            <p className="text-xs text-text-subtle p-2">Unable to read file</p>
          ) : mode === 'preview' && previewableType === 'svg' ? (
            <SvgPreview content={item.content} />
          ) : mode === 'preview' && previewableType === 'markdown' ? (
            <MarkdownPreview content={item.content} />
          ) : mode === 'preview' && previewableType === 'html' ? (
            <HtmlPreview filePath={item.path} cwd={cwd} />
          ) : (
            <HighlightedCode content={item.content} filePath={item.path} />
          )}
        </div>
      </div>
    )
  }

  const fileName = item.diff.filePath.split('/').pop() || item.diff.filePath
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border bg-panel-bg flex items-center gap-2">
        <span className="text-xs text-text font-mono">{fileName}</span>
        <span className="text-[10px] text-text-subtle">{item.diff.title}</span>
      </div>
      <div className="flex-1 overflow-auto [&_*]:!text-[11px] [&_*]:!leading-[1.4]">
        <MultiFileDiff
          oldFile={{ name: item.diff.filePath, contents: item.diff.oldString }}
          newFile={{ name: item.diff.filePath, contents: item.diff.newString }}
          options={{ diffStyle: 'unified', diffIndicators: 'bars', disableFileHeader: true, themeType: isDark ? 'dark' : 'light' }}
          style={{ '--diffs-gap-block': '0px', '--diffs-gap-fallback': '0px' } as React.CSSProperties}
        />
      </div>
    </div>
  )
}

function FileTree({ cwd, onFileClick }: { cwd: string; onFileClick: (path: string) => void }) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [subFiles, setSubFiles] = useState<Record<string, FileEntry[]>>({})
  const [loading, setLoading] = useState(false)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (window as any).acpApi.fs.listFiles(cwd)
      setFiles(result || [])
    } catch {
      setFiles([])
    }
    setLoading(false)
  }, [cwd])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const toggleDir = async (dirPath: string) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath)
    } else {
      newExpanded.add(dirPath)
      if (!subFiles[dirPath]) {
        const result = await (window as any).acpApi.fs.listFiles(dirPath)
        setSubFiles((prev) => ({ ...prev, [dirPath]: result || [] }))
      }
    }
    setExpandedDirs(newExpanded)
  }

  const renderEntry = (entry: FileEntry, basePath: string, depth: number) => {
    const fullPath = `${basePath}/${entry.name}`
    const isExpanded = expandedDirs.has(fullPath)

    return (
      <div key={fullPath}>
        <div
          className={`flex items-center gap-1 px-1 py-0.5 text-xs hover:bg-surface-hover rounded-sm cursor-default ${
            entry.isDirectory ? 'text-text' : 'text-text hover:text-text'
          }`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => {
            if (entry.isDirectory) {
              toggleDir(fullPath)
            } else {
              onFileClick(fullPath)
            }
          }}
        >
          {entry.isDirectory ? (
            isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}
          {entry.isDirectory ? (
            <VSCodeIcon name={entry.name} isDirectory isOpen={isExpanded} className="w-3.5 h-3.5" />
          ) : (
            <VSCodeIcon name={entry.name} className="w-3.5 h-3.5" />
          )}
          <span className="truncate">{entry.name}</span>
        </div>
        {entry.isDirectory && isExpanded && subFiles[fullPath] && (
          <div>
            {subFiles[fullPath].map((sub) => renderEntry(sub, fullPath, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1 border-b border-border">
        <span className="text-[10px] text-text-subtle uppercase tracking-wide">Files</span>
        <button onClick={loadFiles} className="text-text-subtle hover:text-text-muted p-0.5" title="Refresh">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="py-1 max-h-[40vh] overflow-auto">
        {files.length === 0 ? (
          <p className="text-[10px] text-text-subtle px-2 py-1">{loading ? 'Loading...' : 'No files'}</p>
        ) : (
          files.map((entry) => renderEntry(entry, cwd, 0))
        )}
      </div>
    </div>
  )
}

interface OutputPreviewSidebarProps {
  activeAgentId: string | null
  onClose: () => void
  expanded?: boolean
  onToggleExpand?: () => void
}

export default function OutputPreviewSidebar({ activeAgentId, onClose, expanded, onToggleExpand }: OutputPreviewSidebarProps) {
  const { agents } = useAgentConfigStore()
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const [preview, setPreview] = useState<PreviewItem | null>(null)

  const agent = agents.find((a) => a.id === activeAgentId)
  const cwd = agent?.cwd || ''

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const allDiffs = activeSession ? extractDiffsFromSession(activeSession.messages) : []

  // Deduplicate: keep only the last change per file path
  const diffs = useMemo(() => {
    const seen = new Map<string, FileDiff>()
    for (const diff of allDiffs) {
      seen.set(diff.filePath, diff)
    }
    return Array.from(seen.values())
  }, [allDiffs])

  const handleFileClick = useCallback(async (filePath: string) => {
    setPreview({ type: 'file', path: filePath, content: null, loading: true })
    try {
      const content = await (window as any).acpApi.fs.readFile(filePath)
      setPreview((prev) => {
        if (prev?.type === 'file' && prev.path === filePath) {
          return { type: 'file', path: filePath, content, loading: false }
        }
        return prev
      })
    } catch {
      setPreview((prev) => {
        if (prev?.type === 'file' && prev.path === filePath) {
          return { type: 'file', path: filePath, content: null, loading: false }
        }
        return prev
      })
    }
  }, [])

  const handleDiffClick = useCallback((diff: FileDiff) => {
    setPreview({ type: 'diff', diff })
  }, [])

  const hasPreview = preview !== null

  return (
    <div className={`flex h-full shrink-0 border-l border-border ${expanded ? 'flex-1' : hasPreview ? 'w-[720px]' : 'w-[260px]'} transition-[width] duration-200`}>
      {/* Left: file list + changes */}
      <div className="w-[260px] shrink-0 bg-sidebar-bg flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-text">Output Preview</span>
          <div className="flex items-center gap-1">
            {onToggleExpand && (
              <button onClick={onToggleExpand} className="text-text-subtle hover:text-text-muted p-0.5" title={expanded ? 'Collapse' : 'Expand'}>
                {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
            <button onClick={onClose} className="text-text-subtle hover:text-text-muted p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* CWD display */}
        {cwd && (
          <div className="px-3 py-1.5 border-b border-border">
            <p className="text-[10px] text-text-subtle truncate font-mono" title={cwd}>{cwd}</p>
          </div>
        )}

        {/* File tree */}
        {cwd ? (
          <FileTree cwd={cwd} onFileClick={handleFileClick} />
        ) : (
          <div className="px-3 py-2">
            <p className="text-[10px] text-text-subtle">No working directory configured</p>
          </div>
        )}

        {/* Diffs section */}
        <div className="flex-1 min-h-0 flex flex-col border-t border-border">
          <div className="px-2 py-1 border-b border-border">
            <span className="text-[10px] text-text-subtle uppercase tracking-wide">
              Changes ({diffs.length})
            </span>
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
            {diffs.length === 0 ? (
              <p className="text-[10px] text-text-subtle px-1">No file changes yet</p>
            ) : (
              diffs.map((diff, i) => {
                const fileName = diff.filePath.split('/').pop() || diff.filePath
                return (
                  <button
                    key={`${diff.filePath}-${i}`}
                    onClick={() => handleDiffClick(diff)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-surface-hover text-xs transition-colors rounded-sm"
                  >
                    <VSCodeIcon name={fileName} className="w-3.5 h-3.5" />
                    <span className="flex-1 truncate text-text font-mono">{fileName}</span>
                    <span className="text-[9px] text-text-subtle truncate max-w-[80px]">{diff.title}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Right: preview area */}
      {hasPreview && (
        <div className="flex-1 min-w-0 border-l border-border bg-editor-bg flex flex-col h-full">
          <PreviewPanel item={preview} cwd={cwd} />
        </div>
      )}
    </div>
  )
}
