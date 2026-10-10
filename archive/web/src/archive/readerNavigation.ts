import { activeChronicle, transcriptPartsFor, type ChronicleId } from './transcriptData'
import { chaptersForChronicle } from './storyData'
import { chronicleRegistry } from './chronicleRegistry'
import type { ChronicleSection } from './ChronicleRoom'

export type ArchiveRoute =
  | { view: 'home' | 'story' | 'tools' | 'media' | 'operator' | 'operator-visuals' | 'operator-knowledge' | 'operator-vault'; chronicleId: ChronicleId }
  | { view: 'operator-bunker-os'; chronicleId: ChronicleId; bunkerPath?: string }
  | { view: 'operator-knowledge-detail'; chronicleId: ChronicleId; jobId: string }
  | { view: 'knowledge-preview'; chronicleId: ChronicleId; briefId?: string }
  | { view: 'wiki-preview'; chronicleId: ChronicleId; nodeId?: string; page?: 'home' | 'chronicle' | 'world' | 'worlds' }
  | { view: 'chronicle'; chronicleId: ChronicleId; section?: ChronicleSection }
  | { view: 'archive'; chronicleId: ChronicleId; nodeId?: string }
  | { view: 'book'; chronicleId: ChronicleId; chapterId?: string }
  | { view: 'raw'; chronicleId: ChronicleId; partId?: string }
export type ReaderStorage = Pick<Storage, 'getItem'>
export const storyProgressKey = (id: string) => 'survival-diary-archive:story-progress:v1:' + id
export const rawProgressKey = (id: string) => 'survival-diary-archive:reader-progress:v5:' + id

/** An explicit valid link/click always outranks an optional saved bookmark. */
export function selectReaderItem<T extends { id: string }>(items: readonly T[], routedId?: string, savedId?: string): T | undefined {
  return items.find((item) => item.id === routedId) ?? items.find((item) => item.id === savedId) ?? items[0]
}

export function savedReaderId(storage: ReaderStorage | undefined, key: string, raw = false): string | undefined {
  try {
    const value = storage?.getItem(key)
    if (!value) return undefined
    if (!raw) return value
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && 'partId' in parsed && typeof parsed.partId === 'string' ? parsed.partId : undefined
  } catch { return undefined }
}

export function browserReaderStorage(): ReaderStorage | undefined {
  try { return window.localStorage } catch { return undefined }
}

/** Resolve selection only at a navigation boundary, never from a restore Effect. */
export function resolveReaderRoute(route: ArchiveRoute, storage?: ReaderStorage): ArchiveRoute {
  if (route.view === 'book') {
    const chapter = selectReaderItem(chaptersForChronicle(route.chronicleId), route.chapterId, savedReaderId(storage, storyProgressKey(route.chronicleId)))
    return { ...route, chapterId: chapter?.id }
  }
  if (route.view === 'raw') {
    const part = selectReaderItem(transcriptPartsFor(route.chronicleId), route.partId, savedReaderId(storage, rawProgressKey(route.chronicleId), true))
    return { ...route, partId: part?.id }
  }
  return route
}

const sections = new Set<ChronicleSection>(['overview','reader','explorer','characters','locations','events','timeline','graph','map','visuals','raw'])

export function parseArchiveRoute(search: string, storage?: ReaderStorage, pathname = '/'): ArchiveRoute {
  const params = new URLSearchParams(search)
  const requested = params.get('chronicle')
  const chronicleId = chronicleRegistry.find((chronicle) => chronicle.id === requested)?.id ?? activeChronicle.id
  if (pathname === '/operator/visuals' || pathname.startsWith('/operator/visuals/')) return { view: 'operator-visuals', chronicleId }
  const knowledgeDetail = /^\/operator\/knowledge\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i.exec(pathname)
  if (knowledgeDetail) return { view: 'operator-knowledge-detail', chronicleId, jobId: knowledgeDetail[1].toLowerCase() }
  if (pathname === '/operator/knowledge' || pathname === '/operator/knowledge/' || pathname.startsWith('/operator/knowledge/')) return { view: 'operator-knowledge', chronicleId }
  if (pathname === '/operator/vault' || pathname.startsWith('/operator/vault/')) return { view: 'operator-vault', chronicleId }
  if (pathname === '/operator/bunker-os' || pathname.startsWith('/operator/bunker-os/')) {
    const bunkerPath = pathname.slice('/operator/bunker-os'.length).replace(/^\\/+|\\/+$/g, '') || undefined
    return { view: 'operator-bunker-os', chronicleId, bunkerPath }
  }
  if (pathname === '/operator' || pathname === '/operator/' || pathname.startsWith('/operator/')) return { view: 'operator', chronicleId }
  const view = params.get('view')
  if (view === 'reader' || view === 'raw') return resolveReaderRoute({ view: 'raw', chronicleId, partId: params.get('part') ?? undefined }, storage)
  if (view === 'past') return { view: 'story', chronicleId }
  if (view === 'story' && requested) return resolveReaderRoute({ view: 'book', chronicleId, chapterId: params.get('chapter') ?? undefined }, storage)
  if (view === 'story') return { view: 'story', chronicleId }
  if (view === 'chronicle' && chronicleRegistry.some((chronicle) => chronicle.id === requested)) {
    const section = params.get('section') as ChronicleSection | null
    return { view: 'chronicle', chronicleId, section: section && sections.has(section) ? section : 'overview' }
  }
  if (view === 'tools') return { view: 'tools', chronicleId }
  if (view === 'media') return { view: 'media', chronicleId }
  if (view === 'wiki-preview') {
    const page = params.get('page')
    return {
      view: 'wiki-preview',
      chronicleId: requested ?? 'C03-AFTERFALL',
      nodeId: params.get('node') ?? undefined,
      page: page === 'chronicle' ? 'chronicle' : page === 'world' ? 'world' : page === 'worlds' ? 'worlds' : 'home',
    }
  }
  if (view === 'knowledge-preview') return { view: 'knowledge-preview', chronicleId, briefId: params.get('brief') ?? undefined }
  if (view === 'archive') return { view: 'archive', chronicleId: activeChronicle.id, nodeId: params.get('node') ?? undefined }
  return { view: 'wiki-preview', chronicleId: activeChronicle.id, page: 'home' }
}

export function archiveRouteUrl(route: ArchiveRoute, href: string): URL {
  const url = new URL(href)
  url.search = ''; url.hash = ''
  if (route.view === 'operator' || route.view === 'operator-visuals' || route.view === 'operator-knowledge' || route.view === 'operator-knowledge-detail' || route.view === 'operator-vault' || route.view === 'operator-bunker-os') {
    url.pathname = route.view === 'operator-visuals' ? '/operator/visuals/' : route.view === 'operator-knowledge' ? '/operator/knowledge/' : route.view === 'operator-knowledge-detail' ? `/operator/knowledge/${route.jobId}/` : route.view === 'operator-vault' ? '/operator/vault/' : route.view === 'operator-bunker-os' ? `/operator/bunker-os/${route.bunkerPath ? `${route.bunkerPath}/` : ''}` : '/operator/'
  } else if (route.view === 'archive') {
    url.pathname = '/'
    if (route.nodeId) {
    url.searchParams.set('view', 'archive'); url.searchParams.set('node', route.nodeId)
    }
  } else {
    url.pathname = '/'
    const isWikiHome = route.view === 'wiki-preview' && !route.nodeId && route.page !== 'chronicle' && route.page !== 'world' && route.page !== 'worlds'
    if (route.view !== 'home' && !isWikiHome) url.searchParams.set('view', route.view === 'book' ? 'story' : route.view)
    if (route.view === 'wiki-preview' && route.nodeId) url.searchParams.set('node', route.nodeId)
    if (route.view === 'knowledge-preview' && route.briefId) url.searchParams.set('brief', route.briefId)
    if (route.view === 'wiki-preview' && !route.nodeId && route.page === 'chronicle') url.searchParams.set('page', 'chronicle')
    if (route.view === 'wiki-preview' && !route.nodeId && route.page === 'worlds') url.searchParams.set('page', 'worlds')
    if (route.view === 'wiki-preview' && !route.nodeId && route.page === 'world') url.searchParams.set('page', 'world')
    if (route.view === 'chronicle' || route.view === 'book' || route.view === 'raw' || (route.view === 'wiki-preview' && (route.nodeId || route.page === 'chronicle' || route.page === 'world'))) url.searchParams.set('chronicle', route.chronicleId)
    if (route.view === 'chronicle' && route.section && route.section !== 'overview') url.searchParams.set('section', route.section)
    if (route.view === 'book' && route.chapterId) url.searchParams.set('chapter', route.chapterId)
    if (route.view === 'raw' && route.partId) url.searchParams.set('part', route.partId)
  }
  return url
}
