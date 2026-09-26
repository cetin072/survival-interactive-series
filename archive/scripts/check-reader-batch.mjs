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
  await mkdir(resolve(copy, relative), { recursive: true })
  const raw = '## USER 000\n\nTEST_INPUT\n\n## GM 001\n\n## 2099년 1월 1일 10:00\n\nTEST_GM_PROSE\n\n다음 선택\n1. TEST_A\n2. TEST_B\n'
  const range = { start: '2099-01-01 10:00', end: '2099-01-01 10:00' }
  const entry = { session_id: 'SESSION_001', source_type: 'SUPABASE_ROLLING_RAW', visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true, source_manifest: 'SESSION_001/SOURCE_MANIFEST.json', coverage_basis: 'captured_message_range', captured_message_range: range, user_messages: 1, gm_public_blocks: 1 }
  const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S99', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE', sessions: [entry] }
  const source = { ...manifest, sessions: undefined, ...entry, public_safe_only: true, closed_at: '2099-01-01', counts: { user: 1, gm: 1, total: 2 }, message_order: { min: 0, max: 1, contiguous: true }, content_sha256: [{ message_order: 0, role: 'USER', sha256: sha('TEST_INPUT') }, { message_order: 1, role: 'GM', sha256: sha('TEST_GM_PROSE') }], parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': sha(raw) } }
  await writeFile(resolve(copy, relative, 'PART_001.md'), raw)
  await writeFile(resolve(copy, relative, 'SOURCE_MANIFEST.json'), JSON.stringify(source, null, 2) + '\n')
  await writeFile(resolve(copy, relative, '../MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n')
  command('git', ['add', 'archive/content/transcripts/C03-AFTERFALL/S99'], copy)
  command('git', ['-c', 'user.name=Reader test', '-c', 'user.email=reader-test@example.invalid', 'commit', '--no-verify', '-qm', 'Synthetic S99 fixture; local test only'], copy)
  const snapshot = { version: 'publication-snapshot-v1', chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S99', visibility: 'PUBLIC_ARCHIVE', source_revision: command('git', ['rev-parse', 'HEAD'], copy).trim(), source_save_version: 999, source_game_time: range.end, source_checkpoint: 'worldlines/AFTERFALL/seasons/S99/END_CHECKPOINT_2099-01-01.md', coverage_status: 'PARTIAL', sources: [{ session_id: entry.session_id, source_ref: `${relative}/SOURCE_MANIFEST.json`, source_digest: fingerprint(entry), visibility: 'PUBLIC_ARCHIVE', capture_quality: entry.capture_quality, atomic_pairing_complete: true, captured_message_range: range, user_messages: 1, gm_public_blocks: 1 }] }
  const snapshotFile = join(temporary, 'snapshot.json')
  await writeFile(snapshotFile, JSON.stringify(snapshot))
  const args = ['archive/scripts/run-reader-publication.mjs', '--snapshot', snapshotFile, '--apply']
  const updated = JSON.parse(command('node', args, copy))
  assert.equal(updated.reader_status, 'UPDATED_LOCAL_BOOK')
  assert.equal(updated.added_chapters, 1)
  assert.equal(updated.files_written, 1)
  const bookFile = resolve(copy, 'archive/content/stories/C03-AFTERFALL/BOOK.json')
  const changedBook = await readFile(bookFile, 'utf8')
  const parsed = JSON.parse(changedBook)
  assert.deepEqual(parsed.chapters.slice(0, -1), books.find((b) => b.chronicleId === 'C03-AFTERFALL').chapters)
  assert.equal(parsed.chapters.at(-1).body, '## 2099년 1월 1일 10:00\n\nTEST_GM_PROSE')
  assert.equal(JSON.parse(command('node', args, copy)).reader_status, 'NOOP')
  assert.equal(await readFile(resolve(copy, relative, 'PART_001.md'), 'utf8'), raw)
  assert.equal(command('git', ['diff', '--name-only'], copy).trim(), 'archive/content/stories/C03-AFTERFALL/BOOK.json')
  // Corrupt source and failed attempts must preserve the successfully built book.
  await writeFile(resolve(copy, relative, 'PART_001.md'), raw + '\nCORRUPTED\n')
  assert.throws(() => command('node', args, copy))
  assert.equal(await readFile(bookFile, 'utf8'), changedBook)
  console.log(JSON.stringify({ real_books_unchanged: books.map((b) => ({ chronicle: b.chronicleId, chapters: b.chapters.length })), real_s02_reader_batch: report, synthetic_append: 'PASS', synthetic_repeat_noop: 'PASS', corrupted_source_retains_book: 'PASS' }))
} finally { await rm(temporary, { recursive: true, force: true }) }
