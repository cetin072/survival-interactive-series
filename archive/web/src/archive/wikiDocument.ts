import publicGraph from '../../../content/graphs/C03-AFTERFALL/GRAPH.json'
import type { ArchiveNode, ArchiveNodeType } from './archiveData'
import { archiveArticleByNodeId, type ArchiveArticleSection, type ArchiveTimelineItem } from './archiveArticleData'
import { confirmedAppearanceFor } from './characterAppearance'
import { chapterForNode, type ReaderChapter } from './storyData'
import { siteVisualFor, type SiteAsset } from './siteVisual'

export type WikiDocumentRelation = {
  label: string
  nodeId: string
  title: string
  subtitle: string
  type: ArchiveNodeType
}

export type WikiDocumentMetaRow = {
  label: string
  value: string
}

export type WikiDocument = {
  id: string
  chronicleId: 'C03-AFTERFALL'
  type: ArchiveNodeType
  typeLabel: string
  title: string
  subtitle: string
  summary: string
  anchor: { gameTime: string; saveVersion: number }
  metaRows: WikiDocumentMetaRow[]
  appearance?: string
  lead: string[]
  sections: ArchiveArticleSection[]
  timeline: ArchiveTimelineItem[]
  relations: WikiDocumentRelation[]
  visual?: SiteAsset
  relatedChapter?: ReaderChapter
  transcriptPartIds: string[]
}

const typeLabels: Record<ArchiveNodeType, string> = {
  character: '인물',
  location: '장소',
  event: '사건',
  reference: '자료',
}

const metaValueLabels: Record<string, string> = {
  ACTIVE: '활동 중',
  INACTIVE: '비활성',
  CORE_FOUR: '핵심 4인',
}

const nodeById = new Map(
  publicGraph.nodes.map((record) => [record.id, record.data as ArchiveNode]),
)

export const wikiSupportedTypes: ArchiveNodeType[] = ['character', 'location', 'event']

const wikiIndexFor = (type: ArchiveNodeType) => publicGraph.nodes
  .map((record) => record.data as ArchiveNode)
  .filter((node) => node.type === type)
  .map((node) => ({ id: node.id, title: node.label, subtitle: node.subtitle, type: node.type }))
  .sort((a, b) => a.title.localeCompare(b.title, 'ko'))

export const wikiCharacterIndex = wikiIndexFor('character')
export const wikiLocationIndex = wikiIndexFor('location')
export const wikiEventIndex = wikiIndexFor('event')

export const wikiCharacterNodeIds = wikiCharacterIndex.map((item) => item.id)
export const wikiLocationNodeIds = wikiLocationIndex.map((item) => item.id)
export const wikiEventNodeIds = wikiEventIndex.map((item) => item.id)

export const wikiNodeIndex = [...wikiCharacterIndex, ...wikiLocationIndex, ...wikiEventIndex]
export const wikiSupportedNodeIds = wikiNodeIndex.map((item) => item.id)

export function isWikiSupportedNodeId(nodeId: string): boolean {
  return wikiSupportedNodeIds.includes(nodeId)
}

export function requireWikiNode(nodeId: string): ArchiveNode {
  const node = nodeById.get(nodeId)
  if (!node) throw new Error('Wiki source node missing: ' + nodeId)
  return node
}

function metaRowsFor(node: ArchiveNode): WikiDocumentMetaRow[] {
  const rows: WikiDocumentMetaRow[] = [
    { label: '유형', value: typeLabels[node.type] },
    { label: '생존기', value: 'C03 AFTERFALL' },
  ]

  if (node.subtitle) {
    rows.push({
      label: node.type === 'character' ? '역할' : node.type === 'event' ? '시점' : '설명',
      value: node.subtitle,
    })
  }

  for (const [label, rawValue] of Object.entries(node.meta ?? {})) {
    const value = String(rawValue)
    rows.push({ label, value: metaValueLabels[value] ?? value })
  }

  return rows
}

function relationsFor(nodeId: string): WikiDocumentRelation[] {
  return publicGraph.relations.flatMap((record) => {
    const data = record.data
    if (data.from !== nodeId && data.to !== nodeId) return []
    const otherId = data.from === nodeId ? data.to : data.from
    const other = nodeById.get(otherId)
    if (!other) return []
    return [{
      label: data.label,
      nodeId: other.id,
      title: other.label,
      subtitle: other.subtitle,
      type: other.type,
    }]
  })
}

export function buildWikiDocument(nodeId: string): WikiDocument {
  const graphRecord = publicGraph.nodes.find((record) => record.id === nodeId)
  if (!graphRecord) throw new Error('Wiki source record missing: ' + nodeId)

  const node = requireWikiNode(nodeId)
  const article = archiveArticleByNodeId[nodeId]
  const appearance = node.type === 'character' ? confirmedAppearanceFor(node)?.publicDescription : undefined

  return {
    id: node.id,
    chronicleId: 'C03-AFTERFALL',
    type: node.type,
    typeLabel: typeLabels[node.type],
    title: node.label,
    subtitle: node.subtitle,
    summary: node.summary,
    anchor: {
      gameTime: graphRecord.anchor.game_time,
      saveVersion: graphRecord.anchor.save_version,
    },
    metaRows: metaRowsFor(node),
    appearance,
    lead: article?.lead ?? [],
    sections: article?.sections ?? [],
    timeline: article?.timeline ?? [],
    relations: relationsFor(nodeId),
    visual: siteVisualFor(nodeId),
    relatedChapter: chapterForNode(nodeId),
    transcriptPartIds: article?.transcriptPartIds ?? [],
  }
}

export function buildWikiDocuments(nodeIds: readonly string[]): WikiDocument[] {
  return nodeIds.map(buildWikiDocument)
}
