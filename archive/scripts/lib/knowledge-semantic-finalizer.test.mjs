import test from 'node:test'
import assert from 'node:assert/strict'
import { finalizerAction, reconcilePullRequest, runSemanticFinalizer, semanticBranchRef } from '../knowledge-semantic-finalize.mjs'

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

const packagedResult = (decision = 'BRIEF_READY') => ({
  version: 'knowledge-semantic-result-v1', job_id: job.job_id, decision,
  ...(decision === 'HUMAN_REVIEW' ? { code: 'RISK_REVIEW', note: 'Risk requires a person.' } : {}),
  candidate: { id: 'KC-test', brief_id: 'K-011', topic_id: 'T-1', status: 'BRIEF_PROPOSED', source_kind: 'PUBLIC_ARCHIVE', source_manifest_ref: 'manifest', source_manifest_sha256: 'a'.repeat(64) },
  evidence: { brief_id: 'K-011', claims: [{ claim: 'Claim', source_ids: ['S1'], context: 'Context', limitation: 'Limit' }] },
  brief: { id: 'K-011', topic_id: 'T-1', content_type: 'BRIEF', status: 'READY', risk_level: decision === 'HUMAN_REVIEW' ? 'HIGH' : 'LOW', publication_policy: decision === 'HUMAN_REVIEW' ? 'HUMAN_APPROVED' : 'AUTO_LOW_RISK', semantic_qa_status: decision === 'HUMAN_REVIEW' ? 'REVIEW' : 'PASS' },
})

function finalizerHarness({ claimedJob, openJobs = [], pullRequest = null } = {}) {
  const calls = []
  const requestRpc = async (name, args) => {
    calls.push(['rpc', name, args])
    if (name === 'archive_knowledge_semantic_job_claim_finalizer') return claimedJob
    if (name === 'archive_knowledge_semantic_job_list_reconcile') return openJobs
    return { ok: true }
  }
  const shell = (command, args) => {
    calls.push(['shell', command, args])
    if (args[0] === 'api') return JSON.stringify(pullRequest)
    return ''
  }
  return { calls, requestRpc, shell }
}

test('finalizer orchestration sends BRIEF_READY through package, draft PR, and PR_OPEN persistence', async () => {
  const result = packagedResult()
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { ...job, status: 'FINALIZING', result_decision: result.decision, semantic_result: result } })
  const seen = []
  const outcome = await runSemanticFinalizer({
    requestRpc, shell, mainSha: 'b'.repeat(40),
    verifyPinsFn: async () => ({ context: job.semantic_context }),
    packageSemantic: async (_job, _result, pins) => { seen.push(['package', pins]); return { head_sha: 'c'.repeat(40), release_decision: 'WOULD_AUTO_PUBLISH' } },
    createDraft: async (_job, _result, headRef, headSha) => { seen.push(['draft', headRef, headSha]); return { number: 12, url: 'https://example.invalid/pr/12' } },
  })
  assert.equal(outcome.status, 'PR_OPEN')
  assert.equal(outcome.pr_number, 12)
  assert.equal(outcome.head_sha, 'c'.repeat(40))
  assert.equal(seen[0][0], 'package')
  assert.equal(seen[1][0], 'draft')
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'PR_OPEN'))
})

test('finalizer orchestration records HOLD without packaging or opening a PR', async () => {
  const result = { version: 'knowledge-semantic-result-v1', job_id: job.job_id, decision: 'HOLD', code: 'NO_DISTINCT_SAFE_QUESTION', note: 'No distinct safe question.' }
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { ...job, status: 'FINALIZING', semantic_result: result } })
  const outcome = await runSemanticFinalizer({ requestRpc, shell, mainSha: 'b'.repeat(40), packageSemantic: async () => assert.fail('HOLD must not package'), createDraft: async () => assert.fail('HOLD must not open a PR') })
  assert.equal(outcome.status, 'HOLD')
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'HOLD'))
})

test('finalizer orchestration enqueues HUMAN_REVIEW after packaging and persists review state', async () => {
  const result = packagedResult('HUMAN_REVIEW')
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { ...job, status: 'FINALIZING', result_decision: result.decision, semantic_result: result } })
  let enqueued = 0
  const outcome = await runSemanticFinalizer({
    requestRpc, shell, mainSha: 'b'.repeat(40),
    verifyPinsFn: async () => ({ context: job.semantic_context }),
    packageSemantic: async () => ({ head_sha: 'd'.repeat(40), release_decision: 'HUMAN_REVIEW_REQUIRED' }),
    createDraft: async () => ({ number: 13, url: 'https://example.invalid/pr/13' }),
    enqueueReviewEntry: async (payload) => { enqueued += 1; assert.equal(payload.p_payload.brief_id, 'K-011') },
  })
  assert.equal(outcome.status, 'HUMAN_REVIEW', JSON.stringify(outcome))
  assert.equal(enqueued, 1)
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'HUMAN_REVIEW'))
})

test('finalizer blocks a changed pinned source before packaging or opening a PR', async () => {
  const result = packagedResult()
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { ...job, status: 'FINALIZING', result_decision: result.decision, semantic_result: result } })
  const outcome = await runSemanticFinalizer({
    requestRpc, shell, mainSha: 'b'.repeat(40),
    verifyPinsFn: async () => { throw new Error('SEMANTIC_SOURCE_SHA_CHANGED') },
    packageSemantic: async () => assert.fail('changed source must not be packaged'),
    createDraft: async () => assert.fail('changed source must not open a PR'),
  })
  assert.equal(outcome.status, 'BLOCKED')
  assert.equal(outcome.blocker_code, 'SEMANTIC_SOURCE_SHA_CHANGED')
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'BLOCKED'))
})

test('no new submit reconciles an exact-head PR but blocks and closes when main moved', async () => {
  const submitted = { ...job, status: 'PR_OPEN', result_decision: 'BRIEF_READY', final_pr_number: 14, final_head_sha: 'e'.repeat(40) }
  const stalePr = { state: 'open', merged: false, head: { sha: 'e'.repeat(40) }, base: { ref: 'main', sha: 'f'.repeat(40) } }
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { status: 'NO_SUBMITTED_JOB' }, openJobs: [submitted], pullRequest: stalePr })
  const outcome = await runSemanticFinalizer({ requestRpc, shell, mainSha: '0'.repeat(40) })
  assert.equal(outcome.status, 'RECONCILED')
  assert.deepEqual(outcome.jobs[0], { job_id: job.job_id, status: 'BLOCKED', code: 'MAIN_MOVED_REVALIDATION_REQUIRED' })
  assert.ok(calls.some((call) => call[0] === 'shell' && call[1] === 'gh' && call[2][0] === 'pr' && call[2][1] === 'close'))
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'BLOCKED'))
})
