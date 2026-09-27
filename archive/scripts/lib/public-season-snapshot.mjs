/** Derive a Step 2 batch snapshot from committed public season files.
 * The checkpoint is caller-selected but must exist in the same pinned revision.
 */
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'
import { createBatch, fingerprint } from './publication-plan.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)

export async function snapshotFromPublicSeason(manifest, sourceRevision, checkpointRef,
  { read, listParts }) {
  demand(sha(sourceRevision) && manifest?.chronicle_id === 'C03-AFTERFALL'
    && manifest.worldline_id === 'AFTERFALL'
    && /^S\d{2,3}$/.test(manifest.season_id)
    && manifest.visibility === 'PUBLIC_ARCHIVE'
    && manifest.archive_class === 'COLD_RAW'
    && Array.isArray(manifest.sessions) && manifest.sessions.length > 0
    && typeof read === 'function' && typeof listParts === 'function',
  'INVALID_PUBLIC_SEASON_BATCH')
  demand(typeof checkpointRef === 'string'
    && checkpointRef.startsWith(`worldlines/AFTERFALL/seasons/${manifest.season_id}/`)
    && /^[A-Za-z0-9_/-]+\.md$/.test(checkpointRef)
    && !checkpointRef.split('/').includes('..'), 'INVALID_PUBLIC_CHECKPOINT_REF')
  const checkpointBytes = await read(checkpointRef)
  demand(Buffer.isBuffer(checkpointBytes) && checkpointBytes.length > 0
    && checkpointBytes.length <= 1_000_000, 'MISSING_PUBLIC_CHECKPOINT')
  const catalog = await approvedSeasonCatalog(manifest, manifest.season_id, { read, listParts })
  const sources = []
  let lastSession = 0, lastSave = 0, lastTime = ''
  for (const entry of manifest.sessions) {
    demand(entry && /^SESSION_\d{3}$/.test(entry.session_id)
      && Number(entry.session_id.slice(8)) > lastSession, 'UNORDERED_PUBLIC_SESSION')
    lastSession = Number(entry.session_id.slice(8))
    if (entry.visibility !== 'PUBLIC_ARCHIVE') continue
    demand(entry.source_manifest === `${entry.session_id}/SOURCE_MANIFEST.json`,
      'INVALID_PUBLIC_SOURCE_REF')
    const sourceRef = `archive/content/transcripts/C03-AFTERFALL/${manifest.season_id}/${entry.source_manifest}`
    if (entry.atomic_pairing_complete === true) {
      const source = JSON.parse((await read(sourceRef)).toString('utf8'))
      demand(Number.isSafeInteger(source.source_save_version)
        && source.source_save_version >= lastSave
        && source.captured_message_range?.end >= lastTime
        && catalog.some((part) => part.autoPublication?.sessionId === entry.session_id),
      'PUBLIC_SOURCE_ANCHOR_MISMATCH')
      lastSave = source.source_save_version
      lastTime = source.captured_message_range.end
    }
    sources.push({ session_id: entry.session_id, source_ref: sourceRef,
      source_digest: fingerprint(entry), visibility: 'PUBLIC_ARCHIVE',
      capture_quality: entry.capture_quality,
      atomic_pairing_complete: entry.atomic_pairing_complete,
      captured_message_range: entry.captured_message_range,
      user_messages: entry.user_messages,
      gm_public_blocks: entry.gm_public_blocks })
  }
  demand(lastSave > 0 && lastTime && sources.length > 0, 'NO_APPROVED_PUBLIC_SOURCE')
  const snapshot = { version: 'publication-snapshot-v1',
    chronicle_id: manifest.chronicle_id, worldline_id: manifest.worldline_id,
    season_id: manifest.season_id, visibility: 'PUBLIC_ARCHIVE',
    source_revision: sourceRevision, source_save_version: lastSave,
    source_game_time: lastTime, source_checkpoint: checkpointRef,
    coverage_status: 'PARTIAL', sources }
  return createBatch(snapshot).snapshot
}
