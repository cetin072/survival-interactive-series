/** Step 3: compile a frozen public RAW batch to a local Reader edition. No remote writes. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBatch, fingerprint, planPublication } from './lib/publication-plan.mjs'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { checkAppendOnlyEdition } from './lib/reader-auto.mjs'
import { replaceBookAtomically } from './lib/atomic-book.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const hash = (v) => createHash('sha256').update(v).digest('hex')
const equal = (a, b) => Buffer.from(a).equals(Buffer.from(b))
const demand = (c, code) => { if (!c) throw new Error(code) }
function git(...args) { return execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) }
function pinnedReader(revision) {
  demand(/^[a-f0-9]{40}$/.test(revision), 'UNPINNED_REVISION')
  return (path) => {
    demand(/^(?:archive\/content\/|seasons_v2\/)[A-Za-z0-9_./-]+$/.test(path) && !path.split('/').includes('..'), 'INVALID_SOURCE_PATH')
    return git('show', `${revision}:${path}`)
  }
}

export async function prepareTextPublication(input) {
  const batch = createBatch(input)
  const snapshot = batch.snapshot
  demand(snapshot.chronicle_id === 'C03-AFTERFALL', 'TEXT_BATCH_CHRONICLE_NOT_SUPPORTED')
  const head = git('rev-parse', 'HEAD').toString().trim()
  demand(head === snapshot.source_revision, 'SNAPSHOT_CHECKOUT_MISMATCH')
  const readPinned = pinnedReader(head)
  const manifestPath = `archive/content/transcripts/C03-AFTERFALL/${snapshot.season_id}/MANIFEST.json`
  const manifest = JSON.parse(readPinned(manifestPath))
  demand(manifest.chronicle_id === snapshot.chronicle_id && manifest.worldline_id === snapshot.worldline_id && manifest.season_id === snapshot.season_id, 'MANIFEST_NAMESPACE_MISMATCH')
  if (snapshot.season_id !== 'S02') demand(manifest.visibility === 'PUBLIC_ARCHIVE', 'UNAPPROVED_PUBLIC_MANIFEST')
  for (const source of snapshot.sources) {
    const entry = manifest.sessions.find((s) => s.session_id === source.session_id)
    demand(entry && fingerprint(entry) === source.source_digest, 'SOURCE_METADATA_DIGEST_MISMATCH')
    if (snapshot.season_id !== 'S02') demand(entry.visibility === 'PUBLIC_ARCHIVE', 'UNAPPROVED_PUBLIC_SESSION')
    demand(entry.user_messages === source.user_messages && entry.gm_public_blocks === source.gm_public_blocks, 'SOURCE_COUNTS_MISMATCH')
    if (source.atomic_pairing_complete !== null) {
      demand(entry.atomic_pairing_complete === source.atomic_pairing_complete && entry.capture_quality === source.capture_quality && entry.captured_message_range?.start === source.captured_message_range.start && entry.captured_message_range?.end === source.captured_message_range.end, 'SOURCE_COVERAGE_MISMATCH')
    }
  }
  // Dynamic imports keep this runner out of the game's turn path. No gameplay modules imported.
  const { rawCatalog } = await import('./reader-source-catalog.mjs')
  const { makeBooks } = await import('./build-reader-edition.mjs')
  const catalog = rawCatalog[snapshot.chronicle_id]
  for (const part of catalog) {
    if (!part.autoPublication) continue
    const proof = part.autoPublication
    demand(hash(readPinned(proof.sourceManifestRef)) === proof.sourceManifestSha256, 'SOURCE_MANIFEST_CHANGED')
    demand(proof.capturedRange.end <= snapshot.source_game_time, 'SOURCE_AFTER_BATCH_BOUNDARY')
  }
  const bookPath = `archive/content/stories/${snapshot.chronicle_id}/BOOK.json`
  const baselineBytes = readPinned(bookPath)
  const previous = JSON.parse(baselineBytes)
  const [candidate] = await makeBooks({ readSource: async (path) => readPinned(path), catalogs: { [snapshot.chronicle_id]: catalog } })
  const allowed = new Set(snapshot.sources.filter((s) => s.atomic_pairing_complete === true).map((s) => s.source_ref))
  const additions = checkAppendOnlyEdition(previous, candidate, allowed)
  const candidateBytes = Buffer.from(JSON.stringify(candidate, null, 2) + '\n')
  const actualBytes = await readFile(resolve(root, bookPath))
  // Accept a repeat of this exact candidate; never overwrite unrelated local edits.
  demand(equal(actualBytes, baselineBytes) || equal(actualBytes, candidateBytes), 'LOCAL_BOOK_HAS_UNRELATED_CHANGES')
  const plan = planPublication(snapshot)
  const sourceReceipts = snapshot.sources.map((s) => ({
    source_ref: s.source_ref,
    task_id: plan.tasks.find((t) => t.kind === 'TEXT_SOURCE' && t.source_refs.includes(s.source_ref))?.task_id,
    source_digest: s.source_digest,
    status: s.atomic_pairing_complete === false ? 'FRAGMENT_RETAINED_NO_NEW_PROSE' : s.atomic_pairing_complete === null ? 'EXISTING_LEGACY_EDITION_RETAINED' : 'READER_COMPILED',
    chapter_ids: candidate.chapters.filter((c) => c.archiveSourceRefs.some((ref) => ref.startsWith(s.source_ref.replace(/SOURCE_(?:MANIFEST\.json|INDEX\.md)$/, '')))).map((c) => c.id),
  }))
  return {
    bookPath, actualBytes, candidateBytes,
    report: { mode: 'LOCAL_READER_BATCH', batch_id: batch.batch_id, source_revision: head,
      source_save_version: snapshot.source_save_version, source_game_time: snapshot.source_game_time,
      reader_status: equal(actualBytes, candidateBytes) ? 'NOOP' : 'READY_TO_UPDATE_LOCAL_BOOK',
      prior_chapters: previous.chapters.length, generated_chapters: candidate.chapters.length, added_chapters: additions.length,
      source_receipts: sourceReceipts, book_sha256: hash(candidateBytes),
      site_publications: 0, external_calls: 0, database_writes: 0, images_generated: 0, files_written: 0 },
  }
}

export async function runReaderCli(args) {
  if (args.length === 1 && args[0] === '--help') return 'Usage: --demo-s02 (--check|--apply) or --snapshot <file> (--check|--apply). Apply updates one local BOOK.json only; no remote publish.\n'
  const mode = args.at(-1)
  demand(['--check', '--apply'].includes(mode), 'EXPLICIT_LOCAL_MODE_REQUIRED')
  let snapshot
  if (args.length === 2 && args[0] === '--demo-s02') {
    const head = git('rev-parse', 'HEAD').toString().trim()
    snapshot = snapshotFromPublishedS02(JSON.parse(pinnedReader(head)('archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json')), head)
  } else if (args.length === 3 && args[0] === '--snapshot') {
    snapshot = JSON.parse(await readFile(resolve(args[1]), 'utf8'))
  } else { throw new Error('INVALID_CLI_ARGUMENTS') }
  const prepared = await prepareTextPublication(snapshot)
  if (mode === '--apply') {
    const result = await replaceBookAtomically(resolve(root, prepared.bookPath), prepared.actualBytes, prepared.candidateBytes)
    prepared.report.reader_status = result.status
    prepared.report.files_written = result.files_written
  }
  return JSON.stringify(prepared.report, null, 2) + '\n'
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runReaderCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"READER_BATCH_REJECTED","game_affected":false,"site_publications":0,"database_writes":0}\n'); process.exitCode = 1 }
}
