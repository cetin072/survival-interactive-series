import { useEffect, useState } from 'react'
import { ExplorerView, buildPositions, buildVisibleGraph } from './ExplorerView'
import { RawTranscriptReader } from './RawTranscriptReader'
import { StoryBookReader } from './StoryBookReader'
import { StoryLibrary } from './StoryLibrary'
import { activeChronicle, getChronicle, type ChronicleId } from './transcriptData'
import { chronicleBooks, type ReaderChapter } from './storyData'
import './archive.css'

export { buildPositions, buildVisibleGraph }
export const primaryNavigationLabels = ['세계 탐색', '이야기 읽기'] as const

type View = 'archive' | 'story' | 'book' | 'raw'
type Route = { view: View; chronicleId: ChronicleId; chapterId?: string; partId?: string; nodeId?: string }

function readRoute(): Route {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('chronicle')
  const chronicleId = requested && chronicleBooks.some((book) => book.chronicleId === requested) ? requested : activeChronicle.id
  const view = params.get('view')
  if (view === 'reader') return { view: 'raw', chronicleId, partId: params.get('part') ?? undefined }
  if (view === 'raw') return { view: 'raw', chronicleId, partId: params.get('part') ?? undefined }
  if (view === 'past') return { view: 'story', chronicleId }
  if (view === 'story' && requested) return { view: 'book', chronicleId, chapterId: params.get('chapter') ?? undefined }
  if (view === 'story') return { view: 'story', chronicleId }
  return { view: 'archive', chronicleId, nodeId: params.get('node') ?? undefined }
}

function writeRoute(route: Route, replace = false) {
  const url = new URL(window.location.href); url.search = ''
  if (route.view === 'archive' && route.nodeId) {
    url.searchParams.set('view', 'archive'); url.searchParams.set('node', route.nodeId)
  } else if (route.view !== 'archive') {
    url.searchParams.set('view', route.view === 'book' ? 'story' : route.view)
    if (route.view !== 'story') url.searchParams.set('chronicle', route.chronicleId)
    if (route.view === 'book' && route.chapterId) url.searchParams.set('chapter', route.chapterId)
    if (route.view === 'raw' && route.partId) url.searchParams.set('part', route.partId)
  }
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
}

export function ArchiveApp() {
  const [route, setRoute] = useState<Route>(() => readRoute())
  useEffect(() => { const restore = () => setRoute(readRoute()); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore) }, [])
  const open = (next: Route, replace = false) => { setRoute(next); writeRoute(next, replace); window.scrollTo({ top: 0, behavior: replace ? 'auto' : 'smooth' }) }
  const openBook = (chronicleId: ReaderChapter['chronicleId'], chapterId?: string) => open({ view: 'book', chronicleId, chapterId })
  const rawChronicle = (() => { try { return getChronicle(route.chronicleId) } catch { return activeChronicle } })()

  return <main className="archive-shell"><header className="archive-header"><button className="archive-brand" onClick={() => open({ view: 'archive', chronicleId: activeChronicle.id })}><p className="archive-kicker">SURVIVAL DIARY</p><h1>생존일기 <span>ARCHIVE</span></h1></button><nav className="archive-primary-nav" aria-label="주요 탐색"><button className={route.view === 'archive' ? 'active' : ''} onClick={() => open({ view: 'archive', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[0]}</button><button className={route.view === 'story' || route.view === 'book' ? 'active' : ''} onClick={() => open({ view: 'story', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[1]}</button></nav></header>
    {route.view === 'archive' && <ExplorerView initialNodeId={route.nodeId} onOpenStory={(chapterId) => openBook('C03-AFTERFALL', chapterId)} />}
    {route.view === 'story' && <StoryLibrary onOpenBook={(chronicleId) => openBook(chronicleId)} />}
    {route.view === 'book' && <StoryBookReader chronicleId={route.chronicleId as ReaderChapter['chronicleId']} initialChapterId={route.chapterId} onChapterChange={(chapterId) => open({ ...route, chapterId }, true)} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onBack={() => open({ view: 'story', chronicleId: activeChronicle.id })} />}
    {route.view === 'raw' && <RawTranscriptReader chronicleId={rawChronicle.id} initialPartId={route.partId} onPartChange={(partId) => open({ view: 'raw', chronicleId: rawChronicle.id, partId }, true)} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onOpenExplorer={() => open({ view: 'archive', chronicleId: activeChronicle.id })} />}
    <footer className="archive-footer"><p>읽기 정책 · 공개된 이야기와 세계 기록은 실제 확인된 자료를 바탕으로 편집됩니다.</p><button onClick={() => open({ view: 'raw', chronicleId: activeChronicle.id })}>기록 원문 보관소</button></footer>
  </main>
}
