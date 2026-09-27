/** Select foreground portrait requests from a verified local public Visual Catalog.
 * Request preparation does not reserve an attempt, execute a model or prove cost.
 */
import { makeImagePocRequest, validateImagePocRequest } from './image-poc-exchange.mjs'
import { planVisualSelection, validateVisualCatalog } from './visual-compiler.mjs'
import { inspectPublicRef } from './reader-public-ref.mjs'
import { verifyVisualAtPublicRef } from './visual-public-ref.mjs'
import { git } from './atomic-public-segment-git.mjs'
import { planFromAttemptLedger } from './attempt-ledger.mjs'
import { isDeepStrictEqual } from 'node:util'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const visualPath = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'
export const attemptJournalPath = (catalogSha256) => {
  demand(typeof catalogSha256 === 'string' && /^[a-f0-9]{64}$/.test(catalogSha256),
    'INVALID_ATTEMPT_CATALOG_SHA')
  return `archive/content/visuals/C03-AFTERFALL/attempts/${catalogSha256}.json`
}

async function readJournalHistory(inspected, catalog, path, present) {
  const revisions = (await git(inspected.gitBinary, inspected.root,
    ['log', '--reverse', '--format=%H', inspected.base, '--', path]))
    .toString('utf8').split('\n').filter(Boolean)
  demand(revisions.length <= 7 && (present ? revisions.length > 0 : revisions.length === 0),
    'ATTEMPT_JOURNAL_HISTORY_INVALID')
  if (!present) return undefined
  let prior
  for (const revision of revisions) {
    const ledger = JSON.parse((await git(inspected.gitBinary, inspected.root,
      ['show', `${revision}:${path}`])).toString('utf8'))
    planFromAttemptLedger(catalog, ledger)
    if (prior === undefined) demand(ledger.events.length === 0,
      'ATTEMPT_JOURNAL_NOT_INITIALIZED_EMPTY')
    else demand(ledger.events.length === prior.events.length + 1
      && isDeepStrictEqual(ledger.events.slice(0, -1), prior.events),
    'ATTEMPT_JOURNAL_HISTORY_REWRITTEN')
    prior = ledger
  }
  const current = JSON.parse((await inspected.read(path)).toString('utf8'))
  demand(isDeepStrictEqual(current, prior), 'ATTEMPT_JOURNAL_CURRENT_CHANGED')
  return current
}

export async function prepareImageRequestsFromPublicRef(options = {}) {
  const inspected = await inspectPublicRef(options)
  const verified = await verifyVisualAtPublicRef(options)
  demand(verified.baseCommit === inspected.base, 'VISUAL_REF_MOVED_DURING_REQUEST_READ')
  const bytes = await inspected.read(visualPath)
  demand(bytes.equals(verified.candidateBytes), 'VISUAL_CATALOG_CHANGED_DURING_REQUEST_READ')
  // A later local proposal commit must not change the identity of the same brief.
  const visualRevision = (await git(inspected.gitBinary, inspected.root,
    ['log', '-1', '--format=%H', inspected.base, '--', visualPath])).toString().trim()
  demand(/^[a-f0-9]{40}$/.test(visualRevision)
    && bytes.equals(await git(inspected.gitBinary, inspected.root,
      ['show', `${visualRevision}:${visualPath}`])),
  'IMAGE_REQUEST_VISUAL_REVISION_NOT_PINNED')
  const catalog = JSON.parse(bytes.toString('utf8'))
  validateVisualCatalog(catalog)
  const journalPath = attemptJournalPath(catalog.content_sha256)
  const committedJournal = (await git(inspected.gitBinary, inspected.root,
    ['ls-tree', '-r', '--name-only', inspected.base, '--', journalPath]))
    .toString('utf8').trim() === journalPath
  demand(!committedJournal || options.attemptLedger === undefined,
    'COMMITTED_ATTEMPT_JOURNAL_OVERRIDE_FORBIDDEN')
  const recordedJournal = await readJournalHistory(inspected, catalog, journalPath,
    committedJournal)
  const attemptLedger = committedJournal ? recordedJournal : options.attemptLedger
  demand(options.dailyHistory == null || attemptLedger !== undefined,
    'DAILY_HISTORY_WITHOUT_ATTEMPT_LEDGER')
  const selection = attemptLedger === undefined
    ? planVisualSelection(catalog)
    : planFromAttemptLedger(catalog, attemptLedger,
      { dailyHistory: options.dailyHistory ?? null })
  demand(selection.execution_enabled === false, 'IMAGE_EXECUTION_NOT_ALLOWED')
  const byId = new Map(catalog.points.map((point) => [point.point_id, point]))
  if (attemptLedger !== undefined) {
    for (const event of attemptLedger.events) {
      const point = byId.get(event.point_id)
      demand(point?.point_type === 'CHARACTER', 'UNSUPPORTED_LEDGER_IMAGE_POINT')
      const expected = makeImagePocRequest(point, {
        batch_id: catalog.batch_id, source_revision: visualRevision })
      demand(event.request_id === expected.request_id,
        'ATTEMPT_REQUEST_ID_MISMATCH')
    }
  }
  const requests = [], deferred = []
  for (const pointId of selection.selected_point_ids) {
    const point = byId.get(pointId)
    demand(point?.status === 'READY', 'SELECTED_IMAGE_POINT_NOT_READY')
    if (point.point_type !== 'CHARACTER') {
      deferred.push({ point_id: pointId, reason: 'FOREGROUND_POC_PORTRAIT_ONLY' })
      continue
    }
    const request = makeImagePocRequest(point, {
      batch_id: catalog.batch_id, source_revision: visualRevision })
    validateImagePocRequest(request)
    requests.push(request)
  }
  return { status: 'IMAGE_REQUESTS_PREPARED_NO_EXECUTION',
    ref: inspected.ref, source_revision: inspected.base,
    request_source_revision: visualRevision,
    catalog_sha256: catalog.content_sha256,
    selected_point_ids: selection.selected_point_ids,
    requests, deferred,
    attempt_history: committedJournal ? 'LOCAL_REF_PINNED_NOT_AUTHENTICATED'
      : attemptLedger === undefined ? 'NOT_SUPPLIED' : 'CALLER_SUPPLIED_NOT_AUTHENTICATED',
    ...(attemptLedger === undefined ? {} : { attempt_plan: selection }),
    ...(committedJournal ? { attempt_journal_path: journalPath } : {}),
    execution_enabled: false, provider_calls: 0, images_generated: 0,
    database_writes: 0, storage_uploads: 0, site_publications: 0,
    zero_added_cost_proven: false }
}
