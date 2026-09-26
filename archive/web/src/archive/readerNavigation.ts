import { activeChronicle, transcriptPartsFor, type ChronicleId } from './transcriptData'
import { chaptersForChronicle, chronicleBooks } from './storyData'

export type ArchiveRoute = { view: 'archive' | 'story' | 'book' | 'raw'; chronicleId: ChronicleId; chapterId?: string; partId?: string; nodeId?: string }
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

export function parseArchiveRoute(search: string, storage?: ReaderStorage): ArchiveRoute {
  const params = new URLSearchParams(search)
  const requested = params.get('chronicle')
  const chronicleId = chronicleBooks.find((book) => book.chronicleId === requested)?.chronicleId ?? activeChronicle.id
  const view = params.get('view')
  if (view === 'reader' || view === 'raw') return resolveReaderRoute({ view: 'raw', chronicleId, partId: params.get('part') ?? undefined }, storage)
  if (view === 'past') return { view: 'story', chronicleId }
  if (view === 'story' && requested) return resolveReaderRoute({ view: 'book', chronicleId, chapterId: params.get('chapter') ?? undefined }, storage)
  if (view === 'story') return { view: 'story', chronicleId }
  return { view: 'archive', chronicleId, nodeId: params.get('node') ?? undefined }
}

export function archiveRouteUrl(route: ArchiveRoute, href: string): URL {
  const url = new URL(href)
  url.search = ''; url.hash = ''
  if (route.view === 'archive' && route.nodeId) {
    url.searchParams.set('view', 'archive'); url.searchParams.set('node', route.nodeId)
  } else if (route.view !== 'archive') {
    url.searchParams.set('view', route.view === 'book' ? 'story' : route.view)
    if (route.view !== 'story') url.searchParams.set('chronicle', route.chronicleId)
    if (route.view === 'book' && route.chapterId) url.searchParams.set('chapter', route.chapterId)
    if (route.view === 'raw' && route.partId) url.searchParams.set('part', route.partId)
  }
  return url
}
