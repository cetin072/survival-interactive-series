import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertDiscoveryRange } from './archive-source-discovery.mjs'

const expected = { source_session_uuid: 'approved-session', start_order: 0, end_order: 9, pairs: 5,
  authorization_sha256: 'reviewed-authorization' }
const live = () => ({ session: { id: expected.source_session_uuid }, discovery: {
  status: 'NEW_SOURCE_RANGE', startOrder: 0, endOrder: 9, pairs: 5 }, authorization_sha256: expected.authorization_sha256 })

test('manual pilot rejects a missing candidate, another source, expanded/tail range or changed approval before publication', () => {
  assert.doesNotThrow(() => assertDiscoveryRange(live(), expected))
  const changes = [
    x => { x.session.id = 'another-session' },
    x => { x.discovery.endOrder = 11; x.discovery.pairs = 6 },
    x => { x.discovery.startOrder = 10; x.discovery.endOrder = 19 },
    x => { x.discovery.pairs = 4 },
    x => { x.authorization_sha256 = 'changed-approval' },
    x => { x.discovery.status = 'NO_NEW_SOURCE' },
  ]
  for (const change of changes) {
    const candidate = live(); change(candidate)
    assert.throws(() => assertDiscoveryRange(candidate, expected), /APPROVED_PILOT_RANGE_MISMATCH/)
  }
  assert.throws(() => assertDiscoveryRange(null, expected), /APPROVED_PILOT_RANGE_MISMATCH/)
})
