import { createHighlighter, Highlighter } from 'shiki'

let highlighterPromise: Promise<Highlighter> | null = null

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: ['json', 'javascript', 'typescript', 'tsx', 'jsx', 'html', 'css', 'python', 'bash', 'markdown', 'yaml', 'toml', 'rust', 'go', 'java', 'plaintext'],
    }).catch((err) => {
      highlighterPromise = null
      throw err
    })
  }
  return highlighterPromise
}

// Try to detect language from content
export function detectLanguage(content: string, label?: string): string {
  // If it looks like JSON
  const trimmed = content.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {}
  }

  // Check for common patterns
  if (trimmed.includes('import ') || trimmed.includes('export ') || trimmed.includes('const ') || trimmed.includes('function ')) {
    if (trimmed.includes('tsx') || trimmed.includes('className=') || trimmed.includes('jsx')) return 'tsx'
    return 'typescript'
  }
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || /<[a-z]+[\s>]/i.test(trimmed)) return 'html'
  if (trimmed.includes('def ') || trimmed.includes('import ') && trimmed.includes(':')) return 'python'
  if (trimmed.startsWith('#!') || trimmed.includes('#!/bin/')) return 'bash'
  if (label?.toLowerCase() === 'input') return 'json'
  
  return 'plaintext'
}
