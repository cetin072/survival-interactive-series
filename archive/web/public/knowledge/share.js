// Standalone enhancement for static Knowledge articles; no remote services.
(() => {
  const panel = document.querySelector('[data-knowledge-share]')
  if (!panel) return
  const actions = panel.querySelector('[data-knowledge-share-actions]')
  const nativeButton = panel.querySelector('[data-knowledge-native-share]')
  const copyButton = panel.querySelector('[data-knowledge-copy]')
  const input = panel.querySelector('#knowledge-share-url')
  const status = panel.querySelector('[data-knowledge-share-status]')
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
  if (!actions || !nativeButton || !copyButton || !input || !status ||
      !canonical || !canonical.startsWith('https://') || input.value !== canonical) return

  const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.title
  const description = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''
  const canNativeShare = typeof navigator.share === 'function'
  nativeButton.hidden = !canNativeShare
  actions.hidden = false

  nativeButton.addEventListener('click', async () => {
    if (!canNativeShare) return
    try {
      await navigator.share({ title, text: description, url: canonical })
      status.textContent = '공유 요청을 완료했습니다.'
    } catch (error) {
      // Closing the native share sheet is not an error to the user.
      if (error?.name !== 'AbortError') status.textContent = '공유가 되지 않았습니다. 링크 복사를 사용해 주세요.'
    }
  })

  copyButton.addEventListener('click', async () => {
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('CLIPBOARD_UNAVAILABLE')
      await navigator.clipboard.writeText(canonical)
      status.textContent = '글 주소를 복사했습니다.'
    } catch {
      input.focus()
      input.select()
      status.textContent = '주소를 선택했습니다. 직접 복사해 주세요.'
    }
  })
})()
