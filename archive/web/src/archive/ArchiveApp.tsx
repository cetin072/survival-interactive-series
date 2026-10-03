import { lazy, Suspense, useEffect, useState } from 'react'
import { ExplorerView, buildPositions, buildVisibleGraph } from './ExplorerView'
import { ChronicleRoom, chronicleFilterFor, type ChronicleSection } from './ChronicleRoom'
import { RawTranscriptReader } from './RawTranscriptReader'
import { StoryBookReader } from './StoryBookReader'
import { StoryLibrary } from './StoryLibrary'
import { WikiShellPreview } from './WikiShellPreview'
import { activeChronicle, getChronicle } from './transcriptData'
import type { ReaderChapter } from './storyData'
import { archiveRouteUrl, browserReaderStorage, parseArchiveRoute, resolveReaderRoute, type ArchiveRoute } from './readerNavigation'
import './archive.css'

const OperatorConsole = lazy(() => import('./OperatorConsole'))

export { buildPositions, buildVisibleGraph }
export const primaryNavigationLabels = ['이야기', '생존 지식', 'Tools', 'Media'] as const
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

  if (route.view === 'wiki-preview') return <WikiShellPreview nodeId={route.nodeId} page={route.page} chronicleId={route.chronicleId} />

  return <main className="archive-shell">
    <header className="archive-header">
      <button className="archive-brand" onClick={() => open({ view: 'home', chronicleId: activeChronicle.id })}><p className="archive-kicker">SURVIVAL DIARY</p><h1>생존일기 <span>ARCHIVE</span></h1></button>
      <nav className="archive-primary-nav" aria-label="주요 탐색">
        <button className={route.view === 'home' || route.view === 'story' || route.view === 'chronicle' || route.view === 'book' ? 'active' : ''} onClick={() => open({ view: 'home', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[0]}</button>
        <a href="/knowledge/">{primaryNavigationLabels[1]}</a>
        <button className={route.view === 'tools' ? 'active' : ''} onClick={() => open({ view: 'tools', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[2]}</button>
        <button className={route.view === 'media' ? 'active' : ''} onClick={() => open({ view: 'media', chronicleId: activeChronicle.id })}>{primaryNavigationLabels[3]}</button>
      </nav>
    </header>
    {(route.view === 'home' || route.view === 'story') && <StoryLibrary onOpenChronicle={(id) => openRoom(id)} onOpenBook={(id) => openBook(id)} onOpenExplorer={(id) => openRoom(id, 'explorer')} />}
    {route.view === 'chronicle' && <ChronicleRoom key={route.chronicleId} chronicleId={route.chronicleId} section={roomSection} onSection={(section) => open({ ...route, section })} onRead={() => openBook(route.chronicleId)} onExplore={() => openRoom(route.chronicleId, 'graph')} onRaw={() => open({ view: 'raw', chronicleId: route.chronicleId })} onOpenHub={() => open({ view: 'home', chronicleId: activeChronicle.id })} />}
    {roomHasGraph && <ExplorerView key={route.chronicleId + ':' + roomSection} initialFilter={chronicleFilterFor(roomSection)} onOpenStory={(chapterId) => openBook(route.chronicleId, chapterId)} />}
    {route.view === 'archive' && <ExplorerView key={route.nodeId ?? 'default'} initialNodeId={route.nodeId} onOpenStory={(chapterId) => openBook('C03-AFTERFALL', chapterId)} />}
    {route.view === 'book' && <StoryBookReader key={route.chronicleId} chronicleId={route.chronicleId} initialChapterId={route.chapterId} onChapterChange={(chapterId) => open({ ...route, chapterId })} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onBack={() => open({ view: 'chronicle', chronicleId: route.chronicleId, section: 'overview' })} />}
    {route.view === 'raw' && <RawTranscriptReader key={rawChronicle.id} chronicleId={rawChronicle.id} initialPartId={route.partId} onPartChange={(partId) => open({ ...route, partId })} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onOpenExplorer={() => open({ view: 'archive', chronicleId: activeChronicle.id })} />}
    {route.view === 'tools' && <section className="archive-panel future-archive"><p className="archive-eyebrow">TOOLS</p><h1>생존 도구</h1><p>체크리스트와 자료 도구를 연결할 자리입니다.</p><div className="future-cards"><article>PDF 자료 <span>아직 기록 없음</span></article><article>XLSX 관리표 <span>준비 중</span></article><article>체크리스트 <span>준비 중</span></article></div></section>}
    {route.view === 'media' && <section className="archive-panel future-archive"><p className="archive-eyebrow">MEDIA</p><h1>미디어 Archive</h1><p>공개 허용된 시각 자료와 향후 미디어 진입점을 모읍니다.</p><div className="future-cards"><article>삽화 <span>Chronicle 안의 공개 Visual 자료</span></article><article>영상 <span>아직 기록 없음</span></article><article>웹툰 · 교육 <span>아직 기록 없음</span></article></div></section>}
    {(route.view === 'operator' || route.view === 'operator-visuals' || route.view === 'operator-knowledge' || route.view === 'operator-vault') && <Suspense fallback={<section className="operator-page" aria-live="polite">운영자 화면을 불러오는 중…</section>}><OperatorConsole view={route.view === 'operator-visuals' ? 'visuals' : route.view === 'operator-knowledge' ? 'knowledge' : route.view === 'operator-vault' ? 'vault' : 'dashboard'} /></Suspense>}
    {route.view !== 'operator' && route.view !== 'operator-visuals' && route.view !== 'operator-knowledge' && route.view !== 'operator-vault' && <footer className="archive-footer"><p>읽기 정책 · 공개된 이야기와 세계 기록은 실제 확인된 자료를 바탕으로 편집됩니다.</p><button onClick={() => open({ view: 'raw', chronicleId: activeChronicle.id })}>기록 원문 보관소</button></footer>}
  </main>
}
