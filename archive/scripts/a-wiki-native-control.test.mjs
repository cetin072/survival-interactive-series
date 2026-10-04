import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { discoverWikiSource } from './lib/wiki-semantic-jobs.mjs'
import { buildWikiFactJob, buildWikiFactReviewJob, WIKI_REVIEW_VERSION } from './lib/wiki-fact-extractor.mjs'
import { compileSubmittedExtractor, inspectSubmittedReview } from './a-wiki-native-control.mjs'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

async function session006Package() {
  const source = await discoverWikiSource(root)
  assert.equal(source.sourceSession.session_id, 'SESSION_006')
  const graph = JSON.parse(await readFile(resolve(root, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'), 'utf8'))
  const job = buildWikiFactJob(source, graph)
  const fixtures = JSON.parse(await readFile(resolve(root, 'archive/scripts/lib/fixtures/wiki-fact-results-v1.json'), 'utf8'))
  const result = { version: 'wiki-fact-result-v1', job_id: job.job_id, ...fixtures.SESSION_006_COMPLETE }
  return { job, result }
}

test('submitted Extractor compiles into one REVIEW_READY package', async () => {
  const { job, result } = await session006Package()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  assert.equal(compiled.action, 'REVIEW_READY')
  assert.equal(compiled.proposal.coverage.status, 'COMPLETE')
  assert.equal(compiled.reviewJob.prepared_job.job_id, job.job_id)
  assert.equal(compiled.reviewJob.proposal.proposal_sha256, compiled.proposal.proposal_sha256)
  assert.equal(compiled.reviewJob.prepared_job.source.gm_blocks.length, 7)
})

test('submitted independent APPROVE review advances to publication', async () => {
  const { job, result } = await session006Package()
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

test('submitted HUMAN_REVIEW never reaches publication', async () => {
  const { job, result } = await session006Package()
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

test('review package cannot be rebound to another proposal', async () => {
  const { job, result } = await session006Package()
  const compiled = compileSubmittedExtractor({
    status: 'EXTRACTOR_SUBMITTED',
    prepared_job: job,
    extractor_result: result,
  })
  const alteredProposal = structuredClone(compiled.proposal)
  alteredProposal.note += ' changed'
  const alteredReviewJob = buildWikiFactReviewJob(job, alteredProposal)
  assert.notEqual(alteredReviewJob.review_job_id, compiled.reviewJob.review_job_id)
})
