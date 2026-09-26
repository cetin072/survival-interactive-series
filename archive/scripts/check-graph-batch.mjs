/** Real public baseline + isolated S99 graph update. No remote pushes or production files. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareGraphPublication } from './run-graph-publication.mjs'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { byteHash } from './lib/publication-graph.mjs'
import { archiveNodes, archiveEdges } from '../web/src/archive/archiveData.ts'

const root = resolve(import.meta.dirname, '..', '..')
const command = (exe, args, cwd = root) => execFileSync(exe, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const head = command('git', ['rev-parse', 'HEAD']).trim()
const snapshot = snapshotFromPublishedS02(JSON.parse(await readFile(resolve(root, 'archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json'))), head)
const initial = await prepareGraphPublication(snapshot)
const again = await prepareGraphPublication(snapshot)
assert.ok(initial.candidateBytes.equals(again.candidateBytes))
assert.equal(initial.graph.nodes.length, archiveNodes.length)
assert.equal(initial.graph.relations.length, archiveEdges.length)
for (const source of archiveNodes) assert.deepEqual(initial.graph.nodes.find((n) => n.id === source.id).data, source)
for (const source of archiveEdges) assert.ok(initial.graph.relations.some((r) => r.data.from === source.from && r.data.to === source.to && r.data.label === source.label && r.data.kind === 'published_relation'))
assert.ok(initial.graph.story_links.length > 0)
assert.equal(initial.report.inferred_relationships, 0)
assert.equal(initial.report.external_calls, 0)
assert.equal(initial.report.files_written, 0)

const temporary = await mkdtemp(join(tmpdir(), 'graph-git-e2e-'))
try {
  const copy = join(temporary, 'repo')
  command('git', ['clone', '--local', '--no-hardlinks', '--quiet', '--no-checkout', root, copy])
  command('git', ['checkout', '--detach', head], copy)
  const run = (args) => JSON.parse(command('node', ['--experimental-strip-types', 'archive/scripts/run-graph-publication.mjs', ...args], copy))
  const first = run(['--demo-s02', '--apply'])
  assert.equal(first.status, 'UPDATED_LOCAL_GRAPH')
  assert.equal(first.files_written, 1)
  const graphPath = resolve(copy, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json')
  const firstBytes = await readFile(graphPath)
  assert.ok(firstBytes.equals(initial.candidateBytes))
  assert.equal(run(['--demo-s02', '--apply']).status, 'NOOP')
  assert.equal(command('git', ['diff', '--name-only'], copy).trim(), '')
  const bookHashes = {}
  for (const id of ['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL']) bookHashes[id] = byteHash(await readFile(resolve(copy, 'archive/content/stories', id, 'BOOK.json')))

  // This is explicitly synthetic S99 metadata, never a new AFTERFALL plot.
  const factsRef = 'archive/content/public-facts/C03-AFTERFALL/S99/TEST_ONLY.json'
  const publicNamespace = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
  const node = (id, type, label) => ({ id, type, label, subtitle: 'SYNTHETIC TEST ONLY', summary: 'SYNTHETIC TEST ONLY', tags: ['TEST_ONLY'], source: 'SYNTHETIC TEST ONLY' })
  const facts = { version: 'public-graph-facts-v1', ...publicNamespace, season_id: 'S99', anchor: { save_version: 999, game_time: '2099-01-01 10:00' }, nodes: [node('char-test-only', 'character', '테스트인물'), node('loc-test-only', 'location', '테스트장소'), node('event-test-only', 'event', '테스트사건')], relations: [{ from: 'char-test-only', to: 'event-test-only', kind: 'participated_in', label: '시험 참여' }, { from: 'event-test-only', to: 'loc-test-only', kind: 'occurred_at', label: '시험 장소' }] }
  await mkdir(resolve(copy, factsRef, '..'), { recursive: true })
  await writeFile(resolve(copy, factsRef), JSON.stringify(facts, null, 2) + '\n')
  const commit = (path) => {
    command('git', ['add', path], copy)
    command('git', ['-c', 'user.name=Graph test', '-c', 'user.email=graph-test@example.invalid', 'commit', '--no-verify', '-qm', 'Synthetic graph fixture; local test only'], copy)
  }
  commit(factsRef)
  const laterSnapshot = { version: 'publication-snapshot-v1', ...publicNamespace, season_id: 'S99', source_revision: command('git', ['rev-parse', 'HEAD'], copy).trim(), source_save_version: 999, source_game_time: facts.anchor.game_time, source_checkpoint: 'worldlines/AFTERFALL/seasons/S99/END_CHECKPOINT_2099-01-01.md', coverage_status: 'PARTIAL', sources: [] }
  const snapshotPath = join(temporary, 'snapshot.json')
  await writeFile(snapshotPath, JSON.stringify(laterSnapshot))
  const args = ['--snapshot', snapshotPath, '--facts', factsRef, '--apply']
  const updated = run(args)
  assert.equal(updated.nodes_added, 3)
  assert.equal(updated.relations_added, 2)
  assert.equal(updated.status, 'UPDATED_LOCAL_GRAPH')
  const goodBytes = await readFile(graphPath)
  assert.equal(run(args).status, 'NOOP')
  assert.equal(run(['--demo-s02', '--apply']).status, 'NOOP')
  assert.ok(goodBytes.equals(await readFile(graphPath)))
  // Invalid committed public-source classification cannot replace the last good graph.
  facts.visibility = 'CORE_PRIVATE'
  await writeFile(resolve(copy, factsRef), JSON.stringify(facts)); commit(factsRef)
  laterSnapshot.source_revision = command('git', ['rev-parse', 'HEAD'], copy).trim()
  await writeFile(snapshotPath, JSON.stringify(laterSnapshot))
  assert.throws(() => run(args))
  assert.ok(goodBytes.equals(await readFile(graphPath)))
  for (const [id, hash] of Object.entries(bookHashes)) assert.equal(byteHash(await readFile(resolve(copy, 'archive/content/stories', id, 'BOOK.json'))), hash)
  assert.equal(command('git', ['diff', '--name-only'], copy).trim(), '')
  console.log(JSON.stringify({ real_public_graph: initial.report, real_node_types: Object.fromEntries(['character', 'location', 'event', 'reference'].map((type) => [type, archiveNodes.filter((n) => n.type === type).length])), preserved_public_nodes_and_relations: true, double_run_identical: true, synthetic_new_nodes: updated.nodes_added, synthetic_new_relations: updated.relations_added, repeat_noop: true, historical_batch_no_rollback: true, private_source_rejected: true, original_reader_books_unchanged: true, production_writes: 0 }))
} finally { await rm(temporary, { recursive: true, force: true }) }
