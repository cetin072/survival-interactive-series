/** Built-in Codex foreground observation -> disabled Step 7 inbox entry. */
import { inspectPng, pocDigest } from './image-poc-exchange.mjs'
import { validateVisualCatalog } from './visual-compiler.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const same = (a, b) => a === b
const exactKeys = (value, allowed) => demand(value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key)),
'FOREGROUND_UNEXPECTED_APPROVAL_FIELD')

/** A tool artifact name identifies an observed local file, not a provider result id. */
export function observeForegroundImage(point, record, bytes) {
  demand(point?.status === 'READY' && point.visibility === 'PUBLIC_ARCHIVE'
    && point.point_type === 'CHARACTER' && point.subject_id === record.subject_id
    && same(point.point_id, record.point_id) && same(point.generation_key, record.generation_key),
  'FOREGROUND_BRIEF_BINDING_MISMATCH')
  demand(record.version === 'codex-foreground-image-observation-v1'
    && record.chronicle_id === 'C03-AFTERFALL' && record.worldline_id === 'AFTERFALL'
    && record.visibility === 'PUBLIC_ARCHIVE' && record.tool === 'image_gen.imagegen'
    && record.surface === 'CODEX_BUILTIN_FOREGROUND'
    && /^exec-[a-f0-9-]+\.png$/.test(record.output_artifact_basename)
    && /^request-[a-f0-9]{64}$/.test(record.intended_request_id), 'FOREGROUND_SOURCE_INVALID')
  const file = inspectPng(bytes)
  demand(file.width === file.height && file.sha256 === record.file?.sha256
    && file.bytes === record.file.bytes && file.width === record.file.width
    && file.height === record.file.height && record.file.pixel_decode_check === 'PIL_VERIFY_AND_LOAD_PASS',
  'FOREGROUND_FILE_MISMATCH')
  demand(record.review?.reviewer === 'Codex' && record.review.single_subject === true
    && record.review.no_embedded_text_observed === true
    && record.review.public_brief_appearance_match_observed === true
    && record.review.status === 'LOCAL_SAMPLE_REVIEWED_NOT_ACCEPTED'
    && record.review.final_canon_approval === false
    && record.provider_prompt_equality_proven === false
    && record.unattended_generation_proven === false
    && record.zero_added_cost_invoice_audited === false
    && record.paid_api_calls === 0 && record.credit_purchase_actions === 0
    && record.storage_uploads === 0 && record.database_writes === 0
    && record.site_publications === 0, 'FOREGROUND_NOT_PENDING')
  const body = {
    version: 'codex-foreground-local-observation-v1', point_id: point.point_id,
    generation_key: point.generation_key, subject_id: point.subject_id,
    intended_request_id: record.intended_request_id,
    tool: record.tool, surface: record.surface, artifact_basename: record.output_artifact_basename,
    file_sha256: file.sha256, file_bytes: file.bytes,
    status: 'AWAITING_RESULT_ATTESTATION_AND_FINAL_ACCEPTANCE',
    provider_result_id: null, provider_prompt_equality_proven: false,
    accepted_candidate_id: null, storage_status: 'NOT_STORED', publication_status: 'NOT_PUBLISHED',
    execution_enabled: false, storage_writes: 0, database_writes: 0, site_publications: 0,
  }
  return { ...body, observation_id: `observation-${pocDigest(body)}` }
}

/** Pure contract for a separately recorded owner decision; it never publishes pixels. */
export function acceptForegroundLocalCandidate(point, record, bytes, approval) {
  const observation = observeForegroundImage(point, record, bytes)
  exactKeys(approval, ['version', 'role', 'decision', 'reviewer', 'reviewed_at', 'source_ref',
    'observation_id', 'point_id', 'generation_key', 'file_sha256'])
  demand(approval?.version === 'foreground-local-approval-v1'
    && approval.role === 'PROJECT_OWNER' && approval.decision === 'ACCEPT_LOCAL_CANDIDATE'
    && typeof approval.reviewer === 'string' && /^[A-Za-z0-9._-]{2,80}$/.test(approval.reviewer)
    && typeof approval.reviewed_at === 'string'
    && !Number.isNaN(Date.parse(approval.reviewed_at))
    && new Date(approval.reviewed_at).toISOString() === approval.reviewed_at
    && typeof approval.source_ref === 'string'
    && /^codex-thread:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}#msg_[a-f0-9]{40}$/.test(approval.source_ref),
  'FOREGROUND_EXPLICIT_OWNER_DECISION_REQUIRED')
  demand(approval.observation_id === observation.observation_id
    && approval.point_id === observation.point_id
    && approval.generation_key === observation.generation_key
    && approval.file_sha256 === observation.file_sha256,
  'FOREGROUND_APPROVAL_BINDING_MISMATCH')
  const file = inspectPng(bytes)
  const body = {
    version: 'accepted-codex-foreground-local-image-v1', chronicle_id: record.chronicle_id,
    worldline_id: record.worldline_id, visibility: record.visibility,
    point_id: point.point_id, generation_key: point.generation_key, subject_id: point.subject_id,
    intended_request_id: record.intended_request_id, observation_id: observation.observation_id,
    artifact_basename: record.output_artifact_basename, association: 'OBSERVER_ATTESTED_LOCAL_ARTIFACT',
    provider_result_id: null, provider_prompt_equality_proven: false,
    file, approval: structuredClone(approval), status: 'ACCEPTED_LOCAL_CANDIDATE',
    storage_status: 'NOT_STORED', publication_status: 'NOT_PUBLISHED',
    storage_object_path: null, public_url: null, storage_writes: 0, database_writes: 0,
  }
  return { ...body, candidate_id: `candidate-${pocDigest(body)}` }
}

/** Local planning only, after the caller has supplied an independently reviewed approval record. */
export function planForegroundLocalIngest(candidate, catalog, record, bytes) {
  validateVisualCatalog(catalog)
  const point = catalog.points.find((item) => item.point_id === candidate?.point_id)
  const expected = acceptForegroundLocalCandidate(point, record, bytes, candidate?.approval)
  demand(pocDigest(candidate) === pocDigest(expected), 'FOREGROUND_CANDIDATE_CHANGED')
  demand(candidate.status === 'ACCEPTED_LOCAL_CANDIDATE'
    && candidate.storage_status === 'NOT_STORED'
    && candidate.publication_status === 'NOT_PUBLISHED'
    && candidate.storage_object_path === null && candidate.public_url === null
    && candidate.storage_writes === 0 && candidate.database_writes === 0,
  'FOREGROUND_CANDIDATE_NOT_LOCAL_ONLY')
  const body = {
    version: 'codex-foreground-ingest-plan-v1', candidate_id: candidate.candidate_id,
    point_id: point.point_id, generation_key: point.generation_key, subject_id: point.subject_id,
    sha256: candidate.file.sha256, mime_type: candidate.file.mime_type,
    asset_type: point.asset_type, registry_asset_id: point.registry_asset_id,
    state: 'AWAITING_DURABLE_STORAGE_AND_REGISTRY_BINDING', execution_enabled: false,
    storage_writes: 0, database_writes: 0, site_publications: 0,
  }
  return { ...body, plan_id: `ingest-${pocDigest(body)}` }
}
