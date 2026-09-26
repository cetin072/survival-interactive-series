import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { POLICY, fingerprint, createBatch, planPublication, safePlanPublication, assessExternalCapability, assessAttemptBudget } from './publication-plan.mjs'
import { snapshotFromPublishedS02, runCli } from '../dry-run-publication.mjs'

const revision = '1ee5f43c7197499ca57054df7849d0ea34aa3598'
const refRoot = 'archive/content/transcripts/C03-AFTERFALL/S02/'
function source(n = 5) {
  const session_id = `SESSION_${String(n).padStart(3, '0')}`
  return { session_id, source_ref: `${refRoot}${session_id}/SOURCE_MANIFEST.json`, source_digest: 'a'.repeat(64), visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true, captured_message_range: { start: '2027-01-16 10:18', end: '2027-01-21 18:10' }, user_messages: 3, gm_public_blocks: 3 }
}
function snapshot() {
  return { version: 'publication-snapshot-v1', chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S02', visibility: 'PUBLIC_ARCHIVE', source_revision: revision, source_save_version: 253, source_game_time: '2027-03-23 17:50', source_checkpoint: 'worldlines/AFTERFALL/seasons/S02/END_CHECKPOINT_2027-03-23.md', coverage_status: 'PARTIAL', sources: [source()] }
}
const included = { cost_class: 'INCLUDED', zero_cost_verified: true, capability_verified: true, enabled: true, included_units_remaining: 1, evidence_ref: 'TEST_ONLY_VERIFIED_EVIDENCE' }
function rejected(mutator) { const input = snapshot(); mutator(input); assert.throws(() => createBatch(input)) }

// Deliberately synthetic metadata, never reconstructed dialogue.
function manifestFixture() {
  const fixture = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S02', archive_class: 'COLD_RAW', overall_status: 'PARTIAL', complete: false, sessions: [], rolling_capture_extension: { sessions_added: 7, final_captured_save_version: 253, final_captured_game_time: '2027-03-23 17:50' } }
  const counts = [[31, 89], [13, 16], [0, 1], [1, 0], [3, 3], [17, 17], [3, 3], [1, 1], [10, 10]]
  for (let n = 1; n <= 9; n++) {
    const session_id = `SESSION_${String(n).padStart(3, '0')}`
    const entry = { session_id, status: 'PARTIAL', source_manifest: `${session_id}/SOURCE_MANIFEST.json`, user_messages: counts[n - 1][0], gm_public_blocks: counts[n - 1][1] }
    if (n >= 3) Object.assign(entry, { source_type: 'SUPABASE_ROLLING_RAW', capture_quality: n < 5 ? 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING' : 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: n >= 5, captured_message_range: { start: '2027-01-16 09:28', end: '2027-01-16 09:28' }, coverage_basis: 'captured_message_range' })
    fixture.sessions.push(entry)
  }
  return fixture
}

test('same snapshot gives byte-identical deterministic plan', () => assert.deepEqual(planPublication(snapshot()), planPublication(snapshot())))
test('object insertion order does not change the fingerprint', () => assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 })))
test('source inventory order does not change batch identity', () => { const s = snapshot(); s.sources.push(source(6)); const id = createBatch(s).batch_id; s.sources.reverse(); assert.equal(createBatch(s).batch_id, id) })
test('checkout-only revision changes do not duplicate a batch', () => { const a = snapshot(); const b = snapshot(); b.source_revision = 'b'.repeat(40); assert.equal(createBatch(a).batch_id, createBatch(b).batch_id) })
test('source digest changes create a new batch', () => { const a = snapshot(); const b = snapshot(); b.sources[0].source_digest = 'b'.repeat(64); assert.notEqual(createBatch(a).batch_id, createBatch(b).batch_id) })
test('save anchor changes create a new batch', () => { const a = snapshot(); const b = snapshot(); b.source_save_version++; assert.notEqual(createBatch(a).batch_id, createBatch(b).batch_id) })
test('created batch is deeply frozen and does not mutate the caller', () => { const input = snapshot(); const before = structuredClone(input); const batch = createBatch(input); assert.throws(() => { batch.snapshot.sources[0].user_messages = 99 }); input.sources[0].user_messages = 4; assert.equal(batch.snapshot.sources[0].user_messages, before.sources[0].user_messages) })
test('rejects duplicate session ids', () => rejected((s) => s.sources.push(source())))
test('rejects C02 facts under a C03 namespace', () => rejected((s) => { s.worldline_id = 'STRONGHOLD' }))
test('rejects unknown Chronicle', () => rejected((s) => { s.chronicle_id = 'C99-UNKNOWN' }))
test('rejects source path in another Chronicle', () => rejected((s) => { s.sources[0].source_ref = s.sources[0].source_ref.replace('C03-AFTERFALL', 'C02-STRONGHOLD') }))
test('rejects traversal source path', () => rejected((s) => { s.sources[0].source_ref = refRoot + '../gm_state.json' }))
test('rejects mutable branch name as a source revision', () => rejected((s) => { s.source_revision = 'main' }))
test('rejects hidden top-level payload instead of filtering and leaking it', () => rejected((s) => { s.gm_state = { future: 'PRIVATE_TEST_SECRET' } }))
test('rejects source prose/prompt fields', () => rejected((s) => { s.sources[0].prompt = 'PRIVATE_TEST_SECRET' }))
for (const visibility of ['PLAYER_ARCHIVE', 'CORE_PRIVATE', undefined]) {
  test(`rejects ${visibility} snapshot`, () => rejected((s) => { s.visibility = visibility }))
  test(`rejects ${visibility} source`, () => rejected((s) => { s.sources[0].visibility = visibility }))
}
test('does not promote partial season to complete', () => rejected((s) => { s.coverage_status = 'COMPLETE' }))
test('rejects unknown capture classification', () => rejected((s) => { s.sources[0].capture_quality = 'CANON_SUMMARY' }))
test('rejects inconsistent pairing flag', () => rejected((s) => { s.sources[0].atomic_pairing_complete = false }))
test('rejects unbalanced verified pairs', () => rejected((s) => { s.sources[0].gm_public_blocks = 2 }))
test('rejects negative or string counts', () => { rejected((s) => { s.sources[0].user_messages = -1 }); rejected((s) => { s.sources[0].user_messages = '3' }) })
test('rejects future source beyond the frozen time', () => rejected((s) => { s.sources[0].captured_message_range.end = '2027-03-24 00:00' }))
test('rejects invalid calendar dates and missing range endpoint', () => { rejected((s) => { s.sources[0].captured_message_range.start = '2027-02-30 10:00' }); rejected((s) => { delete s.sources[0].captured_message_range.end }) })
test('legacy sources remain review-only, not discarded or inferred', () => { const m = manifestFixture(); const p = planPublication(snapshotFromPublishedS02(m, revision)); assert.equal(p.summary.legacy_sources_deferred, 2); assert.equal(p.tasks.filter((t) => t.status === 'DEFERRED_LEGACY_ADAPTER').length, 2) })
test('S02 planning fixture accounts for 70 rolling rows / 34 pairs / two fragments', () => { const p = planPublication(snapshotFromPublishedS02(manifestFixture(), revision)); assert.equal(p.summary.sources, 9); assert.equal(p.summary.reader_input_spans, 5); assert.equal(p.summary.paired_turns, 34); assert.equal(p.summary.rolling_captured_messages, 70); assert.equal(p.summary.preserved_fragments, 2) })
test('adapter rejects hidden runtime object', () => { const m = manifestFixture(); m.gm_state = {}; assert.throws(() => snapshotFromPublishedS02(m, revision)) })
test('adapter rejects missing rolling session without reconstituting it', () => { const m = manifestFixture(); m.sessions.pop(); assert.throws(() => snapshotFromPublishedS02(m, revision)) })
test('adapter cannot use session range as captured range fallback', () => { const m = manifestFixture(); m.sessions[2].session_range = { start: '2027-01-16 07:30', end: '2027-01-16 09:28' }; delete m.sessions[2].captured_message_range; assert.throws(() => snapshotFromPublishedS02(m, revision)) })
test('UNKNOWN cost is blocked even when enabled', () => assert.equal(assessExternalCapability({ ...included, cost_class: 'UNKNOWN' }).status, 'WAITING_HUMAN_COST_APPROVAL'))
test('PAID cost cannot use the included capability path', () => assert.equal(assessExternalCapability({ ...included, cost_class: 'PAID' }).eligible, false))
test('missing capability config fails closed', () => assert.equal(assessExternalCapability().eligible, false))
test('INCLUDED label alone does not establish zero incremental cost', () => assert.equal(assessExternalCapability({ cost_class: 'INCLUDED', enabled: true }).eligible, false))
test('unproven product bridge remains blocked', () => assert.equal(assessExternalCapability({ ...included, capability_verified: false }).status, 'PRODUCT_BOUNDARY_BLOCKED'))
test('disabled capability remains disabled', () => assert.equal(assessExternalCapability({ ...included, enabled: false }).status, 'DISABLED'))
test('missing/zero quota cannot be assumed free', () => { assert.equal(assessExternalCapability({ ...included, included_units_remaining: 0 }).eligible, false); const c = { ...included }; delete c.included_units_remaining; assert.equal(assessExternalCapability(c).eligible, false) })
test('boolean string does not authorize execution', () => assert.throws(() => assessExternalCapability({ ...included, enabled: 'true' })))
test('verified included capability is only future eligibility, never generation', () => { assert.equal(assessExternalCapability(included).eligible, true); const p = planPublication(snapshot(), { capabilities: { image: included } }); assert.equal(p.tasks.find((t) => t.kind === 'IMAGE_GENERATION').status, 'WAITING_VISUAL_BRIEF'); assert.equal(p.summary.images_generated, 0); assert.equal(p.summary.external_calls, 0) })
test('environment flag cannot bypass ZERO_COST_ONLY', () => { const old = process.env.ALLOW_PAID_GENERATION; try { process.env.ALLOW_PAID_GENERATION = 'true'; assert.equal(assessExternalCapability({ ...included, cost_class: 'PAID' }).eligible, false) } finally { if (old === undefined) delete process.env.ALLOW_PAID_GENERATION; else process.env.ALLOW_PAID_GENERATION = old } })
test('rejects unknown override options', () => assert.throws(() => planPublication(snapshot(), { allow_paid_generation: true })))
test('default three-attempt batch and six-attempt daily ceiling', () => { assert.equal(assessAttemptBudget().available, 3); assert.equal(assessAttemptBudget({ daily_attempts: 5 }).available, 1); assert.equal(assessAttemptBudget({ daily_attempts: 6 }).eligible, false); assert.equal(assessAttemptBudget({ batch_attempts: 3 }).eligible, false) })
test('two retries means at most three total attempts on one asset', () => { assert.equal(assessAttemptBudget({ asset_attempts: 2 }).eligible, true); assert.equal(assessAttemptBudget({ asset_attempts: 3 }).eligible, false) })
test('invalid attempt counters are rejected', () => { assert.throws(() => assessAttemptBudget({ daily_attempts: -1 })); assert.throws(() => assessAttemptBudget({ batch_attempts: '0' })) })
test('completion receipt skips only the exact task, not waiting images', () => { const first = planPublication(snapshot()); const second = planPublication(snapshot(), { completed_task_ids: [first.tasks[0].task_id] }); assert.equal(first.batch_id, second.batch_id); assert.equal(second.summary.completed_tasks_skipped, 1); assert.equal(second.tasks[0].status, 'NOOP_ALREADY_COMPLETED'); assert.equal(second.tasks.find((t) => t.kind === 'IMAGE_GENERATION').status, 'WAITING_HUMAN_COST_APPROVAL') })
test('provider changes do not duplicate snapshot identity', () => { const a = planPublication(snapshot()); const b = planPublication(snapshot(), { capabilities: { image: included } }); assert.equal(a.batch_id, b.batch_id); assert.notEqual(a.plan_id, b.plan_id) })
test('image block does not block eligible text input planning', () => { const p = planPublication(snapshot()); assert.equal(p.tasks[0].status, 'PLANNED_READER_INPUT'); assert.equal(p.tasks.find((t) => t.kind === 'GRAPH_RECONCILIATION').status, 'WAITING_PUBLIC_CANON_INPUT') })
test('all outputs are planning states, not publication claims', () => { const p = planPublication(snapshot()); assert.equal(p.mode, 'DRY_RUN_ONLY'); assert.equal(p.summary.records_written, 0); assert.equal(p.summary.site_publications, 0); assert.ok(p.tasks.every((t) => !['PUBLISHED', 'GENERATED'].includes(t.status))) })
test('safe failure hides payload and cannot touch game state', () => { const s = snapshot(); s.hidden_state = 'PRIVATE_TEST_SECRET'; const result = safePlanPublication(s); assert.equal(result.ok, false); assert.equal(result.game_affected, false); assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST_SECRET')) })
test('zero sources is safe and produces no images or writes', () => { const s = snapshot(); s.sources = []; const p = planPublication(s); assert.equal(p.summary.sources, 0); assert.equal(p.summary.external_calls, 0) })
test('CLI help and invalid execution flag are side-effect free', async () => { assert.match(await runCli(['--help']), /Offline plan only/); await assert.rejects(runCli(['--execute'])) })
test('module dependency boundary stays local and write-free', async () => { const text = await readFile(new URL('./publication-plan.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(text, /fetch\s*\(|https?:\/\/|writeFile\s*\(|process\.env|node:fs|node:child_process/); assert.equal(POLICY.mode, 'ZERO_COST_ONLY') })

test('malformed image config cannot block Reader planning or echo secrets', () => { const p = planPublication(snapshot(), { capabilities: { image: { ...included, secret: 'PRIVATE_TEST_SECRET' } } }); assert.equal(p.tasks[0].status, 'PLANNED_READER_INPUT'); assert.equal(p.gates.image.status, 'CONFIG_REJECTED'); assert.ok(!JSON.stringify(p).includes('PRIVATE_TEST_SECRET')) })
