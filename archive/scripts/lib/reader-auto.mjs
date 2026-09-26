/** Only explicitly approved, hash-checked new sources get the automatic fallback. */
import { createHash } from 'node:crypto'
const hash = (text) => createHash('sha256').update(text).digest('hex')
export const automaticTransformVersion = 'reader-auto-v1'

export function appendAutomaticChapters(chronicleId, parts, chapters, coveredPaths) {
  const result = [...chapters]
  const seen = new Set(parts.map((p) => p.archivePath))
  if (seen.size !== parts.length) throw new Error('DUPLICATE_READER_SOURCE')
  for (const part of [...parts].sort((a, b) => a.archivePath.localeCompare(b.archivePath))) {
    if (coveredPaths.has(part.archivePath)) continue
    const proof = part.autoPublication
    if (!proof || proof.visibility !== 'PUBLIC_ARCHIVE' || !proof.rawSha256 || !proof.sourceManifestSha256) throw new Error('UNAPPROVED_AUTOMATIC_SOURCE')
    if (!part.readerBody?.trim()) throw new Error('EMPTY_AUTOMATIC_CHAPTER')
    if (!part.archivePath.startsWith(`archive/content/transcripts/${chronicleId}/`)) throw new Error('CROSS_CHRONICLE_AUTOMATIC_SOURCE')
    // Derive a title only from a retained heading, never ask a model to invent one.
    const heading = part.readerBody.match(/^#{1,4}\s+(.+)$/m)?.[1]
    const title = heading?.replace(/[\[\]<>*_`]/g, '').trim().slice(0, 100) || `${part.group} · ${proof.sessionId} · ${proof.part}`
    result.push({
      id: `${chronicleId.toLowerCase()}-auto-${hash(part.archivePath)}`,
      chapterNumber: result.length + 1, title, subtitle: '공개 기록 1건',
      dateLabel: `${proof.capturedRange.start} → ${proof.capturedRange.end}`,
      seasonId: part.group, arcLabel: '공개 플레이 기록', sourceKind: 'VERIFIED_GM_NARRATIVE',
      sourceRefs: [part.canonicalRef], archiveSourceRefs: [part.archivePath], sourceHashes: [part.sourceHash],
      supportingRefs: [], transformVersion: automaticTransformVersion, relatedNodeIds: [],
      body: part.readerBody,
      publicationProvenance: structuredClone(proof),
    })
  }
  if (new Set(result.map((c) => c.id)).size !== result.length) throw new Error('DUPLICATE_CHAPTER_ID')
  return result
}

/** Existing editions are immutable to this automatic append path; corrections need review. */
export function checkAppendOnlyEdition(previous, next, allowedSourceRefs) {
  if (previous.chronicleId !== next.chronicleId || previous.worldlineId !== next.worldlineId) throw new Error('BOOK_NAMESPACE_CHANGED')
  if (!Array.isArray(previous.chapters) || !Array.isArray(next.chapters)) throw new Error('INVALID_BOOK')
  if (new Set(next.chapters.map((c) => c.id)).size !== next.chapters.length) throw new Error('DUPLICATE_CHAPTER_ID')
  if (next.chapters.length < previous.chapters.length) throw new Error('EXISTING_CHAPTER_REMOVED')
  for (let i = 0; i < previous.chapters.length; i++) {
    if (JSON.stringify(previous.chapters[i]) !== JSON.stringify(next.chapters[i])) throw new Error('EXISTING_CHAPTER_CHANGED')
  }
  const additions = next.chapters.slice(previous.chapters.length)
  for (const chapter of additions) {
    if (!chapter.body?.trim() || chapter.publicationProvenance?.visibility !== 'PUBLIC_ARCHIVE') throw new Error('UNVERIFIED_CHAPTER')
    const ref = chapter.publicationProvenance.sourceManifestRef
    if (!allowedSourceRefs.has(ref)) throw new Error('CHAPTER_OUTSIDE_BATCH')
  }
  return additions
}

/** Scope only new additions to this batch; later already-published chapters are retained. */
export function selectTextBatchCatalog(catalog, previous, snapshot) {
  const allowed = new Map(snapshot.sources.filter((s) => s.atomic_pairing_complete === true).map((s) => [s.source_ref, s]))
  const existing = new Set([
    ...previous.chapters.flatMap((c) => c.archiveSourceRefs ?? []),
    ...(previous.coverage?.omitted ?? []).map((s) => s.archiveSourceRef),
  ])
  return catalog.filter((part) => {
    const proof = part.autoPublication
    if (!proof) return true
    const source = allowed.get(proof.sourceManifestRef)
    if (source) {
      if (proof.capturedRange.start !== source.captured_message_range.start || proof.capturedRange.end !== source.captured_message_range.end || proof.capturedRange.end > snapshot.source_game_time) throw new Error('SOURCE_AFTER_BATCH_BOUNDARY')
      return true
    }
    // Retention is not fresh publication. checkAppendOnlyEdition still rejects every edit.
    return existing.has(part.archivePath)
  })
}
