/** Built-in Codex foreground observation -> disabled Step 7 inbox entry. */
import { inspectPng, pocDigest } from './image-poc-exchange.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const same = (a, b) => a === b

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
