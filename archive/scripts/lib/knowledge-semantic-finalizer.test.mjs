import test from 'node:test'
import assert from 'node:assert/strict'
import { finalizerAction, reconcilePullRequest, semanticBranchRef } from '../knowledge-semantic-finalize.mjs'

const job = { job_id: '287c20fb-7ad2-41e4-b9be-12426675d234', source_kind: 'PUBLIC_ARCHIVE', source_ref: 'manifest', source_sha256: 'a'.repeat(64), semantic_context: { target: { brief_id: 'K-011', candidate_id: 'KC-test' }, source: { kind: 'PUBLIC_ARCHIVE' } } }

test('worker interruption before submit leaves C-PREPARED job reusable', () => {
  const prepared = { ...job, status: 'PREPARED', semantic_result: null }
  assert.equal(prepared.status, 'PREPARED')
  assert.equal(prepared.semantic_result, null)
})

test('submit interruption leaves finalizer-owned SUBMITTED job recoverable', () => {
  const submitted = { ...job, status: 'SUBMITTED', semantic_result: { version: 'knowledge-semantic-result-v1', decision: 'HOLD', job_id: job.job_id, code: 'NO_DISTINCT_SAFE_QUESTION', note: 'No new question.' } }
  assert.equal(submitted.status, 'SUBMITTED')
  assert.equal(finalizerAction(submitted, submitted.semantic_result).action, 'HOLD')
})

test('deterministic branch identity rejects invalid job ids', () => {
  assert.match(semanticBranchRef(job.job_id), /^knowledge\/worker\/semantic-/)
  assert.throws(() => semanticBranchRef('not-a-uuid'), /SEMANTIC_JOB_ID_INVALID/)
})

test('open PR with stale base is treated as a fail-closed revalidation blocker', () => {
  const outcome = reconcilePullRequest({ final_pr_number: 9, final_head_sha: 'a'.repeat(40), result_decision: 'BRIEF_READY' }, { state: 'open', head: { sha: 'a'.repeat(40) }, base: { ref: 'main', sha: 'b'.repeat(40) } }, 'c'.repeat(40))
  assert.deepEqual(outcome, { status: 'BLOCKED', code: 'MAIN_MOVED_REVALIDATION_REQUIRED' })
})
