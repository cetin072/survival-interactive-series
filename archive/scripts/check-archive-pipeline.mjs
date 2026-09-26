/** Step 9: one read-only invocation over the existing public Reader -> graph -> visual preparers. */
import { execFileSync } from 'node:child_process'
import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { snapshotFromPublishedS02 } from './dry-run-publication.mjs'
import { prepareTextPublication } from './run-reader-publication.mjs'
import { prepareGraphPublication } from './run-graph-publication.mjs'
import { prepareVisualPublication } from './run-visual-publication.mjs'
import { assembleArchiveRun } from './lib/archive-orchestration.mjs'
import { planFromAttemptLedger } from './lib/attempt-ledger.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const allowed = new Set(['--snapshot', '--facts', '--appearances', '--map', '--ledger'])

export async function checkArchivePipeline(args) {
  if (args.length < 2 || args.at(-1) !== '--check') throw new Error('READ_ONLY_MODE_REQUIRED')
  let snapshot, factsRef = null, appearancesRef = null, mapRef = null, ledgerRef = null
  if (args[0] === '--demo-s02' && (args.length === 2 || args.length === 4 && args[1] === '--ledger')) {
    const sha = git('rev-parse', 'HEAD')
    const manifest = JSON.parse(git('show', `${sha}:archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json`))
    snapshot = snapshotFromPublishedS02(manifest, sha)
    ledgerRef = args.length === 4 ? args[2] : null
  } else {
    if ((args.length - 1) % 2 !== 0) throw new Error('INVALID_PIPELINE_FLAGS')
    const flags = new Map()
    for (let i = 0; i < args.length - 1; i += 2) {
      if (!allowed.has(args[i]) || flags.has(args[i])) throw new Error('INVALID_PIPELINE_FLAGS')
      flags.set(args[i], args[i + 1])
    }
    if (!flags.has('--snapshot') || !flags.has('--facts')) throw new Error('MISSING_PUBLIC_INPUTS')
    const bytes = await readFile(resolve(flags.get('--snapshot')))
    if (bytes.length > 2_000_000) throw new Error('SNAPSHOT_TOO_LARGE')
    snapshot = JSON.parse(bytes)
    factsRef = flags.get('--facts')
    appearancesRef = flags.get('--appearances') ?? null
    mapRef = flags.get('--map') ?? null
    ledgerRef = flags.get('--ledger') ?? null
  }
  const reader = await prepareTextPublication(snapshot)
  if (reader.report.reader_status !== 'NOOP') return assembleArchiveRun({ reader: reader.report })
  const graph = await prepareGraphPublication(snapshot, factsRef)
  const visual = await prepareVisualPublication(snapshot, { factsRef, appearancesRef, mapRef })
  let attemptPlan = null
  if (ledgerRef !== null) {
    const path = resolve(ledgerRef), stat = await lstat(path)
    if (!stat.isFile() || stat.size > 1_000_000) throw new Error('INVALID_ATTEMPT_LEDGER_FILE')
    attemptPlan = planFromAttemptLedger(visual.catalog, JSON.parse(await readFile(path, 'utf8')))
  }
  return assembleArchiveRun({ reader: reader.report, graph: graph.report, visual: visual.report, attemptPlan })
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await checkArchivePipeline(process.argv.slice(2)), null, 2) + '\n') }
  catch { process.stderr.write('{"ok":false,"error":"ARCHIVE_PIPELINE_CHECK_REJECTED","writes":0}\n'); process.exitCode = 1 }
}
