/** Derive replay identities from already-public season/source manifests.
 * This is an inventory read, not an approval of a new private segment.
 */
const demand = (ok, code) => { if (!ok) throw new Error(code) }
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = (value) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
function order(value) {
  return value && Number.isSafeInteger(value.start) && value.start >= 0
    && value.start % 2 === 0 && Number.isSafeInteger(value.end)
    && value.end >= value.start && value.end % 2 === 1
}

/** `readSource(ref)` must read from the same pinned Git commit as `manifest`. */
export async function inventoryFromPublishedSeason(manifest, readSource) {
  demand(manifest && manifest.chronicle_id === 'C03-AFTERFALL'
    && manifest.worldline_id === 'AFTERFALL'
    && /^S\d{2,3}$/.test(manifest.season_id)
    && manifest.archive_class === 'COLD_RAW'
    && manifest.visibility === 'PUBLIC_ARCHIVE'
    && Array.isArray(manifest.sessions) && manifest.sessions.length <= 999
    && typeof readSource === 'function', 'INVALID_PUBLISHED_SEASON')
  const reserved = [], segments = [], seen = new Set()
  for (const entry of manifest.sessions) {
    demand(entry && /^SESSION_\d{3}$/.test(entry.session_id)
      && !seen.has(entry.session_id), 'INVALID_PUBLISHED_SESSION')
    seen.add(entry.session_id); reserved.push(entry.session_id)
    if (!Object.hasOwn(entry, 'segment_id')) continue
    demand(entry.visibility === 'PUBLIC_ARCHIVE'
      && entry.source_manifest === `${entry.session_id}/SOURCE_MANIFEST.json`
      && /^segment-[a-f0-9]{64}$/.test(entry.segment_id)
      && /^candidate-[a-f0-9]{64}$/.test(entry.candidate_id)
      && uuid(entry.source_session_uuid) && order(entry.source_message_order),
    'INVALID_PUBLISHED_SEGMENT')
    const source = await readSource(entry.source_manifest)
    demand(source && source.chronicle_id === manifest.chronicle_id
      && source.worldline_id === manifest.worldline_id
      && source.season_id === manifest.season_id
      && source.session_id === entry.session_id
      && source.source_session_uuid === entry.source_session_uuid
      && source.segment_id === entry.segment_id
      && source.candidate_id === entry.candidate_id
      && source.source_message_order?.start === entry.source_message_order.start
      && source.source_message_order?.end === entry.source_message_order.end
      && source.segment_status === 'SEALED'
      && source.visibility === 'PUBLIC_ARCHIVE'
      && source.publication_allowed === true
      && typeof source.approval_provenance_ref === 'string'
      && source.approval_provenance_ref.length > 0
      && Array.isArray(source.parts) && source.parts.length === 1
      && source.parts[0] === 'PART_001.md'
      && digest(source.parts_sha256?.['PART_001.md']),
    'PUBLISHED_SEGMENT_SOURCE_MISMATCH')
    segments.push({ chronicle_id: manifest.chronicle_id,
      worldline_id: manifest.worldline_id, season_id: manifest.season_id,
      session_id: entry.session_id, source_session_uuid: entry.source_session_uuid,
      source_message_order: { ...entry.source_message_order },
      segment_id: entry.segment_id, candidate_id: entry.candidate_id,
      part_sha256: source.parts_sha256['PART_001.md'] })
  }
  return { version: 'pending-segment-inventory-v1',
    chronicle_id: manifest.chronicle_id, worldline_id: manifest.worldline_id,
    season_id: manifest.season_id, segments, reserved_session_ids: reserved }
}
