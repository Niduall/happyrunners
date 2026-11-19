/**
 * Copie de texte avec repli.
 *
 * `navigator.clipboard` est indisponible hors HTTPS, dans certains WebView et
 * quand la permission presse-papiers est refusée. On retombe alors sur
 * `execCommand('copy')`, qui fonctionne encore dans ces contextes.
 */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // On tente le repli ci-dessous.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copie impossible')
}
