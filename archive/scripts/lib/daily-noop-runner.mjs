/** One-shot daily ledger completion when the restricted exporter finds no linked source.
 * Linked source is never approved or published by this runner.
 */
import { randomUUID } from 'node:crypto'
import { discoverLinkedRanges } from './linked-export-discovery.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const datePattern = /^\d{4}-\d{2}-\d{2}$/

export async function runDailyNoop({ exporter, runner, scheduledDate,
  workerId = `archive-noop-${randomUUID()}` }) {
  demand(datePattern.test(scheduledDate)
    && !Number.isNaN(Date.parse(`${scheduledDate}T00:00:00Z`)),
  'INVALID_SCHEDULE_DATE')
  demand(/^archive-noop-[a-f0-9-]{36}$/.test(workerId), 'INVALID_WORKER_ID')
  const identity = await runner.query('select session_user, current_user')
  demand(identity.rows.length === 1
    && identity.rows[0].session_user === 'archive_publication_runner'
    && identity.rows[0].current_user === 'archive_publication_runner',
  'DEDICATED_RUNNER_ROLE_REQUIRED')

  const discovery = await discoverLinkedRanges(exporter)
  if (discovery.ranges.length) return {
    status: 'PENDING_PUBLIC_APPROVAL', linked_ranges: discovery.ranges.length,
    ledger_writes: 0, site_publications: 0,
  }

  const claim = await runner.query(
    'select * from survival_rpg.claim_archive_publication_daily_run($1::date,$2::text,$3::integer)',
    [scheduledDate, workerId, 300])
  demand(claim.rows.length === 1, 'DAILY_CLAIM_RESULT_INVALID')
  const row = claim.rows[0]
  if (row.out_claimed !== true) {
    demand(row.out_lease_token == null, 'FAILED_CLAIM_EXPOSED_TOKEN')
    return { status: row.out_status, claimed: false,
      site_publications: 0 }
  }
  demand(row.out_status === 'CLAIMED'
    && Number.isSafeInteger(Number(row.out_claim_version))
    && typeof row.out_lease_token === 'string',
  'DAILY_CLAIM_IDENTITY_INVALID')

  // Recheck after the claim. If a link appeared, leave it for a later run.
  // A failed finish is not retried blindly: the lease may have been reclaimed.
  const afterClaim = await discoverLinkedRanges(exporter)
  const outcome = afterClaim.ranges.length ? 'RETRY_WAIT' : 'NOOP'
  const receipt = afterClaim.ranges.length
    ? { reason_code: 'LINKED_SOURCE_AWAITING_APPROVAL', result: 'SKIPPED' }
    : { reason_code: 'NO_LINKED_RANGES', result: 'NOOP' }
  const finished = await runner.query(
    'select survival_rpg.finish_archive_publication_daily_run($1::date,$2::bigint,$3::uuid,$4::text,$5::jsonb,$6::text,$7::integer) as status',
    [scheduledDate, row.out_claim_version, row.out_lease_token, outcome,
      JSON.stringify(receipt), afterClaim.ranges.length
        ? 'LINKED_SOURCE_AWAITING_APPROVAL' : null,
      afterClaim.ranges.length ? 30 : null])
  demand(finished.rows.length === 1
    && (finished.rows[0].status === outcome
      || (outcome === 'RETRY_WAIT' && finished.rows[0].status === 'QUARANTINED')),
    'DAILY_FINISH_RESULT_INVALID')
  return { status: finished.rows[0].status, claimed: true,
    linked_ranges: afterClaim.ranges.length,
    site_publications: 0 }
}
