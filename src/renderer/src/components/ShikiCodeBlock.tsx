import { useState, useEffect, useCallback } from 'react'
import { getHighlighter, detectLanguage } from '../utils/shikiHighlighter'

interface ShikiCodeBlockProps {
  label: string
  content: string
  maxHeight?: number
}

export default function ShikiCodeBlock({ label, content, maxHeight = 250 }: ShikiCodeBlockProps) {
  const [html, setHtml] = useState<string>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHtml('')
    const lang = detectLanguage(content, label)
    
    getHighlighter().then((highlighter) => {
      if (cancelled) return
      try {
        const result = highlighter.codeToHtml(content, {
          lang,
          theme: 'github-dark',
        })
        setHtml(result)
      } catch {
        // Fallback: just escape and wrap
        const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        setHtml(`<pre class="shiki"><code>${escaped}</code></pre>`)
      }
    })

    return () => { cancelled = true }
  }, [content, label])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
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
          className="rounded-sm border border-border overflow-auto text-xs font-mono leading-relaxed [&_pre]:!bg-[#11111b] [&_pre]:p-2 [&_pre]:m-0 [&_pre]:min-w-full [&_pre]:w-fit [&_code]:!bg-transparent"
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
