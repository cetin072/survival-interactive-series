/** Real-book regression plus an isolated synthetic S99 local Git transaction. Never pushes. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { makeBooks } from './build-reader-edition.mjs'
import { fingerprint } from './lib/publication-plan.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const sha = (v) => createHash('sha256').update(v).digest('hex')
const command = (exe, args, cwd = root) => execFileSync(exe, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const head = command('git', ['rev-parse', 'HEAD']).trim()
const books = await makeBooks()
for (const book of books) {
  const existing = await readFile(resolve(root, 'archive/content/stories', book.chronicleId, 'BOOK.json'), 'utf8')
  assert.equal(JSON.stringify(book, null, 2) + '\n', existing.replace(/\r\n/g, '\n'), `${book.chronicleId} existing book changed`)
}
const first = command('node', ['archive/scripts/run-reader-publication.mjs', '--demo-s02', '--check'])
assert.equal(first, command('node', ['archive/scripts/run-reader-publication.mjs', '--demo-s02', '--check']))
const report = JSON.parse(first)
assert.equal(report.reader_status, 'NOOP')
assert.equal(report.prior_chapters, report.generated_chapters)
assert.equal(report.source_save_version, 253)
assert.equal(report.source_receipts.filter((s) => s.status === 'FRAGMENT_RETAINED_NO_NEW_PROSE').length, 2)
assert.equal(report.files_written, 0)
assert.equal(report.external_calls, 0)

const temporary = await mkdtemp(join(tmpdir(), 'reader-git-e2e-'))
try {
  const copy = join(temporary, 'repo')
  command('git', ['clone', '--local', '--no-hardlinks', '--quiet', '--no-checkout', root, copy])
  command('git', ['checkout', '--detach', head], copy)
  const relative = 'archive/content/transcripts/C03-AFTERFALL/S99/SESSION_001'
  const checkpointRef = 'worldlines/AFTERFALL/seasons/S99/END_CHECKPOINT_2099-01-01.md'
  await mkdir(resolve(copy, relative), { recursive: true })
  await mkdir(resolve(copy, 'worldlines/AFTERFALL/seasons/S99'), { recursive: true })
  await writeFile(resolve(copy, checkpointRef), 'SYNTHETIC_CHECKPOINT_ONLY\n')
  command('git', ['add', checkpointRef], copy)
  command('git', ['-c', 'user.name=Reader test', '-c', 'user.email=reader-test@example.invalid',
    'commit', '--no-verify', '-qm', 'Synthetic checkpoint fixture; local test only'], copy)
  const raw = '## USER 000\n\nTEST_INPUT\n\n## GM 001\n\n## 2099년 1월 1일 10:00\n\nTEST_GM_PROSE 서진우\n\n다음 선택\n1. TEST_A\n2. TEST_B\n'
  const range = { start: '2099-01-01 10:00', end: '2099-01-01 10:00' }
  const entry = { session_id: 'SESSION_001', source_type: 'SUPABASE_ROLLING_RAW', visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true, source_manifest: 'SESSION_001/SOURCE_MANIFEST.json', coverage_basis: 'captured_message_range', captured_message_range: range, user_messages: 1, gm_public_blocks: 1 }
  const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S99', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE', sessions: [entry] }
  const source = { ...manifest, sessions: undefined, ...entry, public_safe_only: true, closed_at: '2099-01-01', source_save_version: 999, counts: { user: 1, gm: 1, total: 2 }, message_order: { min: 0, max: 1, contiguous: true }, content_sha256: [{ message_order: 0, role: 'USER', sha256: sha('TEST_INPUT') }, { message_order: 1, role: 'GM', sha256: sha('TEST_GM_PROSE') }], parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': sha(raw) } }
  await writeFile(resolve(copy, relative, 'PART_001.md'), raw)
  await writeFile(resolve(copy, relative, 'SOURCE_MANIFEST.json'), JSON.stringify(source, null, 2) + '\n')
  await writeFile(resolve(copy, relative, '../MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n')
  command('git', ['add', 'archive/content/transcripts/C03-AFTERFALL/S99'], copy)
  command('git', ['-c', 'user.name=Reader test', '-c', 'user.email=reader-test@example.invalid', 'commit', '--no-verify', '-qm', 'Synthetic S99 fixture; local test only'], copy)
  const snapshot = { version: 'publication-snapshot-v1', chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S99', visibility: 'PUBLIC_ARCHIVE', source_revision: command('git', ['rev-parse', 'HEAD'], copy).trim(), source_save_version: 999, source_game_time: range.end, source_checkpoint: 'worldlines/AFTERFALL/seasons/S99/END_CHECKPOINT_2099-01-01.md', coverage_status: 'PARTIAL', sources: [{ session_id: entry.session_id, source_ref: `${relative}/SOURCE_MANIFEST.json`, source_digest: fingerprint(entry), visibility: 'PUBLIC_ARCHIVE', capture_quality: entry.capture_quality, atomic_pairing_complete: true, captured_message_range: range, user_messages: 1, gm_public_blocks: 1 }] }
  const snapshotFile = join(temporary, 'snapshot.json')
  await writeFile(snapshotFile, JSON.stringify(snapshot))
  const pastBefore = JSON.parse(command('node', ['archive/scripts/run-reader-publication.mjs', '--demo-s02', '--check'], copy))
  assert.equal(pastBefore.reader_status, 'NOOP')
  assert.equal(pastBefore.deferred_source_parts, 1)
  const derived = JSON.parse(command('node', ['archive/scripts/run-reader-publication.mjs',
    '--public-season', 'S99', '--checkpoint', checkpointRef, '--check'], copy))
  assert.equal(derived.reader_status, 'READY_TO_UPDATE_LOCAL_BOOK')
  assert.equal(derived.added_chapters, 1)
  assert.equal(derived.source_save_version, 999)
  const fixtureHead = command('git', ['rev-parse', 'HEAD'], copy).trim()
  const refSource = 'refs/heads/codex/archive-publication-ref-source-test'
  command('git', ['branch', 'codex/archive-publication-ref-source-test', fixtureHead], copy)
  command('git', ['checkout', '--detach', 'HEAD^'], copy)
  const beforeRefBook = await readFile(resolve(copy, 'archive/content/stories/C03-AFTERFALL/BOOK.json'))
  const refScript = `import { commitReaderFromPublicRef } from './archive/scripts/lib/reader-public-ref.mjs';
const result = await commitReaderFromPublicRef({ repoRoot: process.cwd(),
  ref: '${refSource}', seasonId: 'S99', checkpointRef: '${checkpointRef}',
  authorizeCommit: async () => true });
process.stdout.write(JSON.stringify(result));`
  const refResult = JSON.parse(command('node', ['--input-type=module', '-e', refScript], copy))
  assert.equal(refResult.status, 'LOCAL_READER_PROPOSAL_COMMITTED')
  assert.equal(refResult.added_chapters, 1)
  assert.equal(command('git', ['rev-parse', refSource], copy).trim(), refResult.commit)
  assert.equal(command('git', ['rev-parse', 'HEAD'], copy).trim(),
    command('git', ['rev-parse', `${fixtureHead}^`], copy).trim())
  assert.deepEqual(await readFile(resolve(copy, 'archive/content/stories/C03-AFTERFALL/BOOK.json')), beforeRefBook)
  assert.throws(() => command('node', ['--input-type=module', '-e', refScript], copy))
  const graphScript = `import { commitGraphRelinkFromPublicRef } from './archive/scripts/lib/graph-public-ref.mjs';
const result = await commitGraphRelinkFromPublicRef({ repoRoot: process.cwd(),
  ref: '${refSource}', seasonId: 'S99', checkpointRef: '${checkpointRef}',
  authorizeCommit: async () => true });
process.stdout.write(JSON.stringify(result));`
  const graphResult = JSON.parse(command('node', [
    '--experimental-strip-types', '--input-type=module', '-e', graphScript], copy))
  assert.equal(graphResult.status, 'LOCAL_GRAPH_PROPOSAL_COMMITTED')
  assert.equal(graphResult.nodes_added, 0)
  assert.equal(graphResult.relations_added, 0)
  assert.equal(command('git', ['rev-parse', refSource], copy).trim(), graphResult.commit)
  assert.deepEqual(await readFile(resolve(copy, 'archive/content/stories/C03-AFTERFALL/BOOK.json')), beforeRefBook)
  const proposedGraph = JSON.parse(command('git', ['show',
    `${graphResult.commit}:archive/content/graphs/C03-AFTERFALL/GRAPH.json`], copy))
  assert.ok(proposedGraph.story_links.some((link) =>
    link.chapter_id === 'c03-afterfall-auto-' + sha(`${relative}/PART_001.md`)
      && link.node_id === 'char-jinwoo'))
  assert.throws(() => command('node', [
    '--experimental-strip-types', '--input-type=module', '-e', graphScript], copy))
  const visualScript = `import { commitVisualFromPublicRef } from './archive/scripts/lib/visual-public-ref.mjs';
const result = await commitVisualFromPublicRef({ repoRoot: process.cwd(),
  ref: '${refSource}', seasonId: 'S99', checkpointRef: '${checkpointRef}',
  authorizeCommit: async () => true });
process.stdout.write(JSON.stringify(result));`
  const visualResult = JSON.parse(command('node', [
    '--experimental-strip-types', '--input-type=module', '-e', visualScript], copy))
  assert.equal(visualResult.status, 'LOCAL_VISUAL_PROPOSAL_COMMITTED')
  assert.equal(visualResult.point_count, 34)
  assert.equal(visualResult.provider_calls, 0)
  assert.equal(visualResult.execution_enabled, false)
  assert.equal(command('git', ['rev-parse', refSource], copy).trim(), visualResult.commit)
  const proposedVisual = JSON.parse(command('git', ['show',
    `${visualResult.commit}:archive/content/visuals/C03-AFTERFALL/VISUALS.json`], copy))
  assert.equal(proposedVisual.graph_sha256, proposedGraph.content_sha256)
  assert.equal(proposedVisual.points.find((point) => point.subject_id === 'char-jinwoo').status, 'READY')
  assert.deepEqual(await readFile(resolve(copy, 'archive/content/stories/C03-AFTERFALL/BOOK.json')), beforeRefBook)
  assert.throws(() => command('node', [
    '--experimental-strip-types', '--input-type=module', '-e', visualScript], copy))
  const requestScript = `import { prepareImageRequestsFromPublicRef } from './archive/scripts/lib/image-request-public-ref.mjs';
const result = await prepareImageRequestsFromPublicRef({ repoRoot: process.cwd(),
  ref: '${refSource}', seasonId: 'S99', checkpointRef: '${checkpointRef}' });
process.stdout.write(JSON.stringify(result));`
  const imageRequestArgs = ['--experimental-strip-types', '--input-type=module', '-e', requestScript]
  const requestPlan = JSON.parse(command('node', imageRequestArgs, copy))
  assert.equal(requestPlan.status, 'IMAGE_REQUESTS_PREPARED_NO_EXECUTION')
  assert.equal(requestPlan.requests.length, 3)
  assert.equal(requestPlan.requests[0].subject_id, 'char-jinwoo')
  assert.equal(requestPlan.requests[0].execution_authorized, false)
  assert.equal(requestPlan.provider_calls, 0)
  assert.equal(requestPlan.zero_added_cost_proven, false)
  assert.deepEqual(JSON.parse(command('node', imageRequestArgs, copy)), requestPlan)
  assert.equal(command('git', ['rev-parse', refSource], copy).trim(), visualResult.commit)
  command('git', ['checkout', '--detach', fixtureHead], copy)
  const proposalRef = 'refs/heads/codex/archive-publication-reader-test'
  command('git', ['branch', 'codex/archive-publication-reader-test', fixtureHead], copy)
  const proposalScript = `import { readFileSync } from 'node:fs';
import { commitReaderBookProposal } from './archive/scripts/lib/atomic-reader-book-git.mjs';
const snapshot = JSON.parse(readFileSync(process.argv[1], 'utf8'));
const result = await commitReaderBookProposal(snapshot, {
  repoRoot: process.cwd(), ref: '${proposalRef}',
  authorizeCommit: async () => true,
});
process.stdout.write(JSON.stringify(result));`
  const originalBook = await readFile(resolve(copy, 'archive/content/stories/C03-AFTERFALL/BOOK.json'))
  const proposal = JSON.parse(command('node', ['--input-type=module', '-e', proposalScript, snapshotFile], copy))
  assert.equal(proposal.status, 'LOCAL_READER_PROPOSAL_COMMITTED')
  assert.equal(proposal.added_chapters, 1)
  assert.equal(proposal.checkout_files_written, 0)
  assert.equal(command('git', ['rev-parse', 'HEAD'], copy).trim(), fixtureHead)
  assert.equal(command('git', ['rev-parse', proposalRef], copy).trim(), proposal.commit)
  assert.deepEqual(await readFile(resolve(copy, 'archive/content/stories/C03-AFTERFALL/BOOK.json')), originalBook)
  assert.throws(() => command('node', ['--input-type=module', '-e', proposalScript, snapshotFile], copy))
  const args = ['archive/scripts/run-reader-publication.mjs', '--snapshot', snapshotFile, '--apply']
  const updated = JSON.parse(command('node', args, copy))
  assert.equal(updated.reader_status, 'UPDATED_LOCAL_BOOK')
  assert.equal(updated.added_chapters, 1)
  assert.equal(updated.files_written, 1)
  const bookFile = resolve(copy, 'archive/content/stories/C03-AFTERFALL/BOOK.json')
  const changedBook = await readFile(bookFile, 'utf8')
  assert.equal(command('git', ['show', `${refResult.commit}:archive/content/stories/C03-AFTERFALL/BOOK.json`], copy), changedBook)
  assert.equal(command('git', ['show', `${proposal.commit}:archive/content/stories/C03-AFTERFALL/BOOK.json`], copy), changedBook)
  const parsed = JSON.parse(changedBook)
  assert.deepEqual(parsed.chapters.slice(0, -1), books.find((b) => b.chronicleId === 'C03-AFTERFALL').chapters)
  assert.equal(parsed.chapters.at(-1).body, '## 2099년 1월 1일 10:00\n\nTEST_GM_PROSE 서진우')
  assert.equal(JSON.parse(command('node', args, copy)).reader_status, 'NOOP')
  assert.equal(await readFile(resolve(copy, relative, 'PART_001.md'), 'utf8'), raw)
  assert.equal(command('git', ['diff', '--name-only'], copy).trim(), 'archive/content/stories/C03-AFTERFALL/BOOK.json')
  // Committing a newer edition must not make historical S02 checks fail or roll it back.
  command('git', ['add', 'archive/content/stories/C03-AFTERFALL/BOOK.json'], copy)
  command('git', ['-c', 'user.name=Reader test', '-c', 'user.email=reader-test@example.invalid', 'commit', '--no-verify', '-qm', 'Synthetic Reader result; local test only'], copy)
  const pastAfter = JSON.parse(command('node', ['archive/scripts/run-reader-publication.mjs', '--demo-s02', '--check'], copy))
  assert.equal(pastAfter.reader_status, 'NOOP')
  assert.equal(pastAfter.generated_chapters, parsed.chapters.length)
  snapshot.source_revision = command('git', ['rev-parse', 'HEAD'], copy).trim()
  await writeFile(snapshotFile, JSON.stringify(snapshot))
  // Corrupt source and failed attempts must preserve the successfully built book.
  await writeFile(resolve(copy, relative, 'PART_001.md'), raw + '\nCORRUPTED\n')
  assert.throws(() => command('node', args, copy))
  assert.equal(await readFile(bookFile, 'utf8'), changedBook)
  console.log(JSON.stringify({ real_books_unchanged: books.map((b) => ({ chronicle: b.chronicleId, chapters: b.chapters.length })), real_s02_reader_batch: report, historical_batch_after_newer_publication: 'PASS', synthetic_ref_pinned_reader_proposal: 'PASS', synthetic_ref_pinned_graph_relink: 'PASS', synthetic_ref_pinned_visual_catalog: 'PASS', synthetic_ref_pinned_image_request: 'PASS', synthetic_local_git_proposal: 'PASS', synthetic_append: 'PASS', synthetic_repeat_noop: 'PASS', corrupted_source_retains_book: 'PASS' }))
} finally { await rm(temporary, { recursive: true, force: true }) }
