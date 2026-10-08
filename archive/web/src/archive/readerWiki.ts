import packages from 'virtual:reader-wiki-seeds'
import { readerChapters } from './storyData'
import { transcriptPartsFor } from './transcriptData'
import type { WikiDocument } from './wikiDocument'

type Evidence = { chapterId: string; bodySha256: string; quote: string }
type SeedNode = { id: string; type: 'character' | 'location' | 'event'; title: string; subtitle: string; facts: { text: string; kind: string; evidence: Evidence }[] }
type Seed = { chronicleId: string; notice: string; nodes: SeedNode[]; relations: { from: string; to: string; label: string; evidence: Evidence }[] }
const seeds = packages as Seed[]
const labels = { character: '인물', location: '장소', event: '사건' }

export function readerWikiDocuments(chronicleId: string): WikiDocument[] {
  const seed = seeds.find((item) => item.chronicleId === chronicleId)
  if (!seed) return []
  const chapters = readerChapters.filter((chapter) => chapter.chronicleId === chronicleId)
  const parts = transcriptPartsFor(chronicleId)
  return seed.nodes.map((node) => {
    const relatedRelations = seed.relations.filter((r) => r.from === node.id || r.to === node.id)
    const ids = new Set([...node.facts.map((fact) => fact.evidence.chapterId), ...relatedRelations.map((r) => r.evidence.chapterId)])
    const cited = chapters.filter((chapter) => ids.has(chapter.id))
    const latest = cited.at(-1)!
    const sources = cited.map((chapter) => {
      const part = parts.find((item) => chapter.archiveSourceRefs.includes(item.source) || chapter.sourceRefs.includes(item.source))
      return { chapterId: chapter.id, chapterTitle: chapter.title, partId: part?.id ?? '', partTitle: part?.title ?? '', archiveSourceRef: chapter.archiveSourceRefs[0] }
    })
    return {
      id: node.id, chronicleId, type: node.type, typeLabel: labels[node.type], title: node.title, subtitle: node.subtitle,
      summary: node.facts.map((fact) => fact.text).join(' '),
      anchor: { gameTime: (latest.dateLabel ?? '') + ' · ' + latest.title },
      metaRows: [{ label: '유형', value: labels[node.type] }, { label: '범위', value: '공개 Reader 기반 · 일부 기본 기록' }],
      recordBasis: '공개 Reader 근거 · 기본 위키', notice: seed.notice,
      quotes: node.facts.map((fact) => ({ text: fact.text, quote: fact.evidence.quote,
        chapterId: fact.evidence.chapterId, chapterTitle: chapters.find((c) => c.id === fact.evidence.chapterId)!.title,
        kind: fact.kind === 'REPORTED' ? '인물의 진술·전언' : '서사에 기록된 사실' })),
      lead: [], sections: [], timeline: [], history: [], activities: [], sources,
      relatedChapter: latest,
      relations: relatedRelations.map((r) => {
        const other = seed.nodes.find((item) => item.id === (r.from === node.id ? r.to : r.from))!
        return { nodeId: other.id, type: other.type, title: other.title, subtitle: other.subtitle,
          label: r.from === node.id ? r.label : '관련 기록 · ' + r.label }
      }),
      transcriptPartIds: sources.map((source) => source.partId).filter(Boolean),
    }
  })
}
export const readerWikiChronicleIds = seeds.map((seed) => seed.chronicleId)
export const allReaderWikiDocuments = seeds.flatMap((seed) => readerWikiDocuments(seed.chronicleId))
