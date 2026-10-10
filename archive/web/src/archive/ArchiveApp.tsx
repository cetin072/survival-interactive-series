import { lazy, Suspense, useEffect, useState } from 'react'
import { ExplorerView, buildPositions, buildVisibleGraph } from './ExplorerView'
import { ChronicleRoom, chronicleFilterFor, type ChronicleSection } from './ChronicleRoom'
import { RawTranscriptReader } from './RawTranscriptReader'
import { StoryBookReader } from './StoryBookReader'
import { isWikiSupportedNodeId } from './wikiDocument'
import { WikiStoryLibrary } from './WikiStoryLibrary'
import { WikiToolsPage } from './WikiToolsPage'
import { WikiMediaPage } from './WikiMediaPage'
import { WikiShellPreview } from './WikiShellPreview'
import { KnowledgeGuidePreview } from './KnowledgeGuidePreview'
import { activeChronicle, getChronicle } from './transcriptData'
import type { ReaderChapter } from './storyData'
import { archiveRouteUrl, browserReaderStorage, parseArchiveRoute, resolveReaderRoute, type ArchiveRoute } from './readerNavigation'
import { publicNavigation, currentPublicMenu } from './publicNavigation'
import './archive.css'

const OperatorConsole = lazy(() => import('./OperatorConsole'))

export { buildPositions, buildVisibleGraph }
export const primaryNavigationLabels = publicNavigation.map((item) => item.label)
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
  useEffect(() => { writeRoute(route, true) }, [route.view, 'chronicleId' in route ? route.chronicleId : '', 'section' in route ? route.section : '', 'chapterId' in route ? route.chapterId : '', 'partId' in route ? route.partId : '', 'nodeId' in route ? route.nodeId : '', 'page' in route ? route.page : '', 'briefId' in route ? route.briefId : '', 'jobId' in route ? route.jobId : '', 'bunkerPath' in route ? route.bunkerPath : ''])
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
  if (route.view === 'knowledge-preview') return <KnowledgeGuidePreview briefId={route.briefId} />
  if (route.view === 'story' || route.view === 'home') return <WikiStoryLibrary />
  if (route.view === 'tools') return <WikiToolsPage />
  if (route.view === 'media') return <WikiMediaPage />

  if (route.view === 'book') return <StoryBookReader key={route.chronicleId} chronicleId={route.chronicleId} initialChapterId={route.chapterId} onChapterChange={(chapterId) => open({ ...route, chapterId })} onOpenNode={(nodeId) => open(isWikiSupportedNodeId(nodeId) ? { view: 'wiki-preview', chronicleId: route.chronicleId, nodeId } : { view: 'archive', chronicleId: route.chronicleId, nodeId })} onBack={() => open({ view: 'story', chronicleId: route.chronicleId })} onOpenChronicle={() => open({ view: 'wiki-preview', chronicleId: route.chronicleId, page: 'chronicle' })} />

  return <main className="archive-shell">
    <header className="archive-header">
      <button className="archive-brand" onClick={() => open({ view: 'wiki-preview', chronicleId: activeChronicle.id, page: 'home' })}><p className="archive-kicker">SURVIVAL DIARY</p><h1>생존일기 <span>ARCHIVE</span></h1></button>
      <nav className="archive-primary-nav" aria-label="주요 탐색">
        {route.view.startsWith('operator') ? <>
        <button className={route.view === 'chronicle' ? 'active' : ''} onClick={() => open({ view: 'story', chronicleId: activeChronicle.id })}>이야기</button>
        <a href="/knowledge/">생존 지식</a>
        <button onClick={() => open({ view: 'tools', chronicleId: activeChronicle.id })}>Tools</button>
        <button onClick={() => open({ view: 'media', chronicleId: activeChronicle.id })}>Media</button>
        </> : publicNavigation.map((item) => <a key={item.id} href={item.href} aria-current={currentPublicMenu(window.location.pathname, window.location.search) === item.id ? 'page' : undefined}>{item.label}</a>)}
      </nav>
    </header>
    {route.view === 'chronicle' && <ChronicleRoom key={route.chronicleId} chronicleId={route.chronicleId} section={roomSection} onSection={(section) => open({ ...route, section })} onRead={() => openBook(route.chronicleId)} onExplore={() => openRoom(route.chronicleId, 'graph')} onRaw={() => open({ view: 'raw', chronicleId: route.chronicleId })} onOpenHub={() => open({ view: 'story', chronicleId: activeChronicle.id })} />}
    {roomHasGraph && <ExplorerView key={route.chronicleId + ':' + roomSection} initialFilter={chronicleFilterFor(roomSection)} onOpenStory={(chapterId) => openBook(route.chronicleId, chapterId)} />}
    {route.view === 'archive' && <ExplorerView key={route.nodeId ?? 'default'} initialNodeId={route.nodeId} onOpenStory={(chapterId) => openBook('C03-AFTERFALL', chapterId)} />}
    {route.view === 'raw' && <RawTranscriptReader key={rawChronicle.id} chronicleId={rawChronicle.id} initialPartId={route.partId} onPartChange={(partId) => open({ ...route, partId })} onOpenNode={(nodeId) => open({ view: 'archive', chronicleId: activeChronicle.id, nodeId })} onOpenExplorer={() => open({ view: 'archive', chronicleId: activeChronicle.id })} />}
    {(route.view === 'operator' || route.view === 'operator-visuals' || route.view === 'operator-knowledge' || route.view === 'operator-knowledge-detail' || route.view === 'operator-vault' || route.view === 'operator-bunker-os') && <Suspense fallback={<section className="operator-page" aria-live="polite">운영자 화면을 불러오는 중…</section>}><OperatorConsole
      view={route.view === 'operator-visuals' ? 'visuals' : route.view === 'operator-knowledge' ? 'knowledge' : route.view === 'operator-knowledge-detail' ? 'knowledge-detail' : route.view === 'operator-vault' ? 'vault' : route.view === 'operator-bunker-os' ? 'bunker-os' : 'dashboard'}
      knowledgeJobId={route.view === 'operator-knowledge-detail' ? route.jobId : undefined}
    /></Suspense>}
    {route.view !== 'operator' && route.view !== 'operator-visuals' && route.view !== 'operator-knowledge' && route.view !== 'operator-knowledge-detail' && route.view !== 'operator-vault' && route.view !== 'operator-bunker-os' && <footer className="archive-footer"><p>읽기 정책 · 공개된 이야기와 세계 기록은 실제 확인된 자료를 바탕으로 편집됩니다.</p><button onClick={() => open({ view: 'raw', chronicleId: activeChronicle.id })}>기록 원문 보관소</button></footer>}
  </main>
}
