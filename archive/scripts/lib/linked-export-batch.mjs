/** Read and verify bounded linked ranges without approving or publishing them. */
import { discoverLinkedRanges } from './linked-export-discovery.mjs'
import { readLinkedRange } from './linked-export-runner.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }

export async function checkLinkedExportBatch(client) {
  const discovered = await discoverLinkedRanges(client)
  demand(discovered.ranges.length <= 100, 'LINKED_BATCH_TOO_LARGE')
  let pairs = 0
  for (const range of discovered.ranges) {
    const result = await readLinkedRange(client, {
      sessionId: range.session_id,
      startOrder: range.start_order,
      endOrder: range.end_order,
    })
    try {
      demand(result.candidate.season_id === range.season_id
        && result.report.exporter_authenticated === true
        && result.report.transaction_snapshot_verified === true
        && result.report.publication_allowed === false,
      'LINKED_BATCH_ADMISSION_MISMATCH')
    } finally { result.partBytes.fill(0) }
    pairs += range.pairs
  }
  return {
    status: discovered.ranges.length ? 'PENDING_PUBLIC_APPROVAL' : 'NO_LINKED_RANGES',
    ranges_verified: discovered.ranges.length,
    pairs_verified: pairs,
    exporter_authenticated: true,
    database_writes: 0,
    files_written: 0,
    site_publications: 0,
    publication_allowed: false,
  }
}
