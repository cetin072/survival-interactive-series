/** Catalog-bound local image attempt journal. No provider or publication authority. */
import { readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateVisualCatalog, visualDigest } from './visual-compiler.mjs'
import { writeGraphAtomically } from './atomic-graph.mjs'

const demand = (value, code) => { if (!value) throw new Error(code) }
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
const exact = (value, names, code) => demand(object(value)
  && Object.keys(value).sort().join('|') === [...names].sort().join('|'), code)
const hash = (value, prefix) => typeof value === 'string'
  && new RegExp(`^${prefix}[a-f0-9]{64}$`).test(value)
const fields = ['attempt_id', 'request_id', 'point_id', 'generation_key', 'state', 'evidence_ref', 'previous_event_sha256']

/** Hashes event contents and the prior event, giving each append a stable identity. */
export function makeAttemptEvent(data) {
  exact(data, fields, 'INVALID_ATTEMPT_EVENT')
  return { ...data, event_sha256: visualDigest(data) }
}

/** The journal only suppresses duplicate planning. No state means GENERATED or accepted. */
export function planFromAttemptLedger(catalog, ledger) {
  validateVisualCatalog(catalog)
  exact(ledger, ['version', 'chronicle_id', 'worldline_id', 'visibility', 'catalog_sha256', 'events'], 'INVALID_ATTEMPT_LEDGER')
  demand(ledger.version === 'archive-image-attempt-ledger-v2'
    && ledger.chronicle_id === catalog.chronicle_id && ledger.worldline_id === catalog.worldline_id
    && ledger.visibility === 'PUBLIC_ARCHIVE' && ledger.catalog_sha256 === catalog.content_sha256,
  'ATTEMPT_LEDGER_CATALOG_MISMATCH')
  demand(Array.isArray(ledger.events) && ledger.events.length <= 6, 'INVALID_ATTEMPT_EVENTS')
  const points = new Map(catalog.points.filter((p) => p.status === 'READY').map((p) => [p.point_id, p]))
  const attempts = new Map(), byPoint = new Map()
  let previous = null, reservations = 0
  for (const event of ledger.events) {
    exact(event, [...fields, 'event_sha256'], 'INVALID_ATTEMPT_EVENT')
    const { event_sha256, ...body } = event
    demand(hash(event_sha256, '') && event_sha256 === visualDigest(body)
      && event.previous_event_sha256 === previous, 'ATTEMPT_EVENT_CHAIN_BROKEN')
    previous = event_sha256
    const point = points.get(event.point_id), prior = attempts.get(event.attempt_id)
    demand(hash(event.attempt_id, 'attempt-') && hash(event.request_id, 'request-')
      && point?.generation_key === event.generation_key, 'INVALID_ATTEMPT_BINDING')
    if (event.state === 'RESERVED') {
      demand(prior === undefined && event.evidence_ref === null, 'DUPLICATE_ATTEMPT_RESERVATION')
      const records = byPoint.get(point.point_id) ?? []
      demand(records.length < 3 && !records.some((item) => item.state === 'RESERVED') && ++reservations <= 3,
        'DUPLICATE_OR_EXCESS_ATTEMPT')
      const record = { ...event }; records.push(record)
      byPoint.set(point.point_id, records); attempts.set(event.attempt_id, record)
    } else {
      demand(['FAILED', 'QUARANTINED'].includes(event.state) && prior?.state === 'RESERVED'
        && prior.request_id === event.request_id && prior.point_id === event.point_id
        && prior.generation_key === event.generation_key, 'INVALID_ATTEMPT_TRANSITION')
      demand(typeof event.evidence_ref === 'string'
        && /^docs\/AUTOMATIC_ARCHIVE_STEP6_[A-Z0-9_]+\.json$/.test(event.evidence_ref), 'INVALID_ATTEMPT_EVIDENCE')
      prior.state = event.state
    }
  }
  const records = [...attempts.values()]
  const eligible = catalog.points.filter((point) => point.status === 'READY'
    && !(byPoint.get(point.point_id) ?? []).some((item) => item.state === 'RESERVED')
    && (byPoint.get(point.point_id)?.length ?? 0) < 3)
  return {
    mode: 'LEDGER_PLAN_ONLY', catalog_sha256: catalog.content_sha256,
    selected_point_ids: eligible.slice(0, Math.max(0, 3 - reservations)).map((point) => point.point_id),
    reserved: records.filter((item) => item.state === 'RESERVED').length,
    failed: records.filter((item) => item.state === 'FAILED').length,
    quarantined: records.filter((item) => item.state === 'QUARANTINED').length,
    retry_exhausted: [...byPoint.values()].filter((items) => items.length >= 3).length,
    execution_enabled: false, provider_calls: 0, images_generated: 0, storage_uploads: 0,
  }
}

/** Explicit local-only append. The production orchestrator never calls this function. */
export async function appendAttemptEvent(file, catalog, event, { localWriteEnabled = false, beforeCommit } = {}) {
  demand(localWriteEnabled === true, 'LOCAL_ATTEMPT_WRITE_DISABLED')
  const target = resolve(file)
  demand((await lstat(target)).isFile(), 'ATTEMPT_LEDGER_NOT_REGULAR_FILE')
  const expected = await readFile(target)
  demand(expected.length <= 1_000_000, 'ATTEMPT_LEDGER_TOO_LARGE')
  const ledger = JSON.parse(expected)
  planFromAttemptLedger(catalog, ledger)
  const next = { ...ledger, events: [...ledger.events, event] }
  const plan = planFromAttemptLedger(catalog, next)
  const replacement = Buffer.from(JSON.stringify(next, null, 2) + '\n')
  const commit = await writeGraphAtomically(target, expected, replacement, { beforeCommit })
  return { ...commit, plan, provider_calls: 0, database_writes: 0, storage_uploads: 0, site_publications: 0 }
}
