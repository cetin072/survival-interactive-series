import { useEffect, useState } from 'react'
import { ExplorerView, buildPositions, buildVisibleGraph } from './ExplorerView'
import { RawTranscriptReader } from './RawTranscriptReader'
import { StoryBookReader } from './StoryBookReader'
import { StoryLibrary } from './StoryLibrary'
import { activeChronicle, getChronicle } from './transcriptData'
import type { ReaderChapter } from './storyData'
import { archiveRouteUrl, browserReaderStorage, parseArchiveRoute, resolveReaderRoute, type ArchiveRoute } from './readerNavigation'
import './archive.css'

export { buildPositions, buildVisibleGraph }
export const primaryNavigationLabels = ['세계 탐색', '이야기 읽기'] as const
const readRoute = () => parseArchiveRoute(window.location.search, browserReaderStorage())

function writeRoute(route: ArchiveRoute, replace = false) {
  const url = archiveRouteUrl(route, window.location.href)
  if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
}

export function ArchiveApp() {
  // The route owns the selected chapter/PART. Readers never restore over it.
  const [route, setRoute] = useState<ArchiveRoute>(readRoute)
  useEffect(() => {
    const restore = () => setRoute(readRoute())
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => { writeRoute(route, true) }, [route.view, route.chronicleId, route.chapterId, route.partId, route.nodeId])
  const open = (next: ArchiveRoute) => {
    const resolved = resolveReaderRoute(next, browserReaderStorage())
    setRoute(resolved)
    writeRoute(resolved)
    // Book/RAW position only after their new content has committed.
    if (resolved.view !== 'book' && resolved.view !== 'raw') window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const openBook = (chronicleId: ReaderChapter['chronicleId'], chapterId?: string) => open({ view: 'book', chronicleId, chapterId })
  const rawChronicle = (() => { try { return getChronicle(route.chronicleId) } catch { return activeChronicle } })()

  return <main className="archive-shell">
    <header className="archive-header">
      <button className="archive-brand" onClick={() => open({ view: 'archive', chronicleId: activeChronicle.id })}><p className="archive-kicker">SURVIVAL DIARY</p><h1>생존일기 <span>ARCHIVE</span></h1></button>
      <nav className="archive-primary-nav" aria-label="주요 탐색"><button className={route.view === 'archive' ? 'active' : ''} onClick={() => open({ view: 'archive', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[0]}</button><button className={route.view === 'story' || route.view === 'book' ? 'active' : ''} onClick={() => open({ view: 'story', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[1]}</button></nav>
    </header>
    {route.view === 'archive' && <ExplorerView key={route.nodeId ?? 'default'} initialNodeId={route.nodeId} onOpenStory={(chapterId) => openBook('C03-AFTERFALL', chapterId)} />}
    {route.view === 'story' && <StoryLibrary onOpenBook={(chronicleId) => openBook(chronicleId)} />}
    {route.view === 'book' && <StoryBookReader key={route.chronicleId} chronicleId={route.chronicleId} initialChapterId={route.chapterId} onChapterChange={(chapterId) => open({ ...route, chapterId })} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onBack={() => open({ view: 'story', chronicleId: activeChronicle.id })} />}
    {route.view === 'raw' && <RawTranscriptReader key={rawChronicle.id} chronicleId={rawChronicle.id} initialPartId={route.partId} onPartChange={(partId) => open({ ...route, partId })} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onOpenExplorer={() => open({ view: 'archive', chronicleId: activeChronicle.id })} />}
    <footer className="archive-footer"><p>읽기 정책 · 공개된 이야기와 세계 기록은 실제 확인된 자료를 바탕으로 편집됩니다.</p><button onClick={() => open({ view: 'raw', chronicleId: activeChronicle.id })}>기록 원문 보관소</button></footer>
  </main>
}
