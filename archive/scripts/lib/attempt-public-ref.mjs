/** Local Git-ref attempt journal proposals. No image execution or remote publication. */
import { inspectPublicRef } from './reader-public-ref.mjs'
import { attemptJournalPath, prepareImageRequestsFromPublicRef } from './image-request-public-ref.mjs'
import { makeAttemptEvent, planFromAttemptLedger } from './attempt-ledger.mjs'
import { visualDigest } from './visual-compiler.mjs'
import { commitLocalProposalFiles, git } from './atomic-public-segment-git.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const visualPath = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'

async function context(options) {
  const inspected = await inspectPublicRef(options)
  const requests = await prepareImageRequestsFromPublicRef(options)
  demand(requests.source_revision === inspected.base,
    'ATTEMPT_REF_MOVED_DURING_READ')
  const catalog = JSON.parse((await inspected.read(visualPath)).toString('utf8'))
  const path = attemptJournalPath(catalog.content_sha256)
  const exists = (await git(inspected.gitBinary, inspected.root,
    ['ls-tree', '-r', '--name-only', inspected.base, '--', path]))
    .toString('utf8').trim() === path
  return { inspected, requests, catalog, path, exists }
}

/** Initialize one empty, catalog-bound journal on an existing local ref. */
export async function commitEmptyAttemptJournalFromPublicRef(options = {}) {
  demand(typeof options.authorizeCommit === 'function',
    'ATTEMPT_JOURNAL_COMMIT_DISABLED')
  demand(options.attemptLedger === undefined && options.dailyHistory == null,
    'EXTERNAL_ATTEMPT_HISTORY_NOT_ALLOWED_FOR_COMMIT')
  const { inspected, catalog, path, exists } = await context(options)
  demand(!exists, 'ATTEMPT_JOURNAL_ALREADY_EXISTS')
  const ledger = { version: 'archive-image-attempt-ledger-v2',
    chronicle_id: catalog.chronicle_id, worldline_id: catalog.worldline_id,
    visibility: 'PUBLIC_ARCHIVE', catalog_sha256: catalog.content_sha256,
    events: [] }
  planFromAttemptLedger(catalog, ledger)
  demand(await options.authorizeCommit({ ref: inspected.ref,
    baseCommit: inspected.base, seasonId: inspected.seasonId,
    catalogSha256: catalog.content_sha256, journalPath: path }) === true,
  'ATTEMPT_JOURNAL_COMMIT_NOT_AUTHORIZED')
  const commit = await commitLocalProposalFiles({ repoRoot: inspected.root,
    ref: inspected.ref, baseCommit: inspected.base,
    files: new Map([[path, Buffer.from(JSON.stringify(ledger, null, 2) + '\n')]]),
    subject: `Initialize image attempts ${inspected.seasonId}`,
    gitBinary: inspected.gitBinary })
  return { status: 'LOCAL_EMPTY_ATTEMPT_JOURNAL_COMMITTED',
    ref: inspected.ref, base_commit: inspected.base, commit,
    journal_path: path, reservations: 0, checkout_files_written: 0,
    provider_calls: 0, remote_pushes: 0, database_writes: 0,
    storage_uploads: 0, site_publications: 0 }
}

/** Reserve one currently selected request locally, without invoking a provider. */
export async function commitAttemptReservationFromPublicRef(options = {}) {
  demand(typeof options.authorizeCommit === 'function',
    'ATTEMPT_RESERVATION_COMMIT_DISABLED')
  demand(options.attemptLedger === undefined && options.dailyHistory == null,
    'EXTERNAL_ATTEMPT_HISTORY_NOT_ALLOWED_FOR_COMMIT')
  const { inspected, requests, catalog, path, exists } = await context(options)
  demand(exists && requests.attempt_history === 'LOCAL_REF_PINNED_NOT_AUTHENTICATED',
    'COMMITTED_ATTEMPT_JOURNAL_REQUIRED')
  const request = requests.requests.find((item) => item.request_id === options.requestId)
  demand(request, 'REQUEST_NOT_SELECTED_FOR_RESERVATION')
  const ledger = JSON.parse((await inspected.read(path)).toString('utf8'))
  const ordinal = ledger.events.filter((item) => item.state === 'RESERVED'
    && item.point_id === request.point_id).length + 1
  const event = makeAttemptEvent({
    attempt_id: `attempt-${visualDigest({ request_id: request.request_id, ordinal })}`,
    request_id: request.request_id, point_id: request.point_id,
    generation_key: request.generation_key, state: 'RESERVED', evidence_ref: null,
    previous_event_sha256: ledger.events.at(-1)?.event_sha256 ?? null,
  })
  const next = { ...ledger, events: [...ledger.events, event] }
  const plan = planFromAttemptLedger(catalog, next)
  demand(plan.execution_enabled === false, 'ATTEMPT_EXECUTION_NOT_ALLOWED')
  demand(await options.authorizeCommit({ ref: inspected.ref,
    baseCommit: inspected.base, seasonId: inspected.seasonId,
    catalogSha256: catalog.content_sha256, journalPath: path,
    requestId: request.request_id, pointId: request.point_id,
    generationKey: request.generation_key, attemptId: event.attempt_id }) === true,
  'ATTEMPT_RESERVATION_NOT_AUTHORIZED')
  const commit = await commitLocalProposalFiles({ repoRoot: inspected.root,
    ref: inspected.ref, baseCommit: inspected.base,
    files: new Map([[path, Buffer.from(JSON.stringify(next, null, 2) + '\n')]]),
    subject: `Reserve image attempt ${inspected.seasonId}`,
    gitBinary: inspected.gitBinary })
  return { status: 'LOCAL_IMAGE_ATTEMPT_RESERVED_NO_EXECUTION',
    ref: inspected.ref, base_commit: inspected.base, commit,
    journal_path: path, attempt_id: event.attempt_id,
    request_id: request.request_id, point_id: request.point_id,
    remaining_in_batch: plan.selected_point_ids.length,
    checkout_files_written: 0, provider_calls: 0, remote_pushes: 0,
    database_writes: 0, storage_uploads: 0, site_publications: 0,
    zero_added_cost_proven: false }
}
