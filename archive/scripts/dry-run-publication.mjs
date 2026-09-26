/** Offline CLI: read a public manifest / normalized snapshot, print a plan, write nothing. */
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fingerprint, planPublication, validateSnapshot } from './lib/publication-plan.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const s02Path = 'archive/content/transcripts/C03-AFTERFALL/S02/MANIFEST.json'
const demand = (condition) => { if (!condition) throw new Error('INVALID_PUBLISHED_S02_METADATA') }
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
function allowedKeys(value, allowed) { demand(object(value) && Object.keys(value).every((key) => allowed.includes(key))) }

/** This adapter is ONLY for the already-published S02 registry, not public_safe live DB rows. */
export function snapshotFromPublishedS02(manifest, sourceRevision) {
  allowedKeys(manifest, ['chronicle_id', 'worldline_id', 'protagonist', 'season_id', 'archive_class', 'overall_status', 'sessions', 'overlap_decision', 'source_policy', 'complete', 'rolling_capture_extension'])
  demand(manifest.chronicle_id === 'C03-AFTERFALL' && manifest.worldline_id === 'AFTERFALL' && manifest.season_id === 'S02')
  demand(manifest.archive_class === 'COLD_RAW' && manifest.overall_status === 'PARTIAL' && manifest.complete === false)
  demand(Array.isArray(manifest.sessions))
  const anchor = manifest.rolling_capture_extension
  allowedKeys(anchor, ['source', 'sessions_added', 'policy', 'final_captured_game_time', 'final_captured_save_version'])
  demand(Number.isSafeInteger(anchor.sessions_added) && anchor.sessions_added >= 0)
  const sources = manifest.sessions.map((entry) => {
    allowedKeys(entry, ['session_id', 'source_type', 'source_session_uuid', 'source_pr', 'source_branch', 'source_commit', 'status', 'capture_quality', 'verified_range', 'session_range', 'captured_message_range', 'coverage_basis', 'user_messages', 'gm_public_blocks', 'assistant_public_meta', 'atomic_pairing_complete', 'missing', 'source_index', 'source_manifest'])
    const rolling = entry.source_type === 'SUPABASE_ROLLING_RAW'
    demand(rolling || (entry.source_type === undefined && ['SESSION_001', 'SESSION_002'].includes(entry.session_id)))
    demand(entry.status === 'PARTIAL' && (entry.assistant_public_meta ?? 0) === 0)
    if (rolling) demand(entry.coverage_basis === 'captured_message_range')
    const ref = entry.source_manifest ?? entry.source_index
    demand(ref === `${entry.session_id}/SOURCE_MANIFEST.json` || ref === `${entry.session_id}/SOURCE_INDEX.md`)
    return {
      session_id: entry.session_id,
      source_ref: `archive/content/transcripts/C03-AFTERFALL/S02/${ref}`,
      source_digest: fingerprint(entry),
      visibility: 'PUBLIC_ARCHIVE',
      capture_quality: rolling ? entry.capture_quality : 'LEGACY_SOURCE_REVIEW',
      atomic_pairing_complete: rolling ? entry.atomic_pairing_complete : null,
      captured_message_range: rolling ? entry.captured_message_range : null,
      user_messages: entry.user_messages,
      gm_public_blocks: entry.gm_public_blocks,
    }
  })
  demand(sources.filter((s) => s.capture_quality !== 'LEGACY_SOURCE_REVIEW').length === anchor.sessions_added)
  return validateSnapshot({
    version: 'publication-snapshot-v1', chronicle_id: manifest.chronicle_id,
    worldline_id: manifest.worldline_id, season_id: manifest.season_id,
    visibility: 'PUBLIC_ARCHIVE', source_revision: sourceRevision,
    source_save_version: anchor.final_captured_save_version,
    source_game_time: anchor.final_captured_game_time,
    source_checkpoint: 'worldlines/AFTERFALL/seasons/S02/END_CHECKPOINT_2027-03-23.md',
    coverage_status: 'PARTIAL', sources,
  })
}

async function jsonFile(path) {
  demand((await stat(path)).size <= 2_000_000)
  return JSON.parse(await readFile(path, 'utf8'))
}
export async function runCli(args) {
  if (args.length === 1 && args[0] === '--help') {
    return 'Usage: node archive/scripts/dry-run-publication.mjs --demo-s02 --source-revision <40-hex-checkout-SHA>\n   or: node archive/scripts/dry-run-publication.mjs --snapshot <normalized-snapshot.json>\nOffline plan only. No generation, storage, publishing or scheduler execution.'
  }
  let snapshot
  if (args.length === 3 && args[0] === '--demo-s02' && args[1] === '--source-revision') {
    snapshot = snapshotFromPublishedS02(await jsonFile(resolve(root, s02Path)), args[2])
  } else if (args.length === 2 && args[0] === '--snapshot') {
    snapshot = await jsonFile(resolve(args[1]))
  } else {
    throw new Error('INVALID_CLI_ARGUMENTS')
  }
  return JSON.stringify(planPublication(snapshot), null, 2) + '\n'
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(await runCli(process.argv.slice(2))) }
  catch { process.stderr.write('{"ok":false,"error":"PUBLICATION_INPUT_REJECTED","external_calls":0,"records_written":0}\n'); process.exitCode = 1 }
}
