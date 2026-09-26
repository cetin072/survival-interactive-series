/** Audit committed Step 6 POC metadata without treating it as a current queue or image asset. */
import { pocDigest } from './image-poc-exchange.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const hash = (value, prefix = '') => typeof value === 'string'
  && new RegExp(`^${prefix}[a-f0-9]{64}$`).test(value)

export function auditHistoricalImageObservations(record) {
  demand(record?.version === 'step6-native-image-experiment-v1'
    && /^[a-f0-9]{40}$/.test(record.source_revision)
    && record.intended_subject === 'char-jinwoo'
    && hash(record.request_id, 'request-') && hash(record.point_id, 'point-')
    && hash(record.generation_key, 'generation-'), 'INVALID_HISTORICAL_POC_IDENTITY')
  demand(record.native_image_outputs_observed === 2 && record.accepted_portraits === 0
    && record.quarantined_outputs === 2 && Array.isArray(record.receipts) && record.receipts.length === 2
    && record.storage_uploads === 0 && record.database_writes === 0 && record.site_publications === 0
    && record.zero_added_cost_invoice_verification === 'NOT_AUDITED'
    && record.verdict === 'POC_REVIEWED_WITH_BLOCKER_NOT_OPERATIONALLY_READY', 'HISTORICAL_POC_SUCCESS_CLAIM_REJECTED')
  const ids = new Set(), tools = new Set(), images = new Set()
  for (const receipt of record.receipts) {
    const { receipt_id, independent_decode_check, ...body } = receipt
    demand(hash(receipt_id, 'receipt-') && receipt_id === `receipt-${pocDigest(body)}`
      && !ids.has(receipt_id), 'HISTORICAL_RECEIPT_DIGEST_MISMATCH')
    ids.add(receipt_id)
    demand(receipt.request_id === record.request_id && receipt.point_id === record.point_id
      && receipt.generation_key === record.generation_key
      && receipt.version === 'chatgpt-image-poc-receipt-v1'
      && receipt.tool === 'image_gen.text2im' && receipt.surface === 'CHATGPT_FOREGROUND'
      && typeof receipt.tool_result_id === 'string' && !tools.has(receipt.tool_result_id), 'HISTORICAL_RECEIPT_BINDING_MISMATCH')
    tools.add(receipt.tool_result_id)
    demand(receipt.status === 'QUARANTINED_NOT_AN_ASSET'
      && receipt.content_review === 'REJECTED_REQUEST_MISMATCH'
      && receipt.accepted_as_completed_asset === false && receipt.publication_allowed === false
      && receipt.unattended_generation_proven === false && receipt.cost_invoice_audited === false
      && receipt.database_writes === 0 && receipt.storage_uploads === 0 && receipt.site_publications === 0
      && independent_decode_check === 'PIL_VERIFY_AND_LOAD_PASS', 'HISTORICAL_RECEIPT_NOT_QUARANTINED')
    demand(hash(receipt.observed_file?.sha256) && !images.has(receipt.observed_file.sha256)
      && receipt.observed_file.format === 'PNG' && receipt.observed_file.mime_type === 'image/png'
      && receipt.observed_file.structure_check === 'SIGNATURE_CHUNKS_CRC_PASS', 'HISTORICAL_IMAGE_METADATA_INVALID')
    images.add(receipt.observed_file.sha256)
  }
  return {
    status: 'PRIOR_FOREGROUND_POC_QUARANTINED', source_revision: record.source_revision,
    observed_files: 2, quarantined: 2, accepted: 0, current_queue_attempts: 0,
    original_pixels_rechecked_here: false, unattended_proven: false, zero_added_cost_proven: false,
    storage_uploads: 0, site_publications: 0,
  }
}
