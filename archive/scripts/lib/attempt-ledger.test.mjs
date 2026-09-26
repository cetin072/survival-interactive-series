import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, readdir, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileVisualCatalog, visualDigest } from './visual-compiler.mjs'
import { appendAttemptEvent, makeAttemptEvent, planFromAttemptLedger } from './attempt-ledger.mjs'

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
const empty = (value) => ({ version: 'archive-image-attempt-ledger-v2', ...ns,
  catalog_sha256: value.content_sha256, events: [] })
const event = (point, i, state = 'RESERVED', previous_event_sha256 = null) => makeAttemptEvent({
  attempt_id: `attempt-${String(i).repeat(64)}`, request_id: `request-${'1'.repeat(64)}`,
  point_id: point.point_id, generation_key: point.generation_key, state,
  evidence_ref: state === 'RESERVED' ? null : 'docs/AUTOMATIC_ARCHIVE_STEP6_OBSERVATIONS.json', previous_event_sha256,
})

test('empty journal selects at most three with zero execution', () => {
  const value = catalog(), plan = planFromAttemptLedger(value, empty(value))
  assert.equal(plan.selected_point_ids.length, 3)
  assert.equal(plan.provider_calls, 0)
  assert.equal(plan.execution_enabled, false)
})
test('reservation holds one generation key and consumes one batch slot', () => {
  const value = catalog(), ledger = empty(value), point = value.points[0]
  ledger.events.push(event(point, 1))
  const plan = planFromAttemptLedger(value, ledger)
  assert.equal(plan.reserved, 1)
  assert.equal(plan.selected_point_ids.length, 2)
  assert.ok(!plan.selected_point_ids.includes(point.point_id))
})
test('terminal events retain failed and quarantined attempts with bounded retry', () => {
  const value = catalog(), ledger = empty(value), point = value.points[0]
  for (const [i, state] of [[1, 'FAILED'], [2, 'QUARANTINED']]) {
    const reserved = event(point, i, 'RESERVED', ledger.events.at(-1)?.event_sha256 ?? null)
    ledger.events.push(reserved, event(point, i, state, reserved.event_sha256))
  }
  assert.equal(planFromAttemptLedger(value, ledger).selected_point_ids[0], point.point_id)
  const third = event(point, 3, 'RESERVED', ledger.events.at(-1).event_sha256)
  ledger.events.push(third, event(point, 3, 'FAILED', third.event_sha256))
  const plan = planFromAttemptLedger(value, ledger)
  assert.equal(plan.retry_exhausted, 1)
  assert.deepEqual(plan.selected_point_ids, [])
})
test('rejects duplicate, broken chain, stale key, private scope and fake success', () => {
  const value = catalog(), ledger = empty(value), point = value.points[0]
  const first = event(point, 1)
  ledger.events.push(first)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, events: [first, event(point, 1, 'RESERVED', first.event_sha256)] }), /DUPLICATE_ATTEMPT_RESERVATION/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, events: [first, event(point, 2)] }), /ATTEMPT_EVENT_CHAIN_BROKEN/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, events: [{ ...first, generation_key: `generation-${'f'.repeat(64)}` }] }), /ATTEMPT_EVENT_CHAIN_BROKEN/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, visibility: 'CORE_PRIVATE' }), /ATTEMPT_LEDGER_CATALOG_MISMATCH/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, events: [event(point, 1, 'ACCEPTED')] }), /INVALID_ATTEMPT_TRANSITION/)
  assert.throws(() => planFromAttemptLedger(value, { ...ledger, catalog_sha256: 'f'.repeat(64) }), /ATTEMPT_LEDGER_CATALOG_MISMATCH/)
})
test('local append requires an explicit flag and rejects stale concurrent writers', async () => {
  const value = catalog(), ledger = empty(value), directory = await mkdtemp(join(tmpdir(), 'archive-attempt-'))
  const file = join(directory, 'ATTEMPTS.json'), first = event(value.points[0], 1), second = event(value.points[1], 2)
  try {
    await writeFile(file, JSON.stringify(ledger, null, 2) + '\n')
    await assert.rejects(appendAttemptEvent(file, value, first), /LOCAL_ATTEMPT_WRITE_DISABLED/)
    const result = await appendAttemptEvent(file, value, first, { localWriteEnabled: true })
    assert.equal(result.files_written, 1)
    assert.equal(result.provider_calls, 0)
    const after = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(after.events.length, 1)
    const next = { ...second, previous_event_sha256: first.event_sha256 }
    next.event_sha256 = visualDigest(Object.fromEntries(Object.entries(next).filter(([key]) => key !== 'event_sha256')))
    const stale = appendAttemptEvent(file, value, next, { localWriteEnabled: true,
      beforeCommit: async () => { await writeFile(file, JSON.stringify(after, null, 2) + ' \n') } })
    await assert.rejects(stale, /GRAPH_CONCURRENT_CHANGE/)
    assert.equal(JSON.parse(await readFile(file, 'utf8')).events.length, 1)
    assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith('publication-lock')), [])
  } finally { await unlink(file).catch(() => {}); await rmdir(directory) }
})
