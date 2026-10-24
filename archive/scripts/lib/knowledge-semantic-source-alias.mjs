import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// A C03 Reader chapter can cite its original season-3/4 RAW ref even though the
// original worldline branch no longer contains that file. The public Archive
// keeps a separately verified, byte-identical copy. Never resolve arbitrary
// missing refs or silently substitute unverified narrative text.
const archiveRaw = /^worldlines\/AFTERFALL\/seasons\/(S03|S04)\/raw_transcript\/(SESSION_[0-9]{3})\/(PART_[0-9]{3}\.md)$/
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Approved archive import: PR #107, aee1d709412f3b6d3ea24e0d567f25b9f656c331.
// Only chapter 01's two parts are authorized here. Pin the original manifest
// bytes as well: its PARTIAL coverage/missing ranges must not be promoted.
const strongholdSession = 'SESSION_2031_02_TO_2031_03_ROOM_20260925'
const strongholdParts = Object.freeze({
  'PART_001.md': 'ea0989372e72622554440965fd3f130ac5c0257b41fc9260c22a1e4c12417f10',
  'PART_002.md': 'fcab069d26a3e991f53f2d3a329f5f1fa627be8bc310ede5d5056c5e9b19124b',
})
const strongholdManifestSha = '2a1bdf2fe1585bcf3749f6f342d5aef655294236ff83ebaf82f17f8cc530b077'

export async function readVerifiedStrongholdRaw({ base, ref, expectedSha256, read = readFile }) {
  const part = Object.keys(strongholdParts).find((name) =>
    ref === `worldlines/STRONGHOLD/raw_transcript/${strongholdSession}/${name}`)
  if (!part) return null
  if (expectedSha256 !== strongholdParts[part]) throw new Error('SEMANTIC_ARCHIVE_PROVENANCE_INVALID')
  const dir = join(base, 'archive/content/transcripts/C02-STRONGHOLD/SESSIONS', strongholdSession)
  let manifest, bytes
  try {
    manifest = await read(join(dir, 'MANIFEST.json'))
    bytes = await read(join(dir, part))
  } catch {
    throw new Error('SEMANTIC_SOURCE_UNAVAILABLE')
  }
  if (sha(manifest) !== strongholdManifestSha) throw new Error('SEMANTIC_ARCHIVE_PROVENANCE_INVALID')
  if (sha(bytes) !== expectedSha256) throw new Error('SEMANTIC_SOURCE_SHA_CHANGED')
  return bytes
}

export function archivedRawLocation(ref) {
  const match = archiveRaw.exec(ref ?? '')
  if (!match) return null
  const [, seasonId, sessionId, partName] = match
  const dir = `archive/content/transcripts/C03-AFTERFALL/${seasonId}/${sessionId}`
  return {
    seasonId,
    sessionId,
    partName,
    partRef: `${dir}/${partName}`,
    manifestRef: `${dir}/SOURCE_MANIFEST.json`,
  }
}

// Return null for non-allowlisted inputs; missing or unverified archive records fail closed.
// Callers must still compare the returned bytes to their exact source pin.
export async function readVerifiedArchivedRaw({ base, ref, expectedSha256, read = readFile }) {
  const location = archivedRawLocation(ref)
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
    && manifest?.season_id === location.seasonId
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

export const archivedS03RawLocation = archivedRawLocation
export const readVerifiedArchivedS03Raw = readVerifiedArchivedRaw
