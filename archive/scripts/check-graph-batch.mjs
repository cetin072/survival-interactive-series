/** Real public baseline + isolated S99 graph update. No remote pushes or production files. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import { prepareGraphPublication } from './run-graph-publication.mjs'
import { fingerprint } from './lib/publication-plan.mjs'
import { byteHash, graphHash } from './lib/publication-graph.mjs'
import { loadPublicWikiData } from './lib/wiki-public-sources.mjs'
import { archiveNodes, archiveEdges } from '../web/src/archive/archiveData.ts'

const root = resolve(import.meta.dirname, '..', '..')
const command = (exe, args, cwd = root) => execFileSync(exe, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const head = command('git', ['rev-parse', 'HEAD']).trim()
const source = JSON.parse(await readFile(resolve(root, 'archive/content/transcripts/C03-AFTERFALL/S03/MANIFEST.json'))).sessions[0]
const factsRefS03 = 'archive/content/public-facts/C03-AFTERFALL/S03/FACTS.json'
const aWikiFacts = JSON.parse(await readFile(resolve(root, 'archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_SESSION_005_1d7513ee6981ace5be8ef3d8164c6816d10f3d291037c6f1d4d4f169e52c5550.json')))
const snapshot = { version: 'publication-snapshot-v1', chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S03', visibility: 'PUBLIC_ARCHIVE', source_revision: head, source_save_version: 258, source_game_time: '2027-04-11 17:20', source_checkpoint: 'worldlines/AFTERFALL/seasons/S03/CURRENT_CHECKPOINT_2027-04-08.md', coverage_status: 'PARTIAL', sources: [{ session_id: source.session_id, source_ref: 'archive/content/transcripts/C03-AFTERFALL/S03/SESSION_001/SOURCE_MANIFEST.json', source_digest: fingerprint(source), visibility: source.visibility, capture_quality: source.capture_quality, atomic_pairing_complete: source.atomic_pairing_complete, captured_message_range: source.captured_message_range, user_messages: source.user_messages, gm_public_blocks: source.gm_public_blocks }] }
const initial = await prepareGraphPublication(snapshot, factsRefS03)
const again = await prepareGraphPublication(snapshot, factsRefS03)
assert.ok(initial.candidateBytes.equals(again.candidateBytes))
const minimumExpectedNodes = archiveNodes.length + 2 + aWikiFacts.nodes.length
const minimumExpectedRelations = archiveEdges.length + 2 + aWikiFacts.relations.length
assert.ok(initial.graph.nodes.length >= minimumExpectedNodes)
assert.ok(initial.graph.relations.length >= minimumExpectedRelations)
assert.ok(initial.graph.nodes.some((n) => n.id === 'loc-guild-rear-warehouse'))
// The graph reconciler already validates current/history shape, anchor order,
// and hashes. A reviewed update may move the complete legacy data into history;
// its replacement must also resolve through the existing byte-verified loader.
const verifiedPublicSources = (await loadPublicWikiData(root)).sources
for (const source of archiveNodes) {
  const record = initial.graph.nodes.find((n) => n.id === source.id)
  assert.ok(record, `missing legacy node: ${source.id}`)
  const baseline = [record, ...record.history].find((revision) => isDeepStrictEqual(revision.data, source))
  assert.ok(baseline, `complete legacy data was not preserved: ${source.id}`)
  if (baseline !== record) {
    assert.equal(baseline.data_sha256, graphHash(source), `legacy history hash mismatch: ${source.id}`)
    assert.equal(record.data.type, source.type, `legacy entity type changed: ${source.id}`)
    assert.ok(verifiedPublicSources.some((entry) => entry.nodeId === record.id
      && isDeepStrictEqual(entry.evidence, record.evidence)),
    `updated legacy node lacks verified public fact evidence: ${source.id}`)
  }
}
for (const source of archiveEdges) assert.ok(initial.graph.relations.some((r) => r.data.from === source.from && r.data.to === source.to && r.data.label === source.label && r.data.kind === 'published_relation'))
for (const source of aWikiFacts.nodes) assert.ok(initial.graph.nodes.some((n) =>
  n.id === source.id && n.data.type === source.type && n.data.label === source.label))
for (const source of aWikiFacts.relations) assert.ok(initial.graph.relations.some((r) =>
  r.data.from === source.from && r.data.to === source.to && r.data.kind === source.kind))
assert.ok(initial.graph.story_links.length > 0)
assert.equal(initial.report.inferred_relationships, 0)
assert.equal(initial.report.external_calls, 0)
assert.equal(initial.report.files_written, 0)

const temporary = await mkdtemp(join(tmpdir(), 'graph-git-e2e-'))
try {
  const copy = join(temporary, 'repo')
  command('git', ['clone', '--local', '--no-hardlinks', '--quiet', '--no-checkout', root, copy])
  command('git', ['config', 'core.autocrlf', 'false'], copy)
  command('git', ['checkout', '--detach', head], copy)
  const run = (args) => JSON.parse(command('node', ['--experimental-strip-types', 'archive/scripts/run-graph-publication.mjs', ...args], copy))
  const s03SnapshotFile = join(temporary, 's03-snapshot.json')
  await writeFile(s03SnapshotFile, JSON.stringify(snapshot))
  const s03Args = ['--snapshot', s03SnapshotFile, '--facts', factsRefS03, '--apply']
  const first = run(s03Args)
  assert.equal(first.status, 'NOOP')
  assert.equal(first.files_written, 0)
  const graphPath = resolve(copy, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json')
  const firstBytes = await readFile(graphPath)
  assert.ok(firstBytes.equals(initial.candidateBytes))
  assert.equal(run(s03Args).status, 'NOOP')
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
  snapshot.source_revision = command('git', ['rev-parse', 'HEAD'], copy).trim()
  await writeFile(s03SnapshotFile, JSON.stringify(snapshot))
  assert.equal(run(s03Args).status, 'NOOP')
  assert.ok(goodBytes.equals(await readFile(graphPath)))
  // Invalid committed public-source classification cannot replace the last good graph.
  facts.visibility = 'CORE_PRIVATE'
  await writeFile(resolve(copy, factsRef), JSON.stringify(facts)); commit(factsRef)
  laterSnapshot.source_revision = command('git', ['rev-parse', 'HEAD'], copy).trim()
  await writeFile(snapshotPath, JSON.stringify(laterSnapshot))
  assert.throws(() => run(args))
  assert.ok(goodBytes.equals(await readFile(graphPath)))
  for (const [id, hash] of Object.entries(bookHashes)) assert.equal(byteHash(await readFile(resolve(copy, 'archive/content/stories', id, 'BOOK.json'))), hash)
  assert.equal(command('git', ['diff', '--name-only'], copy).trim(), 'archive/content/graphs/C03-AFTERFALL/GRAPH.json')
  console.log(JSON.stringify({ real_public_graph: initial.report, real_node_types: Object.fromEntries(['character', 'location', 'event', 'reference'].map((type) => [type, archiveNodes.filter((n) => n.type === type).length])), preserved_public_nodes_and_relations: true, double_run_identical: true, synthetic_new_nodes: updated.nodes_added, synthetic_new_relations: updated.relations_added, repeat_noop: true, historical_batch_no_rollback: true, private_source_rejected: true, original_reader_books_unchanged: true, production_writes: 0 }))
} finally { await rm(temporary, { recursive: true, force: true }) }
