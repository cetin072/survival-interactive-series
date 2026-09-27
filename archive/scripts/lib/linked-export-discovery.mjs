/** Discover bounded, contiguous linked ranges without reading transcript bodies.
 * Admission and public approval remain separate from this metadata inventory.
 */
import { requireRestrictedExporterRole } from './linked-export-runner.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function planLinkedRanges(rows) {
  demand(Array.isArray(rows) && rows.length <= 10000,
    'LINKED_DISCOVERY_TOO_LARGE')
  const ranges = []
  let prior = null
  for (const row of rows) {
    demand(typeof row.session_id === 'string' && uuid.test(row.session_id)
      && /^S\d{2,3}$/.test(row.season_id)
      && Number.isSafeInteger(row.turn_no) && row.turn_no >= 0
      && Number.isSafeInteger(row.user_order) && row.user_order >= 0
      && row.user_order % 2 === 0
      && row.gm_order === row.user_order + 1,
    'INVALID_LINKED_DISCOVERY_ROW')
    if (prior) demand(row.session_id > prior.session_id
      || (row.session_id === prior.session_id
        && row.user_order > prior.user_order),
    'LINKED_DISCOVERY_ORDER_INVALID')
    const tail = ranges.at(-1)
    if (tail && prior.session_id === row.session_id
      && prior.season_id === row.season_id
      && row.turn_no === prior.turn_no + 1
      && row.user_order === prior.gm_order + 1
      && tail.pairs < 5000) {
      tail.end_order = row.gm_order
      tail.pairs++
    } else {
      ranges.push({ session_id: row.session_id, season_id: row.season_id,
        start_order: row.user_order, end_order: row.gm_order, pairs: 1 })
    }
    prior = row
  }
  return { status: ranges.length ? 'LINKED_RANGES_DISCOVERED'
    : 'NO_LINKED_RANGES', ranges, message_bodies_read: 0,
  database_writes: 0, publication_allowed: false }
}

/** Caller owns the node-postgres Client. Always closes its own read-only transaction. */
export async function discoverLinkedRanges(client) {
  let begun = false
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    begun = true
    await client.query("SET LOCAL statement_timeout = '10s'")
    await requireRestrictedExporterRole(client)
    const result = await client.query(`select s.id::text as session_id,
      s.season_id, l.turn_no, u.message_order as user_order,
      g.message_order as gm_order
      from survival_rpg.transcript_turn_state_links as l
      join survival_rpg.transcript_sessions as s
        on s.id = l.session_id and s.worldline_id = l.worldline_id
        and s.chronicle_id = l.chronicle_id and s.season_id = l.season_id
      join survival_rpg.transcript_messages as u
        on u.id = l.user_message_id and u.session_id = l.session_id
      join survival_rpg.transcript_messages as g
        on g.id = l.gm_message_id and g.session_id = l.session_id
      where l.worldline_id = 'AFTERFALL' and l.chronicle_id = 'C03'
        and u.role = 'USER' and g.role = 'GM'
      order by s.id, u.message_order
      limit 10001`)
    const plan = planLinkedRanges(result.rows)
    await client.query('COMMIT')
    begun = false
    return { ...plan, exporter_authenticated: true,
      transaction_snapshot_verified: true }
  } catch (error) {
    if (begun) await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}
