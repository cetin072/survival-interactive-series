/** Audit committed Step 6 POC metadata without treating it as a current queue or image asset. */
import { pocDigest } from './image-poc-exchange.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const hash = (value, prefix = '') => typeof value === 'string'
  && new RegExp(`^${prefix}[a-f0-9]{64}$`).test(value)
const observed = {
  source_revision: '5c1a0c59eae96a535c9e5f94d973308f52f8e7b6',
  request_id: 'request-755ce55bd782802eef325b233c280dd8b776bb0a66fb5bea6c5db3f4e4da10a0',
  point_id: 'point-e33f848046b1245234e579828dadc03939faf10d609c15bff315b8c421be1a72',
  generation_key: 'generation-a59f0391ed3fa13bcbcde8ea2123446837e6cc84ef5ab24f93d07f815170f7e8',
  receipt_ids: [
    'receipt-6819edac85746609ed20d0b2dc8de3e81ec3333c7328616ad20c7ce9b8ba6da1',
    'receipt-70c944f7403bfd3230e6fd2a43745ea669552693b0d93faff5e5098223d092a0',
  ],
}

export function auditHistoricalImageObservations(record) {
  demand(record?.version === 'step6-native-image-experiment-v1'
    && record.source_revision === observed.source_revision
    && record.intended_subject === 'char-jinwoo'
    && record.request_id === observed.request_id && record.point_id === observed.point_id
    && record.generation_key === observed.generation_key, 'INVALID_HISTORICAL_POC_IDENTITY')
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
  demand(observed.receipt_ids.every((id) => ids.has(id)), 'HISTORICAL_RECEIPT_SET_CHANGED')
  return {
    status: 'PRIOR_FOREGROUND_POC_QUARANTINED', source_revision: record.source_revision,
    observed_files: 2, quarantined: 2, accepted: 0, current_queue_attempts: 0,
    original_pixels_rechecked_here: false, unattended_proven: false, zero_added_cost_proven: false,
    storage_uploads: 0, site_publications: 0,
  }
}
