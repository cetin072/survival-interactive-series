import test from 'node:test'
import assert from 'node:assert/strict'
import { decideRelease, nextReleaseMarker, validateReleaseMarker, validateReleasePolicy } from './production-release.mjs'

const sha = (c) => c.repeat(40)
const policy = {
  version: 1,
  mode: 'BATCHED',
  site: 'survival-diary-archive',
  production_interval_days: 2,
  release_hour_kst: 23,
  max_production_deploys_per_day: 1,
}

test('validates the cost-control policy', () => {
  assert.equal(validateReleasePolicy(policy).production_interval_days, 2)
  assert.throws(() => validateReleasePolicy({ ...policy, production_interval_days: 0 }), /INVALID_RELEASE_POLICY/)
})

test('bootstraps when there is no prior release marker', () => {
  assert.deepEqual(decideRelease({ headSha: sha('a'), policy, now: new Date('2026-09-28T14:00:00Z') }),
    { status: 'RELEASE_DUE', due: true, reason: 'BOOTSTRAP' })
})

test('does not redeploy the exact release commit', () => {
  const marker = nextReleaseMarker({ sourceMainSha: sha('a'), policy, now: new Date('2026-09-28T14:00:00Z') })
  assert.deepEqual(decideRelease({
    headSha: sha('b'), lastReleaseCommit: sha('b'), marker, policy,
    now: new Date('2026-09-30T14:00:00Z'),
  }), { status: 'NO_CHANGES', due: false })
})

test('waits for the two-day batching window', () => {
  const marker = nextReleaseMarker({ sourceMainSha: sha('a'), policy, now: new Date('2026-09-28T14:00:00Z') })
  const decision = decideRelease({
    headSha: sha('c'), lastReleaseCommit: sha('b'), marker, policy,
    now: new Date('2026-09-29T14:00:00Z'),
  })
  assert.equal(decision.status, 'WAITING_WINDOW')
  assert.equal(decision.remaining_days, 1)
})

test('releases after the batching window and supports force', () => {
  const marker = nextReleaseMarker({ sourceMainSha: sha('a'), policy, now: new Date('2026-09-28T14:00:00Z') })
  assert.equal(decideRelease({
    headSha: sha('c'), lastReleaseCommit: sha('b'), marker, policy,
    now: new Date('2026-09-30T14:00:00Z'),
  }).due, true)
  assert.equal(decideRelease({
    headSha: sha('b'), lastReleaseCommit: sha('b'), marker, policy,
    now: new Date('2026-09-28T15:00:00Z'), force: true,
  }).reason, 'FORCED')
  assert.doesNotThrow(() => validateReleaseMarker(marker))
})
