import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discoverLinkedRanges, planLinkedRanges } from './linked-export-discovery.mjs'

const session = '11111111-1111-4111-8111-111111111111'
const row = (turn, order) => ({ session_id: session, season_id: 'S03',
  turn_no: turn, user_order: order, gm_order: order + 1 })
const role = { role_name: 'archive_exporter', session_role: 'archive_exporter',
  read_only: 'on', rolsuper: false, rolbypassrls: false,
  rolcreaterole: false, rolcreatedb: false, rolreplication: false,
  rolinherit: false, has_role_membership: false, service_member: false,
  postgres_member: false, can_insert: false, can_update: false,
  can_delete: false, can_insert_session: false, can_update_session: false,
  can_delete_session: false, can_insert_link: false,
  can_update_link: false, can_delete_link: false, can_update_save: false }

test('metadata inventory partitions only contiguous linked turns', () => {
  const plan = planLinkedRanges([row(1, 0), row(2, 2), row(4, 8)])
  assert.deepEqual(plan.ranges, [
    { session_id: session, season_id: 'S03', start_order: 0, end_order: 3, pairs: 2 },
    { session_id: session, season_id: 'S03', start_order: 8, end_order: 9, pairs: 1 },
  ])
  assert.equal(plan.publication_allowed, false)
  assert.equal(plan.message_bodies_read + plan.database_writes, 0)
  assert.equal(planLinkedRanges([]).status, 'NO_LINKED_RANGES')
  assert.throws(() => planLinkedRanges([row(2, 2), row(1, 0)]),
    /LINKED_DISCOVERY_ORDER_INVALID/)
  assert.throws(() => planLinkedRanges([{ ...row(1, 0), gm_order: 4 }]),
    /INVALID_LINKED_DISCOVERY_ROW/)
})

test('discovery uses verified exporter role and a read-only transaction', async () => {
  const calls = []
  const client = { query: async (arg) => {
    const sql = typeof arg === 'string' ? arg : arg.text
    calls.push(sql)
    if (sql.includes('select current_user::text')) return { rows: [role] }
    if (sql.includes('from survival_rpg.transcript_turn_state_links'))
      return { rows: [row(1, 0)] }
    return { rows: [] }
  } }
  const result = await discoverLinkedRanges(client)
  assert.equal(result.status, 'LINKED_RANGES_DISCOVERED')
  assert.equal(result.exporter_authenticated, true)
  assert.equal(result.ranges[0].end_order, 1)
  assert.match(calls[0], /READ ONLY/)
  assert.equal(calls.at(-1), 'COMMIT')
  assert.ok(calls.every((sql) => !/\b(INSERT|UPDATE|DELETE)\b\s+survival_rpg\./i.test(sql)))
})

test('wrong login cannot discover ranges and rolls back', async () => {
  const calls = []
  const client = { query: async (sql) => {
    calls.push(sql)
    return typeof sql === 'string' && sql.includes('select current_user::text')
      ? { rows: [{ ...role, session_role: 'service_role' }] } : { rows: [] }
  } }
  await assert.rejects(discoverLinkedRanges(client), /RESTRICTED_EXPORT_ROLE_REQUIRED/)
  assert.equal(calls.at(-1), 'ROLLBACK')
})
