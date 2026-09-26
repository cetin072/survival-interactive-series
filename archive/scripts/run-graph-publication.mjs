/** Step 4: pinned public facts + Reader -> local graph/articles; no remote publication. */
import { execFileSync } from 'node:child_process'
import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBatch, fingerprint, planPublication } from './lib/publication-plan.mjs'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { byteHash, graphBytes, legacyPublicFacts, reconcilePublicGraph } from './lib/publication-graph.mjs'
import { writeGraphAtomically } from './lib/atomic-graph.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const seedRef = 'archive/web/src/archive/archiveData.ts'
const bookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const manifestRef = 'archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json'
const demand = (c, code) => { if (!c) throw new Error(code) }
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const headSHA = () => git('rev-parse', 'HEAD').toString().trim()
function pinned(sha, ref) {
  demand(/^[a-f0-9]{40}$/.test(sha) && /^archive\/(?:content|web\/src\/archive)\/[A-Za-z0-9_./-]+$/.test(ref) && !ref.split('/').includes('..'), 'INVALID_PINNED_PATH')
  return git('show', `${sha}:${ref}`)
}
async function localGraph() {
  // Reject symlinked output ancestors as well as a symlinked graph; never follow them on read.
  for (const sub of ['archive', 'archive/content', 'archive/content/graphs', 'archive/content/graphs/C03-AFTERFALL']) {
    try { demand((await lstat(resolve(root, sub))).isDirectory(), 'INVALID_GRAPH_PARENT') }
    catch (e) { if (e.code === 'ENOENT') return null; throw e }
  }
  try { demand((await lstat(resolve(root, graphRef))).isFile(), 'INVALID_GRAPH_FILE'); return await readFile(resolve(root, graphRef)) }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }
}
export async function prepareGraphPublication(snapshot, factsRef = null) {
  const batch = createBatch(snapshot), sha = headSHA()
  demand(batch.snapshot.source_revision === sha, 'GRAPH_SNAPSHOT_CHECKOUT_MISMATCH')
  demand(batch.snapshot.chronicle_id === 'C03-AFTERFALL', 'GRAPH_CHRONICLE_UNSUPPORTED')
  if (snapshot.sources.length) {
    const m = JSON.parse(pinned(sha, `archive/content/transcripts/C03-AFTERFALL/${snapshot.season_id}/MANIFEST.json`))
    demand(m.chronicle_id === snapshot.chronicle_id && m.worldline_id === snapshot.worldline_id && m.season_id === snapshot.season_id, 'GRAPH_MANIFEST_SCOPE_MISMATCH')
    for (const s of snapshot.sources) demand(fingerprint(m.sessions.find((x) => x.session_id === s.session_id)) === s.source_digest, 'GRAPH_SOURCE_DIGEST_MISMATCH')
  }
  // The only imported data module is this fixed, hash-checked, already-public source file.
  const seedBytes = pinned(sha, seedRef)
  demand((await lstat(resolve(root, seedRef))).isFile() && seedBytes.equals(await readFile(resolve(root, seedRef))), 'PUBLIC_SEED_CHECKOUT_MODIFIED')
  const seedModule = await import(pathToFileURL(resolve(root, seedRef)).href)
  const seedFacts = legacyPublicFacts(seedModule)
  const bookBytes = pinned(sha, bookRef), book = JSON.parse(bookBytes)
  const bookSource = { source_ref: bookRef, source_sha256: byteHash(bookBytes) }
  const seedSource = { source_ref: seedRef, source_sha256: byteHash(seedBytes) }
  const actualBytes = await localGraph()
  let previous = actualBytes ? JSON.parse(actualBytes) : null
  let bootstrap = { nodes: 0, relations: 0 }
  if (!previous) {
    const seedBatch = createBatch(snapshotFromPublishedS02(JSON.parse(pinned(sha, manifestRef)), sha))
    const initialized = reconcilePublicGraph({ batch: seedBatch, facts: seedFacts, source: seedSource, book: { chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', chapters: [] }, bookSource })
    previous = initialized.graph
    bootstrap = { nodes: previous.nodes.length, relations: previous.relations.length }
  }
  let facts = seedFacts, source = seedSource
  if (factsRef !== null) {
    demand(new RegExp(`^archive/content/public-facts/C03-AFTERFALL/${snapshot.season_id}/[A-Za-z0-9_-]+\\.json$`).test(factsRef), 'GRAPH_FACTS_PATH_NOT_ALLOWED')
    const bytes = pinned(sha, factsRef)
    demand(bytes.length <= 2_000_000, 'GRAPH_FACTS_TOO_LARGE')
    facts = JSON.parse(bytes); source = { source_ref: factsRef, source_sha256: byteHash(bytes) }
  }
  const compiled = reconcilePublicGraph({ batch, previous, facts, source, book, bookSource })
  const candidateBytes = Buffer.from(graphBytes(compiled.graph))
  const task = planPublication(snapshot).tasks.find((t) => t.kind === 'GRAPH_RECONCILIATION')
  return { actualBytes, candidateBytes, graph: compiled.graph, report: {
    ...compiled.report, mode: 'LOCAL_GRAPH_BATCH', task_id: task.task_id, bootstrap,
    source_revision: sha, source_save_version: snapshot.source_save_version, graph_sha256: compiled.graph.content_sha256,
    status: actualBytes?.equals(candidateBytes) ? 'NOOP' : 'READY_TO_UPDATE_LOCAL_GRAPH', files_written: 0,
  } }
}
export async function runGraphCli(args) {
  if (args.length === 1 && args[0] === '--help') return 'Usage: node --experimental-strip-types archive/scripts/run-graph-publication.mjs --demo-s02 (--check|--apply)\n  or --snapshot <file> --facts <approved-public-facts-repo-path> (--check|--apply)\nNo remote writes, DB access, image calls or scheduler.\n'
  const mode = args.at(-1)
  demand(['--check', '--apply'].includes(mode), 'EXPLICIT_GRAPH_MODE_REQUIRED')
  let snapshot, factsRef = null
  if (args.length === 2 && args[0] === '--demo-s02') { const sha = headSHA(); snapshot = snapshotFromPublishedS02(JSON.parse(pinned(sha, manifestRef)), sha) }
  else if (args.length === 5 && args[0] === '--snapshot' && args[2] === '--facts') {
    const bytes = await readFile(resolve(args[1])); demand(bytes.length <= 2_000_000, 'GRAPH_SNAPSHOT_TOO_LARGE'); snapshot = JSON.parse(bytes); factsRef = args[3]
  } else throw new Error('INVALID_GRAPH_CLI')
  const prepared = await prepareGraphPublication(snapshot, factsRef)
  if (mode === '--apply') Object.assign(prepared.report, await writeGraphAtomically(resolve(root, graphRef), prepared.actualBytes, prepared.candidateBytes))
  return JSON.stringify(prepared.report, null, 2) + '\n'
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runGraphCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"PUBLIC_GRAPH_BATCH_REJECTED","game_affected":false,"database_writes":0,"site_publications":0}\n'); process.exitCode = 1 }
}
