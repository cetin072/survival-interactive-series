import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { buildSemanticContext, chapterHash, makeWorkKey, nextBriefId, reservedCandidateId, selectBackfillChapter, validateSemanticResult } from './knowledge-semantic-jobs.mjs'
import { finalizerAction, semanticBranchRef, reconcilePullRequest, verifyPins } from '../knowledge-semantic-finalize.mjs'
import { detectLegacyWorkerBlocker, planSemanticPreparation } from '../knowledge-semantic-prepare.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const sourceRef = 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_001/SOURCE_MANIFEST.json'
const sourceBytes = Buffer.from('{"fixture":"public"}\n')
const sourceSha = digest(sourceBytes)
const baseJob = {
  job_id: '287c20fb-7ad2-41e4-b9be-12426675d234', status: 'FINALIZING', job_type: 'FRESH_BRIEF',
  source_kind: 'PUBLIC_ARCHIVE', source_ref: sourceRef, source_sha256: sourceSha,
  semantic_context: {
    target: { brief_id: 'K-011', candidate_id: 'KC-session-001-abcdef1234' },
    source: { kind: 'PUBLIC_ARCHIVE', ref: sourceRef, sha256: sourceSha, refs: [], hashes: [] },
  },
}
const packageResult = (decision = 'BRIEF_READY') => ({
  version: 'knowledge-semantic-result-v1', job_id: baseJob.job_id, decision,
  ...(decision === 'HUMAN_REVIEW' ? { code: 'RISK_REVIEW', note: 'Risk requires a person.' } : {}),
  candidate: { id: 'KC-session-001-abcdef1234', brief_id: 'K-011', topic_id: 'T-PREP', status: 'BRIEF_PROPOSED', source_kind: 'PUBLIC_ARCHIVE', source_manifest_ref: sourceRef, source_manifest_sha256: sourceSha },
  evidence: { brief_id: 'K-011', claims: [{ claim: 'Fixture claim', source_ids: ['S1'], context: 'Public fact', limitation: 'Limited scope' }] },
  brief: { id: 'K-011', topic_id: 'T-PREP', content_type: 'BRIEF', status: 'READY', risk_level: decision === 'HUMAN_REVIEW' ? 'HIGH' : 'LOW', publication_policy: decision === 'HUMAN_REVIEW' ? 'HUMAN_APPROVED' : 'AUTO_LOW_RISK', semantic_qa_status: decision === 'HUMAN_REVIEW' ? 'REVIEW' : 'PASS' },
})

test('C-PREP is a no-op with no source and active work prevents concurrent preparation', () => {
  assert.deepEqual(planSemanticPreparation({ activeJobs: [], scanner: { sources: [] }, backfillIsDue: false }), { decision: 'NOOP', code: 'NO_FRESH_BACKFILL_NOT_DUE' })
  assert.equal(planSemanticPreparation({ activeJobs: [{ job_id: 'active' }], scanner: { sources: [] } }).code, 'ACTIVE_SEMANTIC_JOB_EXISTS')
})

test('C-PREP prioritizes oldest eligible fresh source and excludes durable handled identities', () => {
  const one = { status: 'PENDING', source_manifest_ref: 'a', source_manifest_sha256: 'a'.repeat(64) }
  const two = { status: 'PENDING', source_manifest_ref: 'b', source_manifest_sha256: 'b'.repeat(64) }
  const result = planSemanticPreparation({ activeJobs: [], handledJobs: [{ job_type: 'FRESH_BRIEF', source_kind: 'PUBLIC_ARCHIVE', source_ref: 'a', source_sha256: 'a'.repeat(64), status: 'HOLD' }], scanner: { sources: [two, one] }, backfillIsDue: true, backfillChoice: { sourceRef: 'reader' } })
  assert.equal(result.decision, 'FRESH')
  assert.equal(result.source.source_manifest_ref, 'b')
})

test('C-PREP only selects BACKFILL when no fresh source is pending', () => {
  const backfillChoice = { sourceRef: 'reader#chapter-1' }
  assert.equal(planSemanticPreparation({ activeJobs: [], scanner: { sources: [] }, backfillIsDue: true, backfillChoice }).decision, 'BACKFILL')
})

test('legacy branch guard ignores squash-integrated content but blocks a genuinely unmerged package', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'semantic-branch-guard-'))
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git(['init', '-b', 'main'])
    git(['config', 'user.name', 'test'])
    git(['config', 'user.email', 'test@example.invalid'])
    await mkdir(join(cwd, 'knowledge/content/briefs'), { recursive: true })
    await writeFile(join(cwd, 'knowledge/content/briefs/K-008.json'), '{"id":"K-008"}\n')
    git(['add', '.']); git(['commit', '-m', 'base'])
    const base = git(['rev-parse', 'HEAD'])
    git(['checkout', '-b', 'legacy-package'])
    await writeFile(join(cwd, 'knowledge/content/briefs/K-009.json'), '{"id":"K-009"}\n')
    git(['add', '.']); git(['commit', '-m', 'old worker package'])
    const oldPackage = git(['rev-parse', 'HEAD'])
    git(['checkout', 'main'])
    await writeFile(join(cwd, 'knowledge/content/briefs/K-009.json'), '{"id":"K-009"}\n')
    git(['add', '.']); git(['commit', '-m', 'squashed package'])
    const current = git(['rev-parse', 'HEAD'])
    git(['update-ref', 'refs/remotes/origin/knowledge/worker/effective-merged', oldPackage])
    const mergedBranch = { name: 'knowledge/worker/effective-merged' }
    assert.equal(detectLegacyWorkerBlocker({ openPrs: [], branchRows: [mergedBranch], baseRef: current, cwd }), null)

    git(['checkout', '-b', 'orphan'])
    await writeFile(join(cwd, 'knowledge/content/briefs/K-011.json'), '{"id":"K-011"}\n')
    git(['add', '.']); git(['commit', '-m', 'orphan package'])
    const orphan = git(['rev-parse', 'HEAD'])
    git(['update-ref', 'refs/remotes/origin/knowledge/worker/orphan', orphan])
    assert.equal(detectLegacyWorkerBlocker({ openPrs: [], branchRows: [{ name: 'knowledge/worker/orphan' }], baseRef: current, cwd }), 'LEGACY_WORKER_BRANCH_UNMERGED:knowledge/worker/orphan')
  } finally { await rm(cwd, { recursive: true, force: true }) }
})

test('reserved identities and verified Reader selection are stable and exclude reviewed work', () => {
  const workKey = makeWorkKey({ sourceKind: 'PUBLIC_READER', sourceRef: 'archive/content/stories/C03-AFTERFALL/BOOK.json#ch-1', sourceSha256: '1'.repeat(64) })
  assert.equal(reservedCandidateId(workKey), reservedCandidateId(workKey))
  const chapter = { id: 'ch-1', chapterNumber: 1, sourceKind: 'VERIFIED_GM_NARRATIVE', body: 'story', sourceRefs: ['public/ref'], sourceHashes: ['2'.repeat(64)] }
  const book = { chapters: [chapter] }
  const choice = selectBackfillChapter({ book, candidates: [] })
  assert.equal(choice.chapter.id, 'ch-1')
  assert.equal(choice.chapterSha, chapterHash(chapter))
  assert.equal(selectBackfillChapter({ book, candidates: [], reviewedWorkKeys: [choice.workKey] }), null)
})

test('semantic context is compact and bounded', () => {
  const data = { candidates: [], briefs: [], topics: [], config: { publication_mode: 'AUTO_LOW_RISK_SHADOW', auto_publish_enabled: false } }
  const context = buildSemanticContext({ jobType: 'FRESH_BRIEF', source: { kind: 'PUBLIC_ARCHIVE', ref: sourceRef, sha256: sourceSha }, target: { brief_id: 'K-011', candidate_id: 'KC-test' }, existingKnowledge: data, policy: { version: 2, editorial_spec_ref: 'docs/spec.md', research_policy: { minimum_authoritative_sources_per_brief: 2 }, candidate_policy: { allowed_auto_risk_domains: [], high_risk_domains: [] } }, excerpt: 'x'.repeat(8000) })
  assert.equal(context.source.excerpt.length, 5000)
  assert.equal(context.policy.publication_mode, 'AUTO_LOW_RISK_SHADOW')
})

test('result contract binds BRIEF_READY and HUMAN_REVIEW packages to one job and reserved target', () => {
  assert.equal(validateSemanticResult(baseJob, packageResult()).briefId, 'K-011')
  assert.equal(validateSemanticResult(baseJob, packageResult('HUMAN_REVIEW')).decision, 'HUMAN_REVIEW')
  assert.throws(() => validateSemanticResult(baseJob, { ...packageResult(), job_id: 'stale' }), /SEMANTIC_RESULT_JOB_BINDING_MISMATCH/)
  assert.throws(() => validateSemanticResult(baseJob, { ...packageResult(), extra: true }), /SEMANTIC_RESULT_PROPERTY_UNKNOWN/)
  assert.throws(() => validateSemanticResult(baseJob, { version: 'knowledge-semantic-result-v1', job_id: baseJob.job_id, decision: 'HOLD', code: 'NO_DISTINCT_SAFE_QUESTION', note: 'No distinct safe question.', brief: {} }), /SEMANTIC_HOLD_PACKAGE_FORBIDDEN/)
  assert.throws(() => validateSemanticResult(baseJob, { ...packageResult(), brief: { ...packageResult().brief, id: 'K-012' } }), /SEMANTIC_RESERVED_ID_MISMATCH/)
})

test('HOLD is terminal intent and does not create a content package', () => {
  const result = { version: 'knowledge-semantic-result-v1', job_id: baseJob.job_id, decision: 'HOLD', code: 'NO_DISTINCT_SAFE_QUESTION', note: 'No distinct safe question.' }
  assert.deepEqual(finalizerAction(baseJob, result), { action: 'HOLD', code: result.code })
})

test('finalizer uses a deterministic worker branch and routes review packages to the existing review path', () => {
  assert.equal(semanticBranchRef(baseJob.job_id), semanticBranchRef(baseJob.job_id))
  assert.match(semanticBranchRef(baseJob.job_id), /^knowledge\/worker\/semantic-/)
  assert.deepEqual(finalizerAction(baseJob, packageResult('HUMAN_REVIEW')), { action: 'PACKAGE', humanReview: true, briefId: 'K-011' })
})

test('PR reconciliation requires the exact submitted head and records only a merged exact head', () => {
  const job = { result_decision: 'BRIEF_READY', final_pr_number: 51, final_head_sha: 'a'.repeat(40) }
  assert.deepEqual(reconcilePullRequest(job, { state: 'open', merged: false, head: { sha: 'a'.repeat(40) }, base: { ref: 'main' } }), { status: 'PR_OPEN' })
  assert.deepEqual(reconcilePullRequest(job, { state: 'closed', merged: true, merge_commit_sha: 'b'.repeat(40), head: { sha: 'a'.repeat(40) } }), { status: 'PUBLISHED', mergeSha: 'b'.repeat(40) })
  assert.deepEqual(reconcilePullRequest(job, { state: 'open', merged: false, head: { sha: 'c'.repeat(40) }, base: { ref: 'main' } }), { status: 'BLOCKED', code: 'PR_HEAD_CHANGED' })
})

test('source and policy pins fail closed on modified bytes', async () => {
  const base = await mkdtemp(join(tmpdir(), 'semantic-pins-'))
  try {
    const policy = Buffer.from('{"version":2}')
    const config = Buffer.from('{"publication_mode":"AUTO_LOW_RISK_SHADOW","auto_publish_enabled":false}')
    const editorial = Buffer.from('editorial v1')
    for (const [ref, bytes] of [['knowledge/automation/worker-policy.json', policy], ['knowledge/automation/config.json', config], ['docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md', editorial], [sourceRef, sourceBytes]]) {
      const path = join(base, ref)
      await mkdir(join(path, '..'), { recursive: true })
      await writeFile(path, bytes)
    }
    const { hashPolicyBytes } = await import('./knowledge-semantic-jobs.mjs')
    const policyHash = hashPolicyBytes(policy, config, editorial)
    const job = { ...baseJob, policy_sha256: policyHash, policy_pin: { sha256: policyHash }, semantic_context: { ...baseJob.semantic_context, source: { ...baseJob.semantic_context.source, hashes: [] }, policy: { publication_mode: 'AUTO_LOW_RISK_SHADOW', auto_publish_enabled: false } } }
    await verifyPins(job, base)
    await writeFile(join(base, sourceRef), 'modified')
    await assert.rejects(verifyPins(job, base), /SEMANTIC_SOURCE_SHA_CHANGED/)
  } finally { await rm(base, { recursive: true, force: true }) }
})
