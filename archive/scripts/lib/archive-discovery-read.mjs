/** Bounded snapshot extraction. Transaction ends before candidate building or CI. */
import { assertRestrictedExportRole } from './archive-export-role.mjs'
import { C03_SCOPE, DISCOVERY_LIMITS, planSourceSessions, verifyPublishedHashes } from './archive-source-discovery.mjs'
import { discoverCompletePairs, materializeSegment } from './archive-daily-core.mjs'

export async function readDiscoverySnapshot(client, published, { scope = C03_SCOPE } = {}) {
  if (scope.chronicle_id !== 'C03' || scope.worldline_id !== 'AFTERFALL') throw new Error('UNAPPROVED_DISCOVERY_SCOPE')
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query("SET LOCAL statement_timeout = '10s'")
    await assertRestrictedExportRole(client)
    // to_jsonb permits old DBs without archive_intent to return NULL, never auto-approve.
    const sessions = (await client.query(`select id::text,worldline_id,chronicle_id,season_id,status,last_message_order,
      to_jsonb(s)->'archive_intent' as archive_intent from survival_rpg.transcript_sessions s
      where chronicle_id=$1 and worldline_id=$2 order by id limit $3`,
    [scope.chronicle_id, scope.worldline_id, DISCOVERY_LIMITS.sessions + 1])).rows
    const report = planSourceSessions(sessions, published, { scope })
    for (const [id, cursor] of published.cursors) {
      const hashes = (await client.query(`select message_order,content_sha256,
        content_sha256=encode(extensions.digest(convert_to(content,'UTF8'),'sha256'),'hex') as hash_valid
        from survival_rpg.transcript_messages where session_id=$1::uuid
          and message_order between $2::integer and $3::integer order by message_order limit $4`,
      [id, cursor.ranges[0].min, cursor.nextOrder - 1, DISCOVERY_LIMITS.publishedMessages + 1])).rows
      try { verifyPublishedHashes(cursor, hashes) }
      catch (error) {
        const plan = report.sessions.find((p) => p.source_session_uuid === id)
        plan.status = 'BLOCKED'; plan.blocker = error.message
        // A mutated committed predecessor invalidates its entire continuation.
        for (const p of report.sessions) {
          let s = sessions.find((s) => s.id === p.source_session_uuid), seen = new Set()
          while (s?.archive_intent?.predecessor_id && !seen.has(s.id)) {
            seen.add(s.id)
            if (s.archive_intent.predecessor_id === id) { p.status = 'BLOCKED'; p.blocker = 'PUBLISHED_PREDECESSOR_CHANGED'; break }
            s = sessions.find((v) => v.id === s.archive_intent.predecessor_id)
          }
        }
      }
    }
    const selected = report.sessions.find((p) => p.status === 'PLANNED') ?? null
    report.candidate = selected
    let live = null
    if (selected) {
      const session = sessions.find((s) => s.id === selected.source_session_uuid)
      const rows = (await client.query(`select id::text,session_id::text,worldline_id,chronicle_id,season_id,
        turn_no,message_order,role,content,content_sha256,save_version,public_safe,source_type,game_time,recorded_at
        from survival_rpg.transcript_messages where session_id=$1::uuid and message_order between $2 and $3
        order by message_order limit 200`, [session.id, selected.next_order,
        Math.min(selected.snapshot_upper, selected.next_order + 199)])).rows
      try {
        const discovery = discoverCompletePairs(session, rows, selected.next_order, { scope, snapshotEnd: selected.snapshot_upper })
        const cursor = published.cursors.get(session.id)
        if (discovery.status === 'NEW_SOURCE_RANGE' && cursor && discovery.rows[0].turn_no !== cursor.lastTurn + 1) {
          throw new Error('SOURCE_TURN_CURSOR_MISMATCH')
        }
        let links = []
        if (discovery.status === 'NEW_SOURCE_RANGE') {
          links = (await client.query(`select turn_no,user_message_id::text,gm_message_id::text,outcome,
            user_save_version,gm_save_version,linked_save_version from survival_rpg.transcript_turn_state_links
            where session_id=$1::uuid and turn_no between $2 and $3 order by turn_no limit 101`,
          [session.id, discovery.rows[0].turn_no, discovery.rows.at(-1).turn_no])).rows
          // Run exact optional-link and RAW wrapper validation inside the snapshot.
          materializeSegment({ session, discovery, links, sessionId: 'SESSION_001', sealedAt: 'snapshot-validation' })
        }
        selected.status = discovery.status
        selected.discovered_range = discovery.status === 'NEW_SOURCE_RANGE' ? [discovery.startOrder, discovery.endOrder] : null
        selected.pairs = discovery.pairs ?? 0
        live = { session, discovery, links }
      } catch (error) { selected.status = 'BLOCKED'; selected.blocker = /^[A-Z_]+$/.test(error.message) ? error.message : 'SOURCE_VALIDATION_FAILED' }
    }
    await client.query('COMMIT')
    return { report, live }
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  // Caller owns and closes the connection, including errors. There are no DB write statements.
}
