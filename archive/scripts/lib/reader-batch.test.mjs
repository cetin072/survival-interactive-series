import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'
import { appendAutomaticChapters, checkAppendOnlyEdition, selectTextBatchCatalog } from './reader-auto.mjs'
import { replaceBookAtomically } from './atomic-book.mjs'
import { extractReaderNarrative } from './reader-transform.mjs'

const hash = (v) => createHash('sha256').update(v).digest('hex')
// Synthetic S99 fixtures only: no actual AFTERFALL event or dialogue is authored here.
function fixture() {
  const prefix = 'archive/content/transcripts/C03-AFTERFALL/S99/SESSION_001'
  const raw = Buffer.from('## USER 000\n\nTEST_INPUT\n\n## GM 001\n\n## 2099년 1월 1일 10:00\n\nTEST_GM_PROSE\n\n다음 선택\n1. TEST_A\n2. TEST_B\n')
  const range = { start: '2099-01-01 10:00', end: '2099-01-01 10:00' }
  const session = { session_id: 'SESSION_001', visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true, source_manifest: 'SESSION_001/SOURCE_MANIFEST.json', coverage_basis: 'captured_message_range', captured_message_range: range, user_messages: 1, gm_public_blocks: 1 }
  const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: 'S99', archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE', sessions: [session] }
  const source = { ...manifest, sessions: undefined, ...session, public_safe_only: true, closed_at: '2099-01-01', counts: { user: 1, gm: 1, total: 2 }, message_order: { min: 0, max: 1, contiguous: true }, content_sha256: [{ message_order: 0, role: 'USER', sha256: hash('TEST_INPUT') }, { message_order: 1, role: 'GM', sha256: hash('TEST_GM_PROSE') }], parts: ['PART_001.md'], parts_sha256: { 'PART_001.md': hash(raw) } }
  const io = { read: async (path) => path === `${prefix}/SOURCE_MANIFEST.json` ? Buffer.from(JSON.stringify(source)) : raw,
    listParts: async () => ['PART_001.md'] }
  return { prefix, raw, range, session, manifest, source, io }
}
async function catalog(f) { return approvedSeasonCatalog(f.manifest, 'S99', f.io) }
async function automatic(f = fixture()) {
  const [item] = await catalog(f)
  const part = { ...item, readerBody: extractReaderNarrative(f.raw.toString()), sourceHash: hash(f.raw) }
  return { item, part, chapters: appendAutomaticChapters('C03-AFTERFALL', [part], [], new Set()) }
}
async function rejects(edit) { const f = fixture(); edit(f); await assert.rejects(catalog(f)) }

test('approved closed source becomes a hash-bound catalog item', async () => { const f = fixture(); const [p] = await catalog(f); assert.equal(p.autoPublication.rawSha256, hash(f.raw)); assert.equal(p.autoPublication.sourceManifestRef, `${f.prefix}/SOURCE_MANIFEST.json`) })
for (const visibility of [undefined, 'PLAYER_ARCHIVE', 'CORE_PRIVATE']) test(`unapproved season ${visibility} is never read`, async () => { const f = fixture(); f.manifest.visibility = visibility; f.io.read = async () => { throw Error('MUST_NOT_READ') }; assert.deepEqual(await catalog(f), []) })
test('unapproved session is withheld', async () => { const f = fixture(); f.session.visibility = 'PLAYER_ARCHIVE'; assert.deepEqual(await catalog(f), []) })
test('fragment is kept out of automatic prose', async () => { const f = fixture(); f.session.capture_quality = 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING'; f.session.atomic_pairing_complete = false; assert.deepEqual(await catalog(f), []) })
test('unknown quality cannot pass as a verified pair', async () => rejects((f) => { f.session.capture_quality = 'UNKNOWN' }))
test('unknown Chronicle cannot be mixed into C03', async () => rejects((f) => { f.manifest.chronicle_id = 'C02-STRONGHOLD' }))
test('wrong worldline is rejected', async () => rejects((f) => { f.manifest.worldline_id = 'STRONGHOLD' }))
test('wrong season is rejected', async () => rejects((f) => { f.source.season_id = 'S03' }))
test('duplicate source session is rejected', async () => rejects((f) => { f.manifest.sessions.push(f.session) }))
test('source path traversal is rejected', async () => rejects((f) => { f.session.source_manifest = '../gm_state.json' }))
test('source manifest identity mismatch is rejected', async () => rejects((f) => { f.source.session_id = 'SESSION_002' }))
test('source public_safe is not enough without PUBLIC_ARCHIVE approval', async () => rejects((f) => { f.source.visibility = 'PLAYER_ARCHIVE' }))
test('open capture is deferred by fail-closed rejection', async () => rejects((f) => { f.source.closed_at = null }))
test('source atomic truth must be strict boolean', async () => rejects((f) => { f.source.atomic_pairing_complete = 'true' }))
test('invalid date is rejected', async () => rejects((f) => { f.source.captured_message_range = { start: '2099-02-30 00:00', end: '2099-03-01 00:00' } }))
test('range mismatch is rejected', async () => rejects((f) => { f.source.captured_message_range = { start: '2099-01-01 09:00', end: '2099-01-01 10:00' } }))
test('unbalanced source count is rejected', async () => rejects((f) => { f.source.counts.gm = 2 }))
test('source vs session count mismatch is rejected', async () => rejects((f) => { f.session.user_messages = 2 }))
test('nonzero public-meta count cannot silently become a pair', async () => rejects((f) => { f.source.counts.assistant_public_meta = 1 }))
test('invalid order mirror is rejected', async () => rejects((f) => { f.source.message_order.max = 9 }))
test('invalid message hash is rejected', async () => rejects((f) => { f.source.content_sha256[0].sha256 = 'bogus' }))
test('wrong role order is rejected', async () => rejects((f) => { f.source.content_sha256[0].role = 'GM' }))
test('duplicate part inventory is rejected', async () => rejects((f) => { f.source.parts.push('PART_001.md') }))
test('unlisted part is rejected', async () => rejects((f) => { f.io.listParts = async () => ['PART_001.md', 'PART_002.md'] }))
test('missing part hashes are rejected', async () => rejects((f) => { delete f.source.parts_sha256 }))
test('actual corrupted RAW bytes are rejected', async () => rejects((f) => { f.source.parts_sha256['PART_001.md'] = 'b'.repeat(64) }))
test('header pairing cannot be forged merely by adjusting counts', async () => { const f = fixture(); const bad = Buffer.from('## GM 000\n\nBAD\n\n## GM 001\n\nBAD\n'); f.source.parts_sha256['PART_001.md'] = hash(bad); const read = f.io.read; f.io.read = async (p) => p.endsWith('PART_001.md') ? bad : read(p); await assert.rejects(catalog(f)) })
test('existing prose transformer removes USER and the choice gate', async () => { const { chapters } = await automatic(); assert.equal(chapters[0].body, '## 2099년 1월 1일 10:00\n\nTEST_GM_PROSE'); assert.doesNotMatch(chapters[0].body, /TEST_INPUT|TEST_A|TEST_B/) })
test('automatic chapter retains source and hashes', async () => { const { chapters, item } = await automatic(); assert.equal(chapters[0].publicationProvenance.sourceManifestRef, item.autoPublication.sourceManifestRef); assert.equal(chapters[0].sourceHashes.length, 1); assert.deepEqual(chapters[0].relatedNodeIds, []) })
test('automatic id is stable and repeated input does not duplicate', async () => { const { part, chapters } = await automatic(); const again = appendAutomaticChapters('C03-AFTERFALL', [part], [], new Set()); assert.deepEqual(again, chapters) })
test('existing covered manual chapters are kept byte-identical', async () => { const { part } = await automatic(); const manual = [{ id: 'old', body: 'EXACT_OLD_PROSE' }]; assert.deepEqual(appendAutomaticChapters('C03-AFTERFALL', [part], manual, new Set([part.archivePath])), manual) })
test('duplicate automatic source is rejected', async () => { const { part } = await automatic(); assert.throws(() => appendAutomaticChapters('C03-AFTERFALL', [part, part], [], new Set())) })
test('unapproved fallback remains an error rather than invented text', async () => { const { part } = await automatic(); delete part.autoPublication; assert.throws(() => appendAutomaticChapters('C03-AFTERFALL', [part], [], new Set())) })
test('old book truncation is rejected', () => assert.throws(() => checkAppendOnlyEdition({ chronicleId: 'C03', worldlineId: 'AF', chapters: [{ id: 'old' }] }, { chronicleId: 'C03', worldlineId: 'AF', chapters: [] }, new Set())))
test('old chapter modification is rejected', () => assert.throws(() => checkAppendOnlyEdition({ chronicleId: 'C03', worldlineId: 'AF', chapters: [{ id: 'old', body: 'A' }] }, { chronicleId: 'C03', worldlineId: 'AF', chapters: [{ id: 'old', body: 'B' }] }, new Set())))
test('new chapter outside frozen batch is rejected', async () => { const { chapters } = await automatic(); assert.throws(() => checkAppendOnlyEdition({ chronicleId: 'C03', worldlineId: 'AF', chapters: [] }, { chronicleId: 'C03', worldlineId: 'AF', chapters }, new Set())) })
test('approved new chapter extends a book without revising old prose', async () => { const { chapters } = await automatic(); const old = { chronicleId: 'C03', worldlineId: 'AF', chapters: [{ id: 'old', body: 'EXACT_OLD_PROSE' }] }; const next = { ...old, chapters: [...old.chapters, ...chapters] }; assert.equal(checkAppendOnlyEdition(old, next, new Set([chapters[0].publicationProvenance.sourceManifestRef])).length, 1) })

async function disk(testBody) {
  const dir = await mkdtemp(join(tmpdir(), 'reader-batch-'))
  const file = join(dir, 'BOOK.json')
  await writeFile(file, 'OLD_COMPLETE_BOOK')
  try { await testBody(file, dir) } finally { await rm(dir, { recursive: true, force: true }) }
}
test('atomic writer swaps only a complete local book', async () => disk(async (file) => { assert.equal((await replaceBookAtomically(file, 'OLD_COMPLETE_BOOK', 'NEW_COMPLETE_BOOK')).files_written, 1); assert.equal(await readFile(file, 'utf8'), 'NEW_COMPLETE_BOOK') }))
test('second identical run is a no-op', async () => disk(async (file) => { const r = await replaceBookAtomically(file, 'OLD_COMPLETE_BOOK', 'OLD_COMPLETE_BOOK'); assert.equal(r.status, 'NOOP'); assert.equal(r.files_written, 0) }))
test('stale expected book cannot overwrite an edited book', async () => disk(async (file) => { await assert.rejects(replaceBookAtomically(file, 'STALE', 'NEW')); assert.equal(await readFile(file, 'utf8'), 'OLD_COMPLETE_BOOK') }))
test('failure before swap preserves old content and cleans own temp/lock', async () => disk(async (file, dir) => { await assert.rejects(replaceBookAtomically(file, 'OLD_COMPLETE_BOOK', 'NEW', { beforeCommit: async () => { throw Error('TEST_IO_FAILURE') } })); assert.equal(await readFile(file, 'utf8'), 'OLD_COMPLETE_BOOK'); assert.deepEqual(await readdir(dir), ['BOOK.json']) }))
test('concurrent modification during preparation is not overwritten', async () => disk(async (file) => { await assert.rejects(replaceBookAtomically(file, 'OLD_COMPLETE_BOOK', 'NEW', { beforeCommit: async () => writeFile(file, 'OTHER_WRITER') })); assert.equal(await readFile(file, 'utf8'), 'OTHER_WRITER') }))
test('an existing lock is not stolen or removed', async () => disk(async (file) => { await writeFile(`${file}.publication-lock`, 'OTHER'); await assert.rejects(replaceBookAtomically(file, 'OLD_COMPLETE_BOOK', 'NEW')); assert.equal(await readFile(`${file}.publication-lock`, 'utf8'), 'OTHER') }))
test('book symlink is rejected', async () => disk(async (file, dir) => { const link = join(dir, 'LINK.json'); await symlink(file, link); await assert.rejects(replaceBookAtomically(link, 'OLD_COMPLETE_BOOK', 'NEW')) }))
test('raw sentinel and another Chronicle stay untouched', async () => disk(async (file, dir) => { await writeFile(join(dir, 'RAW.md'), 'EXACT_RAW'); await writeFile(join(dir, 'C02.json'), 'OTHER_CHRONICLE'); await replaceBookAtomically(file, 'OLD_COMPLETE_BOOK', 'NEW'); assert.equal(await readFile(join(dir, 'RAW.md'), 'utf8'), 'EXACT_RAW'); assert.equal(await readFile(join(dir, 'C02.json'), 'utf8'), 'OTHER_CHRONICLE') }))

test('past batch defers later unpublished input rather than publishing it', async () => { const { item } = await automatic(); assert.deepEqual(selectTextBatchCatalog([item], { chapters: [] }, { sources: [], source_game_time: '2027-03-23 17:50' }), []) })
test('past batch retains newer already-published source without changing it', async () => { const { item, chapters } = await automatic(); assert.deepEqual(selectTextBatchCatalog([item], { chapters }, { sources: [], source_game_time: '2027-03-23 17:50' }), [item]) })
test('new input within a batch still must not exceed its time boundary', async () => { const { item } = await automatic(); assert.throws(() => selectTextBatchCatalog([item], { chapters: [] }, { source_game_time: '2027-03-23 17:50', sources: [{ atomic_pairing_complete: true, source_ref: item.autoPublication.sourceManifestRef, captured_message_range: item.autoPublication.capturedRange }] })) })
