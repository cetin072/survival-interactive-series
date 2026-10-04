import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { experienceSeedChoice, EX001_REF } from '../knowledge-semantic-prepare-experience.mjs'
import { applySemanticPackage, buildSemanticContext, nextBriefId, validateSemanticResult } from './knowledge-semantic-jobs.mjs'
import { loadKnowledge } from './knowledge-content.mjs'
import { checkHumanApprovedRelease, checkRelease } from './knowledge-release.mjs'

const root = resolve(import.meta.dirname, '../../..')
const resultTemplate = JSON.parse(await readFile(join(root, 'knowledge/automation/pilots/EX-001-semantic-result.template.json'), 'utf8'))
const seedBytes = await readFile(join(root, EX001_REF))

test('EX-001 explicit choice preserves the question and omits the private photo', () => {
  const choice = experienceSeedChoice(seedBytes)
  assert.equal(choice.sourceKind, 'USER_REPORTED_EXPERIENCE')
  assert.equal(choice.sourceRef, EX001_REF)
  assert.match(choice.sourceSha256, /^[a-f0-9]{64}$/)
  assert.match(choice.excerpt, /분전반/)
  assert.doesNotMatch(choice.excerpt, /repair-site-original|PRIVATE_SOURCE_ASSET_STORED/)
  assert.throws(() => experienceSeedChoice(seedBytes, 'knowledge/content/experience-seeds/EX-002.json'), /EXPERIENCE_SEED_REF_UNSUPPORTED/)
})

test('EX-001 package stays bound to the seed and requires human review', async () => {
  const choice = experienceSeedChoice(seedBytes)
  const data = await loadKnowledge(root)
  const result = structuredClone(resultTemplate)
  const briefId = nextBriefId(data.briefs)
  result.brief.id = briefId
  result.evidence.brief_id = briefId
  result.candidate.brief_id = briefId
  const context = buildSemanticContext({
    jobType: choice.jobType,
    source: { kind: choice.sourceKind, ref: choice.sourceRef, sha256: choice.sourceSha256, refs: [], hashes: [] },
    target: { brief_id: briefId, candidate_id: result.candidate.id },
    existingKnowledge: data,
    policy: JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8')),
    excerpt: choice.excerpt,
  })
  const job = { job_id: result.job_id, source_kind: choice.sourceKind, source_ref: choice.sourceRef, source_sha256: choice.sourceSha256, work_key: choice.workKey, semantic_context: context }
  assert.equal(validateSemanticResult(job, result).decision, 'HUMAN_REVIEW')
  const { code, note, ...autoResult } = result
  assert.throws(() => validateSemanticResult(job, { ...autoResult, decision: 'BRIEF_READY', brief: { ...result.brief, risk_level: 'LOW', publication_policy: 'AUTO_LOW_RISK' } }), /SEMANTIC_EXPERIENCE_REVIEW_REQUIRED/)
  assert.throws(() => validateSemanticResult(job, { ...result, candidate: { ...result.candidate, source_sha256: '0'.repeat(64) } }), /SEMANTIC_EXPERIENCE_SOURCE_BINDING_MISMATCH/)
  if (data.candidates.some((candidate) => candidate.source_kind === choice.sourceKind && candidate.source_ref === choice.sourceRef)) return
  const temp = await mkdtemp(join(tmpdir(), 'knowledge-ex001-'))
  try {
    await cp(join(root, 'knowledge'), join(temp, 'knowledge'), { recursive: true })
    const bookDir = join(temp, 'archive/content/stories/C03-AFTERFALL')
    await mkdir(bookDir, { recursive: true })
    await cp(join(root, 'archive/content/stories/C03-AFTERFALL/BOOK.json'), join(bookDir, 'BOOK.json'))
    await cp(join(root, 'archive/web/public/knowledge'), join(temp, 'archive/web/public/knowledge'), { recursive: true })
    const applied = await applySemanticPackage({ root: temp, job, result, now: '2026-10-04T12:00:00.000Z' })
    assert.equal(applied.brief_id, briefId)
    const staged = await loadKnowledge(temp)
    const files = applied.changed_files
    const release = await checkRelease(staged, { changedFiles: files, briefIds: [briefId], mode: staged.config.publication_mode, base: temp })
    assert.equal(release.decision, 'HUMAN_REVIEW_REQUIRED')
    const approved = await checkHumanApprovedRelease(staged, { changedFiles: files, briefIds: [briefId], base: temp })
    assert.equal(approved.decision, 'HUMAN_APPROVED_ELIGIBLE')
  } finally { await rm(temp, { recursive: true, force: true }) }
})
