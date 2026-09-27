import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { observeForegroundImage } from './foreground-image-handoff.mjs'

const root = resolve(import.meta.dirname, '..', '..', '..')
const record = JSON.parse(await readFile(resolve(root, 'docs/AUTOMATIC_ARCHIVE_STEP6_FOREGROUND_20260927.json'), 'utf8'))
const bytes = await readFile(resolve(root, record.workspace_file))
const point = { status: 'READY', visibility: 'PUBLIC_ARCHIVE', point_type: 'CHARACTER',
  subject_id: record.subject_id, point_id: record.point_id, generation_key: record.generation_key }

test('actual foreground PNG enters a disabled, non-accepted local inbox', () => {
  const observation = observeForegroundImage(point, record, bytes)
  assert.equal(observation.file_sha256, record.file.sha256)
  assert.equal(observation.status, 'AWAITING_RESULT_ATTESTATION_AND_FINAL_ACCEPTANCE')
  assert.equal(observation.provider_result_id, null)
  assert.equal(observation.accepted_candidate_id, null)
  assert.equal(observation.storage_status, 'NOT_STORED')
  assert.equal(observation.publication_status, 'NOT_PUBLISHED')
  assert.equal(observation.execution_enabled, false)
  assert.deepEqual(observation, observeForegroundImage(point, record, bytes))
})

test('changed brief, bytes or acceptance claims cannot enter the inbox', () => {
  assert.throws(() => observeForegroundImage({ ...point, generation_key: 'generation-' + '0'.repeat(64) }, record, bytes))
  assert.throws(() => observeForegroundImage(point, record, Buffer.from(bytes.subarray(0, -1))))
  assert.throws(() => observeForegroundImage(point, { ...record, review: { ...record.review, final_canon_approval: true } }, bytes))
  assert.throws(() => observeForegroundImage(point, { ...record, site_publications: 1 }, bytes))
})
