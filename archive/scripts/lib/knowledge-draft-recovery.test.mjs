import test from 'node:test'
import assert from 'node:assert/strict'
import { validateKnowledge, stageSemanticBrief, publicationEligibility } from './knowledge-content.mjs'
import { promoteBriefRecord, promoteHumanApprovedBriefRecord } from './knowledge-publish.mjs'
import { runSemanticFinalizer, reconcilePullRequest } from '../knowledge-semantic-finalize.mjs'

const config = { publication_mode: 'AUTO_LOW_RISK', auto_publish_enabled: true, site_origin: 'https://example.com' }
function fixture() {
  const brief = {
    id: 'K-999', slug: 'draft-schema-fixture', content_type: 'BRIEF', topic_id: 'T-FIXTURE',
    title: 'What should a draft record?', summary: 'A draft is not publication.', meta_description: 'Fixture',
    lead: 'Keep the draft unpublished until its publication gate passes.', label: 'Fixture', scope: 'Test', basis: 'Test', footer: 'Test',
    risk_level: 'LOW', publication_policy: 'AUTO_LOW_RISK', risk_domains: ['GENERAL_PREPAREDNESS'],
    semantic_qa_status: 'PASS', status: 'READY', source_checked_at: '2026-10-15', updated_at: '2026-10-15',
    ai_assisted: true, editorial_note: 'TEST_ONLY',
    sections: [{ heading: 'Draft', blocks: [{ type: 'prose', text: 'Test fixture, not public advice.' }] }],
    sources: [{ id: 'S1', title: 'Fixture', url: 'https://example.com/source', note: 'Test', checked_at: '2026-10-15' }],
    related_brief_ids: [], tools: [], story_refs: [],
  }
  const evidence = { brief_id: brief.id, question: brief.title, claims: [
    { claim: 'Test', source_ids: ['S1'], context: 'Test', limitation: 'Test' },
  ], conflicts: [], unknowns: [], risk_notes: [], copyright_status: 'CLEAR', story_source_status: 'VERIFIED_PUBLIC_ARCHIVE' }
  return { brief, evidence }
}
const dataFor = ({ brief, evidence }) => ({ briefs: [brief], candidates: [], evidence: new Map([[brief.id, evidence]]),
  topics: [{ id: brief.topic_id, brief_ids: [brief.id], tools: [], story_refs: [] }], guides: [], stories: [], config, base: '.' })

test('unpublished drafts may omit publication dates; actual publication must have a valid date', async () => {
  for (const status of ['READY', 'DRAFT', 'HOLD']) {
    for (const published_at of [undefined, null]) {
      const f = fixture(); f.brief.status = status
      if (published_at === null) f.brief.published_at = null
      const before = JSON.stringify(f)
      assert.equal(await validateKnowledge(dataFor(f)), true)
      assert.equal(JSON.stringify(f), before)
    }
  }
  for (const published_at of [undefined, null, '', '2026-10-15T09:00:00Z']) {
    const f = fixture(); Object.assign(f.brief, { status: 'PUBLISHED', published_at })
    await assert.rejects(validateKnowledge(dataFor(f)), /K-999 dates/)
  }
  const f = fixture(); f.brief = promoteBriefRecord(f.brief, '2026-10-16')
  assert.equal(f.brief.published_at, '2026-10-16')
  assert.equal(await validateKnowledge(dataFor(f)), true)
})

test('human QA aliases are projected on a clone and never become PASS or an invented publication', async () => {
  for (const alias of ['HUMAN_REVIEW', 'NEEDS_HUMAN_REVIEW']) {
    const f = fixture()
    Object.assign(f.brief, { risk_level: 'HIGH', risk_domains: ['SHELTER_STRUCTURAL'], publication_policy: 'HUMAN_APPROVED', semantic_qa_status: alias })
    f.evidence.unknowns = ['Requires local expert verification']
    const before = JSON.stringify(f)
    const staged = stageSemanticBrief({ ...f, decision: 'HUMAN_REVIEW', config, nowDate: '2026-10-15' })
    assert.equal(staged.brief.semantic_qa_status, 'REVIEW')
    assert.equal(staged.brief.risk_level, 'HIGH')
    assert.deepEqual(staged.brief.risk_domains, ['SHELTER_STRUCTURAL'])
    assert.equal(staged.brief.publication_policy, 'HUMAN_APPROVED')
    assert.equal(staged.brief.published_at, undefined)
    assert.equal(staged.requires_human_review, true)
    assert.equal(staged.projection.original_qa_status, alias)
    assert.equal(await validateKnowledge(dataFor({ ...f, brief: staged.brief })), true)
    assert.throws(() => promoteHumanApprovedBriefRecord(staged.brief, '2026-10-16'), /semantic QA must PASS/)
    assert.equal(JSON.stringify(f), before)
  }
})

test('unknowns, conflicts and unverified rights escalate auto submissions to human review without clearing evidence', async () => {
  for (const change of [
    { unknowns: ['Unresolved scope'] }, { conflicts: ['Conflicting sources'] },
    { copyright_status: 'PUBLIC_OFFICIAL_SOURCE_SUMMARY' }, { story_source_status: 'NARRATIVE_PROVENANCE_ONLY' },
  ]) {
    const f = fixture(); Object.assign(f.evidence, change)
    const before = JSON.stringify(f)
    const staged = stageSemanticBrief({ ...f, decision: 'BRIEF_READY', config, nowDate: '2026-10-15' })
    assert.equal(staged.requires_human_review, true)
    assert.equal(staged.brief.publication_policy, 'HUMAN_APPROVED')
    assert.equal(staged.brief.semantic_qa_status, 'REVIEW')
    assert.equal(staged.projection.reason, 'AUTO_EVIDENCE_REQUIRES_HUMAN_REVIEW')
    assert.notEqual(publicationEligibility(staged.brief, f.evidence, config), 'AUTO_PUBLISH_ELIGIBLE')
    assert.equal(await validateKnowledge(dataFor({ ...f, brief: staged.brief })), true)
    assert.throws(() => promoteBriefRecord(staged.brief, '2026-10-16'))
    assert.equal(JSON.stringify(f), before)
  }
  const f = fixture()
  const staged = stageSemanticBrief({ ...f, decision: 'BRIEF_READY', config, nowDate: '2026-10-15' })
  assert.equal(staged.requires_human_review, false)
  assert.equal(staged.projection, null)
  assert.equal(staged.brief.semantic_qa_status, 'PASS')
  assert.equal(staged.brief.publication_policy, 'AUTO_LOW_RISK')
})

function jobFixture() {
  const f = fixture(), job_id = '287c20fb-7ad2-41e4-b9be-12426675d234'
  const source_ref = 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_001/SOURCE_MANIFEST.json'
  const source_sha256 = 'a'.repeat(64)
  const result = { version: 'knowledge-semantic-result-v1', job_id, decision: 'BRIEF_READY', brief: f.brief, evidence: f.evidence,
    candidate: { id: 'KC-fixture', brief_id: f.brief.id, topic_id: f.brief.topic_id, question: f.brief.title, status: 'BRIEF_PROPOSED',
      source_kind: 'PUBLIC_ARCHIVE', source_manifest_ref: source_ref, source_manifest_sha256: source_sha256 } }
  return { job_id, status: 'FINALIZING', source_kind: 'PUBLIC_ARCHIVE', source_ref, source_sha256, semantic_result: result,
    semantic_context: { target: { brief_id: f.brief.id, candidate_id: 'KC-fixture' }, source: { kind: 'PUBLIC_ARCHIVE' } } }
}

test('program-required human review enters the existing inbox, never PR_OPEN or PUBLISHED', async () => {
  const job = jobFixture(), before = JSON.stringify(job), updates = [], inbox = []
  const staged = { ...job.semantic_result.brief, publication_policy: 'HUMAN_APPROVED', semantic_qa_status: 'REVIEW' }
  const outcome = await runSemanticFinalizer({ mainSha: 'b'.repeat(40),
    requestRpc: async (name, args) => name.endsWith('claim_finalizer') ? job : (updates.push(args), { status: args.p_status }),
    verifyPinsFn: async () => ({ context: job.semantic_context }),
    packageSemantic: async () => ({ head_sha: 'c'.repeat(40), requires_human_review: true, staged_brief: staged, release_decision: 'HOLD' }),
    createDraft: async () => ({ number: 999 }), enqueueReviewEntry: async payload => inbox.push(payload),
  })
  assert.equal(outcome.status, 'HUMAN_REVIEW')
  assert.equal(inbox.length, 1)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].p_status, 'HUMAN_REVIEW')
  assert.equal(JSON.stringify(job), before)
})

test('contract failures retain actionable field detail and do not report success', async () => {
  const job = jobFixture()
  const outcome = await runSemanticFinalizer({ mainSha: 'b'.repeat(40),
    requestRpc: async (name, args) => name.endsWith('claim_finalizer') ? job : { status: args.p_status },
    verifyPinsFn: async () => ({ context: job.semantic_context }),
    packageSemantic: async () => { throw new Error('KNOWLEDGE_CONTRACT: K-999 dates') },
  })
  assert.equal(outcome.status, 'BLOCKED')
  assert.equal(outcome.blocker_code, 'KNOWLEDGE_CONTRACT')
  assert.equal(outcome.blocker_detail, 'KNOWLEDGE_CONTRACT: K-999 dates')
})
