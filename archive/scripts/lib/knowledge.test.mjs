import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { publicKnowledgeInventory, scanKnowledge, bootstrapKnowledge, recordKnowledgeDisposition } from './knowledge-scan.mjs'
import { loadKnowledge, validateKnowledge, publicationEligibility, root } from './knowledge-content.mjs'
import { checkContentOnly, checkRelease, verifyProductionPublication } from './knowledge-release.mjs'
import { planWorkerRun, validateProviderConfig, validateWorkerPolicy } from './knowledge-worker-config.mjs'
import { assertReleaseReady, expectedReleaseDecision, promoteBriefRecord } from './knowledge-publish.mjs'
import { isExactProductionDeployMeta } from './knowledge-production.mjs'
import {
  RUN_RESULT_CODES, backfillDue, classifyWorkerPr, deterministicBackfillBranch,
  deterministicFreshBranch, deterministicStateBranch, notificationMarker,
  planWorkerPreflight, recordBackfillResult, validateRuntimeState, workerPhaseMarker,
} from './knowledge-worker-runtime.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const manifestRef = 'archive/content/transcripts/C03-AFTERFALL/S99/SESSION_001/SOURCE_MANIFEST.json'
const raw = Buffer.from('## USER 000\n\nTEST_INPUT\n\n## GM 001\n\n## 2099년 1월 1일 10:00\n\nTEST_GM_PROSE\n')
async function fixture(edit = () => {}) {
  const base = await mkdtemp(join(tmpdir(), 'knowledge-scan-'))
  const seasonDir = join(base, 'archive/content/transcripts/C03-AFTERFALL/S99')
  const sessionDir = join(seasonDir, 'SESSION_001')
  await mkdir(sessionDir, { recursive: true })
  await mkdir(join(base, 'knowledge/automation'), { recursive: true })
  const range = { start: '2099-01-01 10:00', end: '2099-01-01 10:00' }
  const session = { session_id: 'SESSION_001', visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true,
    source_manifest: 'SESSION_001/SOURCE_MANIFEST.json', coverage_basis: 'captured_message_range', captured_message_range: range, user_messages: 1, gm_public_blocks: 1 }
  const season = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S99', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE', sessions: [session] }
  const source = { chronicle_id: season.chronicle_id, worldline_id: season.worldline_id, season_id: season.season_id, session_id: session.session_id,
    visibility: 'PUBLIC_ARCHIVE', public_safe_only: true, closed_at: '2099-01-01', atomic_pairing_complete: true,
    capture_quality: session.capture_quality, coverage_basis: 'captured_message_range', captured_message_range: range,
    counts: { user: 1, gm: 1, total: 2 }, message_order: { min: 0, max: 1, contiguous: true },
    content_sha256: [{ message_order: 0, role: 'USER', sha256: sha('TEST_INPUT') }, { message_order: 1, role: 'GM', sha256: sha('TEST_GM_PROSE') }],
    parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': sha(raw) } }
  edit({ season, session, source })
  await writeFile(join(seasonDir, 'MANIFEST.json'), JSON.stringify(season))
  await writeFile(join(sessionDir, 'SOURCE_MANIFEST.json'), JSON.stringify(source))
  await writeFile(join(sessionDir, 'PART_001.md'), raw)
  await writeFile(join(base, 'knowledge/automation/state.json'), JSON.stringify({ version: 1, sources: [] }))
  return base
}
const empty = () => ({ version: 1, sources: [] })
const record = (item, status = 'PROCESSED') => ({ source_manifest_ref: item.source_manifest_ref, source_manifest_sha256: item.source_manifest_sha256,
  status, processed_at: '2026-09-27T00:00:00.000Z', candidate_ids: [], brief_ids: [] })
async function validateWithReaderBook(data, mutateBook) {
  const base = await mkdtemp(join(tmpdir(), 'knowledge-reader-book-'))
  try {
    const bookRef = data.stories[0].reader_book_ref
    const book = JSON.parse(await readFile(join(root, bookRef), 'utf8'))
    mutateBook(book)
    const bookPath = join(base, bookRef)
    await mkdir(dirname(bookPath), { recursive: true })
    await writeFile(bookPath, JSON.stringify(book))
    const download = 'archive/web/public/knowledge/downloads/survival-diary-emergency-inventory-v1.xlsx'
    const downloadPath = join(base, download)
    await mkdir(dirname(downloadPath), { recursive: true })
    await copyFile(join(root, download), downloadPath)
    return await validateKnowledge({ ...data, base })
  } finally { await rm(base, { recursive: true, force: true }) }
}

test('bootstrap existing public input then NOOP without falsely marking processed', async () => {
  const base = await fixture()
  try {
    const items = await publicKnowledgeInventory(base)
    assert.equal(await bootstrapKnowledge(base, items, empty(), '2026-09-27T00:00:00.000Z'), 1)
    const state = JSON.parse(await readFile(join(base, 'knowledge/automation/state.json')))
    assert.equal(state.sources[0].status, 'BASELINE_PRE_V1')
    assert.equal(scanKnowledge(items, state).status, 'NOOP')
    assert.equal(await bootstrapKnowledge(base, items, state, '2026-09-28T00:00:00.000Z'), 0)
  } finally { await rm(base, { recursive: true, force: true }) }
})
test('new verified public source is pending exactly once and repeat scan is deterministic', async () => {
  const base = await fixture()
  try {
    const items = await publicKnowledgeInventory(base)
    assert.equal(items.length, 1)
    const first = scanKnowledge(items, empty())
    assert.equal(first.status, 'PENDING')
    assert.equal(first.sources.length, 1)
    assert.deepEqual(scanKnowledge(items, empty()), first)
    const processed = scanKnowledge(items, { version: 1, sources: [record(items[0])] })
    assert.equal(processed.status, 'NOOP')
    assert.equal(processed.ignored[0].status, 'NOOP_ALREADY_PROCESSED')
    assert.equal(scanKnowledge([{ ...items[0], source_manifest_sha256: 'f'.repeat(64) }], { version: 1, sources: [record(items[0])] }).status, 'SOURCE_CHANGED_RESCAN_REQUIRED')
  } finally { await rm(base, { recursive: true, force: true }) }
})
for (const [name, edit] of [
  ['non-public season', ({ season }) => { season.visibility = 'PLAYER_ARCHIVE' }],
  ['partial session', ({ session }) => { session.capture_quality = 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING'; session.atomic_pairing_complete = false }],
]) test(`${name} is not a knowledge input`, async () => {
  const base = await fixture(edit)
  try { assert.deepEqual(await publicKnowledgeInventory(base), []) }
  finally { await rm(base, { recursive: true, force: true }) }
})
test('malformed approved source fails closed', async () => {
  const base = await fixture(({ source }) => { source.parts_sha256['PART_001.md'] = 'f'.repeat(64) })
  try { await assert.rejects(publicKnowledgeInventory(base), /INVALID_APPROVED_READER_SOURCE/) }
  finally { await rm(base, { recursive: true, force: true }) }
})
test('golden fixtures satisfy content contract and policy gate', async () => {
  const data = await loadKnowledge(root)
  assert.equal(await validateKnowledge(data), true)
  for (const brief of data.briefs.filter((item) => ['K-002', 'K-003'].includes(item.id))) {
    assert.equal(brief.status, 'PUBLISHED')
    assert.equal(brief.publication_policy, 'HUMAN_APPROVED')
    assert.equal(publicationEligibility(brief, data.evidence.get(brief.id), data.config), 'HUMAN_REVIEW')
  }
  const brief = { ...data.briefs.find((item) => item.id === 'K-004'), status: 'READY', publication_policy: 'AUTO_LOW_RISK' }
  const evidence = data.evidence.get('K-004')
  assert.equal(publicationEligibility(brief, evidence, data.config), 'AUTO_PUBLISH_ELIGIBLE')
  assert.equal(publicationEligibility({ ...brief, risk_level: 'HIGH' }, evidence, data.config), 'HUMAN_REVIEW')
  assert.equal(publicationEligibility({ ...brief, content_type: 'GUIDE' }, evidence, data.config), 'HUMAN_REVIEW')
  assert.equal(publicationEligibility(brief, null, data.config), 'HOLD')
  assert.equal(publicationEligibility(brief, { ...evidence, conflicts: ['unresolved'] }, data.config), 'HOLD')
  assert.equal(publicationEligibility({ ...brief, risk_domains: ['WATER_PURIFICATION'] }, evidence, data.config), 'HUMAN_REVIEW')
})
test('Reader backfill is pinned to verified public chapter and source metadata', async () => {
  const data = await loadKnowledge(root)
  const candidate = data.candidates.find((item) => item.id === 'KC-community-reserve-tracking')
  assert.equal(candidate.source_kind, 'PUBLIC_READER')
  assert.equal(candidate.reader_chapter_id, 'c03-afterfall-chapter-02')
  assert.equal(await validateKnowledge(data), true)
  const tampered = { ...candidate, source_hashes: ['f'.repeat(64)] }
  await assert.rejects(validateKnowledge({ ...data, candidates: data.candidates.map((item) => item.id === candidate.id ? tampered : item) }), /Reader provenance mismatch/)
})
test('Reader backfill survives unrelated BOOK growth and rejects referenced chapter changes', async () => {
  const data = await loadKnowledge(root)
  const chapterId = data.candidates.find((item) => item.id === 'KC-community-reserve-tracking').reader_chapter_id
  assert.equal(await validateWithReaderBook(data, (book) => book.chapters.push({ id: 'later-reader-chapter', title: 'Later', body: 'Unrelated Reader growth' })), true)
  for (const mutate of [
    (book) => { book.chapters.find((chapter) => chapter.id === chapterId).body += '\nChanged body' },
    (book) => { book.chapters.find((chapter) => chapter.id === chapterId).sourceRefs[0] += '.changed' },
    (book) => { book.chapters.find((chapter) => chapter.id === chapterId).sourceHashes[0] = 'f'.repeat(64) },
  ]) await assert.rejects(validateWithReaderBook(data, mutate), /Reader chapter changed|Reader provenance mismatch/)
})
test('AUTO_LOW_RISK READY and PUBLISHED must pass the same publication gate', async () => {
  const data = await loadKnowledge(root)
  const auto = { ...data.briefs.find((item) => item.id === 'K-004'), publication_policy: 'AUTO_LOW_RISK' }
  const withAuto = (patch = {}, evidence = data.evidence) => ({
    ...data, briefs: data.briefs.map((item) => item.id === auto.id ? { ...auto, ...patch } : item), evidence,
  })
  const pack = data.evidence.get(auto.id)

  assert.equal(publicationEligibility({ ...auto, status: 'READY' }, pack, data.config), 'AUTO_PUBLISH_ELIGIBLE')
  assert.equal(await validateKnowledge(withAuto({ status: 'READY' })), true)
  assert.equal(publicationEligibility({ ...auto, status: 'PUBLISHED' }, pack, data.config), 'AUTO_PUBLISH_ELIGIBLE')
  assert.equal(await validateKnowledge(withAuto({ status: 'PUBLISHED' })), true)

  const missingEvidence = new Map(data.evidence)
  missingEvidence.delete(auto.id)
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED' }, missingEvidence)), /evidence/)

  const conflictedEvidence = new Map(data.evidence)
  conflictedEvidence.set(auto.id, { ...pack, conflicts: ['unresolved'] })
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED' }, conflictedEvidence)), /publication eligibility/)
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED', risk_domains: ['WATER_PURIFICATION'] })), /publication eligibility/)
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED', risk_level: 'HIGH' })), /publication eligibility/)
  await assert.rejects(validateKnowledge(withAuto({ status: 'PUBLISHED', risk_domains: ['WATER_PURIFCATION'] })), /risk domains/)
  await assert.rejects(validateKnowledge(withAuto({ status: 'READY', risk_domains: ['UNCLASSIFIED'] })), /risk domains/)
})

test('release gate covers PR_ONLY, shadow, AUTO, and the content-only boundary', async () => {
  const data = await loadKnowledge(root)
  const allowedFile = 'knowledge/content/briefs/K-004.json'
  const prOnlyData = { ...data, config: { ...data.config, publication_mode: 'PR_ONLY', auto_publish_enabled: false } }
  const prOnly = await checkRelease(prOnlyData, { changedFiles: [allowedFile], briefIds: ['K-004'], mode: 'PR_ONLY' })
  assert.equal(prOnly.decision, 'PR_ONLY')
  assert.equal(prOnly.requires_human, false)

  const shadowData = { ...data, config: { ...data.config, publication_mode: 'AUTO_LOW_RISK_SHADOW', auto_publish_enabled: false } }
  const shadow = await checkRelease(shadowData, { changedFiles: [allowedFile], briefIds: ['K-004'], mode: 'AUTO_LOW_RISK_SHADOW' })
  assert.equal(shadow.decision, 'WOULD_AUTO_PUBLISH')
  assert.equal(shadow.requires_human, false)

  const escalation = await checkRelease(shadowData, { changedFiles: [allowedFile], briefIds: ['K-004'], mode: 'AUTO_LOW_RISK' })
  assert.equal(escalation.decision, 'REJECTED')
  assert.ok(escalation.reasons.includes('REQUESTED_MODE_MISMATCH'))

  const autoData = { ...data, config: { ...data.config, publication_mode: 'AUTO_LOW_RISK', auto_publish_enabled: true } }
  const automatic = await checkRelease(autoData, { changedFiles: [allowedFile], briefIds: ['K-004'], mode: 'AUTO_LOW_RISK' })
  assert.equal(automatic.decision, 'AUTO_PUBLISH_ELIGIBLE')
  assert.equal(automatic.requires_human, false)

  const codeDiff = await checkRelease(autoData, { changedFiles: ['archive/scripts/knowledge-release.mjs'], briefIds: ['K-004'], mode: 'AUTO_LOW_RISK' })
  assert.equal(codeDiff.decision, 'REJECTED')
  assert.deepEqual(codeDiff.content_only.rejected, ['archive/scripts/knowledge-release.mjs'])
  assert.equal(checkContentOnly(['archive/web/public/knowledge/knowledge.css']).allowed, false)
  assert.equal(checkContentOnly(['knowledge/automation/runtime-state.json']).allowed, true)
})

test('publication mode config is authoritative and internally consistent', async () => {
  const data = await loadKnowledge(root)
  const shadowData = { ...data, config: { ...data.config, publication_mode: 'AUTO_LOW_RISK_SHADOW', auto_publish_enabled: false } }
  await assert.rejects(validateKnowledge({ ...shadowData, config: { ...shadowData.config, auto_publish_enabled: true } }), /auto_publish_enabled must be false outside AUTO_LOW_RISK mode/)
  await assert.rejects(validateKnowledge({ ...data, config: { ...data.config, publication_mode: 'PR_ONLY', auto_publish_enabled: true } }), /auto_publish_enabled must be false outside AUTO_LOW_RISK mode/)
  assert.equal(await validateKnowledge({ ...data, config: { ...data.config, publication_mode: 'AUTO_LOW_RISK', auto_publish_enabled: true } }), true)
  const inconsistent = await checkRelease({ ...shadowData, config: { ...shadowData.config, auto_publish_enabled: true } }, {
    changedFiles: ['knowledge/content/briefs/K-004.json'], briefIds: ['K-004'], mode: 'AUTO_LOW_RISK_SHADOW',
  })
  assert.equal(inconsistent.decision, 'HUMAN_REVIEW_REQUIRED')
  assert.ok(inconsistent.reasons.some((reason) => reason.startsWith('INVALID_PUBLICATION_CONFIG:')))
  const cliOutput = execFileSync(process.execPath, [join(root, 'archive/scripts/knowledge-release-check.mjs'), '--brief', 'K-004', '--mode', 'AUTO_LOW_RISK_SHADOW', '--changed-file', 'knowledge/content/briefs/K-004.json'], { cwd: root, encoding: 'utf8' })
  assert.equal(JSON.parse(cliOutput).decision, 'REJECTED')
})

test('every changed brief is bound to the exact release targets and must pass independently', async () => {
  const data = await loadKnowledge(root)
  const k004 = data.briefs.find((brief) => brief.id === 'K-004')
  const k007 = { ...k004, id: 'K-997', slug: 'another-fixture-brief', title: 'A second verified test brief' }
  const k004Candidate = data.candidates.find((candidate) => candidate.brief_id === 'K-004')
  assert.ok(k004Candidate)
  const k007Evidence = { ...data.evidence.get('K-004'), brief_id: 'K-997', question: k007.title }
  const k007Candidate = { ...k004Candidate, id: 'KC-second-brief', brief_id: 'K-997', question: 'A second verified test question' }
  const evidence = new Map(data.evidence)
  evidence.set('K-997', k007Evidence)
  const bothBriefs = { ...data, config: { ...data.config, publication_mode: 'AUTO_LOW_RISK', auto_publish_enabled: true },
    briefs: [...data.briefs, k007], evidence, candidates: [...data.candidates, k007Candidate] }
  const changed = ['knowledge/content/briefs/K-004.json', 'knowledge/content/briefs/K-997.json']

  const firstOnly = await checkRelease(bothBriefs, { changedFiles: changed, briefIds: ['K-004'], mode: 'AUTO_LOW_RISK' })
  assert.equal(firstOnly.decision, 'REJECTED')
  assert.ok(firstOnly.reasons.includes('CHANGED_BRIEF_NOT_TARGETED:K-997'))

  const both = await checkRelease(bothBriefs, { changedFiles: changed, briefIds: ['K-004', 'K-997'], mode: 'AUTO_LOW_RISK' })
  assert.equal(both.decision, 'AUTO_PUBLISH_ELIGIBLE')
  assert.deepEqual(both.brief_ids, ['K-004', 'K-997'])

  const withSupportingRecords = await checkRelease(bothBriefs, {
    changedFiles: [...changed, 'knowledge/content/evidence/K-997.json', 'knowledge/content/candidates/KC-second-brief.json'],
    briefIds: ['K-004', 'K-997'], mode: 'AUTO_LOW_RISK',
  })
  assert.equal(withSupportingRecords.decision, 'AUTO_PUBLISH_ELIGIBLE')
  const unsupportedEvidence = await checkRelease(bothBriefs, {
    changedFiles: [...changed, 'knowledge/content/evidence/K-997.json'], briefIds: ['K-004'], mode: 'AUTO_LOW_RISK',
  })
  assert.equal(unsupportedEvidence.decision, 'REJECTED')
  const unsupportedCandidate = await checkRelease(bothBriefs, {
    changedFiles: [...changed, 'knowledge/content/candidates/KC-second-brief.json'], briefIds: ['K-004'], mode: 'AUTO_LOW_RISK',
  })
  assert.equal(unsupportedCandidate.decision, 'REJECTED')

  const unsafeK007 = { ...k007, publication_policy: 'HUMAN_APPROVED' }
  const unsafe = { ...bothBriefs, briefs: [...data.briefs, unsafeK007] }
  const bothWithUnsafe = await checkRelease(unsafe, { changedFiles: changed, briefIds: ['K-004', 'K-997'], mode: 'AUTO_LOW_RISK' })
  assert.equal(bothWithUnsafe.decision, 'HUMAN_REVIEW_REQUIRED')
  const untargetedUnsafe = await checkRelease(unsafe, { changedFiles: changed, briefIds: ['K-004'], mode: 'AUTO_LOW_RISK' })
  assert.equal(untargetedUnsafe.decision, 'REJECTED')
})

test('release gate fails closed for risk, conflicts, missing evidence, unknown domains, and duplicate candidates', async () => {
  const data = await loadKnowledge(root)
  const files = ['knowledge/content/briefs/K-004.json']
  const shadowConfig = { ...data.config, publication_mode: 'AUTO_LOW_RISK_SHADOW', auto_publish_enabled: false }
  const release = (input, briefIds = ['K-004']) => checkRelease({ ...input, config: shadowConfig }, { changedFiles: files, briefIds, mode: 'AUTO_LOW_RISK_SHADOW' })
  const highRisk = { ...data, briefs: data.briefs.map((brief) => brief.id === 'K-004' ? { ...brief, risk_level: 'HIGH' } : brief) }
  assert.equal((await release(highRisk)).decision, 'HUMAN_REVIEW_REQUIRED')

  const conflictEvidence = new Map(data.evidence)
  conflictEvidence.set('K-004', { ...conflictEvidence.get('K-004'), conflicts: ['source conflict'] })
  const conflictResult = await release({ ...data, evidence: conflictEvidence })
  assert.equal(conflictResult.decision, 'HOLD')
  assert.equal(conflictResult.requires_human, true)

  const noEvidence = new Map(data.evidence)
  noEvidence.delete('K-004')
  const ordinaryHold = await release({ ...data, evidence: noEvidence })
  assert.equal(ordinaryHold.decision, 'HOLD')
  assert.equal(ordinaryHold.requires_human, false)

  const unknownDomain = { ...data, briefs: data.briefs.map((brief) => brief.id === 'K-004' ? { ...brief, risk_domains: ['UNKNOWN_DOMAIN'] } : brief) }
  assert.equal((await release(unknownDomain)).decision, 'HUMAN_REVIEW_REQUIRED')

  const k004Candidate = data.candidates.find((candidate) => candidate.brief_id === 'K-004')
  assert.ok(k004Candidate)
  const duplicate = { ...data, candidates: [...data.candidates, { ...k004Candidate, id: 'KC-duplicate', question: k004Candidate.question }] }
  assert.equal((await release(duplicate)).decision, 'HUMAN_REVIEW_REQUIRED')
})

test('release gate fails closed on high risk, publication policy, QA, missing evidence details, and out-of-scope files', async () => {
  const data = await loadKnowledge(root)
  const files = ['knowledge/content/briefs/K-004.json']
  const release = (input) => checkRelease(input, { changedFiles: files, briefIds: ['K-004'] })
  for (const patch of [
    { risk_level: 'HIGH' },
    { risk_domains: ['MEDICAL'] },
    { publication_policy: 'HUMAN_APPROVED' },
    { semantic_qa_status: 'REVIEW' },
  ]) {
    const mutated = { ...data, briefs: data.briefs.map((brief) => brief.id === 'K-004' ? { ...brief, ...patch } : brief) }
    assert.notEqual((await release(mutated)).decision, 'WOULD_AUTO_PUBLISH')
  }

  const pack = data.evidence.get('K-004')
  const incompletePacks = [
    new Map([...data.evidence].filter(([id]) => id !== 'K-004')),
    new Map(data.evidence).set('K-004', { ...pack, claims: [] }),
    new Map(data.evidence).set('K-004', { ...pack, claims: pack.claims.map((claim) => ({ ...claim, source_ids: [] })) }),
  ]
  for (const evidence of incompletePacks.slice(0, 2)) assert.equal((await release({ ...data, evidence })).decision, 'HOLD')
  assert.equal((await release({ ...data, evidence: incompletePacks[2] })).decision, 'HUMAN_REVIEW_REQUIRED')
  const noSources = { ...data, briefs: data.briefs.map((brief) => brief.id === 'K-004' ? { ...brief, sources: [] } : brief) }
  assert.equal((await release(noSources)).decision, 'HOLD')
  const noCheckedDate = { ...data, briefs: data.briefs.map((brief) => brief.id === 'K-004' ? { ...brief, source_checked_at: '' } : brief) }
  assert.equal((await release(noCheckedDate)).decision, 'HOLD')
  const rightsUnknown = new Map(data.evidence).set('K-004', { ...pack, copyright_status: 'UNKNOWN' })
  const rightsResult = await release({ ...data, evidence: rightsUnknown })
  assert.equal(rightsResult.decision, 'HOLD')
  assert.equal(rightsResult.requires_human, true)
  const withUnknowns = new Map(data.evidence).set('K-004', { ...pack, unknowns: ['The source does not resolve this point.'] })
  const unknownResult = await release({ ...data, evidence: withUnknowns })
  assert.equal(unknownResult.decision, 'HOLD')
  assert.equal(unknownResult.requires_human, true)

  for (const path of [
    'archive/scripts/knowledge-release.mjs',
    '.github/workflows/knowledge.yml',
    'archive/scripts/package.json',
    'knowledge/automation/config.json',
  ]) assert.equal((await checkRelease(data, { changedFiles: [...files, path], briefIds: ['K-004'] })).decision, 'REJECTED')
})

test('out-of-target Evidence, Candidate, and generated pages are rejected', async () => {
  const data = await loadKnowledge(root)
  const k004Candidate = data.candidates.find((candidate) => candidate.brief_id === 'K-004')
  assert.ok(k004Candidate)
  const briefs = [...data.briefs, { ...data.briefs.find((brief) => brief.id === 'K-004'), id: 'K-997', slug: 'another-fixture-brief' }]
  const candidates = [...data.candidates, { ...k004Candidate, id: 'KC-another-brief', brief_id: 'K-997' }]
  const files = ['knowledge/content/briefs/K-004.json']
  const release = (extraFile) => checkRelease({ ...data, briefs, candidates }, { changedFiles: [...files, extraFile], briefIds: ['K-004'] })
  assert.ok((await release('knowledge/content/evidence/K-997.json')).reasons.includes('EVIDENCE_OUTSIDE_RELEASE_TARGETS:K-997'))
  assert.ok((await release('knowledge/content/candidates/KC-another-brief.json')).reasons.includes('CANDIDATE_OUTSIDE_RELEASE_TARGETS:KC-another-brief'))
  assert.ok((await release('archive/web/public/knowledge/another-fixture-brief/index.html')).reasons.includes('GENERATED_PAGE_OUTSIDE_RELEASE_TARGETS:another-fixture-brief'))
})

test('source manifest bytes are pinned and unavailable or invalid sources require human review', async () => {
  const data = await loadKnowledge(root)
  const base = await mkdtemp(join(tmpdir(), 'knowledge-release-source-'))
  const sourceRef = 'archive/content/transcripts/C03-AFTERFALL/S99/SESSION_001/SOURCE_MANIFEST.json'
  const sourcePath = join(base, sourceRef)
  const bytes = Buffer.from('{"source":"verified fixture"}\n')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const original = data.candidates.find((candidate) => candidate.brief_id === 'K-004')
  const archiveCandidate = { ...original, source_kind: 'PUBLIC_ARCHIVE', source_manifest_ref: sourceRef, source_manifest_sha256: hash }
  const withCandidate = (candidate = archiveCandidate) => ({ ...data, config: { ...data.config, publication_mode: 'AUTO_LOW_RISK_SHADOW', auto_publish_enabled: false }, base, candidates: [candidate] })
  const options = { changedFiles: ['knowledge/content/briefs/K-004.json'], briefIds: ['K-004'] }
  try {
    await mkdir(dirname(sourcePath), { recursive: true })
    await writeFile(sourcePath, bytes)
    assert.equal((await checkRelease(withCandidate(), options)).decision, 'WOULD_AUTO_PUBLISH')

    await writeFile(sourcePath, Buffer.from('{"source":"changed fixture"}\n'))
    const changed = await checkRelease(withCandidate(), options)
    assert.equal(changed.decision, 'HUMAN_REVIEW_REQUIRED')
    assert.ok(changed.reasons.includes('SOURCE_CHANGED:K-004'))

    await rm(sourcePath)
    const unavailable = await checkRelease(withCandidate(), options)
    assert.equal(unavailable.decision, 'HUMAN_REVIEW_REQUIRED')
    assert.ok(unavailable.reasons.includes('SOURCE_UNAVAILABLE:K-004'))

    const invalidPath = await checkRelease(withCandidate({ ...archiveCandidate, source_manifest_ref: 'worldlines/AFTERFALL/raw/SOURCE_MANIFEST.json' }), options)
    assert.equal(invalidPath.decision, 'HUMAN_REVIEW_REQUIRED')
    assert.ok(invalidPath.reasons.includes('SOURCE_PATH_INVALID:K-004'))
  } finally { await rm(base, { recursive: true, force: true }) }
})

test('candidate absence, bad status, missing disposition, link errors, and normalized duplicates never pass', async () => {
  const data = await loadKnowledge(root)
  const candidate = data.candidates.find((item) => item.brief_id === 'K-004')
  assert.ok(candidate)
  const release = (candidates) => checkRelease({ ...data, candidates }, {
    changedFiles: ['knowledge/content/briefs/K-004.json'], briefIds: ['K-004'],
  })
  const missing = await release([])
  assert.equal(missing.decision, 'HOLD')
  assert.equal(missing.requires_human, false)

  for (const mutation of [
    { status: 'DISCOVERED' },
    { disposition_note: '' },
    { brief_id: 'K-999' },
  ]) assert.equal((await release([{ ...candidate, ...mutation }])).decision, 'HOLD')

  const duplicate = { ...candidate, id: 'KC-normalized-duplicate', brief_id: 'K-999', question: candidate.question.replace('비상 물자를', '비상-물자를').replace('여러 거점', '여러  거점') }
  const duplicateResult = await release([candidate, duplicate])
  assert.equal(duplicateResult.decision, 'HUMAN_REVIEW_REQUIRED')
  assert.ok(duplicateResult.reasons.includes('UNRESOLVED_DUPLICATE:K-004'))
})

test('Reader-only claims require explicit narrative scope and limitation markers', async () => {
  const data = await loadKnowledge(root)
  const pack = data.evidence.get('K-004')
  const changedClaims = pack.claims.map((claim, index) => index === 0 ? { ...claim, source_ids: ['S2'] } : claim)
  const evidence = new Map(data.evidence).set('K-004', { ...pack, claims: changedClaims })
  const result = await checkRelease({ ...data, evidence }, {
    changedFiles: ['knowledge/content/briefs/K-004.json'], briefIds: ['K-004'],
  })
  assert.equal(result.decision, 'HUMAN_REVIEW_REQUIRED')
  assert.ok(result.reasons.includes('AUTHORITATIVE_SUPPORT_MISSING:K-004'))
})

test('production publication is complete only when deploy, page, index, and sitemap match', () => {
  const valid = { deployCommitSha: 'abc123', mergeSha: 'abc123', pageReachable: true, indexContains: true, sitemapContains: true }
  assert.deepEqual(verifyProductionPublication({ ...valid, deployStatus: 'ready' }), { status: 'PUBLISHED', reasons: [] })
  assert.deepEqual(verifyProductionPublication({ ...valid, deployStatus: 'READY' }), { status: 'PUBLISHED', reasons: [] })
  assert.equal(verifyProductionPublication({ ...valid, deployStatus: 'building' }).status, 'AUTO_PUBLISH_INCOMPLETE')
  assert.equal(verifyProductionPublication({ ...valid, deployStatus: 'error' }).status, 'AUTO_PUBLISH_INCOMPLETE')
  assert.equal(verifyProductionPublication({ deployStatus: 'READY', deployCommitSha: 'oldsha', mergeSha: 'abc123', pageReachable: true, indexContains: true, sitemapContains: true }).status, 'AUTO_PUBLISH_INCOMPLETE')
  for (const field of ['pageReachable', 'indexContains', 'sitemapContains']) assert.equal(verifyProductionPublication({ ...valid, deployStatus: 'ready', [field]: false }).status, 'AUTO_PUBLISH_INCOMPLETE')
})
test('duplicate identity, broken relations and missing downloads fail validation', async () => {
  const data = await loadKnowledge(root)
  await assert.rejects(validateKnowledge({ ...data, briefs: [...data.briefs, { ...data.briefs[0] }] }), /duplicate or invalid brief id/)
  await assert.rejects(validateKnowledge({ ...data, briefs: [{ ...data.briefs[0], related_brief_ids: ['K-999'] }, data.briefs[1]] }), /related ref/)
  const broken = { ...data.briefs[0],
    tools: [{ ...data.briefs[0].tools[0], path: '/knowledge/downloads/missing.xlsx' }],
    sections: data.briefs[0].sections.map((section) => ({ ...section, blocks: section.blocks.map((block) => block.type === 'download/tool' ? { ...block, tool_path: '/knowledge/downloads/missing.xlsx' } : block) })) }
  await assert.rejects(validateKnowledge({ ...data, briefs: [broken, data.briefs[1]] }), /broken tool/)
})
test('generated golden pages remain static, searchable, linked and downloadable', async () => {
  const data = await loadKnowledge(root)
  const index = await readFile(join(root, 'archive/web/public/knowledge/index.html'), 'utf8')
  const sitemap = await readFile(join(root, 'archive/web/public/sitemap.xml'), 'utf8')
  for (const brief of data.briefs.filter((item) => item.status === 'PUBLISHED')) {
    const page = await readFile(join(root, 'archive/web/public/knowledge', brief.slug, 'index.html'), 'utf8')
    assert.match(index, new RegExp(`/knowledge/${brief.slug}/`))
    assert.match(sitemap, new RegExp(`/knowledge/${brief.slug}/`))
    assert.ok(page.includes(`<h1>${brief.title}</h1>`))
    assert.ok(page.includes(`<title>${brief.title} | 생존일기</title>`))
    assert.ok(page.includes(brief.meta_description))
    assert.ok(page.includes('https://schema.org'))
    assert.ok(page.includes('rel="canonical"'))
    for (const source of brief.sources) assert.ok(page.includes(source.url.replace(/&/g, '&amp;')))
    for (const related of brief.related_brief_ids.map((id) => data.briefs.find((item) => item.id === id)).filter((item) => item?.status === 'PUBLISHED')) assert.ok(page.includes(`/knowledge/${related.slug}/`))
    for (const tool of brief.tools) assert.ok(page.includes(`href="${tool.path}" download`))
    assert.doesNotMatch(page, /<script(?! type="application\/ld\+json")/)
  }
})


test('worker V2 dispatcher prefers FRESH on twice-daily cadence and uses one daily BACKFILL window', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const providerConfig = JSON.parse(await readFile(join(root, 'knowledge/automation/provider-config.json'), 'utf8'))
  assert.equal(validateWorkerPolicy(policy), true)
  assert.equal(validateProviderConfig(providerConfig), true)
  assert.equal(policy.dispatcher.trigger_interval_hours, 12)
  assert.equal(policy.editorial_spec_ref, 'docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md')
  assert.equal(policy.research_policy.minimum_authoritative_sources_per_brief, 2)
  assert.equal(policy.research_policy.preferred_authoritative_sources_per_brief, 3)

  const pending = [{ source_manifest_ref: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/SOURCE_MANIFEST.json' }]
  assert.equal(planWorkerRun({ policy, providerConfig, pendingSources: pending, openWorkerPr: false, localHour: 6 }).decision, 'FRESH')
  assert.equal(planWorkerRun({ policy, providerConfig, pendingSources: [], openWorkerPr: false, localHour: 6 }).decision, 'BACKFILL')
  assert.equal(planWorkerRun({ policy, providerConfig, pendingSources: [], openWorkerPr: false, localHour: 12 }).decision, 'NOOP_WAIT')
  assert.equal(planWorkerRun({ policy, providerConfig, pendingSources: pending, openWorkerPr: true, localHour: 6 }).decision, 'NOOP_OPEN_WORKER_PR')
})

test('worker provider can switch without changing dispatcher or repository safety contracts', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const providerConfig = JSON.parse(await readFile(join(root, 'knowledge/automation/provider-config.json'), 'utf8'))
  const switched = {
    ...providerConfig,
    active_provider: 'OPENAI_API',
    providers: {
      ...providerConfig.providers,
      CHATGPT_SCHEDULED: { ...providerConfig.providers.CHATGPT_SCHEDULED, enabled: false },
      OPENAI_API: { ...providerConfig.providers.OPENAI_API, enabled: true },
    },
  }
  assert.equal(validateProviderConfig(switched), true)
  const plan = planWorkerRun({ policy, providerConfig: switched, pendingSources: [{ id: 'fresh' }], openWorkerPr: false, localHour: 0 })
  assert.equal(plan.decision, 'FRESH')
  assert.equal(plan.provider, 'OPENAI_API')

  const leaked = {
    ...switched,
    providers: {
      ...switched.providers,
      OPENAI_API: { ...switched.providers.OPENAI_API, api_key: 'forbidden' },
    },
  }
  assert.throws(() => validateProviderConfig(leaked), /checked-in secret forbidden/)
})


test('publish preparation accepts only exact release decisions and promotes READY low-risk brief', () => {
  assert.equal(expectedReleaseDecision('AUTO_LOW_RISK_SHADOW'), 'WOULD_AUTO_PUBLISH')
  assert.equal(expectedReleaseDecision('AUTO_LOW_RISK'), 'AUTO_PUBLISH_ELIGIBLE')
  assert.equal(expectedReleaseDecision('PR_ONLY'), null)

  const passing = {
    decision: 'WOULD_AUTO_PUBLISH',
    requires_human: false,
    content_only: { allowed: true },
    reasons: [],
  }
  assert.equal(assertReleaseReady(passing, 'AUTO_LOW_RISK_SHADOW'), true)
  assert.throws(() => assertReleaseReady({ ...passing, decision: 'HOLD' }, 'AUTO_LOW_RISK_SHADOW'), /release decision/)
  assert.throws(() => assertReleaseReady({ ...passing, requires_human: true }, 'AUTO_LOW_RISK_SHADOW'), /human review/)
  assert.throws(() => assertReleaseReady({ ...passing, content_only: { allowed: false } }, 'AUTO_LOW_RISK_SHADOW'), /content-only/)

  const ready = {
    content_type: 'BRIEF',
    id: 'K-999',
    status: 'READY',
    risk_level: 'LOW',
    publication_policy: 'AUTO_LOW_RISK',
    semantic_qa_status: 'PASS',
    published_at: '2026-09-20',
    updated_at: '2026-09-20',
  }
  const promoted = promoteBriefRecord(ready, '2026-09-28')
  assert.equal(promoted.status, 'PUBLISHED')
  assert.equal(promoted.published_at, '2026-09-20')
  assert.equal(promoted.updated_at, '2026-09-28')
  assert.throws(() => promoteBriefRecord({ ...ready, risk_level: 'HIGH' }, '2026-09-28'), /risk must be LOW/)
  assert.throws(() => promoteBriefRecord({ ...ready, semantic_qa_status: 'REVIEW' }, '2026-09-28'), /semantic QA/)
  assert.throws(() => promoteBriefRecord({ ...ready, status: 'PUBLISHED' }, '2026-09-28'), /status must be READY/)
})


test('worker publication policy requires exact-head and exact Production verification in live AUTO mode', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  assert.equal(validateWorkerPolicy(policy), true)
  assert.equal(policy.publication_policy.required_repository_mode, 'AUTO_LOW_RISK')
  assert.equal(policy.publication_policy.required_auto_publish_enabled, true)
  assert.equal(policy.publication_policy.auto_merge, true)
  assert.equal(policy.publication_policy.production_publish, true)
  assert.equal(policy.publication_policy.exact_head_validation_required, true)
  assert.equal(policy.publication_policy.production_exact_sha_required, true)

  assert.throws(() => validateWorkerPolicy({
    ...policy,
    publication_policy: { ...policy.publication_policy, exact_head_validation_required: false },
  }), /exact-head validation required/)
  assert.throws(() => validateWorkerPolicy({
    ...policy,
    publication_policy: { ...policy.publication_policy, required_auto_publish_enabled: false },
  }), /publication enabled flag/)
  assert.throws(() => validateWorkerPolicy({
    ...policy,
    publication_policy: { ...policy.publication_policy, production_publish: false },
  }), /Production publish must match publication mode/)
})


test('tokenless Production metadata requires Netlify production and exact merge SHA', () => {
  const sha = 'a'.repeat(40)
  assert.equal(isExactProductionDeployMeta({
    version: 1,
    provider: 'netlify',
    context: 'production',
    commit_ref: sha,
  }, sha), true)
  assert.equal(isExactProductionDeployMeta({
    version: 1,
    provider: 'netlify',
    context: 'deploy-preview',
    commit_ref: sha,
  }, sha), false)
  assert.equal(isExactProductionDeployMeta({
    version: 1,
    provider: 'github-actions',
    context: 'production',
    commit_ref: sha,
  }, sha), false)
  assert.equal(isExactProductionDeployMeta({
    version: 1,
    provider: 'netlify',
    context: 'production',
    commit_ref: 'b'.repeat(40),
  }, sha), false)
  assert.equal(isExactProductionDeployMeta(null, sha), false)
})


test('editorial policy reference and quality target fail closed', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  assert.throws(() => validateWorkerPolicy({
    ...policy,
    editorial_spec_ref: 'docs/WRONG.md',
  }), /editorial spec ref/)
  assert.throws(() => validateWorkerPolicy({
    ...policy,
    research_policy: { ...policy.research_policy, preferred_authoritative_sources_per_brief: 1 },
  }), /preferred authoritative sources/)
  assert.throws(() => validateWorkerPolicy({
    ...policy,
    dispatcher: { ...policy.dispatcher, trigger_interval_hours: 6 },
  }), /dispatcher trigger interval must be 12 hours/)
})


test('fresh HOLD and HUMAN_REVIEW dispositions are durable scanner terminal states', () => {
  const source = {
    source_manifest_ref: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_999/SOURCE_MANIFEST.json',
    source_manifest_sha256: 'a'.repeat(64),
  }
  for (const status of ['HOLD', 'HUMAN_REVIEW']) {
    const state = { version: 1, sources: [] }
    recordKnowledgeDisposition(state, {
      sourceManifestRef: source.source_manifest_ref,
      sourceManifestSha256: source.source_manifest_sha256,
      status,
      processedAt: '2026-09-29T00:00:00.000Z',
      dispositionCode: status === 'HOLD' ? 'NO_STRONG_TOPIC' : 'RISK_REVIEW_REQUIRED',
      dispositionNote: 'fixture disposition',
    })
    assert.equal(state.sources[0].status, status)
    const scan = scanKnowledge([source], state)
    assert.equal(scan.status, 'NOOP')
    assert.equal(scan.sources.length, 0)

    const changed = scanKnowledge([{ ...source, source_manifest_sha256: 'b'.repeat(64) }], state)
    assert.equal(changed.status, 'SOURCE_CHANGED_RESCAN_REQUIRED')
  }
})

test('runtime state makes BACKFILL durable and allows late retry without wall-clock-only logic', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const runtime = { version: 1, backfill: { last_attempted_at: null, last_work_key: null, last_result: null, reviewed_items: [] } }
  assert.equal(validateRuntimeState(runtime), true)

  const sixKst = '2026-09-29T21:00:00.000Z'
  const eighteenKst = '2026-09-30T09:00:00.000Z'
  assert.equal(backfillDue({ policy, runtimeState: runtime, now: sixKst }), true)
  assert.equal(backfillDue({ policy, runtimeState: runtime, now: eighteenKst }), false)

  recordBackfillResult(runtime, { workKey: 'PUBLIC_READER:chapter-1:sha-a', status: 'NO_CANDIDATE', now: sixKst })
  assert.equal(backfillDue({ policy, runtimeState: runtime, now: eighteenKst }), false)
  assert.equal(backfillDue({ policy, runtimeState: runtime, now: '2026-10-01T09:00:01.000Z' }), true)
  assert.deepEqual(runtime.backfill.reviewed_items.map((item) => item.work_key), ['PUBLIC_READER:chapter-1:sha-a'])
})

test('worker branches are deterministic and separated by work identity', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const a = { source_manifest_ref: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_100/SOURCE_MANIFEST.json', source_manifest_sha256: 'a'.repeat(64) }
  const b = { ...a, source_manifest_sha256: 'b'.repeat(64) }
  assert.equal(deterministicFreshBranch(policy, a), deterministicFreshBranch(policy, a))
  assert.notEqual(deterministicFreshBranch(policy, a), deterministicFreshBranch(policy, b))
  assert.ok(deterministicFreshBranch(policy, a).startsWith('knowledge/worker/fresh-'))
  assert.ok(deterministicBackfillBranch(policy, 'reader:chapter-1').startsWith('knowledge/worker/backfill-'))
  assert.ok(deterministicStateBranch(policy, 'fresh:hold:chapter-1').startsWith('knowledge/worker/state-'))
})

test('open Worker PR lifecycle distinguishes running, resumable, blocked and stalled states', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const base = {
    number: 99,
    head_ref: 'knowledge/worker/fresh-abc123',
    head_sha: 'a'.repeat(40),
    updated_at: '2026-09-29T00:00:00.000Z',
    state: 'open',
    draft: true,
    body: workerPhaseMarker(policy, 'PACKAGE_READY'),
    labels: [],
  }
  assert.equal(classifyWorkerPr({
    policy, pr: base, now: '2026-09-29T01:00:00.000Z',
    checks: [{ name: 'Knowledge', status: 'in_progress', conclusion: null }],
  }).result, 'WAITING_PR')

  assert.equal(classifyWorkerPr({
    policy, pr: base, now: '2026-09-29T01:00:00.000Z',
    checks: [{ name: 'Knowledge', status: 'completed', conclusion: 'success' }],
  }).result, 'RESUME_PR')

  assert.equal(classifyWorkerPr({
    policy, pr: base, now: '2026-09-29T01:00:00.000Z',
    checks: [{ name: 'Knowledge', status: 'completed', conclusion: 'failure' }],
  }).result, 'BLOCKED_PR')

  assert.equal(classifyWorkerPr({
    policy,
    pr: { ...base, labels: ['knowledge-publish-prepare'] },
    now: '2026-09-29T07:00:01.000Z',
    checks: [{ name: 'Knowledge', status: 'completed', conclusion: 'success' }],
  }).result, 'STALLED_PR')
})

test('canonical preflight blocks duplicate Worker PRs and respects actual provider binding', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const provider = JSON.parse(await readFile(join(root, 'knowledge/automation/provider-config.json'), 'utf8'))
  const runtime = { version: 1, backfill: { last_attempted_at: null, last_work_key: null, last_result: null, reviewed_items: [] } }
  const scanner = { status: 'PENDING', sources: [{
    source_manifest_ref: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_100/SOURCE_MANIFEST.json',
    source_manifest_sha256: 'a'.repeat(64),
    status: 'PENDING',
  }] }

  const fresh = planWorkerPreflight({ policy, providerConfig: provider, runtimeState: runtime, scannerResult: scanner,
    pullRequests: [], checksByPr: {}, branchInventory: [], now: '2026-09-29T21:00:00.000Z' })
  assert.equal(fresh.result, 'FRESH_READY')
  assert.ok(fresh.branch.startsWith('knowledge/worker/fresh-'))

  const pr = (number) => ({ number, state: 'open', head_ref: `knowledge/worker/fresh-${number}`,
    head_sha: String(number).padStart(40, 'a').slice(-40), updated_at: '2026-09-29T20:00:00.000Z',
    draft: true, body: workerPhaseMarker(policy, 'PACKAGE_READY'), labels: [] })
  const blocked = planWorkerPreflight({ policy, providerConfig: provider, runtimeState: runtime, scannerResult: { status: 'NOOP', sources: [] },
    pullRequests: [pr(1), pr(2)], checksByPr: {}, branchInventory: [], now: '2026-09-29T21:00:00.000Z' })
  assert.equal(blocked.result, 'BLOCKED_CONTRACT')
  assert.equal(blocked.reason, 'MULTIPLE_OPEN_WORKER_PRS')

  const otherProvider = { ...provider, active_provider: 'OPENAI_API',
    providers: { ...provider.providers, CHATGPT_SCHEDULED: { ...provider.providers.CHATGPT_SCHEDULED, enabled: false },
      OPENAI_API: { ...provider.providers.OPENAI_API, enabled: true } } }
  assert.equal(planWorkerPreflight({ policy, providerConfig: otherProvider, runtimeState: runtime,
    scannerResult: { status: 'NOOP', sources: [] }, pullRequests: [], checksByPr: {}, branchInventory: [],
    now: '2026-09-29T21:00:00.000Z' }).result, 'PROVIDER_NOT_ACTIVE')
})

test('notification markers and RUN_RESULT contract are deterministic', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  assert.deepEqual([...policy.runtime.run_result_codes].sort(), [...RUN_RESULT_CODES].sort())
  const marker = notificationMarker(policy, { result: 'STALLED_PR', prNumber: 123, headSha: 'a'.repeat(40) })
  assert.equal(marker, notificationMarker(policy, { result: 'STALLED_PR', prNumber: 123, headSha: 'a'.repeat(40) }))
  assert.match(marker, /knowledge-worker-notify-v1:STALLED_PR:123:/)
})


test('publication handoff marker prefix is fixed for human-removal detection', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  assert.equal(policy.runtime.publication_marker_prefix, 'knowledge-worker-publication-v1')
  assert.equal(validateWorkerPolicy(policy), true)
})


test('preflight fails closed when PR, check or branch inventory is omitted', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const provider = JSON.parse(await readFile(join(root, 'knowledge/automation/provider-config.json'), 'utf8'))
  const runtime = { version: 1, backfill: { last_attempted_at: null, last_work_key: null, last_result: null, reviewed_items: [] } }
  const scannerResult = { status: 'NOOP', sources: [] }
  assert.equal(planWorkerPreflight({ policy, providerConfig: provider, runtimeState: runtime, scannerResult,
    checksByPr: {}, branchInventory: [], now: '2026-09-29T21:00:00.000Z' }).reason, 'PR_INVENTORY_REQUIRED')
  assert.equal(planWorkerPreflight({ policy, providerConfig: provider, runtimeState: runtime, scannerResult,
    pullRequests: [], branchInventory: [], now: '2026-09-29T21:00:00.000Z' }).reason, 'CHECK_INVENTORY_REQUIRED')
  assert.equal(planWorkerPreflight({ policy, providerConfig: provider, runtimeState: runtime, scannerResult,
    pullRequests: [], checksByPr: {}, now: '2026-09-29T21:00:00.000Z' }).reason, 'BRANCH_INVENTORY_REQUIRED')
})

test('orphan deterministic branches are resumed or salvaged before new work', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const provider = JSON.parse(await readFile(join(root, 'knowledge/automation/provider-config.json'), 'utf8'))
  const runtime = { version: 1, backfill: { last_attempted_at: null, last_work_key: null, last_result: null, reviewed_items: [] } }
  const base = { name: 'knowledge/worker/backfill-deadbeef1234', head_sha: 'a'.repeat(40), ahead_by: 1 }
  const resume = planWorkerPreflight({ policy, providerConfig: provider, runtimeState: runtime,
    scannerResult: { status: 'NOOP', sources: [] }, pullRequests: [], checksByPr: {},
    branchInventory: [{ ...base, behind_by: 2 }], now: '2026-09-29T21:00:00.000Z' })
  assert.equal(resume.result, 'RESUME_BRANCH')
  assert.equal(resume.action, 'VALIDATE_PACKAGE_THEN_OPEN_DRAFT_PR')

  const salvage = planWorkerPreflight({ policy, providerConfig: provider, runtimeState: runtime,
    scannerResult: { status: 'NOOP', sources: [] }, pullRequests: [], checksByPr: {},
    branchInventory: [{ ...base, behind_by: policy.runtime.salvage_when_behind_commits + 1 }],
    now: '2026-09-29T21:00:00.000Z' })
  assert.equal(salvage.result, 'SALVAGE_BRANCH')
  assert.equal(salvage.action, 'REBUILD_SAME_BRANCH_ON_CURRENT_MAIN_THEN_OPEN_DRAFT_PR')
})

test('closed unmerged deterministic Worker branch is never resurrected automatically', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const provider = JSON.parse(await readFile(join(root, 'knowledge/automation/provider-config.json'), 'utf8'))
  const runtime = { version: 1, backfill: { last_attempted_at: null, last_work_key: null, last_result: null, reviewed_items: [] } }
  const source = {
    source_manifest_ref: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_901/SOURCE_MANIFEST.json',
    source_manifest_sha256: '9'.repeat(64), status: 'PENDING',
  }
  const name = deterministicFreshBranch(policy, source)
  const result = planWorkerPreflight({ policy, providerConfig: provider, runtimeState: runtime,
    scannerResult: { status: 'PENDING', sources: [source] },
    pullRequests: [{ number: 501, state: 'closed', merged_at: null, head_ref: name, head_sha: 'b'.repeat(40),
      updated_at: '2026-09-29T20:00:00.000Z', labels: [], body: workerPhaseMarker(policy, 'PACKAGE_READY'), draft: true }],
    checksByPr: {}, branchInventory: [{ name, head_sha: 'b'.repeat(40), ahead_by: 1, behind_by: 1 }],
    now: '2026-09-29T21:00:00.000Z' })
  assert.equal(result.result, 'BLOCKED_CONTRACT')
  assert.equal(result.reason, 'CLOSED_UNMERGED_WORKER_BRANCH')
})

test('content Worker PR requires phase marker and handles Draft exact-head gate safely', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const base = {
    number: 601, state: 'open', head_ref: 'knowledge/worker/fresh-deadbeef1234',
    head_sha: 'c'.repeat(40), updated_at: '2026-09-29T20:00:00.000Z', draft: true, labels: [],
  }
  const missing = classifyWorkerPr({ policy, pr: { ...base, body: '' },
    checks: [{ name: 'Validate Knowledge worker gate', status: 'completed', conclusion: 'success' }],
    now: '2026-09-29T21:00:00.000Z' })
  assert.equal(missing.result, 'BLOCKED_CONTRACT')
  assert.equal(missing.reason, 'MISSING_WORKER_PR_PHASE')

  const ready = classifyWorkerPr({ policy, pr: { ...base, body: workerPhaseMarker(policy, 'PACKAGE_READY') },
    checks: [{ name: 'Validate Knowledge worker gate', status: 'completed', conclusion: 'success' }],
    now: '2026-09-29T21:00:00.000Z' })
  assert.equal(ready.result, 'RESUME_PR')
  assert.equal(ready.action, 'MARK_READY_THEN_PUBLICATION_HANDOFF')

  const human = classifyWorkerPr({ policy, pr: { ...base, draft: false, body: workerPhaseMarker(policy, 'PUBLICATION_HANDOFF') },
    checks: [{ name: 'Validate Knowledge worker gate', status: 'completed', conclusion: 'success' }],
    now: '2026-09-29T21:00:00.000Z' })
  assert.equal(human.result, 'HUMAN_REVIEW_REQUIRED')
  assert.equal(human.reason, 'PUBLICATION_LABEL_REMOVED_AFTER_HANDOFF')
})


test('open Worker PR with green checks syncs current main before publication handoff', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  const provider = JSON.parse(await readFile(join(root, 'knowledge/automation/provider-config.json'), 'utf8'))
  const runtime = { version: 1, backfill: { last_attempted_at: null, last_work_key: null, last_result: null, reviewed_items: [] } }
  const pr = {
    number: 777,
    state: 'open',
    head_ref: 'knowledge/worker/backfill-deadbeef1234',
    head_sha: 'd'.repeat(40),
    updated_at: '2026-09-29T20:00:00.000Z',
    draft: true,
    body: workerPhaseMarker(policy, 'PACKAGE_READY'),
    labels: [],
  }
  const result = planWorkerPreflight({
    policy,
    providerConfig: provider,
    runtimeState: runtime,
    scannerResult: { status: 'NOOP', sources: [] },
    pullRequests: [pr],
    checksByPr: { 777: [{ name: 'Validate Knowledge worker gate', status: 'completed', conclusion: 'success' }] },
    branchInventory: [{ name: pr.head_ref, head_sha: pr.head_sha, ahead_by: 1, behind_by: 2 }],
    now: '2026-09-29T21:00:00.000Z',
  })
  assert.equal(result.result, 'RESUME_PR')
  assert.equal(result.action, 'SYNC_CURRENT_MAIN_THEN_RECHECK')
  assert.equal(result.behind_by, 2)
})


test('GitHub Actions owns automatic publication handoff', async () => {
  const policy = JSON.parse(await readFile(join(root, 'knowledge/automation/worker-policy.json'), 'utf8'))
  assert.equal(policy.runtime.publication_handoff_owner, 'GITHUB_ACTIONS')
  assert.equal(policy.runtime.automatic_publication_handoff, true)
  assert.equal(policy.runtime.scheduled_ai_publication_handoff, false)
  assert.equal(validateWorkerPolicy(policy), true)
})
