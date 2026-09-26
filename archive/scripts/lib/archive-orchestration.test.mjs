import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleArchiveRun } from './archive-orchestration.mjs'

const reader = () => ({ mode: 'LOCAL_READER_BATCH', batch_id: 'batch-test', source_revision: 'a'.repeat(40),
  source_save_version: 253, reader_status: 'NOOP', added_chapters: 0, book_sha256: 'b'.repeat(64),
  files_written: 0, external_calls: 0, database_writes: 0, site_publications: 0 })
const graph = () => ({ mode: 'LOCAL_GRAPH_BATCH', batch_id: 'batch-test', source_revision: 'a'.repeat(40),
  graph_sha256: 'c'.repeat(64), files_written: 0 })
const visual = () => ({ mode: 'LOCAL_VISUAL_BRIEF_COMPILER', batch_id: 'batch-test', source_revision: 'a'.repeat(40),
  catalog_sha256: 'd'.repeat(64), files_written: 0, provider_calls: 0, database_writes: 0, site_publications: 0,
  selection: { execution_enabled: false, ready: 30, waiting: 4, selected_point_ids: ['point-test'] } })

test('the read-only plan keeps downstream image, storage and cost unproven', () => {
  const result = assembleArchiveRun({ reader: reader(), graph: graph(), visual: visual() })
  assert.equal(result.stages.graph.status, 'COMPILED_IN_MEMORY')
  assert.equal(result.stages.visual.ready_briefs, 30)
  assert.equal(result.stages.image.accepted_images, 0)
  assert.equal(result.stages.cost.added_cost_proven_zero, false)
  assert.equal(result.storage_uploads, 0)
})
test('an uncommitted Reader candidate blocks graph and visual claims', () => {
  const changed = { ...reader(), reader_status: 'READY_TO_UPDATE_LOCAL_BOOK', added_chapters: 1 }
  const result = assembleArchiveRun({ reader: changed })
  assert.equal(result.stages.graph.status, 'WAITING_READER')
  assert.equal(result.stages.visual.status, 'WAITING_READER')
  assert.deepEqual(result.selected_point_ids, [])
  assert.throws(() => assembleArchiveRun({ reader: changed, graph: graph(), visual: visual() }))
})
test('mismatched batch or an execution flag cannot be reported as a dry-run', () => {
  assert.throws(() => assembleArchiveRun({ reader: reader(), graph: { ...graph(), batch_id: 'wrong' }, visual: visual() }))
  assert.throws(() => assembleArchiveRun({ reader: reader(), graph: graph(), visual: { ...visual(), provider_calls: 1 } }))
  assert.throws(() => assembleArchiveRun({ reader: { ...reader(), files_written: 1 } }))
})
