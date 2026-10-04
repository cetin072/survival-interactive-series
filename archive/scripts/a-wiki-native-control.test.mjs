import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byteHash, reconcilePublicGraph } from './lib/publication-graph.mjs'
import {
  buildWikiFactJob, buildWikiFactReviewJob, WIKI_REVIEW_VERSION,
} from './lib/wiki-fact-extractor.mjs'
import {
  compileSubmittedExtractor, inspectSubmittedReview, mergedPublication,
} from './a-wiki-native-control.mjs'

const NS = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const ANCHOR = { save_version: 10, game_time: '2027-01-01 12:00' }
const seed = {
  id: 'char-existing', label: '기존인물', type: 'character',
  subtitle: '기존 역할', summary: '기존 공개 설명', tags: ['기존태그'],
  source: 'SYNTHETIC_TEST_ONLY',
}
const book = { chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', chapters: [] }
const bookSource = { source_ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json', source_sha256: 'b'.repeat(64) }

function batch(anchor) {
  return {
    batch_id: 'batch-' + 'a'.repeat(64),
    snapshot: { ...NS, season_id: 'S03', source_save_version: anchor.save_version, source_game_time: anchor.game_time },
  }
}

function syntheticPackage() {
  const facts = {
    version: 'public-graph-facts-v1', ...NS, season_id: 'S03', anchor: ANCHOR,
    nodes: [seed], relations: [],
  }
  const graph = reconcilePublicGraph({
    batch: batch(ANCHOR),
    facts,
    source: {
      source_ref: 'archive/content/public-facts/C03-AFTERFALL/S03/TEST.json',
      source_sha256: 'a'.repeat(64),
    },
    book,
    bookSource,
  }).graph

  const body = '제어시험인물은 제어시험작업장에서 일한다.'
  const source = {
    sourceSession: { session_id: 'SESSION_999' },
    sourceManifestRef: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/SOURCE_MANIFEST.json',
    sourceDigest: 'c'.repeat(64),
    rawRef: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/PART_001.md',
    rawSha256: byteHash(body),
    anchor: { save_version: 11, game_time: '2027-01-02 12:00' },
    gmBlocks: [{ messageLabel: '001', body }],
  }
  const job = buildWikiFactJob(source, graph)
  const proof = (fields) => Object.fromEntries(fields.map((field) => [field, ['q1']]))
  const result = {
    version: 'wiki-fact-result-v1',
    job_id: job.job_id,
    decision: 'FACTS_READY',
    coverage: { status: 'COMPLETE', reviewed_blocks: ['001'] },
    nodes: [
      {
        key: 'new:person', existing_id: null, type: 'character', label: '제어시험인물',
        changes: { subtitle: '작업자', summary: '제어시험작업장에서 일한다.' },
        evidence: proof(['type', 'label', 'subtitle', 'summary']),
      },
      {
        key: 'new:place', existing_id: null, type: 'location', label: '제어시험작업장',
        changes: { subtitle: '작업 장소', summary: '제어시험인물의 작업 장소다.' },
        evidence: proof(['type', 'label', 'subtitle', 'summary']),
      },
    ],
    relations: [
      { from: 'new:person', to: 'new:place', kind: 'works_at', label: '근무', evidence: ['q1'] },
    ],
    citations: [
      { id: 'q1', block_id: '001', quote: body },
    ],
    deferred: [],
    note: 'SYNTHETIC_TEST_ONLY',
  }
  return { job, result }
}

test('submitted Extractor compiles into one REVIEW_READY package', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  assert.equal(compiled.action, 'REVIEW_READY')
  assert.equal(compiled.proposal.coverage.status, 'COMPLETE')
  assert.equal(compiled.reviewJob.prepared_job.job_id, job.job_id)
  assert.equal(compiled.reviewJob.proposal.proposal_sha256, compiled.proposal.proposal_sha256)
  assert.equal(compiled.reviewJob.prepared_job.source.gm_blocks.length, 1)
})

test('submitted independent APPROVE review advances to publication', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  const review = {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: compiled.proposal.proposal_sha256,
    decision: 'APPROVE',
    note: 'Test-only independent full-source review.',
  }
  const disposition = inspectSubmittedReview({
    status: 'REVIEW_SUBMITTED',
    review_job: compiled.reviewJob,
    review_result: review,
  })
  assert.equal(disposition.action, 'PUBLISH')
})

test('submitted HUMAN_REVIEW never reaches publication', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  const review = {
    version: WIKI_REVIEW_VERSION,
    proposal_sha256: compiled.proposal.proposal_sha256,
    decision: 'HUMAN_REVIEW',
    note: 'Material durable fact may be missing.',
  }
  const disposition = inspectSubmittedReview({
    status: 'REVIEW_SUBMITTED',
    review_job: compiled.reviewJob,
    review_result: review,
  })
  assert.equal(disposition.action, 'HUMAN_REVIEW')
})

test('review package rejects a mutated proposal', () => {
  const { job, result } = syntheticPackage()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  const alteredProposal = structuredClone(compiled.proposal)
  alteredProposal.note += ' changed'
  assert.throws(() => buildWikiFactReviewJob(job, alteredProposal), /WIKI_REVIEW_PROPOSAL_HASH_INVALID/)
})

test('merged publication recovery accepts only the exact publication branch and main target', () => {
  const branch = 'automation/a-wiki-publish-006-14675b020602'
  const result = mergedPublication({
    number: 372,
    state: 'MERGED',
    headRefName: branch,
    headRefOid: '4'.repeat(40),
    baseRefName: 'main',
    mergeCommit: { oid: 'a'.repeat(40) },
  }, branch)
  assert.deepEqual(result, {
    status: 'MERGED',
    branch,
    prNumber: 372,
    headSha: '4'.repeat(40),
    mergeSha: 'a'.repeat(40),
  })
  assert.throws(() => mergedPublication({
    number: 372,
    state: 'MERGED',
    headRefName: 'other-branch',
    headRefOid: '4'.repeat(40),
    baseRefName: 'main',
    mergeCommit: { oid: 'a'.repeat(40) },
  }, branch), /A_WIKI_MERGED_PR_BINDING_INVALID/)
  assert.equal(mergedPublication({ state: 'OPEN' }, branch), null)
})
