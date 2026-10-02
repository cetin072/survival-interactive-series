import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { byteHash, graphBytes, reconcilePublicGraph } from './lib/publication-graph.mjs'
import { writeGraphAtomically } from './lib/atomic-graph.mjs'
import { discoverWikiSource, prepareWikiFacts } from './lib/wiki-semantic-jobs.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const bookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const demand = (condition, code) => { if (!condition) throw new Error(code) }
async function regularFile(ref) {
  const path = resolve(root, ref)
  demand((await lstat(path)).isFile(), 'WIKI_OUTPUT_NOT_REGULAR_FILE')
  return { path, bytes: await readFile(path) }
}
function publicBook(bytes) {
  const book = JSON.parse(bytes.toString('utf8'))
  demand(book.chronicleId === 'C03-AFTERFALL' && book.worldlineId === 'AFTERFALL' && Array.isArray(book.chapters), 'WIKI_BOOK_SCOPE_INVALID')
  return book
}

export async function runWikiAutomation(mode, { discover = discoverWikiSource } = {}) {
  demand(mode === '--check' || mode === '--apply', 'EXPLICIT_WIKI_MODE_REQUIRED')
  const source = await discover(root)
  const graphFile = await regularFile(graphRef)
  const previous = JSON.parse(graphFile.bytes.toString('utf8'))
  const prepared = prepareWikiFacts(source, previous)
  const factAbs = resolve(root, prepared.path)
  let factBytes = prepared.bytes
  let factAlreadyPresent = false
  try {
    demand((await lstat(factAbs)).isFile(), 'WIKI_FACT_PATH_NOT_REGULAR_FILE')
    factBytes = await readFile(factAbs)
    demand(factBytes.equals(prepared.bytes), 'WIKI_FACT_IDENTITY_COLLISION')
    factAlreadyPresent = true
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const bookFile = await regularFile(bookRef)
  const batch = {
    batch_id: `batch-${source.sourceDigest}`,
    snapshot: { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE', season_id: 'S03', source_save_version: source.anchor.save_version, source_game_time: source.anchor.game_time },
  }
  const compiled = reconcilePublicGraph({
    batch, previous, facts: prepared.facts,
    source: { source_ref: prepared.path, source_sha256: byteHash(factBytes) },
    book: publicBook(bookFile.bytes),
    bookSource: { source_ref: bookRef, source_sha256: byteHash(bookFile.bytes) },
  })
  const candidateBytes = Buffer.from(graphBytes(compiled.graph))
  const unchanged = graphFile.bytes.equals(candidateBytes)
  const report = {
    status: unchanged ? 'NOOP' : mode === '--check' ? 'READY' : 'UPDATED',
    source_ref: source.sourceManifestRef,
    source_session: source.sourceSession.session_id,
    source_sha256: source.sourceDigest,
    fact_ref: prepared.path,
    fact_file: factAlreadyPresent ? 'EXISTS' : mode === '--check' ? 'WOULD_CREATE' : 'CREATED',
    anchor: source.anchor,
    nodes_added: compiled.report.nodes_added,
    nodes_updated: compiled.report.nodes_updated,
    relations_added: compiled.report.relations_added,
    relations_updated: compiled.report.relations_updated,
    graph_sha256: compiled.graph.content_sha256,
    first_run: !unchanged,
    second_run: unchanged,
    raw_changed: false,
    book_changed: false,
    database_writes: 0,
    external_calls: 0,
    site_publications: 0,
  }
  if (mode === '--apply') {
    if (!factAlreadyPresent) await writeGraphAtomically(factAbs, null, factBytes)
    if (!unchanged) await writeGraphAtomically(graphFile.path, graphFile.bytes, candidateBytes)
  }
  return report
}

export async function runCli(args, { discover = discoverWikiSource } = {}) {
  if (args.length === 1 && args[0] === '--help') return 'Usage: node archive/scripts/run-wiki-automation.mjs (--check|--apply)\nReads the latest verified S03 PUBLIC_ARCHIVE session; extracts GM blocks only.\n--check writes nothing; --apply writes one deterministic AWiki fact and reconciles GRAPH.json.\n'
  demand(args.length === 1, 'INVALID_WIKI_CLI_ARGUMENTS')
  try { return JSON.stringify(await runWikiAutomation(args[0], { discover }), null, 2) + '\n' }
  catch (error) {
    if (/WIKI_(?:V1_LATEST_SOURCE_UNSUPPORTED|V1_ANCHOR_REVIEW_REQUIRED|NAMED_ENTITY_EVIDENCE_MISSING|AGREEMENT_EVIDENCE_MISSING|RAIN_PLAN_EVIDENCE_MISSING|ENTITY_COLLISION_OR_NO_GM_EVIDENCE|NODE_LABEL_COLLISION|NODE_IDENTITY_COLLISION|NEW_CHARACTER_EVIDENCE_INVALID|RELATION_KIND_REVIEW_REQUIRED)/.test(error.message)) {
      return JSON.stringify({ status: 'HUMAN_REVIEW', source_session: error.source_session ?? null, reason: error.message, graph_changed: false, raw_changed: false, book_changed: false }) + '\n'
    }
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(await runCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"WIKI_AUTOMATION_REJECTED","graph_changed":false,"raw_changed":false,"book_changed":false}\n'); process.exitCode = 1 }
}
