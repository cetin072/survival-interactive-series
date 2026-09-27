/** Compile Reader, Graph and Visual from one committed public snapshot.
 * This is a read-only preparation step. A separate atomic publisher must commit
 * the three candidates together before a site deploy can use them.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { prepareTextPublication } from './run-reader-publication.mjs'
import { prepareGraphPublication } from './run-graph-publication.mjs'
import { prepareVisualPublication } from './run-visual-publication.mjs'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const demand = (ok, code) => { if (!ok) throw new Error(code) }
const root = resolve(import.meta.dirname, '../..')

export async function prepareUnifiedPublication(snapshot, options = {}) {
  const reader = await prepareTextPublication(snapshot)
  const graph = await prepareGraphPublication(snapshot, options.factsRef ?? null,
    { readerCandidateBytes: reader.candidateBytes })
  const visual = await prepareVisualPublication(snapshot, {
    ...options, readerCandidateBytes: reader.candidateBytes,
  })
  const readerHash = hash(reader.candidateBytes)
  demand(reader.report.source_revision === graph.report.source_revision
    && graph.report.source_revision === visual.report.source_revision
    && reader.report.batch_id === visual.report.batch_id
    && graph.report.reader_sha256 === readerHash
    && visual.report.reader_sha256 === readerHash
    && visual.report.graph_sha256 === graph.report.graph_sha256
    && visual.catalog.graph_sha256 === graph.graph.content_sha256,
  'UNIFIED_PUBLICATION_SNAPSHOT_MISMATCH')
  return { reader, graph, visual, report: {
    mode: 'UNIFIED_PUBLICATION_PREPARATION', batch_id: reader.report.batch_id,
    source_revision: reader.report.source_revision,
    reader_sha256: readerHash, graph_sha256: hash(graph.candidateBytes),
    visual_sha256: hash(visual.candidateBytes),
    reader_status: reader.report.reader_status,
    graph_status: graph.report.status, visual_status: visual.report.status,
    files_written: 0, database_writes: 0, provider_calls: 0,
    site_publications: 0,
  } }
}

export async function runUnifiedCli(args) {
  demand(args.at(-1) === '--check', 'UNIFIED_PUBLICATION_READ_ONLY_MODE_REQUIRED')
  let snapshot, options = {}
  if (args.length === 2 && args[0] === '--demo-s02') {
    const gitBinary = process.env.ARCHIVE_GIT_BINARY || 'git'
    const head = execFileSync(gitBinary, ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
    const manifest = JSON.parse(execFileSync(gitBinary,
      ['show', `${head}:archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json`],
      { cwd: root }))
    snapshot = snapshotFromPublishedS02(manifest, head)
  } else {
    demand(args.length >= 3 && args.length <= 9 && args.length % 2 === 1,
      'INVALID_UNIFIED_PUBLICATION_FLAGS')
    const flags = new Map()
    for (let i = 0; i < args.length - 1; i += 2) {
      demand(['--snapshot', '--facts', '--appearances', '--map'].includes(args[i])
        && !flags.has(args[i]), 'INVALID_UNIFIED_PUBLICATION_FLAGS')
      flags.set(args[i], args[i + 1])
    }
    demand(flags.has('--snapshot'), 'UNIFIED_PUBLICATION_SNAPSHOT_REQUIRED')
    const bytes = await readFile(resolve(flags.get('--snapshot')))
    demand(bytes.length <= 2_000_000, 'UNIFIED_PUBLICATION_SNAPSHOT_TOO_LARGE')
    snapshot = JSON.parse(bytes)
    options = { factsRef: flags.get('--facts') ?? null,
      appearancesRef: flags.get('--appearances') ?? null,
      mapRef: flags.get('--map') ?? null }
  }
  return (await prepareUnifiedPublication(snapshot, options)).report
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await runUnifiedCli(process.argv.slice(2))) + '\n') }
  catch { process.stderr.write('{"ok":false,"error":"UNIFIED_PUBLICATION_REJECTED","files_written":0,"database_writes":0,"site_publications":0}\n'); process.exitCode = 1 }
}
