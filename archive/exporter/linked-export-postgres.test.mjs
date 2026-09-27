/** Actual PostgreSQL 17 integration, with synthetic CI-only source rows. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { discoverLinkedRanges } from '../scripts/lib/linked-export-discovery.mjs'
import { readLinkedRange } from '../scripts/lib/linked-export-runner.mjs'
import { checkLinkedExportBatch } from '../scripts/lib/linked-export-batch.mjs'

const connectionString = process.env.ARCHIVE_TEST_EXPORT_DATABASE_URL
if (!connectionString) throw new Error('ISOLATED_EXPORT_TEST_DATABASE_REQUIRED')

test('restricted real login discovers and reads only the synthetic linked range', async () => {
  const client = new pg.Client({ connectionString, application_name: 'archive_exporter_ci' })
  await client.connect()
  try {
    const inventory = await discoverLinkedRanges(client)
    assert.equal(inventory.status, 'LINKED_RANGES_DISCOVERED')
    assert.equal(inventory.exporter_authenticated, true)
    assert.deepEqual(inventory.ranges, [{
      session_id: '11111111-1111-4111-8111-111111111111',
      season_id: 'S99', start_order: 0, end_order: 1, pairs: 1,
    }])
    assert.equal(inventory.message_bodies_read + inventory.database_writes, 0)
    const admitted = await readLinkedRange(client, {
      sessionId: inventory.ranges[0].session_id,
      startOrder: inventory.ranges[0].start_order,
      endOrder: inventory.ranges[0].end_order,
    })
    assert.equal(admitted.report.exporter_authenticated, true)
    assert.equal(admitted.report.transaction_snapshot_verified, true)
    assert.equal(admitted.report.publication_allowed, false)
    assert.ok(admitted.partBytes.length > 0)
    const first = await checkLinkedExportBatch(client)
    const replay = await checkLinkedExportBatch(client)
    assert.deepEqual(first, replay)
    assert.equal(first.status, 'PENDING_PUBLIC_APPROVAL')
    assert.equal(first.ranges_verified, 1)
    assert.equal(first.pairs_verified, 1)
    assert.equal(first.database_writes + first.files_written + first.site_publications, 0)
  } finally { await client.end() }
})
