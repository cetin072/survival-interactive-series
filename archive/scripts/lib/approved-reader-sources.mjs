/** Public cold-archive input, not a projection of arbitrary live/GM tables. */
import { createHash } from 'node:crypto'
import { splitRoleBlocks } from './reader-transform.mjs'
const hash = (v) => createHash('sha256').update(v).digest('hex')
const demand = (c) => { if (!c) throw new Error('INVALID_APPROVED_READER_SOURCE') }
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
function validTime(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return false
  const d = new Date(v.replace(' ', 'T') + ':00Z')
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 16).replace('T', ' ') === v
}

/** Unapproved seasons are not scanned as narratives. Approved malformed input fails closed. */
export async function approvedSeasonCatalog(manifest, seasonId, { read, listParts }) {
  if (manifest.visibility !== 'PUBLIC_ARCHIVE') return []
  demand(manifest.chronicle_id === 'C03-AFTERFALL' && manifest.worldline_id === 'AFTERFALL')
  demand(/^S\d{2,3}$/.test(seasonId) && manifest.season_id === seasonId)
  demand(manifest.archive_class === 'COLD_RAW' && Array.isArray(manifest.sessions))
  demand(new Set(manifest.sessions.map((s) => s.session_id)).size === manifest.sessions.length)
  const result = []
  for (const session of manifest.sessions) {
    demand(/^SESSION_\d{3}$/.test(session.session_id))
    if (session.visibility !== 'PUBLIC_ARCHIVE') continue
    // A fragment never becomes a complete story merely because a manifest claims it is public.
    if (session.capture_quality === 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING' && session.atomic_pairing_complete === false) continue
    demand(session.capture_quality === 'VERIFIED_CONTIGUOUS_TURN_PAIRS' && session.atomic_pairing_complete === true)
    const prefix = `archive/content/transcripts/C03-AFTERFALL/${seasonId}/${session.session_id}`
    demand(session.source_manifest === `${session.session_id}/SOURCE_MANIFEST.json`)
    const sourceManifestRef = `${prefix}/SOURCE_MANIFEST.json`
    const manifestBytes = await read(sourceManifestRef)
    const source = JSON.parse(manifestBytes.toString('utf8'))
    demand(source.chronicle_id === manifest.chronicle_id && source.worldline_id === manifest.worldline_id && source.season_id === seasonId && source.session_id === session.session_id)
    demand(source.visibility === 'PUBLIC_ARCHIVE' && source.public_safe_only === true && source.closed_at)
    demand(source.atomic_pairing_complete === true && source.capture_quality === session.capture_quality)
    const range = source.captured_message_range
    demand(source.coverage_basis === 'captured_message_range' && session.coverage_basis === 'captured_message_range')
    demand(validTime(range?.start) && validTime(range?.end) && range.start <= range.end)
    demand(range.start === session.captured_message_range?.start && range.end === session.captured_message_range?.end)
    const counts = source.counts
    demand(Number.isSafeInteger(counts?.user) && counts.user > 0 && counts.user === counts.gm && counts.total === 2 * counts.user)
    demand(session.user_messages === counts.user && session.gm_public_blocks === counts.gm && (counts.assistant_public_meta ?? 0) === 0)
    demand(Array.isArray(source.content_sha256) && source.content_sha256.length === counts.total)
    demand(source.content_sha256.every((h, i) => h.message_order === i && h.role === (i % 2 ? 'GM' : 'USER') && digest(h.sha256)))
    demand(source.message_order?.min === 0 && source.message_order?.max === counts.total - 1 && source.message_order.contiguous === true)
    demand(Array.isArray(source.parts) && source.parts.length > 0 && new Set(source.parts).size === source.parts.length)
    demand(source.parts.every((name) => /^PART_\d{3}\.md$/.test(name)))
    demand(JSON.stringify([...source.parts].sort()) === JSON.stringify((await listParts(prefix)).sort()))
    demand(source.parts_sha256 && JSON.stringify(Object.keys(source.parts_sha256).sort()) === JSON.stringify([...source.parts].sort()))
    const roles = []
    for (const part of [...source.parts].sort()) {
      const archivePath = `${prefix}/${part}`
      const bytes = await read(archivePath)
      demand(digest(source.parts_sha256[part]) && bytes.length > 0 && hash(bytes) === source.parts_sha256[part])
      roles.push(...splitRoleBlocks(bytes.toString('utf8')).map((block) => block.header))
      result.push({
        archivePath, canonicalRef: `worldlines/AFTERFALL/seasons/${seasonId}/raw_transcript/${session.session_id}/${part}`,
        group: seasonId, title: '공개 플레이 기록',
        autoPublication: { visibility: 'PUBLIC_ARCHIVE', sessionId: session.session_id, part, sourceManifestRef,
          sourceManifestSha256: hash(manifestBytes), rawSha256: hash(bytes), capturedRange: { ...range } },
      })
    }
    demand(roles.length === counts.total && roles.every((header, i) => header.role === (i % 2 ? 'GM' : 'USER') && Number(header.messageLabel) === i))
  }
  return result
}
