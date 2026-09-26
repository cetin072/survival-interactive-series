import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileVisualCatalog, visualDigest } from './visual-compiler.mjs'
import { planFromAttemptLedger } from './attempt-ledger.mjs'

// Synthetic public facts only; no real request, provider call, or accepted image.
const ns = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const anchor = { save_version: 253, game_time: '2027-03-23 17:50' }
function catalog() {
  const nodes = ['char-one', 'char-two', 'char-three'].map((id, i) => ({ id,
    data: { id, label: id, type: 'character', tags: ['CORE'], subtitle: '공개 시험 역할', summary: '공개 시험 설명', source: 'SYNTHETIC' },
    anchor, evidence: { source_ref: 'archive/web/src/archive/archiveData.ts', source_sha256: 'a'.repeat(64), pointer: `/nodes/${i}` }, history: [],
  }))
  const body = { version: 'archive-graph-v1', ...ns, anchor, nodes, relations: [], articles: [], story_links: [] }
  const graph = { ...body, content_sha256: visualDigest(body) }
  const appearances = { version: 'public-appearance-v1', ...ns, anchor,
    records: nodes.map((node) => ({ node_id: node.id, status: 'confirmed',
      visual: { apparentAge: '30대', build: '보통', face: '시험 외형', hair: '검은 머리' },
      evidence: { source_ref: 'archive/web/src/archive/characterAppearance.ts', source_sha256: 'b'.repeat(64), pointer: `/characters/${node.id}` },
    })) }
  return compileVisualCatalog({ batch: { batch_id: `batch-${'c'.repeat(64)}`,
    snapshot: { ...ns, source_save_version: 253, source_game_time: anchor.game_time } }, graph, appearances })
}
const empty = (value) => ({ version: 'archive-image-attempt-ledger-v1', ...ns,
  catalog_sha256: value.content_sha256, attempts: [] })
const attempt = (point, i, state = 'RESERVED') => ({ attempt_id: `attempt-${String(i).repeat(64)}`,
  request_id: `request-${String(i).repeat(64)}`, point_id: point.point_id,
  generation_key: point.generation_key, state,
  evidence_ref: state === 'RESERVED' ? null : 'docs/AUTOMATIC_ARCHIVE_STEP6_OBSERVATIONS.json' })

test('empty ledger selects at most three without executing', () => {
  const value = catalog(), plan = planFromAttemptLedger(value, empty(value))
  assert.equal(plan.selected_point_ids.length, 3)
  assert.equal(plan.provider_calls, 0)
  assert.equal(plan.execution_enabled, false)
})
test('reserved generation is held and consumes one batch slot', () => {
  const value = catalog(), ledger = empty(value), point = value.points[0]
  ledger.attempts.push(attempt(point, 1))
  const plan = planFromAttemptLedger(value, ledger)
  assert.equal(plan.reserved, 1)
  assert.equal(plan.selected_point_ids.length, 2)
  assert.ok(!plan.selected_point_ids.includes(point.point_id))
})
test('failed and quarantined attempts retain a bounded retry budget', () => {
  const value = catalog(), ledger = empty(value), point = value.points[0]
  ledger.attempts.push(attempt(point, 1, 'FAILED'), attempt(point, 2, 'QUARANTINED'))
  assert.equal(planFromAttemptLedger(value, ledger).selected_point_ids[0], point.point_id)
  ledger.attempts.push(attempt(point, 3, 'FAILED'))
  const plan = planFromAttemptLedger(value, ledger)
  assert.equal(plan.retry_exhausted, 1)
  assert.deepEqual(plan.selected_point_ids, [])
})
test('rejects duplicate reservation, stale generation, private scope and fake success', () => {
  const value = catalog(), ledger = empty(value), point = value.points[0]
  ledger.attempts.push(attempt(point, 1))
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, attempts: [attempt(point, 1), attempt(point, 2)] }), /DUPLICATE_OR_EXCESS_ATTEMPT/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, attempts: [{ ...attempt(point, 1), generation_key: `generation-${'f'.repeat(64)}` }] }), /INVALID_ATTEMPT_BINDING/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, visibility: 'CORE_PRIVATE' }), /ATTEMPT_LEDGER_CATALOG_MISMATCH/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, attempts: [attempt(point, 1, 'ACCEPTED')] }), /INVALID_ATTEMPT_STATE/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, catalog_sha256: 'f'.repeat(64) }), /ATTEMPT_LEDGER_CATALOG_MISMATCH/)
})
