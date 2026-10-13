// story_refs links to the Knowledge registry. Narrative provenance belongs to
// the immutable Candidate and prepared source binding, never to this relation.
export function validateStoryRefs(refs, stories) {
  const ids = new Set(stories.map((story) => story.id))
  if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== 'string' || !ids.has(ref)))
    throw new Error('SEMANTIC_STORY_REFS_INVALID')
  return refs
}

export function projectReaderStoryRefs({ job, result, stories, reservation }) {
  const refs = result.brief.story_refs
  const ids = new Set(stories.map((story) => story.id))
  if (!Array.isArray(refs)) throw new Error('SEMANTIC_STORY_REFS_INVALID')
  const removed = refs.filter((ref) => !ids.has(ref))
  if (!removed.length) return { result, receipt: null }
  const source = job.semantic_context?.source
  const candidate = result.candidate
  // The VALID receipt is obtained with the exact original source/policy/result
  // digests by verifyBriefReservation, after the source bytes pass verifyPins.
  if (reservation?.status !== 'VALID' || reservation.job_id !== job.job_id
      || reservation.brief_id !== result.brief.id
      || !/^[a-f0-9]{64}$/.test(job.semantic_result_sha256 ?? '')
      || job.source_kind !== 'PUBLIC_READER' || source?.kind !== 'PUBLIC_READER'
      || result.job_id !== job.job_id || result.decision !== job.result_decision
      || source.ref !== job.source_ref || source.sha256 !== job.source_sha256
      || candidate.reader_book_ref !== source.reader_book_ref
      || candidate.reader_book_sha256 !== source.reader_book_sha256
      || candidate.reader_chapter_id !== source.chapter_id
      || candidate.reader_chapter_sha256 !== source.chapter_sha256
      || JSON.stringify(candidate.source_refs) !== JSON.stringify(source.refs)
      || JSON.stringify(candidate.source_hashes) !== JSON.stringify(source.hashes))
    throw new Error('SEMANTIC_STORY_REFS_PROJECTION_UNVERIFIED')
  const provenance = new Set([job.source_ref, candidate.reader_book_ref, ...candidate.source_refs])
  if (removed.some((ref) => typeof ref !== 'string' || !ref.includes('/') || !provenance.has(ref)))
    throw new Error('SEMANTIC_STORY_REFS_INVALID')
  const storyRefs = refs.filter((ref) => ids.has(ref))
  // No guessed mapping. All other result fields remain identical.
  return {
    result: { ...result, brief: { ...result.brief, story_refs: storyRefs } },
    receipt: { version: 'knowledge-story-refs-projection-v1', job_id: job.job_id,
      brief_id: result.brief.id, semantic_result_sha256: job.semantic_result_sha256,
      source_sha256: job.source_sha256, policy_sha256: job.policy_sha256,
      removed_story_refs: removed, story_refs: storyRefs },
  }
}
