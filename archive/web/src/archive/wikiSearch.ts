import { isWikiSupportedNodeId, requireWikiNode, wikiNodeIndex } from './wikiDocument'
import { siteVisualsFor } from './siteVisual'

export type PublicSearchKind = 'wiki' | 'knowledge' | 'resource'

export type PublicSearchEntry = {
  id: string
  kind: PublicSearchKind
  kindLabel: string
  title: string
  subtitle: string
  summary: string
  href: string
  terms: string[]
}

type KnowledgeBrief = {
  id: string
  status: string
  slug: string
  published_at?: string
  label?: string
  title: string
  summary: string
  lead?: string
  scope?: string
  risk_level?: string
}

const knowledgeBriefs = import.meta.glob('../../../../knowledge/content/briefs/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, KnowledgeBrief>

const normalize = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('ko-KR')
  .replace(/[·/_,()[\]{}:;'"!?~—–-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const wikiEntries: PublicSearchEntry[] = wikiNodeIndex.map((item) => {
  const node = requireWikiNode(item.id)
  return {
    id: 'wiki:' + item.id,
    kind: 'wiki',
    kindLabel: node.type === 'character' ? '인물' : node.type === 'location' ? '장소' : '사건',
    title: node.label,
    subtitle: node.subtitle,
    summary: node.summary,
    href: '/?view=wiki-preview&node=' + encodeURIComponent(node.id),
    terms: [node.label, node.subtitle, node.summary, ...(node.tags ?? [])],
  }
})

export const publishedKnowledgeEntries: (PublicSearchEntry & { publishedAt?: string })[] = Object.values(knowledgeBriefs)
  .filter((brief) => brief.status === 'PUBLISHED')
  .map((brief) => ({
    id: 'knowledge:' + brief.id,
    kind: 'knowledge' as const,
    kindLabel: '생존 지식',
    title: brief.title,
    subtitle: brief.label ?? brief.scope ?? brief.id,
    summary: brief.summary ?? brief.lead ?? '',
    href: '/?view=knowledge-preview&brief=' + encodeURIComponent(brief.id),
    terms: [brief.id, brief.title, brief.label ?? '', brief.summary ?? '', brief.lead ?? '', brief.scope ?? ''],
    publishedAt: brief.published_at,
  }))
  .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.title.localeCompare(b.title, 'ko'))

const resourceEntries: PublicSearchEntry[] = siteVisualsFor('C03-AFTERFALL').map((asset) => {
  const node = requireWikiNode(asset.subject_id)
  return {
    id: 'resource:visual:' + asset.subject_id,
    kind: 'resource' as const,
    kindLabel: '공개 삽화',
    title: node.label + ' 삽화',
    subtitle: node.type === 'character' ? '인물 삽화' : node.type === 'location' ? '장소 삽화' : '세계관 삽화',
    summary: asset.caption ?? node.summary,
    href: isWikiSupportedNodeId(node.id)
      ? '/?view=wiki-preview&node=' + encodeURIComponent(node.id) + '#wiki-visuals'
      : '/?view=media',
    terms: [node.label, node.subtitle, node.summary, '삽화', '이미지', asset.caption ?? ''],
  }
})

export const publicSearchIndex: PublicSearchEntry[] = [
  ...wikiEntries,
  ...publishedKnowledgeEntries,
  ...resourceEntries,
]

const kindPriority: Record<PublicSearchKind, number> = {
  wiki: 0,
  knowledge: 1,
  resource: 2,
}

function scoreEntry(entry: PublicSearchEntry, normalizedQuery: string, queryTokens: string[]) {
  const title = normalize(entry.title)
  const subtitle = normalize(entry.subtitle)
  const summary = normalize(entry.summary)
  const terms = normalize(entry.terms.join(' '))
  let score = 0

  if (title === normalizedQuery) score += 120
  else if (title.startsWith(normalizedQuery)) score += 90
  else if (title.includes(normalizedQuery)) score += 70

  if (subtitle.includes(normalizedQuery)) score += 35
  if (summary.includes(normalizedQuery)) score += 18
  if (terms.includes(normalizedQuery)) score += 16

  const searchable = [title, subtitle, summary, terms].join(' ')
  if (queryTokens.every((token) => searchable.includes(token))) score += 22
  score += queryTokens.filter((token) => title.includes(token)).length * 12

  return score
}

export function searchPublicArchive(query: string, limit = 18): PublicSearchEntry[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return []
  const tokens = normalizedQuery.split(' ').filter(Boolean)

  return publicSearchIndex
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score
      || kindPriority[a.entry.kind] - kindPriority[b.entry.kind]
      || a.entry.title.localeCompare(b.entry.title, 'ko'))
    .slice(0, limit)
    .map(({ entry }) => entry)
}

export function searchResultGroups(results: readonly PublicSearchEntry[]) {
  return {
    wiki: results.filter((entry) => entry.kind === 'wiki'),
    knowledge: results.filter((entry) => entry.kind === 'knowledge'),
    resource: results.filter((entry) => entry.kind === 'resource'),
  }
}
