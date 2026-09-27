/** Build exact public files in memory after an external trusted approval decision.
 * This module cannot authenticate an owner decision and never writes or publishes.
 */
import { createHash } from 'node:crypto'
import { planPendingSegment } from './pending-segment-inventory.mjs'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'
import { inventoryFromPublishedSeason } from '../../exporter/published-season-inventory.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const demand = (ok, code) => { if (!ok) throw new Error(code) }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const commit = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)

/** Prior-file callbacks must read at `baseCommit`; authorizer must be a trusted caller. */
export async function preparePublicSegmentBundle(candidate, partBytes, {
  baseCommit, seasonManifest = null, readPriorFile, listPriorParts,
  approval, authorizePromotion,
} = {}) {
  demand(commit(baseCommit), 'PINNED_PUBLIC_BASE_REQUIRED')
  demand(exact(approval, ['version', 'decision', 'season_id', 'candidate_id',
    'candidate_sha256', 'segment_id', 'part_sha256', 'approval_provenance_ref'])
    && approval.version === 'public-segment-approval-v1'
    && approval.decision === 'APPROVED_PUBLIC_ARCHIVE'
    && approval.season_id === candidate?.season_id
    && approval.candidate_id === candidate?.candidate_id
    && approval.candidate_sha256 === hash(JSON.stringify(candidate))
    && approval.segment_id === candidate?.segment_id
    && approval.part_sha256 === candidate?.part_sha256
    && typeof approval.approval_provenance_ref === 'string'
    && /^[-A-Za-z0-9_./:#]{1,300}$/.test(approval.approval_provenance_ref),
  'PUBLIC_APPROVAL_RECEIPT_MISMATCH')
  demand(typeof authorizePromotion === 'function', 'TRUSTED_AUTHORIZER_REQUIRED')
  const empty = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL',
    season_id: candidate.season_id, archive_class: 'COLD_RAW',
    visibility: 'PUBLIC_ARCHIVE', sessions: [] }
  const previous = seasonManifest ?? empty
  demand(previous.season_id === candidate.season_id, 'PUBLIC_SEASON_MISMATCH')
  if (seasonManifest && previous.sessions.length) {
    demand(typeof readPriorFile === 'function' && typeof listPriorParts === 'function',
      'PINNED_SOURCE_READER_REQUIRED')
  }
  const inventory = await inventoryFromPublishedSeason(previous, async (ref) => {
    const path = `archive/content/transcripts/C03-AFTERFALL/${candidate.season_id}/${ref}`
    return JSON.parse((await readPriorFile(path, baseCommit)).toString('utf8'))
  })
  const plan = planPendingSegment(candidate, partBytes, inventory.segments,
    inventory.reserved_session_ids)
  demand(plan.status === 'PENDING_PUBLIC_APPROVAL', 'SEGMENT_ALREADY_PUBLISHED')
  const authority = await authorizePromotion(approval, {
    baseCommit, candidateId: candidate.candidate_id,
    candidateSha256: approval.candidate_sha256, partSha256: candidate.part_sha256,
  })
  demand(authority === true, 'PUBLIC_PROMOTION_NOT_AUTHORIZED')
  const source = { ...plan.source_manifest_candidate,
    visibility: 'PUBLIC_ARCHIVE', publication_allowed: true,
    approval_provenance_ref: approval.approval_provenance_ref }
  const entry = { session_id: plan.session_id, source_type: 'SUPABASE_ROLLING_RAW',
    visibility: 'PUBLIC_ARCHIVE', capture_quality: candidate.capture_quality,
    atomic_pairing_complete: true,
    source_manifest: `${plan.session_id}/SOURCE_MANIFEST.json`,
    coverage_basis: 'captured_message_range',
    captured_message_range: { ...candidate.captured_message_range },
    user_messages: candidate.counts.user, gm_public_blocks: candidate.counts.gm,
    source_session_uuid: candidate.source_session_uuid,
    source_session_status: candidate.source_session_status,
    source_message_order: { ...candidate.source_message_order },
    segment_id: candidate.segment_id, candidate_id: candidate.candidate_id,
    segment_status: 'SEALED', publication_allowed: true,
    approval_provenance_ref: approval.approval_provenance_ref }
  const season = { ...structuredClone(previous), sessions: [...previous.sessions, entry] }
  const prefix = `archive/content/transcripts/C03-AFTERFALL/${candidate.season_id}`
  const sessionPrefix = `${prefix}/${plan.session_id}`
  const sourceBytes = Buffer.from(JSON.stringify(source, null, 2) + '\n')
  const part = Buffer.from(partBytes)
  const selected = await approvedSeasonCatalog(season,
    candidate.season_id, {
      read: async (path) => {
        if (path === `${sessionPrefix}/SOURCE_MANIFEST.json`) return sourceBytes
        if (path === `${sessionPrefix}/PART_001.md`) return part
        return readPriorFile(path, baseCommit)
      },
      listParts: async (path) => {
        return path === sessionPrefix ? ['PART_001.md']
          : listPriorParts(path, baseCommit)
      },
    })
  demand(selected.some((item) => item.autoPublication.segmentId === candidate.segment_id),
    'PUBLIC_BUNDLE_READER_REJECTED')
  const seasonBytes = Buffer.from(JSON.stringify(season, null, 2) + '\n')
  return { baseCommit, files: new Map([
    [`${prefix}/MANIFEST.json`, seasonBytes],
    [`${sessionPrefix}/SOURCE_MANIFEST.json`, sourceBytes],
    [`${sessionPrefix}/PART_001.md`, part],
  ]), report: { status: 'APPROVED_FILES_PREPARED_IN_MEMORY',
    season_id: candidate.season_id, session_id: plan.session_id,
    candidate_id: candidate.candidate_id, segment_id: candidate.segment_id,
    part_sha256: candidate.part_sha256, season_manifest_sha256: hash(seasonBytes),
    source_manifest_sha256: hash(sourceBytes), files_written: 0,
    git_commits: 0, site_publications: 0 } }
}
