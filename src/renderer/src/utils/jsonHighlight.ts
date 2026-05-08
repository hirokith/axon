export function highlightJson(obj: any): string {
  const json = JSON.stringify(obj, null, 2)
  if (!json) return ''

  // Tokenize and highlight properly to avoid double-replacement issues
  const result: string[] = []
  let i = 0
  while (i < json.length) {
    // String
    if (json[i] === '"') {
      let end = i + 1
      while (end < json.length && json[end] !== '"') {
        if (json[end] === '\\') end++ // skip escaped char
        end++
      }
      end++ // include closing quote
      const str = json.slice(i, end)
      const escaped = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // Check if this is a key (followed by colon)
      const afterStr = json.slice(end).match(/^\s*:/)
      if (afterStr) {
        result.push(`<span class="text-purple-400">${escaped}</span>`)
      } else {
        result.push(`<span class="text-green-400">${escaped}</span>`)
      }
      i = end
    }
    // Number
    else if (/[\d\-]/.test(json[i]) && (i === 0 || /[,:\[\s]/.test(json[i - 1]))) {
      let end = i
      while (end < json.length && /[\d.eE+\-]/.test(json[end])) end++
      result.push(`<span class="text-blue-400">${json.slice(i, end)}</span>`)
      i = end
    }
    // Boolean / null
    else if (json.slice(i, i + 4) === 'true') {
      result.push('<span class="text-orange-400">true</span>')
      i += 4
    } else if (json.slice(i, i + 5) === 'false') {
      result.push('<span class="text-orange-400">false</span>')
      i += 5
    } else if (json.slice(i, i + 4) === 'null') {
      result.push('<span class="text-gray-500">null</span>')
      i += 4
    }
    // Other characters (whitespace, braces, brackets, commas, colons)
    else {
      const ch = json[i]
      if (ch === '<') result.push('&lt;')
      else if (ch === '>') result.push('&gt;')
      else if (ch === '&') result.push('&amp;')
      else result.push(ch)
      i++
    }
  }
  return result.join('')
}
