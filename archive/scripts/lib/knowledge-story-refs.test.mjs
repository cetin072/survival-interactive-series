import test from 'node:test'
import assert from 'node:assert/strict'
import { validateStoryRefs, projectReaderStoryRefs } from './knowledge-story-refs.mjs'

const book = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const raw = 'worldlines/AFTERFALL/seasons/S02/raw_transcript/SESSION_001/PART_003.md'
const source = { kind: 'PUBLIC_READER', ref: `${book}#chapter-11`, sha256: 'a'.repeat(64),
  reader_book_ref: book, reader_book_sha256: 'b'.repeat(64), chapter_id: 'chapter-11',
  chapter_sha256: 'a'.repeat(64), refs: [raw], hashes: ['c'.repeat(64)] }
const job = { job_id: 'unchanged-job', source_kind: 'PUBLIC_READER', source_ref: source.ref,
  source_sha256: source.sha256, policy_sha256: 'd'.repeat(64), semantic_result_sha256: 'e'.repeat(64),
  result_decision: 'BRIEF_READY', semantic_context: { source } }
const result = { job_id: job.job_id, decision: 'BRIEF_READY', brief: { id: 'K-099', title: 'unchanged',
  story_refs: [source.ref, raw], risk_level: 'LOW', sections: [{ body: 'untouched' }] },
  candidate: { source_kind: 'PUBLIC_READER', reader_book_ref: book, reader_book_sha256: source.reader_book_sha256,
    reader_chapter_id: source.chapter_id, reader_chapter_sha256: source.sha256,
    source_refs: [raw], source_hashes: source.hashes }, evidence: { claims: ['untouched'] } }
const reservation = { status: 'VALID', job_id: job.job_id, brief_id: result.brief.id }
const project = (changes = {}) => projectReaderStoryRefs({ job, result, stories: [], reservation, ...changes })

test('paths fail strict registry validation before finalization', () => {
  assert.throws(() => validateStoryRefs(result.brief.story_refs, []), /SEMANTIC_STORY_REFS_INVALID/)
  assert.throws(() => validateStoryRefs(['https://example.com/raw'], []), /SEMANTIC_STORY_REFS_INVALID/)
})
test('valid story registry IDs are preserved in order', () => {
  const r = { ...result, brief: { ...result.brief, story_refs: ['registered-story'] } }
  assert.deepEqual(validateStoryRefs(r.brief.story_refs, [{ id: 'registered-story' }]), ['registered-story'])
  assert.equal(project({ result: r, stories: [{ id: 'registered-story' }], reservation: null }).result, r)
})
test('verified Reader projection removes only bound provenance, leaving the original immutable', () => {
  const before = JSON.stringify({ job, result })
  const p = project()
  assert.deepEqual(p.result.brief.story_refs, [])
  assert.deepEqual(p.result, { ...result, brief: { ...result.brief, story_refs: [] } })
  assert.equal(p.result.candidate, result.candidate)
  assert.equal(p.result.evidence, result.evidence)
  assert.equal(JSON.stringify({ job, result }), before)
  assert.deepEqual(p.receipt.removed_story_refs, result.brief.story_refs)
  assert.equal(p.receipt.semantic_result_sha256, job.semantic_result_sha256)
})
test('mixed registry IDs and bound paths retain only explicit IDs, never guess a mapping', () => {
  const r = { ...result, brief: { ...result.brief, story_refs: ['registered-story', raw] } }
  assert.deepEqual(project({ result: r, stories: [{ id: 'registered-story' }] }).result.brief.story_refs, ['registered-story'])
})
test('unknown IDs, unbound paths, URLs and incomplete provenance fail closed', () => {
  for (const ref of ['invented-id', 'archive/unbound.json', 'https://example.com']) {
    assert.throws(() => project({ result: { ...result, brief: { ...result.brief, story_refs: [ref] } } }), /SEMANTIC_STORY_REFS_INVALID/)
  }
  assert.throws(() => project({ result: { ...result, candidate: { ...result.candidate, source_hashes: [] } } }), /UNVERIFIED/)
})
test('wrong receipt, job identity, source kind or digest never permits compatibility projection', () => {
  for (const changes of [{ reservation: null }, { reservation: { ...reservation, job_id: 'other' } },
    { job: { ...job, semantic_result_sha256: null } }, { job: { ...job, source_kind: 'PUBLIC_ARCHIVE' } },
    { job: { ...job, source_sha256: 'f'.repeat(64) } }, { result: { ...result, job_id: 'other' } }])
    assert.throws(() => project(changes), /UNVERIFIED/)
})
