import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { discoverCompletePairs, materializeSegment, publishedWatermark, DAILY_SOURCE_SESSION } from './archive-daily-core.mjs'

const sha = (body) => createHash('sha256').update(body).digest('hex')
const scope = { worldline_id: 'AFTERFALL', chronicle_id: 'C03', season_id: 'S03', session_id: DAILY_SOURCE_SESSION }
const session = { id: DAILY_SOURCE_SESSION, ...scope, status: 'OPEN', last_message_order: 51 }
const row = (order, role, turn, content = role === 'GM' ? '# AFTERFALL\n새 장면.' : '1') => ({
  id: `00000000-0000-4000-8000-${String(order).padStart(12, '0')}`, ...scope,
  message_order: order, role, turn_no: turn, content, content_sha256: sha(content),
  public_safe: true, source_type: 'LIVE', save_version: order,
  game_time: '2027-04-12 16:40', recorded_at: new Date('2026-09-28T00:00:00Z'),
})
const old = { session_id: 'SESSION_001', source_session_uuid: DAILY_SOURCE_SESSION,
  visibility: 'PUBLIC_ARCHIVE', atomic_pairing_complete: true,
  source_message_order: { min: 42, max: 49, contiguous: true } }
const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
  season_id: 'S03', visibility: 'PUBLIC_ARCHIVE', sessions: [old] }
const sources = new Map([['SESSION_001', { ...old, parts: ['PART_001.md'] }]])

test('published metadata advances watermark without editing old source', () => {
  assert.deepEqual(publishedWatermark(manifest, sources), { nextOrder: 50, nextSessionId: 'SESSION_002' })
  assert.equal(JSON.stringify(manifest.sessions), JSON.stringify([old]))
})

test('complete safe pair is materialized with exact hashes and optional links', () => {
  const discovery = discoverCompletePairs(session, [row(50, 'USER', 21), row(51, 'GM', 21)], 50)
  assert.equal(discovery.pairs, 1)
  const result = materializeSegment({ session, discovery, sessionId: 'SESSION_002',
    sealedAt: '2026-09-28T00:00:00.000Z' })
  assert.equal(result.source.content_sha256[1].sha256, sha('# AFTERFALL\n새 장면.'))
  assert.equal(result.source.content_sha256[1].state_link, undefined)
  assert.equal(result.source.parts_sha256['PART_001.md'], sha(result.part))
  assert.equal(result.part.toString('utf8').includes('# AFTERFALL\n새 장면.'), true)
})

test('incomplete trailing USER is withheld; unsafe and hash-invalid rows fail closed', () => {
  const complete = [row(50, 'USER', 21), row(51, 'GM', 21)]
  const trailing = row(52, 'USER', 22)
  assert.equal(discoverCompletePairs({ ...session, last_message_order: 52 }, [...complete, trailing], 50).endOrder, 51)
  assert.equal(discoverCompletePairs({ ...session, last_message_order: 50 }, [complete[0]], 50).status, 'NO_NEW_SOURCE')
  assert.equal(discoverCompletePairs({ ...session, last_message_order: 52 },
    [...complete, { ...trailing, public_safe: false, content_sha256: 'pending' }], 50).endOrder, 51)
  assert.throws(() => discoverCompletePairs(session, [{ ...complete[0], public_safe: false }, complete[1]], 50))
  assert.throws(() => discoverCompletePairs(session, [{ ...complete[0], content: 'changed' }, complete[1]], 50))
  assert.throws(() => discoverCompletePairs(session, [complete[0]], 50))
})

test('optional state links must identify both exact pair messages and versions', () => {
  const rows = [row(50, 'USER', 21), row(51, 'GM', 21)]
  const discovery = discoverCompletePairs(session, rows, 50)
  const link = { turn_no: 21, user_message_id: rows[0].id, gm_message_id: rows[1].id,
    user_save_version: 50, gm_save_version: 51, linked_save_version: 51, outcome: 'APPLIED' }
  const args = { session, discovery, sessionId: 'SESSION_002',
    sealedAt: '2026-09-28T00:00:00.000Z' }
  assert.equal(materializeSegment({ ...args, links: [link] }).source.content_sha256[1].state_link.outcome, 'APPLIED')
  assert.throws(() => materializeSegment({ ...args, links: [{ ...link, user_message_id: rows[1].id }] }),
    /INVALID_OPTIONAL_STATE_LINK/)
  assert.throws(() => materializeSegment({ ...args, links: [{ ...link, user_save_version: 49 }] }),
    /INVALID_OPTIONAL_STATE_LINK/)
})

test('replay of a published range advances the GitHub watermark and becomes NOOP', () => {
  const discovery = discoverCompletePairs(session, [row(50, 'USER', 21), row(51, 'GM', 21)], 50)
  const segment = materializeSegment({ session, discovery, sessionId: 'SESSION_002',
    sealedAt: '2026-09-28T00:00:00.000Z' })
  const next = publishedWatermark({ ...manifest, sessions: [...manifest.sessions, segment.entry] },
    new Map([...sources, ['SESSION_002', segment.source]]))
  assert.equal(next.nextOrder, 52)
  assert.equal(discoverCompletePairs(session, [], next.nextOrder).status, 'NO_NEW_SOURCE')
})
