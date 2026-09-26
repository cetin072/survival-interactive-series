import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { auditHistoricalImageObservations } from './historical-image-observations.mjs'

const source = new URL('../../../docs/AUTOMATIC_ARCHIVE_STEP6_OBSERVATIONS.json', import.meta.url)
const observations = async () => JSON.parse(await readFile(source, 'utf8'))

test('the committed POC record has two quarantines and no accepted or published image', async () => {
  const audit = auditHistoricalImageObservations(await observations())
  assert.equal(audit.observed_files, 2)
  assert.equal(audit.quarantined, 2)
  assert.equal(audit.accepted, 0)
  assert.equal(audit.current_queue_attempts, 0)
  assert.equal(audit.zero_added_cost_proven, false)
  assert.equal(audit.original_pixels_rechecked_here, false)
})
test('changed receipt binding or digest and success inflation fail closed', async () => {
  const original = await observations()
  for (const changed of [
    { ...original, accepted_portraits: 1 },
    { ...original, receipts: [{ ...original.receipts[0], point_id: `point-${'f'.repeat(64)}` }, original.receipts[1]] },
    { ...original, receipts: [original.receipts[0], { ...original.receipts[1], accepted_as_completed_asset: true }] },
    { ...original, receipts: [original.receipts[0], original.receipts[0]] },
  ]) assert.throws(() => auditHistoricalImageObservations(changed))
})
