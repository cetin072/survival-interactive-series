/** Actual PostgreSQL role/RPC/replay verification on isolated CI fixtures. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { runDailyNoop } from '../scripts/lib/daily-noop-runner.mjs'

const exporterUrl = process.env.ARCHIVE_TEST_EXPORT_DATABASE_URL
const runnerUrl = process.env.ARCHIVE_TEST_RUNNER_DATABASE_URL
const adminUrl = process.env.ARCHIVE_TEST_ADMIN_DATABASE_URL
if (!exporterUrl || !runnerUrl || !adminUrl)
  throw new Error('ISOLATED_DAILY_TEST_DATABASES_REQUIRED')

test('restricted runner waits on linked source, then records one NOOP and replays without mutation', async () => {
  const exporter = new pg.Client({ connectionString: exporterUrl })
  const runner = new pg.Client({ connectionString: runnerUrl })
  const admin = new pg.Client({ connectionString: adminUrl })
  const date = '2026-01-01'
  await Promise.all([exporter.connect(), runner.connect(), admin.connect()])
  try {
    const pending = await runDailyNoop({ exporter, runner, scheduledDate: date })
    assert.equal(pending.status, 'PENDING_PUBLIC_APPROVAL')
    assert.equal(pending.ledger_writes, 0)
    assert.equal((await admin.query('select count(*)::integer as n from survival_rpg.archive_publication_daily_runs where scheduled_date=$1', [date])).rows[0].n, 0)
    await admin.query('delete from survival_rpg.transcript_turn_state_links where worldline_id=$1 and chronicle_id=$2', ['AFTERFALL', 'C03'])
    const first = await runDailyNoop({ exporter, runner, scheduledDate: date })
    assert.equal(first.status, 'NOOP')
    const state = await admin.query('select status, attempt_count, receipt from survival_rpg.archive_publication_daily_runs where scheduled_date=$1', [date])
    assert.deepEqual(state.rows, [{ status: 'NOOP', attempt_count: 1,
      receipt: { reason_code: 'NO_LINKED_RANGES', result: 'NOOP' } }])
    const eventCount = (await admin.query('select count(*)::integer as n from survival_rpg.archive_publication_daily_run_events where scheduled_date=$1', [date])).rows[0].n
    const interruptedDate = '2026-01-02'
    const stale = (await runner.query(
      'select * from survival_rpg.claim_archive_publication_daily_run($1::date,$2::text,$3::integer)',
      [interruptedDate, 'ci-abandoned-worker', 30])).rows[0]
    assert.equal(stale.out_claimed, true)
    await admin.query('update survival_rpg.archive_publication_daily_runs set lease_expires_at=clock_timestamp()-interval \'1 second\' where scheduled_date=$1', [interruptedDate])
    await runner.end() // A new process/session must observe the same terminal record.
    const restarted = new pg.Client({ connectionString: runnerUrl })
    await restarted.connect()
    try {
      const replay = await runDailyNoop({ exporter, runner: restarted, scheduledDate: date })
      assert.equal(replay.status, 'NOOP')
      assert.equal(replay.claimed, false)
      assert.equal((await admin.query('select count(*)::integer as n from survival_rpg.archive_publication_daily_run_events where scheduled_date=$1', [date])).rows[0].n, eventCount)
      const recovered = await runDailyNoop({ exporter, runner: restarted,
        scheduledDate: interruptedDate })
      assert.equal(recovered.status, 'NOOP')
      const recoveredState = (await admin.query('select status, attempt_count, claim_version from survival_rpg.archive_publication_daily_runs where scheduled_date=$1', [interruptedDate])).rows[0]
      assert.equal(recoveredState.status, 'NOOP')
      assert.equal(recoveredState.attempt_count, 2)
      assert.equal(Number(recoveredState.claim_version), Number(stale.out_claim_version) + 1)
      const beforeStale = (await admin.query('select count(*)::integer as n from survival_rpg.archive_publication_daily_run_events where scheduled_date=$1', [interruptedDate])).rows[0].n
      await assert.rejects(restarted.query(
        'select survival_rpg.finish_archive_publication_daily_run($1::date,$2::bigint,$3::uuid,$4::text,$5::jsonb,$6::text,$7::integer)',
        [interruptedDate, stale.out_claim_version, stale.out_lease_token,
          'NOOP', '{}', null, null]), /RUN_LEASE_NOT_OWNED/)
      assert.equal((await admin.query('select count(*)::integer as n from survival_rpg.archive_publication_daily_run_events where scheduled_date=$1', [interruptedDate])).rows[0].n, beforeStale)
    } finally { await restarted.end() }
  } finally {
    await Promise.allSettled([exporter.end(), runner.end(), admin.end()])
  }
})
