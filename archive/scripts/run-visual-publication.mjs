/** Step 5: offline, pinned public graph -> Visual Points/Briefs. Never executes an image model. */
import { execFileSync } from 'node:child_process'
import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBatch } from './lib/publication-plan.mjs'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { prepareGraphPublication } from './run-graph-publication.mjs'
import { writeGraphAtomically } from './lib/atomic-graph.mjs'
import { compileVisualCatalog, legacyPublicAppearance, planVisualSelection, validateVisualCatalog, visualBytes, visualByteHash } from './lib/visual-compiler.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const appearanceRef = 'archive/web/src/archive/characterAppearance.ts'
const outputRef = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'
const baselineAppearanceBlob = '74beacb2424ad2b6d39fdbf4761fdfb99032df85'
// Explicit editorial approval #140, not an inference from mutable UI or later gameplay.
// The timestamped public input is verified against the durable decision and DB receipt.
// Its save/time identifies the unchanged S02 subject baseline, not a newly invented event.
export const APPROVED_S02_APPEARANCE_REF = 'archive/content/public-facts/C03-AFTERFALL/S02/APPEARANCES_APPROVED_20260926.json'
const demand = (v, code) => { if (!v) throw new Error(code) }
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const currentHead = () => git('rev-parse', 'HEAD').toString().trim()
function pinned(sha, path) {
  demand(/^[a-f0-9]{40}$/.test(sha) && /^archive\/(?:content|web\/src\/archive)\/[A-Za-z0-9_./-]+$/.test(path) && !path.split('/').includes('..'), 'INVALID_VISUAL_PATH')
  return git('show', `${sha}:${path}`)
}
async function existingOutput() {
  for (const path of ['archive', 'archive/content', 'archive/content/visuals', 'archive/content/visuals/C03-AFTERFALL']) {
    try { demand((await lstat(resolve(root, path))).isDirectory(), 'INVALID_VISUAL_PARENT') }
    catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }
  try { demand((await lstat(resolve(root, outputRef))).isFile(), 'INVALID_VISUAL_OUTPUT'); return await readFile(resolve(root, outputRef)) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
function approvedJSON(sha, path, section, season) {
  demand(new RegExp(`^archive/content/${section}/C03-AFTERFALL/${season}/[A-Za-z0-9_-]+\\.json$`).test(path), 'UNAPPROVED_VISUAL_INPUT_PATH')
  const bytes = pinned(sha, path)
  demand(bytes.length <= 2_000_000, 'VISUAL_INPUT_TOO_LARGE')
  return { data: JSON.parse(bytes), evidence: { source_ref: path, source_sha256: visualByteHash(bytes) } }
}
export async function prepareVisualPublication(snapshot, { factsRef = null, appearancesRef = null, mapRef = null } = {}) {
  const batch = createBatch(snapshot), sha = currentHead()
  demand(batch.snapshot.source_revision === sha, 'VISUAL_SNAPSHOT_CHECKOUT_MISMATCH')
  const preparedGraph = await prepareGraphPublication(snapshot, factsRef)
  // Only this reviewed S02 editorial decision has a default. Other snapshots
  // still require an explicit dated appearance input when the legacy UI drifts.
  const reviewedAppearanceRef = appearancesRef ?? (snapshot.season_id === 'S02' ? APPROVED_S02_APPEARANCE_REF : null)
  let appearances
  if (reviewedAppearanceRef) {
    const loaded = approvedJSON(sha, reviewedAppearanceRef, 'public-facts', snapshot.season_id)
    demand(Array.isArray(loaded.data.records), 'MISSING_APPEARANCE_RECORDS')
    appearances = { ...loaded.data, records: loaded.data.records.map((item) => {
      demand(!Object.hasOwn(item, 'evidence'), 'CALLER_APPEARANCE_EVIDENCE_REJECTED')
      return { ...item, evidence: { ...loaded.evidence, pointer: `/characters/${item.node_id}` } }
    }) }
  } else {
    // No future modification of the TS snapshot may masquerade as save-253 appearance Canon.
    demand(git('rev-parse', `${sha}:${appearanceRef}`).toString().trim() === baselineAppearanceBlob, 'APPEARANCE_BASELINE_CHANGED_USE_DATED_PUBLIC_INPUT')
    const bytes = pinned(sha, appearanceRef)
    demand((await lstat(resolve(root, appearanceRef))).isFile() && bytes.equals(await readFile(resolve(root, appearanceRef))), 'APPEARANCE_CHECKOUT_CHANGED')
    const module = await import(pathToFileURL(resolve(root, appearanceRef)).href)
    appearances = legacyPublicAppearance(module.characterAppearanceByNodeId, visualByteHash(bytes))
  }
  let publicMap = null
  if (mapRef) {
    const loaded = approvedJSON(sha, mapRef, 'public-maps', snapshot.season_id)
    demand(!Object.hasOwn(loaded.data, 'evidence'), 'CALLER_MAP_EVIDENCE_REJECTED')
    publicMap = { ...loaded.data, evidence: { ...loaded.evidence, pointer: '/map' } }
  }
  const catalog = compileVisualCatalog({ batch, graph: preparedGraph.graph, appearances, publicMap })
  validateVisualCatalog(catalog)
  const actualBytes = await existingOutput()
  if (actualBytes) {
    const previous = JSON.parse(actualBytes); validateVisualCatalog(previous)
    demand(previous.anchor.save_version <= catalog.anchor.save_version && previous.anchor.game_time <= catalog.anchor.game_time, 'STALE_VISUAL_CATALOG_WRITE')
  }
  const candidateBytes = Buffer.from(visualBytes(catalog))
  return { catalog, actualBytes, candidateBytes, report: {
    mode: 'LOCAL_VISUAL_BRIEF_COMPILER', batch_id: batch.batch_id, source_revision: sha,
    source_save_version: catalog.anchor.save_version, status: actualBytes?.equals(candidateBytes) ? 'NOOP' : 'READY_TO_UPDATE_LOCAL_VISUAL_CATALOG',
    point_count: catalog.points.length, by_type: Object.fromEntries(['CHARACTER', 'LOCATION', 'EVENT', 'ENVIRONMENT', 'MAP'].map((t) => [t, catalog.points.filter((p) => p.point_type === t).length])),
    skipped: catalog.skipped.length, map_gate: catalog.map_gate, selection: planVisualSelection(catalog),
    catalog_sha256: catalog.content_sha256, files_written: 0, provider_calls: 0, database_writes: 0, site_publications: 0,
  } }
}
export async function runVisualCli(args) {
  if (args.length === 1 && args[0] === '--help') return 'Usage: node --experimental-strip-types archive/scripts/run-visual-publication.mjs --demo-s02 (--check|--apply)\n  or --snapshot <file> --facts <repo-path> [--appearances <repo-path>] [--map <repo-path>] (--check|--apply)\nCompiles a local worklist only. No generation, upload, scheduler or site publication.\n'
  const mode = args.at(-1)
  demand(['--check', '--apply'].includes(mode), 'EXPLICIT_VISUAL_MODE_REQUIRED')
  let snapshot, options = {}
  if (args.length === 2 && args[0] === '--demo-s02') {
    const sha = currentHead()
    snapshot = snapshotFromPublishedS02(JSON.parse(pinned(sha, 'archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json')), sha)
  } else {
    const flags = new Map()
    demand((args.length - 1) % 2 === 0, 'INVALID_VISUAL_ARGUMENTS')
    for (let i = 0; i < args.length - 1; i += 2) {
      demand(['--snapshot', '--facts', '--appearances', '--map'].includes(args[i]) && !flags.has(args[i]), 'INVALID_VISUAL_FLAG')
      flags.set(args[i], args[i + 1])
    }
    demand(flags.has('--snapshot') && flags.has('--facts'), 'MISSING_VISUAL_INPUT')
    const bytes = await readFile(resolve(flags.get('--snapshot'))); demand(bytes.length <= 2_000_000, 'VISUAL_SNAPSHOT_TOO_LARGE')
    snapshot = JSON.parse(bytes)
    options = { factsRef: flags.get('--facts'), appearancesRef: flags.get('--appearances') ?? null, mapRef: flags.get('--map') ?? null }
  }
  const prepared = await prepareVisualPublication(snapshot, options)
  if (mode === '--apply') Object.assign(prepared.report, await writeGraphAtomically(resolve(root, outputRef), prepared.actualBytes, prepared.candidateBytes))
  if (prepared.report.status === 'UPDATED_LOCAL_GRAPH') prepared.report.status = 'UPDATED_LOCAL_VISUAL_CATALOG'
  return JSON.stringify(prepared.report, null, 2) + '\n'
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runVisualCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"PUBLIC_VISUAL_BATCH_REJECTED","game_affected":false,"provider_calls":0,"database_writes":0,"site_publications":0}\n'); process.exitCode = 1 }
}
