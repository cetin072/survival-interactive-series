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
    await runner.end() // A new process/session must observe the same terminal record.
    const restarted = new pg.Client({ connectionString: runnerUrl })
    await restarted.connect()
    try {
      const replay = await runDailyNoop({ exporter, runner: restarted, scheduledDate: date })
      assert.equal(replay.status, 'NOOP')
      assert.equal(replay.claimed, false)
      assert.equal((await admin.query('select count(*)::integer as n from survival_rpg.archive_publication_daily_run_events where scheduled_date=$1', [date])).rows[0].n, eventCount)
    } finally { await restarted.end() }
  } finally {
    await Promise.allSettled([exporter.end(), runner.end(), admin.end()])
  }
})
