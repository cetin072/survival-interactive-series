import { activeChronicle } from './chronicleRegistry'
import { archiveRouteUrl } from './readerNavigation'

// Only names, order and existing destinations; no new router.
export const publicNavigation = [
  { id: 'knowledge', label: '생존 지식', href: '/knowledge/' },
  { id: 'tools', label: '자료실', href: '/?view=tools' },
  { id: 'story', label: '생존 이야기', href: '/?view=story' },
  { id: 'world', label: '세계관 위키', href: (() => {
    const url = archiveRouteUrl({ view: 'wiki-preview', page: 'world', chronicleId: activeChronicle.id }, 'https://archive.invalid/')
    return url.pathname + url.search
  })() },
] as const

export function currentPublicMenu(pathname: string, search: string) {
  if (pathname.startsWith('/knowledge/')) return 'knowledge'
  const params = new URLSearchParams(search)
  if (params.get('view') === 'tools') return 'tools'
  if (['story', 'past', 'book', 'chronicle', 'raw', 'reader'].includes(params.get('view') ?? '')) return 'story'
  if (params.get('view') === 'archive' || (params.get('view') === 'wiki-preview' && (params.has('node') || ['world', 'chronicle'].includes(params.get('page') ?? '')))) return 'world'
  return undefined
}
