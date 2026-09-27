import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { prepareTextPublication } from './run-reader-publication.mjs'
import { prepareGraphPublication } from './run-graph-publication.mjs'
import { prepareUnifiedPublication, runUnifiedCli } from './prepare-unified-publication.mjs'

const root = resolve(import.meta.dirname, '../..')
const gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git'
const head = execFileSync(gitBinary, ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
const manifest = JSON.parse(await readFile(resolve(root,
  'archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json'), 'utf8'))
const snapshot = snapshotFromPublishedS02(manifest, head)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

test('one committed public snapshot feeds Reader candidate into Graph and Visual', async () => {
  const prepared = await prepareUnifiedPublication(snapshot)
  assert.equal(prepared.report.source_revision, head)
  assert.equal(prepared.report.reader_sha256, hash(prepared.reader.candidateBytes))
  assert.equal(prepared.graph.report.reader_sha256, prepared.report.reader_sha256)
  assert.equal(prepared.visual.report.reader_sha256, prepared.report.reader_sha256)
  assert.equal(prepared.visual.catalog.graph_sha256, prepared.graph.graph.content_sha256)
  assert.equal(prepared.report.files_written + prepared.report.database_writes
    + prepared.report.provider_calls + prepared.report.site_publications, 0)
})

test('Graph rejects a Reader candidate not produced by this snapshot', async () => {
  const reader = await prepareTextPublication(snapshot)
  const changed = Buffer.from(reader.candidateBytes)
  changed[changed.length - 2] ^= 1
  await assert.rejects(prepareGraphPublication(snapshot, null,
    { readerCandidateBytes: changed }), /GRAPH_READER_CANDIDATE_MISMATCH/)
})

test('read-only CLI prepares the real public S02 inputs and refuses apply mode', async () => {
  const report = await runUnifiedCli(['--demo-s02', '--check'])
  assert.equal(report.mode, 'UNIFIED_PUBLICATION_PREPARATION')
  assert.equal(report.source_revision, head)
  await assert.rejects(runUnifiedCli(['--demo-s02', '--apply']),
    /UNIFIED_PUBLICATION_READ_ONLY_MODE_REQUIRED/)
})
