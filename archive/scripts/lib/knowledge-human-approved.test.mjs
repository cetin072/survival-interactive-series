import test from 'node:test'
import assert from 'node:assert/strict'
import { loadKnowledge, root } from './knowledge-content.mjs'
import { checkHumanApprovedRelease, checkRelease } from './knowledge-release.mjs'
import { promoteHumanApprovedBriefRecord } from './knowledge-publish.mjs'

function withHumanApprovedK004(data, patch = {}, evidencePatch = {}) {
  const brief = data.briefs.find((item) => item.id === 'K-004')
  const nextBrief = {
    ...brief,
    status: 'READY',
    publication_policy: 'HUMAN_APPROVED',
    risk_level: 'HIGH',
    risk_domains: ['GENERATOR'],
    semantic_qa_status: 'PASS',
    ...patch,
  }
  const evidence = new Map(data.evidence)
  evidence.set('K-004', { ...evidence.get('K-004'), ...evidencePatch })
  return {
    ...data,
    briefs: data.briefs.map((item) => item.id === 'K-004' ? nextBrief : item),
    evidence,
  }
}

test('human-approved gate overrides risk policy only after all machine evidence checks pass', async () => {
  const data = await loadKnowledge(root)
  const input = withHumanApprovedK004(data)
  const files = ['knowledge/content/briefs/K-004.json']

  const automatic = await checkRelease(input, {
    changedFiles: files,
    briefIds: ['K-004'],
    mode: input.config.publication_mode,
    base: root,
  })
  assert.equal(automatic.decision, 'HUMAN_REVIEW_REQUIRED')

  const approved = await checkHumanApprovedRelease(input, {
    changedFiles: files,
    briefIds: ['K-004'],
    base: root,
  })
  assert.equal(approved.decision, 'HUMAN_APPROVED_ELIGIBLE')
  assert.equal(approved.requires_human, false)
  assert.deepEqual(approved.reasons, [])
})

test('human approval cannot override unresolved evidence or failed semantic QA', async () => {
  const data = await loadKnowledge(root)
  const files = ['knowledge/content/briefs/K-004.json']

  const conflict = await checkHumanApprovedRelease(withHumanApprovedK004(data, {}, { conflicts: ['unresolved'] }), {
    changedFiles: files, briefIds: ['K-004'], base: root,
  })
  assert.equal(conflict.decision, 'HUMAN_APPROVED_BLOCKED')
  assert.ok(conflict.reasons.includes('EVIDENCE_CONFLICT:K-004'))

  const badQa = await checkHumanApprovedRelease(withHumanApprovedK004(data, { semantic_qa_status: 'REVIEW' }), {
    changedFiles: files, briefIds: ['K-004'], base: root,
  })
  assert.equal(badQa.decision, 'HUMAN_APPROVED_BLOCKED')
  assert.ok(badQa.reasons.includes('SEMANTIC_QA_NOT_PASS:K-004'))
})

test('human-approved promotion preserves content and records the reviewed publication policy', async () => {
  const data = await loadKnowledge(root)
  const brief = withHumanApprovedK004(data).briefs.find((item) => item.id === 'K-004')
  const promoted = promoteHumanApprovedBriefRecord(brief, '2026-09-30')
  assert.equal(promoted.status, 'PUBLISHED')
  assert.equal(promoted.publication_policy, 'HUMAN_APPROVED')
  assert.equal(promoted.risk_level, 'HIGH')
  assert.equal(promoted.semantic_qa_status, 'PASS')
})
