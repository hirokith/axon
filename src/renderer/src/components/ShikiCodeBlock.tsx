import { useState, useEffect, useCallback } from 'react'
import { getHighlighter, detectLanguage } from '../utils/shikiHighlighter'

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

interface ShikiCodeBlockProps {
  label: string
  content: string
  maxHeight?: number
}

export default function ShikiCodeBlock({ label, content, maxHeight = 250 }: ShikiCodeBlockProps) {
  const [htmlDark, setHtmlDark] = useState<string>('')
  const [htmlLight, setHtmlLight] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const isDark = useIsDark()

  useEffect(() => {
    let cancelled = false
    setHtmlDark('')
    setHtmlLight('')
    const lang = detectLanguage(content, label)
    
    getHighlighter().then((highlighter) => {
      if (cancelled) return
      try {
        setHtmlDark(highlighter.codeToHtml(content, { lang, theme: 'github-dark' }))
      } catch {
        const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        setHtmlDark(`<pre class="shiki"><code>${escaped}</code></pre>`)
      }
      try {
        setHtmlLight(highlighter.codeToHtml(content, { lang, theme: 'github-light' }))
      } catch {
        const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        setHtmlLight(`<pre class="shiki"><code>${escaped}</code></pre>`)
      }
    })

    return () => { cancelled = true }
  }, [content, label])

  const html = isDark ? htmlDark : htmlLight

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* */ }
  }, [content])

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-text-subtle uppercase tracking-wide">{label}</span>
        <button onClick={handleCopy} className="text-xs text-text-subtle hover:text-text-muted transition-colors">
          {copied ? '✓' : 'copy'}
        </button>
      </div>
      {html ? (
        <div
          className="rounded-sm border border-border overflow-auto text-xs font-mono leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-2 [&_pre]:m-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:!bg-transparent"
          style={{ maxHeight }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div
          className="rounded-sm border border-border overflow-auto text-xs font-mono leading-relaxed"
          style={{ maxHeight }}
        >
          <pre className="bg-panel-bg p-2 text-text whitespace-pre-wrap break-words min-w-full w-fit">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}
