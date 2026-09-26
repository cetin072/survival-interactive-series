/** Local, read-only accounting for image attempts. Never authorizes a provider call. */
import { validateVisualCatalog } from './visual-compiler.mjs'

const demand = (value, code) => { if (!value) throw new Error(code) }
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
const exact = (value, names, code) => demand(object(value)
  && Object.keys(value).sort().join('|') === [...names].sort().join('|'), code)
const hash = (value, prefix) => typeof value === 'string'
  && new RegExp(`^${prefix}[a-f0-9]{64}$`).test(value)

/** A catalog-bound ledger can only block duplicate planning, not prove an image exists. */
export function planFromAttemptLedger(catalog, ledger) {
  validateVisualCatalog(catalog)
  exact(ledger, ['version', 'chronicle_id', 'worldline_id', 'visibility', 'catalog_sha256', 'attempts'], 'INVALID_ATTEMPT_LEDGER')
  demand(ledger.version === 'archive-image-attempt-ledger-v1'
    && ledger.chronicle_id === catalog.chronicle_id && ledger.worldline_id === catalog.worldline_id
    && ledger.visibility === 'PUBLIC_ARCHIVE' && ledger.catalog_sha256 === catalog.content_sha256,
  'ATTEMPT_LEDGER_CATALOG_MISMATCH')
  demand(Array.isArray(ledger.attempts) && ledger.attempts.length <= 3, 'INVALID_ATTEMPT_LIST')
  const points = new Map(catalog.points.filter((p) => p.status === 'READY').map((p) => [p.point_id, p]))
  const ids = new Set(), byPoint = new Map()
  for (const attempt of ledger.attempts) {
    exact(attempt, ['attempt_id', 'request_id', 'point_id', 'generation_key', 'state', 'evidence_ref'], 'INVALID_ATTEMPT_RECORD')
    const point = points.get(attempt.point_id)
    demand(hash(attempt.attempt_id, 'attempt-') && hash(attempt.request_id, 'request-')
      && point?.generation_key === attempt.generation_key && !ids.has(attempt.attempt_id), 'INVALID_ATTEMPT_BINDING')
    ids.add(attempt.attempt_id)
    demand(['RESERVED', 'FAILED', 'QUARANTINED'].includes(attempt.state), 'INVALID_ATTEMPT_STATE')
    demand(attempt.state === 'RESERVED' ? attempt.evidence_ref === null
      : typeof attempt.evidence_ref === 'string'
        && /^docs\/AUTOMATIC_ARCHIVE_STEP6_[A-Z0-9_]+\.json$/.test(attempt.evidence_ref), 'INVALID_ATTEMPT_EVIDENCE')
    const records = byPoint.get(point.point_id) ?? []
    records.push(attempt); byPoint.set(point.point_id, records)
    demand(records.length <= 3 && records.filter((item) => item.state === 'RESERVED').length <= 1,
      'DUPLICATE_OR_EXCESS_ATTEMPT')
  }
  // Reservations do not count as provider calls. They only hold this generation key out of a future plan.
  const eligible = catalog.points.filter((point) => point.status === 'READY'
    && !(byPoint.get(point.point_id) ?? []).some((item) => item.state === 'RESERVED')
    && (byPoint.get(point.point_id)?.length ?? 0) < 3)
  const available = Math.max(0, 3 - ledger.attempts.length)
  return {
    mode: 'LEDGER_PLAN_ONLY', catalog_sha256: catalog.content_sha256,
    selected_point_ids: eligible.slice(0, available).map((point) => point.point_id),
    reserved: ledger.attempts.filter((item) => item.state === 'RESERVED').length,
    failed: ledger.attempts.filter((item) => item.state === 'FAILED').length,
    quarantined: ledger.attempts.filter((item) => item.state === 'QUARANTINED').length,
    retry_exhausted: [...byPoint.values()].filter((records) => records.length >= 3).length,
    execution_enabled: false, provider_calls: 0, images_generated: 0, storage_uploads: 0,
  }
}
