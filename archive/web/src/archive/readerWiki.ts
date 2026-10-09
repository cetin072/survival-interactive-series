import packages from 'virtual:reader-wiki-seeds'
import { chronicleRegistry } from './chronicleRegistry'
import { readerChapters, type ReaderChapter } from './storyData'
import { transcriptPartsFor } from './transcriptData'
import type { WikiDocument } from './wikiDocument'

type Evidence = { chapterId: string; quote: string }
type SeedNode = { id: string; type: 'character' | 'location' | 'event'; title: string; subtitle: string; facts: { text: string; kind: string; evidence: Evidence }[] }
export type ReaderWikiSeed = { chronicleId: string; notice: string; nodes: SeedNode[]; relations: { from: string; to: string; label: string; evidence: Evidence }[] }
const seeds = (packages as ReaderWikiSeed[]).filter(seed => chronicleRegistry.some(chronicle => chronicle.id === seed.chronicleId))
const labels = { character: '인물', location: '장소', event: '사건' }

/** One supplied Chronicle only. Missing evidence links fail closed after build validation. */
export function buildReaderWikiDocuments(seed: ReaderWikiSeed, chapters: ReaderChapter[],
  parts: { id: string; title: string; source: string }[]): WikiDocument[] {
  const ownChapters = chapters.filter((chapter) => chapter.chronicleId === seed.chronicleId)
  return seed.nodes.map((node) => {
    const relatedRelations = seed.relations.filter((r) => r.from === node.id || r.to === node.id)
    const records = [...node.facts.map((fact) => ({ ...fact, label: fact.kind === 'REPORTED' ? '인물의 진술·전언' : '서사에 기록된 사실' })),
      ...relatedRelations.map((relation) => ({ text: relation.label, evidence: relation.evidence, label: '관계의 기록 근거' }))]
    const ids = new Set(records.map((record) => record.evidence.chapterId))
    const cited = ownChapters.filter((chapter) => ids.has(chapter.id)).sort((a,b) => a.chapterNumber - b.chapterNumber)
    if (cited.length !== ids.size || !cited.length) throw new Error('Reader Wiki chapter scope mismatch')
    const latest = cited.at(-1)!
    const sources = cited.flatMap((chapter) => chapter.archiveSourceRefs.map((ref, index) => {
      const part = parts.find((item) => item.source === (chapter.sourceRefs[index] ?? ref))
      if (!part) throw new Error('Reader Wiki RAW link missing: ' + seed.chronicleId)
      return { chapterId: chapter.id, chapterTitle: chapter.title, partId: part.id, partTitle: part.title, archiveSourceRef: ref }
    }))
    return {
      id: node.id, chronicleId: seed.chronicleId, type: node.type, typeLabel: labels[node.type], title: node.title, subtitle: node.subtitle,
      summary: node.facts.slice(-2).map((fact) => fact.text).join(' '),
      sourceOrder: latest.chapterNumber,
      anchor: { gameTime: '제' + latest.chapterNumber + '장 · ' + latest.title },
      metaRows: [{ label: '유형', value: labels[node.type] }, { label: '범위', value: '현재 공개된 Reader 기록' }],
      recordBasis: '공개 Reader 근거 · 위키 검수 후보', notice: seed.notice,
      quotes: records.map((record) => ({ text: record.text, quote: record.evidence.quote,
        chapterId: record.evidence.chapterId, chapterTitle: cited.find((chapter) => chapter.id === record.evidence.chapterId)!.title,
        kind: record.label })),
      lead: [], sections: [], timeline: [], history: [], activities: [], sources, relatedChapter: latest,
      relations: relatedRelations.map((relation) => {
        const other = seed.nodes.find((item) => item.id === (relation.from === node.id ? relation.to : relation.from))
        if (!other) throw new Error('Reader Wiki relation scope mismatch')
        return { nodeId: other.id, type: other.type, title: other.title, subtitle: other.subtitle,
          label: relation.from === node.id ? relation.label : '관련 기록 · ' + relation.label }
      }),
      transcriptPartIds: [...new Set(sources.map((source) => source.partId))],
    }
  })
}
export const readerWikiChronicleIds = seeds.map((seed) => seed.chronicleId)
export function readerWikiDocuments(chronicleId: string): WikiDocument[] {
  const seed = seeds.find((item) => item.chronicleId === chronicleId)
  return seed ? buildReaderWikiDocuments(seed, readerChapters, transcriptPartsFor(chronicleId)) : []
}
export const allReaderWikiDocuments = seeds.flatMap((seed) => readerWikiDocuments(seed.chronicleId))
