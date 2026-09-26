import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** One post-commit content scroll, not competing parent/child smooth scrolls. */
export function useReaderPosition(itemId: string | undefined) {
  const articleRef = useRef<HTMLElement>(null)
  const lastPositionedId = useRef<string | undefined>(undefined)
  const [progress, setProgress] = useState(0)
  const scrollToStart = useCallback(() => {
    const article = articleRef.current
    if (article) window.scrollTo({ top: Math.max(0, window.scrollY + article.getBoundingClientRect().top - 16), behavior: 'instant' })
  }, [])

  useLayoutEffect(() => {
    if (!itemId || lastPositionedId.current === itemId) return
    lastPositionedId.current = itemId
    scrollToStart()
  }, [itemId, scrollToStart])

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const article = articleRef.current
      if (!article) return
      const top = window.scrollY + article.getBoundingClientRect().top
      const maximum = Math.max(article.offsetHeight - window.innerHeight, 1)
      setProgress(Math.max(0, Math.min(100, Math.round((window.scrollY - top) / maximum * 100))))
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [itemId])
  return { articleRef, progress, scrollToStart }
}
