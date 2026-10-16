import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byteHash, graphHash } from './publication-graph.mjs'
import { loadWikiReviewSources } from './wiki-review-sources.mjs'
import { externalReviewLedgerPath } from '../run-wiki-continuous-review.mjs'
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyReviewLedger, enqueueReviewWork, discoverReviewWork, submitReviewExtraction,
  submitIndependentReview, validateReviewLedger, reviewQueueSummary } from './wiki-continuous-review.mjs'

const at = '2026-10-16T13:00:00.000Z'
const h = byteHash('fictional bytes')
function scope(id = 'C01-FIXTURE', sourceId = 'chapter-01') {
  const text = 'Mira inspected the northern gate and recorded a broken hinge.'
  const binding = { chronicle_id: id, worldline_id: id + '-WORLD', source_id: sourceId,
    source_sha256: byteHash(text), raw: [{ ref: 'fixture.md', sha256: h }], wiki_sha256: h,
    book_sha256: h, approval_sha256: h }
  return { ...binding, scope_sha256: graphHash(binding), source: { text },
    existing: { nodes: [{ id: 'char-mira', facts: [{ text: 'Mira inspected the northern gate.' }] }], relations: [] },
    publication_policy: 'NEW_EXACT_HUMAN_APPROVAL_REQUIRED' }
}
const discovery = scopes => ({ scopes, inventory: [], new_source: null })
function result(job, candidates = []) {
  return { version: 'wiki-continuous-result-v1', job_id: job.job_id, scope_sha256: job.scope_sha256,
    coverage: 'COMPLETE', checked_fact_count: 1, candidates, insufficient_evidence: [],
    next_review_condition: 'Actual source or wiki bytes change; new source-bound error evidence.' }
}
function candidate(s) {
  return { work_type: 'MISSING_FACT', chronicle_id: s.chronicle_id, text: 'Mira recorded a broken hinge.',
    meaningful_change: 'The condition of the gate is absent from the current fixture wiki.',
    assertion_kind: 'RECORDED', entity_ids: ['char-mira'],
    evidence: [{ source_sha256: s.source_sha256, quote: s.source.text }] }
}
function review(ledger, decision = 'APPROVE') {
  const e = ledger.events.at(-1)
  return { version: 'wiki-continuous-review-v1', job_id: e.job_id, proposal_sha256: e.proposal_sha256,
    decision, note: 'Independent fictional-fixture review only; never operating content.' }
}
test('TEST 1: new C03 source routes to unchanged legacy Native path before all historical work', () => {
  const d = { ...discovery([scope()]), new_source: { sourceDigest: h } }
  const selected = enqueueReviewWork(d, emptyReviewLedger(), at)
  assert.equal(selected.status, 'LEGACY_NEW_SOURCE')
  assert.equal(selected.route, 'EXISTING_C03_NATIVE')
  assert.equal(selected.ledger.events.length, 0)
})
test('TEST 2/3: C01 → C02 → C03 rotates once and exact completed scopes become idle', () => {
  const d = discovery([scope('C01-FIXTURE'), scope('C02-FIXTURE'), scope('C03-FIXTURE')])
  let ledger = emptyReviewLedger()
  for (const s of d.scopes) {
    const queued = enqueueReviewWork(d, ledger, at)
    assert.equal(queued.job.chronicle_id, s.chronicle_id)
    assert.equal(enqueueReviewWork(d, queued.ledger, at).status, 'EXISTING_JOB')
    ledger = submitReviewExtraction(queued.ledger, queued.job.job_id, s, result(queued.job), 'extract-run', at)
    ledger = submitIndependentReview(ledger, queued.job.job_id, s, review(ledger), 'review-run', at)
  }
  assert.equal(discoverReviewWork(d, ledger).status, 'NO_JOB')
  assert.equal(enqueueReviewWork(d, ledger, at).ledger.events.length, ledger.events.length)
})
test('TEST 4/5: duplicates excluded and identical entity IDs remain world scoped', () => {
  const a = scope('C01-FIXTURE'), b = scope('C02-FIXTURE')
  assert.notEqual(a.scope_sha256, b.scope_sha256)
  const q = enqueueReviewWork(discovery([a]), emptyReviewLedger(), at)
  const c = candidate(a)
  const ledger = submitReviewExtraction(q.ledger, q.job.job_id, a, result(q.job, [c, c,
    { ...c, text: a.existing.nodes[0].facts[0].text }]), 'extract-run', at)
  assert.equal(ledger.events.at(-1).proposal.candidates.length, 1)
  assert.equal(ledger.events.at(-1).proposal.duplicates.length, 2)
  assert.throws(() => submitReviewExtraction(q.ledger, q.job.job_id, a,
    result(q.job, [candidate(b)]), 'extract-run', at), /CANDIDATE_INVALID/)
})
test('TEST 6/7: missing quotes, choices, plans, reported-to-recorded tricks require rejection or semantic review', () => {
  const s = scope(), q = enqueueReviewWork(discovery([s]), emptyReviewLedger(), at)
  for (const mutation of [c => c.evidence = [], c => c.evidence[0].quote = 'invented evidence',
    c => c.assertion_kind = 'PLAN', c => c.assertion_kind = 'CHOICE', c => c.entity_ids = ['other-world-id']]) {
    const c = candidate(s); mutation(c)
    assert.throws(() => submitReviewExtraction(q.ledger, q.job.job_id, s, result(q.job, [c]), 'extract', at))
  }
  // A lexical quote does not prove an occurrence: a fresh Reviewer can still reject.
  const extracted = submitReviewExtraction(q.ledger, q.job.job_id, s, result(q.job, [candidate(s)]), 'extract', at)
  const rejected = submitIndependentReview(extracted, q.job.job_id, s, review(extracted, 'REJECT'), 'review', at)
  assert.equal(rejected.events.at(-1).status, 'REJECT')
})
test('TEST 8/9: independent HUMAN_REVIEW is terminal; old approval and extraction stay immutable', () => {
  const s = scope(), q = enqueueReviewWork(discovery([s]), emptyReviewLedger(), at)
  const extracted = submitReviewExtraction(q.ledger, q.job.job_id, s, result(q.job, [candidate(s)]), 'extract', at)
  assert.throws(() => submitIndependentReview(extracted, q.job.job_id, s, review(extracted), 'extract', at), /INDEPENDENT_EXECUTION/)
  const held = submitIndependentReview(extracted, q.job.job_id, s, review(extracted, 'HUMAN_REVIEW'), 'review', at)
  assert.equal(held.events.at(-1).status, 'HUMAN_REVIEW')
  assert.equal(held.events.at(-1).job.scope.approval_sha256, s.approval_sha256)
  assert.deepEqual(held.events.slice(0, extracted.events.length), extracted.events)
  assert.throws(() => submitIndependentReview(held, q.job.job_id, s, review(held), 'other-review', at), /PHASE_MISMATCH/)
})
test('TEST 10/12: NO_CHANGE retained, no publication and unknown scheduler status are explicit', () => {
  const s = scope(), d = discovery([s]), q = enqueueReviewWork(d, emptyReviewLedger(), at)
  const e = submitReviewExtraction(q.ledger, q.job.job_id, s, result(q.job), 'extract', at)
  const done = submitIndependentReview(e, q.job.job_id, s, review(e), 'review', at)
  assert.equal(done.events.at(-1).work_type, 'NO_CHANGE')
  assert.equal(discoverReviewWork(d, done).reason, '정상 대기 — 현재 새로 반영할 사실 없음')
  assert.equal(reviewQueueSummary(d, done).published_count, 0)
  assert.equal(reviewQueueSummary(d, done).schedule_status, 'UNKNOWN')
})
test('TEST 13: Graph/wiki changes invalidate review and retain old job before requeue', () => {
  const s = scope(), q = enqueueReviewWork(discovery([s]), emptyReviewLedger(), at)
  const e = submitReviewExtraction(q.ledger, q.job.job_id, s, result(q.job), 'extract', at)
  const changed = { ...s, wiki_sha256: byteHash('changed wiki') }
  const { scope_sha256, source, existing, publication_policy, ...binding } = changed
  changed.scope_sha256 = graphHash(binding)
  assert.throws(() => submitIndependentReview(e, q.job.job_id, changed, review(e), 'review', at), /STALE_SCOPE/)
  const newer = enqueueReviewWork(discovery([changed]), e, at)
  assert.equal(newer.status, 'QUEUED')
  assert.notEqual(newer.job.job_id, q.job.job_id)
  assert.equal(newer.ledger.events.at(-2).status, 'SUPERSEDED')
  assert.deepEqual(newer.ledger.events.slice(0, e.events.length), e.events)
})
test('TEST 14: adding C04 changes no existing graph, receipts, jobs or IDs', () => {
  const d = discovery([scope()]), q = enqueueReviewWork(d, emptyReviewLedger(), at)
  const before = JSON.stringify(q.ledger)
  assert.equal(discoverReviewWork(discovery([...d.scopes, scope('C04-FIXTURE')]), q.ledger).job.job_id, q.job.job_id)
  assert.equal(JSON.stringify(q.ledger), before)
})
test('rejected or stale unposted candidates do not suppress a fresh scope review', () => {
  const s = scope(), q = enqueueReviewWork(discovery([s]), emptyReviewLedger(), at)
  const extracted = submitReviewExtraction(q.ledger, q.job.job_id, s, result(q.job, [candidate(s)]), 'extract', at)
  const rejected = submitIndependentReview(extracted, q.job.job_id, s, review(extracted, 'REJECT'), 'review', at)
  const changed = { ...s, wiki_sha256: byteHash('new graph') }
  const { scope_sha256, source, existing, publication_policy, ...binding } = changed
  changed.scope_sha256 = graphHash(binding)
  const fresh = enqueueReviewWork(discovery([changed]), rejected, at)
  const again = submitReviewExtraction(fresh.ledger, fresh.job.job_id, changed,
    result(fresh.job, [candidate(changed)]), 'fresh-extract', at)
  assert.equal(again.events.at(-1).proposal.candidates.length, 1)
  assert.equal(again.events.at(-1).proposal.duplicates.length, 0)
})
test('source-only drift invalidates old approved pending review even with identical wiki bytes', () => {
  const s = scope(), q = enqueueReviewWork(discovery([s]), emptyReviewLedger(), at)
  const extracted = submitReviewExtraction(q.ledger, q.job.job_id, s, result(q.job, [candidate(s)]), 'extract', at)
  const approved = submitIndependentReview(extracted, q.job.job_id, s, review(extracted), 'review', at)
  const changed = structuredClone(s)
  changed.source.text += ' A later verified sentence changes the source.'
  changed.source_sha256 = byteHash(changed.source.text)
  changed.book_sha256 = byteHash('changed book')
  const { scope_sha256, source, existing, publication_policy, ...binding } = changed
  changed.scope_sha256 = graphHash(binding)
  const fresh = enqueueReviewWork(discovery([changed]), approved, at)
  const c = candidate(changed); c.evidence[0].quote = s.source.text
  const again = submitReviewExtraction(fresh.ledger, fresh.job.job_id, changed,
    result(fresh.job, [c]), 'fresh-extract', at)
  assert.equal(again.events.at(-1).proposal.candidates.length, 1)
  assert.equal(again.events.at(-1).proposal.duplicates.length, 0)
})
test('approved candidates never inherit initial publication approval', () => {
  const s = scope(), q = enqueueReviewWork(discovery([s]), emptyReviewLedger(), at)
  const e = submitReviewExtraction(q.ledger, q.job.job_id, s, result(q.job, [candidate(s)]), 'extract', at)
  const done = submitIndependentReview(e, q.job.job_id, s, review(e), 'review', at)
  assert.equal(done.events.at(-1).status, 'HUMAN_APPROVAL_REQUIRED')
  const damaged = structuredClone(done); damaged.events[0].job.scope.source.text = 'tampered'
  assert.throws(() => validateReviewLedger(damaged), /LEDGER_CHANGED/)
})
test('actual corpus: all 3 worlds and C03 S01/S02 present, hashes checked, no fake runtime anchors', async () => {
  const d = await loadWikiReviewSources()
  assert.deepEqual(d.inventory.map(w => w.chronicle_id), ['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL'])
  assert.ok(d.scopes.some(s => s.chronicle_id === 'C03-AFTERFALL' && s.season_id === 'S01'))
  assert.ok(d.scopes.some(s => s.chronicle_id === 'C03-AFTERFALL' && s.season_id === 'S02'))
  for (const s of d.scopes) {
    assert.equal(s.save_version, undefined)
    assert.equal(s.game_time, undefined)
  }
  assert.equal(d.semantic_review_performed, false)
  assert.equal(enqueueReviewWork(d, emptyReviewLedger(), at).status, d.new_source ? 'LEGACY_NEW_SOURCE' : 'QUEUED')
})
test('ledger rejects source-tree writes through directory or file symlinks', async () => {
  const base = await mkdtemp(join(tmpdir(), 'wiki-ledger-path-'))
  try {
    const source = join(base, 'source')
    await mkdir(source)
    await symlink(source, join(base, 'alias'), 'dir')
    await assert.rejects(externalReviewLedgerPath(join(base, 'alias', 'ledger.json'), source), /OUTSIDE_SOURCE_TREE/)
    await symlink(join(source, 'data.json'), join(base, 'linked.json'))
    await assert.rejects(externalReviewLedgerPath(join(base, 'linked.json'), source), /NOT_REGULAR_FILE/)
    assert.equal(await externalReviewLedgerPath(join(base, 'safe.json'), source), join(base, 'safe.json'))
  } finally { await rm(base, { recursive: true, force: true }) }
})
