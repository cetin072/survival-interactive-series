import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// A C03 Reader chapter can cite its original season-3 RAW ref even though the
// original worldline branch no longer contains that file. The public Archive
// keeps a separately verified, byte-identical copy. Never resolve arbitrary
// missing refs or silently substitute unverified narrative text.
const s03Raw = /^worldlines\/AFTERFALL\/seasons\/S03\/raw_transcript\/(SESSION_[0-9]{3})\/(PART_[0-9]{3}\.md)$/
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function archivedS03RawLocation(ref) {
  const match = s03Raw.exec(ref ?? '')
  if (!match) return null
  const [, sessionId, partName] = match
  const dir = `archive/content/transcripts/C03-AFTERFALL/S03/${sessionId}`
  return {
    sessionId,
    partName,
    partRef: `${dir}/${partName}`,
    manifestRef: `${dir}/SOURCE_MANIFEST.json`,
  }
}

// Return null for non-S03 inputs; missing or unverified S03 records fail closed.
// Callers must still compare the returned bytes to their exact source pin.
export async function readVerifiedArchivedS03Raw({ base, ref, expectedSha256, read = readFile }) {
  const location = archivedS03RawLocation(ref)
  if (!location) return null
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? '')) {
    throw new Error('SEMANTIC_SOURCE_REFERENCE_INVALID')
  }

  let manifest
  try {
    manifest = JSON.parse((await read(join(base, location.manifestRef))).toString('utf8'))
  } catch {
    throw new Error('SEMANTIC_SOURCE_UNAVAILABLE')
  }
  const verified =
    manifest?.chronicle_id === 'C03-AFTERFALL'
    && manifest?.worldline_id === 'AFTERFALL'
    && manifest?.season_id === 'S03'
    && manifest?.session_id === location.sessionId
    && manifest?.source_type === 'SUPABASE_ROLLING_RAW_SEGMENT'
    && manifest?.visibility === 'PUBLIC_ARCHIVE'
    && manifest?.archive_class === 'COLD_RAW'
    && manifest?.public_safe_only === true
    && manifest?.capture_quality === 'VERIFIED_CONTIGUOUS_TURN_PAIRS'
    && manifest?.atomic_pairing_complete === true
    && ['PARTIAL', 'COMPLETE'].includes(manifest?.status)
    && Array.isArray(manifest?.parts)
    && manifest.parts.includes(location.partName)
    && manifest?.parts_sha256?.[location.partName] === expectedSha256
  if (!verified) throw new Error('SEMANTIC_ARCHIVE_PROVENANCE_INVALID')

  let bytes
  try {
    bytes = await read(join(base, location.partRef))
  } catch {
    throw new Error('SEMANTIC_SOURCE_UNAVAILABLE')
  }
  if (sha(bytes) !== expectedSha256) throw new Error('SEMANTIC_SOURCE_SHA_CHANGED')
  return bytes
}
