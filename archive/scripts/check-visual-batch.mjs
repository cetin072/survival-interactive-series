/** Real public inputs and a local-only synthetic S99 transaction. Never calls an image model. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareVisualPublication, APPROVED_S02_APPEARANCE_REF } from './run-visual-publication.mjs'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { legacyPublicAppearance, planVisualSelection, visualByteHash } from './lib/visual-compiler.mjs'
import { POLICY } from './lib/publication-plan.mjs'
import { characterAppearanceByNodeId } from '../web/src/archive/characterAppearance.ts'

const root = resolve(import.meta.dirname, '..', '..')
const command = (exe, args, cwd = root) => execFileSync(exe, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const head = command('git', ['rev-parse', 'HEAD']).trim()
const snapshot = snapshotFromPublishedS02(JSON.parse(await readFile(resolve(root, 'archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json'))), head)
const approvedBytes = await readFile(resolve(root, APPROVED_S02_APPEARANCE_REF))
const approvedInput = JSON.parse(approvedBytes)
assert.equal(approvedInput.records.length, 18)
for (const record of approvedInput.records) {
  assert.deepEqual(record.visual, characterAppearanceByNodeId[record.node_id].visual)
  assert.equal(record.status, characterAppearanceByNodeId[record.node_id].status)
}
const initial = await prepareVisualPublication(snapshot), repeat = await prepareVisualPublication(snapshot)
assert.ok(initial.candidateBytes.equals(repeat.candidateBytes))
assert.equal(initial.report.point_count, 34)
assert.equal(initial.report.by_type.CHARACTER, 18)
assert.equal(initial.report.by_type.LOCATION, 10)
assert.equal(initial.report.by_type.MAP, 0)
assert.equal(initial.report.skipped, 4)
const portraits = initial.catalog.points.filter((p) => p.point_type === 'CHARACTER')
// The explicit #140 completion changed approved input, not the compiler's readiness gate.
assert.equal(portraits.filter((p) => p.status === 'READY').length, 18)
assert.equal(portraits.filter((p) => p.status === 'WAITING_CANON').length, 0)
for (const p of portraits.filter((p) => p.status === 'READY')) {
  const appearance = characterAppearanceByNodeId[p.subject_id]
  for (const [key, value] of Object.entries(p.brief.canon_facts.appearance)) assert.deepEqual(value, appearance.visual[key])
  assert.equal(Object.hasOwn(p.brief.canon_facts.appearance, 'voice'), false)
  assert.equal(Object.hasOwn(p.brief, 'provenance'), false)
  assert.ok(p.source_refs.some((source) => source.source_ref === APPROVED_S02_APPEARANCE_REF && source.source_sha256 === visualByteHash(approvedBytes)))
}
assert.equal(portraits.find((p) => p.subject_id === 'char-hajin').brief.canon_facts.appearance.gender, '여성')
assert.equal(portraits.find((p) => p.subject_id === 'char-jisu').brief.canon_facts.appearance.height, '168cm쯤')
for (const mutate of [
  (p) => { p.hidden_state = 'not permitted' },
  (p) => { p.origin = 'UNAPPROVED' },
  (p) => { p.newFields = ['unknown_hidden_field'] },
  (p) => { p.recoveredFields = [...p.recoveredFields, p.newFields[0]] },
]) {
  const bad = structuredClone(characterAppearanceByNodeId)
  mutate(bad['char-hajin'].provenance)
  assert.throws(() => legacyPublicAppearance(bad, 'a'.repeat(64)))
}
assert.equal(initial.report.selection.selected_point_ids.length, 3)
assert.equal(initial.report.selection.execution_enabled, false)
assert.equal(initial.report.selection.batch_attempt_limit, POLICY.batch_attempt_limit)
assert.equal(initial.report.selection.daily_attempt_limit, POLICY.daily_attempt_limit)
assert.equal(initial.report.selection.retry_limit, POLICY.retry_limit)
assert.equal(initial.report.map_gate, 'WAITING_PUBLIC_MAP_PROJECTION')
assert.equal(initial.report.provider_calls, 0)
assert.equal(initial.report.files_written, 0)
const firstPortrait = portraits.find((p) => p.subject_id === 'char-jinwoo')
assert.ok(firstPortrait)
const withReceipt = planVisualSelection(initial.catalog, { receipts: [{ point_id: firstPortrait.point_id, generation_key: firstPortrait.generation_key, status: 'GENERATED', visibility: 'PUBLIC_ARCHIVE' }] })
assert.equal(withReceipt.already_rendered, 1)
assert.ok(!withReceipt.selected_point_ids.includes(firstPortrait.point_id))

const temporary = await mkdtemp(join(tmpdir(), 'visual-git-e2e-'))
try {
  const copy = join(temporary, 'repo')
  command('git', ['clone', '--local', '--no-hardlinks', '--quiet', '--no-checkout', root, copy])
  command('git', ['checkout', '--detach', head], copy)
  const run = (args) => JSON.parse(command('node', ['--experimental-strip-types', 'archive/scripts/run-visual-publication.mjs', ...args], copy))
  const before = {}
  for (const path of ['archive/content/stories/C01-HAN-JUNHO/BOOK.json', 'archive/content/stories/C02-STRONGHOLD/BOOK.json', 'archive/content/stories/C03-AFTERFALL/BOOK.json', 'archive/web/src/archive/archiveData.ts', 'archive/web/src/archive/characterAppearance.ts']) before[path] = visualByteHash(await readFile(resolve(copy, path)))
  // The website now commits a pinned catalog. Remove it only in this disposable
  // clone so the original create-then-repeat atomic writer path is still tested.
  const outputPath = resolve(copy, 'archive/content/visuals/C03-AFTERFALL/VISUALS.json')
  await rm(outputPath, { force: true })
  const first = run(['--demo-s02', '--apply'])
  assert.equal(first.status, 'UPDATED_LOCAL_VISUAL_CATALOG')
  assert.equal(first.files_written, 1)
  assert.ok(initial.candidateBytes.equals(await readFile(outputPath)))
  assert.equal(run(['--demo-s02', '--apply']).status, 'NOOP')
  assert.equal(command('git', ['diff', '--name-only'], copy).trim(), '')

  // Publicly approved synthetic sources prove new environment and map-layers work. Not real Canon.
  const factsRef = 'archive/content/public-facts/C03-AFTERFALL/S99/TEST_VISUAL.json'
  const mapRef = 'archive/content/public-maps/C03-AFTERFALL/S99/TEST_MAP.json'
  const appearancesRef = 'archive/content/public-facts/C03-AFTERFALL/S99/TEST_APPEARANCES.json'
  const publicNamespace = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
  const boundary = { save_version: 999, game_time: '2099-01-01 10:00' }
  const facts = { version: 'public-graph-facts-v1', ...publicNamespace, season_id: 'S99', anchor: boundary,
    nodes: [{ id: 'event-test-visual', type: 'event', label: 'TEST ONLY SKY', subtitle: 'SYNTHETIC TEST', summary: 'A synthetic red-horizon environment fixture.', tags: ['ENVIRONMENT', 'RED_HORIZON'], source: 'SYNTHETIC TEST ONLY' }], relations: [] }
  const publicMap = { asset_id: 'AF-MAP-001', visibility: 'PUBLIC_ARCHIVE', anchor: boundary, public_projection_sha256: 'c'.repeat(64) }
  await mkdir(resolve(copy, factsRef, '..'), { recursive: true })
  await mkdir(resolve(copy, mapRef, '..'), { recursive: true })
  await writeFile(resolve(copy, factsRef), JSON.stringify(facts, null, 2) + '\n')
  await writeFile(resolve(copy, mapRef), JSON.stringify(publicMap, null, 2) + '\n')
  await writeFile(resolve(copy, appearancesRef), approvedBytes)
  const commit = (paths) => {
    command('git', ['add', ...paths], copy)
    command('git', ['-c', 'user.name=Visual test', '-c', 'user.email=visual-test@example.invalid', 'commit', '--no-verify', '-qm', 'Synthetic visual fixture; local test only'], copy)
  }
  commit([factsRef, mapRef, appearancesRef])
  const laterSnapshot = { version: 'publication-snapshot-v1', ...publicNamespace, season_id: 'S99', source_revision: command('git', ['rev-parse', 'HEAD'], copy).trim(), source_save_version: boundary.save_version, source_game_time: boundary.game_time, source_checkpoint: 'worldlines/AFTERFALL/seasons/S99/END_CHECKPOINT_2099-01-01.md', coverage_status: 'PARTIAL', sources: [] }
  const snapshotFile = join(temporary, 'snapshot.json')
  await writeFile(snapshotFile, JSON.stringify(laterSnapshot))
  // Outside the specifically reviewed S02 decision, no dated input means fail closed.
  assert.throws(() => run(['--snapshot', snapshotFile, '--facts', factsRef, '--map', mapRef, '--apply']))
  assert.ok(initial.candidateBytes.equals(await readFile(outputPath)))
  const args = ['--snapshot', snapshotFile, '--facts', factsRef, '--appearances', appearancesRef, '--map', mapRef, '--apply']
  const later = run(args)
  assert.equal(later.point_count, 36)
  assert.equal(later.by_type.MAP, 1)
  const goodBytes = await readFile(outputPath), catalog = JSON.parse(goodBytes)
  assert.equal(catalog.points.find((p) => p.subject_id === 'event-test-visual').brief.art_direction.mood, 'RED_HORIZON')
  assert.equal(catalog.points.find((p) => p.subject_id === 'char-jinwoo').generation_key, firstPortrait.generation_key)
  assert.deepEqual(catalog.points.find((p) => p.point_type === 'MAP').brief.canon_facts, {})
  assert.equal(run(args).status, 'NOOP')
  assert.throws(() => run(['--demo-s02', '--apply']))
  assert.ok(goodBytes.equals(await readFile(outputPath)))
  // Private map cannot be promoted by a PUBLIC parent graph or overwritten into the good worklist.
  publicMap.visibility = 'PLAYER_ARCHIVE'
  await writeFile(resolve(copy, mapRef), JSON.stringify(publicMap)); commit([mapRef])
  laterSnapshot.source_revision = command('git', ['rev-parse', 'HEAD'], copy).trim()
  await writeFile(snapshotFile, JSON.stringify(laterSnapshot))
  assert.throws(() => run(args))
  assert.ok(goodBytes.equals(await readFile(outputPath)))
  for (const [path, hash] of Object.entries(before)) assert.equal(visualByteHash(await readFile(resolve(copy, path))), hash)
  assert.equal(command('git', ['diff', '--name-only'], copy).trim(), 'archive/content/visuals/C03-AFTERFALL/VISUALS.json')
  console.log(JSON.stringify({ real_visual_catalog: initial.report,
    sample_character_brief: firstPortrait.brief,
    current_public_appearance_fields_preserved: true, deterministic_double_compile: true,
    explicitly_dated_appearance_input: true, unreviewed_baseline_fails_closed: true,
    synthetic_environment_and_map: true, repeat_noop: true, unchanged_portrait_not_regenerated: true,
    stale_batch_does_not_overwrite: true, private_map_rejected_preserving_output: true,
    original_books_and_public_sources_unchanged: true, actual_images_generated: 0, production_writes: 0 }))
} finally { await rm(temporary, { recursive: true, force: true }) }
