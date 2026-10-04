import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { applySemanticPackage, buildSemanticContext, chapterHash, hashPolicyBytes, knowledgeOperationalDate, makeWorkKey, nextBriefId, reservedCandidateId, selectBackfillChapter, validateSemanticResult } from './knowledge-semantic-jobs.mjs'
import { finalizerAction, semanticBranchRef, reconcilePullRequest, runSemanticFinalizer, verifyPins } from '../knowledge-semantic-finalize.mjs'
import { runPackage } from '../knowledge-semantic-finalize.mjs'
import { detectLegacyWorkerBlocker, planSemanticPreparation, selectExperienceSeed } from '../knowledge-semantic-prepare.mjs'

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
  candidate: { id: 'KC-session-001-abcdef1234', brief_id: 'K-011', topic_id: 'T-PREP', status: 'BRIEF_PROPOSED', source_kind: 'PUBLIC_ARCHIVE', source_manifest_ref: sourceRef, source_manifest_sha256: sourceSha, question: '짧고 분명한 생존 질문은 무엇일까?' },
  evidence: { brief_id: 'K-011', question: '짧고 분명한 생존 질문은 무엇일까?', claims: [{ claim: 'Fixture claim', source_ids: ['S1'], context: 'Public fact', limitation: 'Limited scope' }] },
  brief: { id: 'K-011', title: '짧고 분명한 생존 질문은 무엇일까?', topic_id: 'T-PREP', content_type: 'BRIEF', status: 'READY', risk_level: decision === 'HUMAN_REVIEW' ? 'HIGH' : 'LOW', publication_policy: decision === 'HUMAN_REVIEW' ? 'HUMAN_APPROVED' : 'AUTO_LOW_RISK', semantic_qa_status: decision === 'HUMAN_REVIEW' ? 'REVIEW' : 'PASS' },
})

test('Knowledge operational date follows Asia/Seoul across the UTC midnight boundary', () => {
  assert.equal(knowledgeOperationalDate('2026-10-03T14:59:59.000Z'), '2026-10-03')
  assert.equal(knowledgeOperationalDate('2026-10-03T15:00:00.000Z'), '2026-10-04')
  assert.equal(knowledgeOperationalDate('2026-10-03T16:28:03.320Z'), '2026-10-04')
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

test('C-PREP chooses FRESH then EXPERIENCE_SEED then due BACKFILL, once per run', () => {
  const seed = { sourceRef: 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json' }
  const reader = { sourceRef: 'reader#chapter-1' }
  const fresh = { status: 'PENDING', source_manifest_ref: 'fresh', source_manifest_sha256: 'a'.repeat(64) }
  assert.equal(planSemanticPreparation({ activeJobs: [], scanner: { sources: [fresh] }, experienceChoice: seed, backfillIsDue: true, backfillChoice: reader }).decision, 'FRESH')
  assert.equal(planSemanticPreparation({ activeJobs: [], scanner: { sources: [] }, experienceChoice: seed, backfillIsDue: true, backfillChoice: reader }).decision, 'EXPERIENCE_SEED')
  assert.equal(planSemanticPreparation({ activeJobs: [], scanner: { sources: [] }, backfillIsDue: true, backfillChoice: reader }).decision, 'BACKFILL')
  assert.equal(planSemanticPreparation({ activeJobs: [{ status: 'HUMAN_REVIEW' }], scanner: { sources: [] }, experienceChoice: seed, backfillIsDue: true, backfillChoice: reader }).decision, 'NOOP')
})

test('EX-001 is a deterministic Seed candidate and a handled identity is not selected again', async () => {
  const base = resolve(import.meta.dirname, '../../..')
  const choice = await selectExperienceSeed({ base })
  assert.equal(choice.seedId, 'EX-001')
  assert.equal(choice.sourceKind, 'EXPERIENCE_SEED')
  assert.equal(choice.sourceSha256.length, 64)
  assert.equal(await selectExperienceSeed({ base, handledJobs: [{ source_kind: 'EXPERIENCE_SEED', source_ref: choice.sourceRef, status: 'HOLD' }] }), null)
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

    git(['update-ref', 'refs/remotes/origin/knowledge/worker/semantic-287c20fb-7ad2-41e4-b9be-12426675d234', orphan])
    assert.equal(detectLegacyWorkerBlocker({
      openPrs: [{ state: 'OPEN', number: 501, headRefName: 'knowledge/worker/semantic-287c20fb-7ad2-41e4-b9be-12426675d234' }],
      branchRows: [{ name: 'knowledge/worker/semantic-287c20fb-7ad2-41e4-b9be-12426675d234' }],
      baseRef: current,
      cwd,
    }), null)
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

  const readerContext = buildSemanticContext({
    jobType: 'BACKFILL_BRIEF',
    source: {
      kind: 'PUBLIC_READER',
      ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json#ch-1',
      sha256: '1'.repeat(64),
      chapter_id: 'ch-1',
      chapter_sha256: '1'.repeat(64),
      reader_book_sha256: '3'.repeat(64),
      refs: ['public/ref'],
      hashes: ['2'.repeat(64)],
    },
    target: { brief_id: 'K-011', candidate_id: 'KC-reader-test' },
    existingKnowledge: data,
    policy: { version: 2, editorial_spec_ref: 'docs/spec.md', research_policy: { minimum_authoritative_sources_per_brief: 2 }, candidate_policy: { allowed_auto_risk_domains: [], high_risk_domains: [] } },
    excerpt: 'reader',
  })
  assert.equal(readerContext.source.reader_book_sha256, '3'.repeat(64))
  assert.throws(() => buildSemanticContext({
    jobType: 'BACKFILL_BRIEF',
    source: { kind: 'PUBLIC_READER', ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json#ch-1', sha256: '1'.repeat(64), chapter_id: 'ch-1', chapter_sha256: '1'.repeat(64), refs: ['public/ref'], hashes: ['2'.repeat(64)] },
    target: { brief_id: 'K-011', candidate_id: 'KC-reader-test' },
    existingKnowledge: data,
    policy: { version: 2, editorial_spec_ref: 'docs/spec.md', research_policy: { minimum_authoritative_sources_per_brief: 2 }, candidate_policy: { allowed_auto_risk_domains: [], high_risk_domains: [] } },
    excerpt: 'reader',
  }), /SEMANTIC_READER_BOOK_SHA_REQUIRED/)
})

test('result contract binds BRIEF_READY and HUMAN_REVIEW packages to one job and reserved target', () => {
  assert.equal(validateSemanticResult(baseJob, packageResult()).briefId, 'K-011')
  assert.equal(validateSemanticResult(baseJob, packageResult('HUMAN_REVIEW')).decision, 'HUMAN_REVIEW')
  assert.throws(() => validateSemanticResult(baseJob, { ...packageResult(), brief: { ...packageResult().brief, title: '다른 질문' } }), /SEMANTIC_QUESTION_TITLE_MISMATCH/)
  assert.throws(() => validateSemanticResult(baseJob, { ...packageResult(), job_id: 'stale' }), /SEMANTIC_RESULT_JOB_BINDING_MISMATCH/)
  assert.throws(() => validateSemanticResult(baseJob, { ...packageResult(), extra: true }), /SEMANTIC_RESULT_PROPERTY_UNKNOWN/)
  assert.throws(() => validateSemanticResult(baseJob, { version: 'knowledge-semantic-result-v1', job_id: baseJob.job_id, decision: 'HOLD', code: 'NO_DISTINCT_SAFE_QUESTION', note: 'No distinct safe question.', brief: {} }), /SEMANTIC_HOLD_PACKAGE_FORBIDDEN/)
  assert.throws(() => validateSemanticResult(baseJob, { ...packageResult(), brief: { ...packageResult().brief, id: 'K-012' } }), /SEMANTIC_RESERVED_ID_MISMATCH/)
})

test('EX-001 requires a full ELECTRICAL HUMAN_REVIEW package and experience is provenance only', () => {
  const ref = 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
  const seedJob = {
    ...baseJob, source_kind: 'EXPERIENCE_SEED', source_ref: ref,
    semantic_context: { ...baseJob.semantic_context, source: { kind: 'EXPERIENCE_SEED', ref, sha256: sourceSha, refs: [], hashes: [] } },
  }
  const original = packageResult('HUMAN_REVIEW')
  const result = {
    ...original,
    candidate: { ...original.candidate, source_kind: 'EXPERIENCE_SEED', experience_seed_ref: ref, experience_seed_sha256: sourceSha },
    evidence: { ...original.evidence, story_source_status: 'EXPERIENCE_PROVENANCE_ONLY' },
    brief: { ...original.brief, risk_domains: ['ELECTRICAL'] },
  }
  assert.equal(validateSemanticResult(seedJob, result).decision, 'HUMAN_REVIEW')
  assert.throws(() => validateSemanticResult(seedJob, { ...result, evidence: { ...result.evidence, story_source_status: 'VERIFIED_PUBLIC_ARCHIVE' } }), /SEMANTIC_EXPERIENCE_EVIDENCE_BOUNDARY_INVALID/)
  assert.throws(() => validateSemanticResult(seedJob, { ...result, brief: { ...result.brief, risk_domains: ['GENERAL_PREPAREDNESS'] } }), /SEMANTIC_EX001_RISK_DOWNGRADE_FORBIDDEN/)
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

test('Reader provenance may be verified from the canonical AFTERFALL worldline branch when bytes are not on main', async () => {
  const base = await mkdtemp(join(tmpdir(), 'semantic-reader-worldline-'))
  const git = (args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    const policy = Buffer.from('{"version":2}')
    const config = Buffer.from('{"publication_mode":"AUTO_LOW_RISK","auto_publish_enabled":true}')
    const editorial = Buffer.from('editorial v1')
    for (const [ref, bytes] of [
      ['knowledge/automation/worker-policy.json', policy],
      ['knowledge/automation/config.json', config],
      ['docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md', editorial],
    ]) {
      const file = join(base, ref)
      await mkdir(join(file, '..'), { recursive: true })
      await writeFile(file, bytes)
    }

    const provenanceRef = 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_001.md'
    const provenanceBytes = Buffer.from('verified worldline provenance\n')
    const provenanceHash = digest(provenanceBytes)
    const chapter = {
      id: 'ch-worldline',
      chapterNumber: 1,
      sourceKind: 'VERIFIED_GM_NARRATIVE',
      body: 'Verified Reader body',
      sourceRefs: [provenanceRef],
      sourceHashes: [provenanceHash],
    }
    const bookPath = join(base, 'archive/content/stories/C03-AFTERFALL/BOOK.json')
    await mkdir(join(bookPath, '..'), { recursive: true })
    await writeFile(bookPath, JSON.stringify({ chapters: [chapter] }))

    git(['init', '-b', 'main'])
    git(['config', 'user.name', 'test'])
    git(['config', 'user.email', 'test@example.invalid'])
    git(['add', '.'])
    git(['commit', '-m', 'main reader snapshot'])

    git(['checkout', '-b', 'worldline-source'])
    const provenancePath = join(base, provenanceRef)
    await mkdir(join(provenancePath, '..'), { recursive: true })
    await writeFile(provenancePath, provenanceBytes)
    git(['add', provenanceRef])
    git(['commit', '-m', 'worldline provenance'])
    const sourceCommit = git(['rev-parse', 'HEAD'])
    git(['update-ref', 'refs/remotes/origin/worldline/afterfall-rpg', sourceCommit])
    git(['checkout', 'main'])

    const policyHash = hashPolicyBytes(policy, config, editorial)
    const chapterSha = chapterHash(chapter)
    const readerJob = {
      ...baseJob,
      source_kind: 'PUBLIC_READER',
      source_ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json#ch-worldline',
      source_sha256: chapterSha,
      policy_sha256: policyHash,
      policy_pin: { sha256: policyHash },
      semantic_context: {
        target: { brief_id: 'K-011', candidate_id: 'KC-worldline-reader' },
        source: {
          kind: 'PUBLIC_READER',
          ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json#ch-worldline',
          sha256: chapterSha,
          chapter_id: 'ch-worldline',
          chapter_sha256: chapterSha,
          reader_book_sha256: 'a'.repeat(64),
          refs: [provenanceRef],
          hashes: [provenanceHash],
        },
        policy: { publication_mode: 'AUTO_LOW_RISK', auto_publish_enabled: true },
      },
    }
    await verifyPins(readerJob, base)

    git(['checkout', 'worldline-source'])
    await writeFile(provenancePath, 'modified provenance\n')
    git(['add', provenanceRef])
    git(['commit', '-m', 'change worldline provenance'])
    const changedCommit = git(['rev-parse', 'HEAD'])
    git(['update-ref', 'refs/remotes/origin/worldline/afterfall-rpg', changedCommit])
    git(['checkout', 'main'])
    await assert.rejects(verifyPins(readerJob, base), /SEMANTIC_SOURCE_SHA_CHANGED/)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('C-FINALIZER package application persists one validated BRIEF_READY disposition in an isolated repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-package-e2e-'))
  const repositoryRoot = resolve(import.meta.dirname, '../../..')
  try {
    await Promise.all([
      cp(join(repositoryRoot, 'knowledge'), join(root, 'knowledge'), { recursive: true }),
      cp(join(repositoryRoot, 'archive/content'), join(root, 'archive/content'), { recursive: true }),
      cp(join(repositoryRoot, 'archive/web/public'), join(root, 'archive/web/public'), { recursive: true }),
    ])
    const { loadKnowledge, validateKnowledge } = await import('./knowledge-content.mjs')
    const fixtureData = await loadKnowledge(root)
    const briefId = nextBriefId(fixtureData.briefs)
    const referenceBrief = JSON.parse(await readFile(join(root, 'knowledge/content/briefs/K-010.json'), 'utf8'))
    const referenceCandidate = JSON.parse(await readFile(join(root, 'knowledge/content/candidates/KC-community-mutual-aid-agreement.json'), 'utf8'))
    const referenceEvidence = JSON.parse(await readFile(join(root, 'knowledge/content/evidence/K-010.json'), 'utf8'))
    const candidateId = 'KC-semantic-test-integration'
    const question = '어떤 일반 자원 목록과 인수 기록을 미리 정해 두면 공동체 간 물품 인계를 확인하기 쉬울까'
    const sourceRef = 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/SOURCE_MANIFEST.json'
    const sourceSha = 'f'.repeat(64)
    const syntheticJob = {
      ...baseJob,
      status: 'FINALIZING',
      source_ref: sourceRef,
      source_sha256: sourceSha,
      semantic_context: {
        target: { brief_id: briefId, candidate_id: candidateId },
        source: { kind: 'PUBLIC_ARCHIVE', ref: sourceRef, sha256: sourceSha, refs: [], hashes: [] },
      },
    }
    const candidate = {
      ...referenceCandidate,
      id: candidateId,
      brief_id: briefId,
      question,
      source_manifest_ref: sourceRef,
      source_manifest_sha256: sourceSha,
    }
    const brief = {
      ...referenceBrief,
      id: briefId,
      slug: 'semantic-worker-package-fixture',
      label: '공동 물품 인계 기록',
      title: question,
      summary: '공동체 사이의 일반 물품 인계를 사전에 정한 목록과 실제 인수 기록으로 확인하는 방법을 정리합니다.',
      meta_description: '저위험 일반 재난대비에서 물품 인계 목록과 실제 인수 기록을 구분해 관리하는 방법을 설명합니다.',
      lead: '공동으로 보관하거나 전달하는 일반 물품은 약속한 수량과 실제 인수량을 분리해 기록하면 확인이 쉬워집니다.',
      status: 'READY',
      source_checked_at: '2026-10-04',
      published_at: '2026-10-04',
      updated_at: '2026-10-04',
    }
    const evidence = { ...referenceEvidence, brief_id: briefId, question }
    const result = { version: 'knowledge-semantic-result-v1', job_id: syntheticJob.job_id, decision: 'BRIEF_READY', candidate, evidence, brief }

    const applied = await applySemanticPackage({ root, job: syntheticJob, result, now: '2026-10-03T16:28:03.320Z' })
    assert.equal(applied.brief_id, briefId)
    assert.equal(applied.candidate_id, candidateId)
    const completed = await loadKnowledge(root)
    await validateKnowledge(completed)
    assert.equal(completed.briefs.find((item) => item.id === briefId).status, 'READY')
    assert.equal(completed.briefs.find((item) => item.id === briefId).updated_at, '2026-10-04')
    assert.equal(completed.evidence.get(briefId).question, question)
    assert.ok(applied.changed_files.includes('knowledge/automation/state.json'))
    const state = JSON.parse(await readFile(join(root, 'knowledge/automation/state.json'), 'utf8'))
    assert.equal(state.sources.find((item) => item.source_manifest_ref === sourceRef)?.status, 'PROCESSED')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('C-FINALIZER drives an exact-target package through a Git worker branch to PR_OPEN', async () => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-finalizer-package-git-'))
  const remote = await mkdtemp(join(tmpdir(), 'semantic-finalizer-origin-'))
  const repositoryRoot = resolve(import.meta.dirname, '../../..')
  const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    await Promise.all([
      cp(join(repositoryRoot, 'knowledge'), join(root, 'knowledge'), { recursive: true }),
      cp(join(repositoryRoot, 'archive/content'), join(root, 'archive/content'), { recursive: true }),
      cp(join(repositoryRoot, 'archive/web/public'), join(root, 'archive/web/public'), { recursive: true }),
      cp(join(repositoryRoot, 'archive/scripts'), join(root, 'archive/scripts'), { recursive: true }),
      cp(join(repositoryRoot, 'docs'), join(root, 'docs'), { recursive: true }),
    ])
    await mkdir(join(root, 'archive/web'), { recursive: true })
    await writeFile(join(root, 'archive/web/package.json'), '{"private":true,"type":"module"}\n')

    const { loadKnowledge } = await import('./knowledge-content.mjs')
    const fixtureData = await loadKnowledge(root)
    const briefId = nextBriefId(fixtureData.briefs)

    const sourceRef = 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/SOURCE_MANIFEST.json'
    const sourceDir = join(root, 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999')
    await mkdir(sourceDir, { recursive: true })
    const referenceManifest = JSON.parse(await readFile(join(root, 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_005/SOURCE_MANIFEST.json'), 'utf8'))
    const partName = referenceManifest.parts[0]
    const referencePart = join(root, 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_005', partName)
    const partBytes = await readFile(referencePart)
    await writeFile(join(sourceDir, partName), partBytes)
    const sourceManifest = {
      ...referenceManifest,
      session_id: 'SESSION_999',
      source_session_uuid: '90000000-0000-4000-8000-000000000999',
      publication_segment_id: `segment-${digest(Buffer.from('semantic-finalizer-test'))}`,
    }
    const manifestBytes = Buffer.from(`${JSON.stringify(sourceManifest, null, 2)}\n`)
    await writeFile(join(root, sourceRef), manifestBytes)
    const sourceSha = digest(manifestBytes)
    const partRef = `archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/${partName}`
    const partSha = digest(partBytes)

    const candidateId = 'KC-semantic-finalizer-git-fixture'
    const question = '어떤 일반 물품 인계 목록을 미리 정해 두면 공동체 간 인수를 확인하기 쉬울까'
    const templateBrief = JSON.parse(await readFile(join(root, 'knowledge/content/briefs/K-010.json'), 'utf8'))
    const templateCandidate = JSON.parse(await readFile(join(root, 'knowledge/content/candidates/KC-community-mutual-aid-agreement.json'), 'utf8'))
    const templateEvidence = JSON.parse(await readFile(join(root, 'knowledge/content/evidence/K-010.json'), 'utf8'))
    const candidate = {
      ...templateCandidate, id: candidateId, brief_id: briefId, question,
      disposition_note: 'Synthetic package used only by the isolated C-FINALIZER Git integration test.',
      source_manifest_ref: sourceRef, source_manifest_sha256: sourceSha,
    }
    const brief = {
      ...templateBrief, id: briefId, slug: 'semantic-finalizer-git-fixture',
      label: '공동 물품 인계 기록', title: question,
      summary: '공동체 간 일반 물품의 약속 수량과 실제 인수량을 기록으로 확인하는 방법을 정리합니다.',
      meta_description: '일반 물품 인계 목록과 실제 인수 기록을 구분해 관리하는 방법을 설명합니다.',
      lead: '일반 물품을 여러 조직이 함께 다룰 때는 약속한 수량과 실제 인수량을 분리해 기록하면 확인이 쉬워집니다.',
      status: 'READY', updated_at: '2026-10-01',
    }
    const evidence = { ...templateEvidence, brief_id: briefId, question }
    const configBytes = await readFile(join(root, 'knowledge/automation/config.json'))
    const config = JSON.parse(configBytes.toString('utf8'))
    const policyBytes = await readFile(join(root, 'knowledge/automation/worker-policy.json'))
    const editorialBytes = await readFile(join(root, 'docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md'))
    const policySha = hashPolicyBytes(policyBytes, configBytes, editorialBytes)
    const job = {
      ...baseJob,
      status: 'FINALIZING', source_ref: sourceRef, source_sha256: sourceSha,
      prepared_at: '2026-10-01T12:00:00.000Z', policy_sha256: policySha,
      policy_pin: { sha256: policySha },
      semantic_context: {
        target: { brief_id: briefId, candidate_id: candidateId },
        source: { kind: 'PUBLIC_ARCHIVE', ref: sourceRef, sha256: sourceSha, refs: [partRef], hashes: [partSha] },
        policy: { publication_mode: config.publication_mode, auto_publish_enabled: config.auto_publish_enabled },
      },
    }
    const result = { version: 'knowledge-semantic-result-v1', job_id: job.job_id, decision: 'BRIEF_READY', candidate, evidence, brief }

    git(['init', '-b', 'main'])
    git(['config', 'user.name', 'C3 integration test'])
    git(['config', 'user.email', 'c3-integration@example.invalid'])
    git(['config', 'core.autocrlf', 'false'])
    git(['add', '.'])
    git(['commit', '-m', 'test fixture base'])
    const baseSha = git(['rev-parse', 'HEAD'])
    execFileSync('git', ['init', '--bare', remote], { cwd: root, stdio: 'ignore' })
    git(['remote', 'add', 'origin', remote])
    git(['push', 'origin', 'main'])
    git(['update-ref', 'refs/remotes/origin/main', baseSha])

    const runCommand = (command, args, cwd, env = {}) => {
      if (command !== 'npm') return execFileSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      if (args[0] === 'ci' || (args[0] === 'run' && args[1] === 'knowledge:test')) return ''
      if (args[0] === 'run' && args[1] === 'knowledge:build') {
        return execFileSync(process.execPath, ['../scripts/build-knowledge.mjs'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      }
      if (args[0] === 'run' && args[1] === 'knowledge:check') {
        execFileSync(process.execPath, ['../scripts/build-knowledge.mjs', '--check'], { cwd, stdio: 'ignore' })
        return execFileSync(process.execPath, ['../scripts/knowledge-scan.mjs', '--check'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      }
      throw new Error(`Unexpected npm command in isolated test: ${args.join(' ')}`)
    }
    const headRef = semanticBranchRef(job.job_id)
    const finalizingJob = { ...job, status: 'FINALIZING', result_decision: 'BRIEF_READY', semantic_result: result, finalizer_attempt_count: 0 }
    const rpcCalls = []
    const requestRpc = async (name, args) => {
      rpcCalls.push({ name, args })
      if (name === 'archive_knowledge_semantic_job_claim_finalizer') return finalizingJob
      if (name === 'archive_knowledge_semantic_job_update') return { status: args.p_status }
      throw new Error(`Unexpected RPC in isolated finalizer test: ${name}`)
    }
    let createdPr = null
    const outcome = await runSemanticFinalizer({
      requestRpc, mainSha: baseSha, currentRoot: root,
      packageSemantic: (claimedJob, semanticResult, pins) => runPackage(claimedJob, semanticResult, { ...pins, currentRoot: root, runCommand }),
      createDraft: async (_claimedJob, _semanticResult, ref, headSha) => {
        assert.equal(ref, headRef)
        assert.equal(git(['--git-dir', remote, 'rev-parse', `refs/heads/${ref}`]), headSha)
        createdPr = { number: 501, url: 'https://example.invalid/pull/501', ref, headSha }
        return { number: createdPr.number, url: createdPr.url }
      },
    })
    assert.equal(outcome.status, 'PR_OPEN')
    assert.equal(outcome.pr_number, 501)
    assert.equal(outcome.head_sha, createdPr.headSha)
    assert.equal(outcome.release_decision, 'AUTO_PUBLISH_ELIGIBLE')
    assert.match(outcome.head_sha, /^[a-f0-9]{40}$/)
    assert.equal(git(['rev-parse', `refs/heads/${headRef}`]), outcome.head_sha)
    assert.equal(git(['--git-dir', remote, 'rev-parse', `refs/heads/${headRef}`]), outcome.head_sha)
    const persisted = rpcCalls.find((call) => call.name === 'archive_knowledge_semantic_job_update')
    assert.equal(persisted.args.p_status, 'PR_OPEN')
    assert.equal(persisted.args.p_pr_number, 501)
    assert.equal(persisted.args.p_head_sha, outcome.head_sha)
    const committedBrief = JSON.parse(git(['show', `${headRef}:knowledge/content/briefs/${briefId}.json`]))
    assert.equal(committedBrief.status, 'READY')
    assert.equal(committedBrief.id, briefId)
    const committedState = JSON.parse(git(['show', `${headRef}:knowledge/automation/state.json`]))
    assert.equal(committedState.sources.find((item) => item.source_manifest_ref === sourceRef)?.status, 'PROCESSED')
    const committedPaths = git(['ls-tree', '-r', '--name-only', headRef]).split(/\r?\n/)
    assert.ok(!committedPaths.includes('archive/web/public/knowledge/semantic-finalizer-git-fixture/index.html'))
    const sitemap = git(['show', `${headRef}:archive/web/public/sitemap.xml`])
    assert.ok(!sitemap.includes('/knowledge/semantic-finalizer-git-fixture/'))
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(remote, { recursive: true, force: true })
  }
})

test('C-FINALIZER workflow accepts the dispatcher origin input', async () => {
  const workflow = await readFile(resolve(import.meta.dirname, '../../../.github/workflows/knowledge-semantic-finalizer.yml'), 'utf8')
  assert.match(workflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+dispatch_origin:/)
  assert.match(workflow, /dispatch_origin:\s*\n\s+description: Scheduler origin\s*\n\s+required: false\s*\n\s+default: manual/)
})

test('Knowledge publication workflow allows the C3 runtime-state package file', async () => {
  const workflow = await readFile(resolve(import.meta.dirname, '../../../.github/workflows/knowledge-publish-prepare.yml'), 'utf8')
  assert.match(workflow, /knowledge\/automation\/runtime-state\.json/)
})

test('Knowledge publication binds a C3 durable job to the prepared exact head before validation', async () => {
  const workflow = await readFile(resolve(import.meta.dirname, '../../../.github/workflows/knowledge-publish-prepare.yml'), 'utf8')
  assert.match(workflow, /Bind C3 durable job to prepared head/)
  assert.match(workflow, /archive_knowledge_semantic_job_update/)
  assert.match(workflow, /p_expected_status: 'PR_OPEN'/)
  assert.match(workflow, /p_status: 'PR_OPEN'/)
  assert.match(workflow, /p_head_sha: process\.env\.PREPARED_SHA/)
  assert.ok(workflow.indexOf('Bind C3 durable job to prepared head') < workflow.indexOf('Dispatch exact-head validation for prepared commit'))
})

