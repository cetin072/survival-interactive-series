import { lazy, Suspense, useEffect, useState } from 'react'
import { ExplorerView, buildPositions, buildVisibleGraph } from './ExplorerView'
import { ChronicleRoom, chronicleFilterFor, type ChronicleSection } from './ChronicleRoom'
import { RawTranscriptReader } from './RawTranscriptReader'
import { StoryBookReader } from './StoryBookReader'
import { StoryLibrary } from './StoryLibrary'
import { activeChronicle, getChronicle } from './transcriptData'
import type { ReaderChapter } from './storyData'
import { archiveRouteUrl, browserReaderStorage, parseArchiveRoute, resolveReaderRoute, type ArchiveRoute } from './readerNavigation'
import './archive.css'

const OperatorConsole = lazy(() => import('./OperatorConsole'))

export { buildPositions, buildVisibleGraph }
export const primaryNavigationLabels = ['이야기', '생존 지식', '자료실'] as const
const readRoute = () => parseArchiveRoute(window.location.search, browserReaderStorage(), window.location.pathname)

function writeRoute(route: ArchiveRoute, replace = false) {
  const url = archiveRouteUrl(route, window.location.href)
  if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
}

export function ArchiveApp() {
  const [route, setRoute] = useState<ArchiveRoute>(readRoute)
  useEffect(() => {
    const restore = () => setRoute(readRoute())
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => { writeRoute(route, true) }, [route.view, 'chronicleId' in route ? route.chronicleId : '', 'section' in route ? route.section : '', 'chapterId' in route ? route.chapterId : '', 'partId' in route ? route.partId : '', 'nodeId' in route ? route.nodeId : ''])
  const open = (next: ArchiveRoute) => {
    const resolved = resolveReaderRoute(next, browserReaderStorage())
    setRoute(resolved)
    writeRoute(resolved)
    if (resolved.view !== 'book' && resolved.view !== 'raw') window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const openBook = (chronicleId: ReaderChapter['chronicleId'], chapterId?: string) => open({ view: 'book', chronicleId, chapterId })
  const chronicleId = 'chronicleId' in route ? route.chronicleId : activeChronicle.id
  const rawChronicle = (() => { try { return getChronicle(chronicleId) } catch { return activeChronicle } })()
  const openRoom = (id: string, section: ChronicleSection = 'overview') => open({ view: 'chronicle', chronicleId: id, section })
  const roomSection = route.view === 'chronicle' ? route.section ?? 'overview' : 'overview'
  const roomHasGraph = route.view === 'chronicle' && route.chronicleId === 'C03-AFTERFALL' && ['explorer','characters','locations','events','graph'].includes(roomSection)

  return <main className="archive-shell">
    <header className="archive-header">
      <button className="archive-brand" onClick={() => open({ view: 'home', chronicleId: activeChronicle.id })}><p className="archive-kicker">SURVIVAL DIARY</p><h1>생존일기 <span>ARCHIVE</span></h1></button>
      <nav className="archive-primary-nav" aria-label="주요 탐색">
        <button className={route.view === 'home' || route.view === 'story' || route.view === 'chronicle' || route.view === 'book' ? 'active' : ''} onClick={() => open({ view: 'home', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[0]}</button>
        <a href="/knowledge/">{primaryNavigationLabels[1]}</a>
        <button className={route.view === 'tools' || route.view === 'media' ? 'active' : ''} onClick={() => open({ view: 'tools', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[2]}</button>
      </nav>
    </header>
    {(route.view === 'home' || route.view === 'story') && <StoryLibrary onOpenChronicle={(id) => openRoom(id)} onOpenBook={(id) => openBook(id)} onOpenExplorer={(id) => openRoom(id, 'explorer')} />}
    {route.view === 'chronicle' && <ChronicleRoom key={route.chronicleId} chronicleId={route.chronicleId} section={roomSection} onSection={(section) => open({ ...route, section })} onRead={() => openBook(route.chronicleId)} onExplore={() => openRoom(route.chronicleId, 'graph')} onRaw={() => open({ view: 'raw', chronicleId: route.chronicleId })} onOpenHub={() => open({ view: 'home', chronicleId: activeChronicle.id })} />}
    {roomHasGraph && <ExplorerView key={route.chronicleId + ':' + roomSection} initialFilter={chronicleFilterFor(roomSection)} onOpenStory={(chapterId) => openBook(route.chronicleId, chapterId)} />}
    {route.view === 'archive' && <ExplorerView key={route.nodeId ?? 'default'} initialNodeId={route.nodeId} onOpenStory={(chapterId) => openBook('C03-AFTERFALL', chapterId)} />}
    {route.view === 'book' && <StoryBookReader key={route.chronicleId} chronicleId={route.chronicleId} initialChapterId={route.chapterId} onChapterChange={(chapterId) => open({ ...route, chapterId })} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onBack={() => open({ view: 'chronicle', chronicleId: route.chronicleId, section: 'overview' })} />}
    {route.view === 'raw' && <RawTranscriptReader key={rawChronicle.id} chronicleId={rawChronicle.id} initialPartId={route.partId} onPartChange={(partId) => open({ ...route, partId })} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onOpenExplorer={() => open({ view: 'archive', chronicleId: activeChronicle.id })} />}
    {(route.view === 'tools' || route.view === 'media') && <section className="archive-panel future-archive"><p className="archive-eyebrow">SURVIVAL DIARY · LIBRARY</p><h1>자료실</h1><p>이야기에서 만들어진 삽화와 지도, 현실에서 쓸 수 있는 체크리스트와 파일을 한곳에 모읍니다.</p><div className="future-cards"><article>삽화 <span>각 생존기의 공개 삽화를 모아볼 자리</span></article><article>지도 <span>세계관 지도가 준비되면 연결</span></article><article>체크리스트 <span>현실 생존 준비용 자료</span></article><article>PDF · XLSX <span>다운로드 가능한 자료와 관리표</span></article><article>영상 <span>향후 영상·교육 콘텐츠</span></article></div></section>}
    {(route.view === 'operator' || route.view === 'operator-visuals' || route.view === 'operator-knowledge' || route.view === 'operator-vault') && <Suspense fallback={<section className="operator-page" aria-live="polite">운영자 화면을 불러오는 중…</section>}><OperatorConsole view={route.view === 'operator-visuals' ? 'visuals' : route.view === 'operator-knowledge' ? 'knowledge' : route.view === 'operator-vault' ? 'vault' : 'dashboard'} /></Suspense>}
    {route.view !== 'operator' && route.view !== 'operator-visuals' && route.view !== 'operator-knowledge' && route.view !== 'operator-vault' && <footer className="archive-footer"><p>공개된 이야기와 세계 기록은 실제 확인된 자료를 바탕으로 편집됩니다.</p><button onClick={() => open({ view: 'raw', chronicleId: activeChronicle.id })}>원문 기록</button></footer>}
  </main>
}
