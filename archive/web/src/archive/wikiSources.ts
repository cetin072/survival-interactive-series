import publishedSources from 'virtual:wiki-sources'

export type WikiSourceRecord = {
  id: string
  evidence: { source_ref: string; source_sha256: string; pointer: string }
}
export type WikiSourceLink = {
  chapterId: string
  chapterTitle: string
  partId: string
  partTitle: string
  archiveSourceRef: string
}
type PublishedSource = { nodeId: string; evidence: WikiSourceRecord['evidence']; links: WikiSourceLink[] }

// Only the build-verified, minimal link table reaches the client. Source bodies
// and their visibility/hash validation remain in wiki-public-sources.mjs.
const sourceKey = (id: string, evidence: WikiSourceRecord['evidence']) => JSON.stringify([
  id, evidence.source_ref, evidence.source_sha256, evidence.pointer,
])
const sourceLinks = new Map((publishedSources as PublishedSource[]).map((source) => [sourceKey(source.nodeId, source.evidence), source.links]))

export function wikiSourcesForRecord(record: WikiSourceRecord): WikiSourceLink[] {
  return sourceLinks.get(sourceKey(record.id, record.evidence)) ?? []
}
