import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..', '..')
const archiveRoot = resolve(root, 'archive', 'content', 'transcripts', 'C03-AFTERFALL', 'S02')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const expectedSessions = {
  SESSION_003: { quality: 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING', atomic: false, range: ['2027-01-16 09:28', '2027-01-16 09:28'] },
  SESSION_004: { quality: 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING', atomic: false, range: ['2027-01-16 09:28', '2027-01-16 09:28'] },
  SESSION_005: { quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic: true, range: ['2027-01-16 10:18', '2027-01-21 18:10'] },
  SESSION_006: { quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic: true, range: ['2027-01-21 18:10', '2027-02-05 22:10'] },
  SESSION_007: { quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic: true, range: ['2027-02-06 21:15', '2027-02-07 13:40'] },
  SESSION_008: { quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic: true, range: ['2027-02-07 13:40', '2027-02-07 13:40'] },
  SESSION_009: { quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic: true, range: ['2027-02-07 13:40', '2027-03-23 17:50'] },
}

function assert(condition, message) { if (!condition) throw new Error(message) }
function rangeMatches(range, expected) { return range?.start === expected[0] && range?.end === expected[1] }

async function sourceManifest(sessionId) {
  return JSON.parse(await readFile(resolve(archiveRoot, sessionId, 'SOURCE_MANIFEST.json'), 'utf8'))
}

async function validateRawInventory(sessionId, source) {
  const files = (await readdir(resolve(archiveRoot, sessionId))).filter((name) => /^PART_\d{3}\.md$/.test(name)).sort()
  assert(JSON.stringify(files) === JSON.stringify(source.parts), `${sessionId} PART inventory does not match SOURCE_MANIFEST`)
}

function sourceRaw(ref, path) {
  return execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'buffer' })
}

async function validateSourceRawSha(sourceRef, sessionId, source) {
  for (const part of source.parts) {
    const archivePath = `archive/content/transcripts/C03-AFTERFALL/S02/${sessionId}/${part}`
    const sourcePath = `worldlines/AFTERFALL/seasons/S02/raw_transcript/${sessionId}/${part}`
    execFileSync('git', ['diff', '--quiet', '--', archivePath], { cwd: root })
    const archiveSha = sha256(sourceRaw('HEAD', archivePath))
    const sourceSha = sha256(sourceRaw(sourceRef, sourcePath))
    assert(archiveSha === sourceSha, `${sessionId}/${part} RAW SHA-256 differs from ${sourceRef}`)
  }
}

export async function validateAfterfallS02Publication({ sourceRef } = {}) {
  const manifest = JSON.parse(await readFile(resolve(archiveRoot, 'MANIFEST.json'), 'utf8'))
  const sessionIds = manifest.sessions.map((session) => session.session_id)
  assert(new Set(sessionIds).size === sessionIds.length, 'C03 S02 manifest contains duplicate session ids')
  for (const [sessionId, expected] of Object.entries(expectedSessions)) {
    const session = manifest.sessions.find((candidate) => candidate.session_id === sessionId)
    assert(session, `C03 S02 manifest is missing ${sessionId}`)
    assert(session.capture_quality === expected.quality, `${sessionId} pairing verdict is stale`)
    assert(session.atomic_pairing_complete === expected.atomic, `${sessionId} atomic pairing flag is stale`)
    assert(rangeMatches(session.captured_message_range, expected.range), `${sessionId} captured_message_range is invalid`)
    assert(session.coverage_basis === 'captured_message_range', `${sessionId} coverage_basis must name captured_message_range`)
    assert(typeof session.session_range?.start === 'string', `${sessionId} session_range is not parseable`)
    assert(typeof session.session_range?.end === 'string' || session.session_range?.end === null, `${sessionId} session_range end is not parseable`)

    const source = await sourceManifest(sessionId)
    assert(source.capture_quality === expected.quality, `${sessionId} copied SOURCE_MANIFEST pairing verdict is stale`)
    assert(source.atomic_pairing_complete === expected.atomic, `${sessionId} copied SOURCE_MANIFEST pairing flag is stale`)
    assert(rangeMatches(source.captured_message_range, expected.range), `${sessionId} copied SOURCE_MANIFEST captured range is invalid`)
    assert(source.coverage_basis === 'captured_message_range', `${sessionId} copied SOURCE_MANIFEST coverage basis is stale`)
    if (source.atomic_pairing_complete) assert(source.counts.user === source.counts.gm, `${sessionId} atomic pairing requires balanced USER and GM counts`)
    await validateRawInventory(sessionId, source)
    if (sourceRef) await validateSourceRawSha(sourceRef, sessionId, source)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceRef = process.env.ARCHIVE_AFTERFALL_SOURCE_REF
  await validateAfterfallS02Publication({ sourceRef })
  console.log(`AFTERFALL S02 publication validation passed${sourceRef ? ` against ${sourceRef}` : ''}.`)
}
