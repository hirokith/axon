export async function copyToClipboard(text: string): Promise<void> {
  const acpApi = (window as any).acpApi
  if (acpApi?.clipboard?.writeText) {
    await acpApi.clipboard.writeText(text)
    return
  }

  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to execCommand fallback
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}
