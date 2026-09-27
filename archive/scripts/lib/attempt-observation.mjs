/** Catalog-bound local attempt evidence. It records a caller observation, not provider or owner authority. */
import { visualDigest } from './visual-compiler.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const root = 'archive/content/visuals/C03-AFTERFALL/attempts'
const reasons = new Set(['PROVIDER_UNAVAILABLE', 'EXECUTION_ERROR', 'NO_FILE_RETURNED'])
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

export function attemptObservationPath(record) {
  return `${root}/${visualDigest(record)}.json`
}

export function validateAttemptObservation(event, record, path) {
  demand(record && typeof record === 'object' && !Array.isArray(record)
    && record.version === 'archive-image-attempt-observation-v1'
    && record.authority === 'CALLER_REPORTED_NOT_INDEPENDENTLY_VERIFIED'
    && record.attempt_id === event.attempt_id
    && record.request_id === event.request_id
    && record.point_id === event.point_id
    && record.generation_key === event.generation_key
    && record.state === event.state
    && path === attemptObservationPath(record), 'ATTEMPT_OBSERVATION_BINDING_INVALID')
  if (event.state === 'FAILED') {
    demand(Object.keys(record).sort().join('|') ===
      'attempt_id|authority|failure_reason|generation_key|point_id|request_id|state|version'
      && reasons.has(record.failure_reason), 'ATTEMPT_FAILURE_OBSERVATION_INVALID')
  } else if (event.state === 'QUARANTINED') {
    const receipt = record.receipt
    demand(Object.keys(record).sort().join('|') ===
      'attempt_id|authority|generation_key|point_id|receipt|request_id|state|version'
      && receipt?.request_id === event.request_id
      && receipt.point_id === event.point_id
      && receipt.generation_key === event.generation_key
      && receipt.status === 'QUARANTINED_NOT_AN_ASSET'
      && receipt.accepted_as_completed_asset === false
      && receipt.publication_allowed === false
      && sha(receipt.observed_file?.sha256)
      && receipt.observed_file?.structure_check === 'SIGNATURE_CHUNKS_CRC_PASS',
    'ATTEMPT_QUARANTINE_OBSERVATION_INVALID')
  } else demand(false, 'ATTEMPT_OBSERVATION_STATE_INVALID')
}
