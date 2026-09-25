import { chronicleRegistry, type ChronicleId } from './chronicleRegistry'
import { assertReaderManifest } from './readerManifestContract'

export type ReaderSourceKind = 'VERIFIED_GM_NARRATIVE' | 'EDITORIAL_CANON_BRIDGE'
export type ReaderChapter = {
  id: string; chronicleId: ChronicleId; seasonId?: string; partId?: string; arcLabel?: string
  chapterNumber: number; title: string; subtitle?: string; dateLabel?: string; body: string
  relatedNodeIds: string[]; sourceKind: ReaderSourceKind; sourceRefs: string[]; archiveSourceRefs: string[]; sourceHashes: string[]; supportingRefs: string[]; transformVersion: string
}
export type ReaderCoverage = { verifiedRawParts: number; scanned: number; eligibleGmProse: number; included: number; omitted: { sourceRef: string; archiveSourceRef: string; reason: string }[] }
export type ChronicleBook = {
  chronicleId: ChronicleId; title: string; protagonist: string; worldlineId: string; subtitle: string
  description: string; sourceRoot: string; transformVersion: string; coverage?: ReaderCoverage
}
type BookFile = Omit<ChronicleBook, 'chronicleId'> & { chronicleId: ChronicleId; chapters: Omit<ReaderChapter, 'chronicleId'>[] }

const manifests = import.meta.glob('../../../content/stories/*/BOOK.json', { eager: true, import: 'default' }) as Record<string, BookFile>
const files = Object.values(manifests).map(assertReaderManifest)
export const chronicleBooks: ChronicleBook[] = chronicleRegistry.filter((item) => item.readerAvailable).map((registry) => {
  const book = files.find((file) => file.chronicleId === registry.id)
  if (!book) throw new Error('Reader manifest missing for ' + registry.id)
  return { chronicleId: registry.id, title: registry.title, protagonist: registry.protagonist, worldlineId: registry.worldlineId, subtitle: book.subtitle, description: book.description, sourceRoot: registry.sourceRoot, transformVersion: book.transformVersion, coverage: book.coverage }
})
export const readerChapters: ReaderChapter[] = files.flatMap((book) => book.chapters.map((chapter) => ({ ...chapter, chronicleId: book.chronicleId })))
export const chaptersForChronicle = (chronicleId: ChronicleId) => readerChapters.filter((chapter) => chapter.chronicleId === chronicleId)
export const chapterForNode = (nodeId: string) => readerChapters.find((chapter) => chapter.relatedNodeIds.includes(nodeId))

// Raw vault summaries are intentionally separate from Reader Edition prose.
export const seasonSummaries = { S01: { title: 'Season 1', description: '원문 보관소의 시즌 기록입니다.' }, S02: { title: 'Season 2', description: '원문 보관소의 시즌 기록입니다.' } } as const
