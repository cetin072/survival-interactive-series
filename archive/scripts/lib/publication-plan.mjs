/** Step 2: metadata-only planning. No filesystem, network, database or provider calls. */
import { createHash } from 'node:crypto'

const namespaces = {
  'C01-HAN-JUNHO': ['CANON-V2', 'seasons_v2'],
  'C02-STRONGHOLD': ['STRONGHOLD', 'worldlines/STRONGHOLD'],
  'C03-AFTERFALL': ['AFTERFALL', 'worldlines/AFTERFALL'],
}
const qualities = ['LEGACY_SOURCE_REVIEW', 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING', 'VERIFIED_CONTIGUOUS_TURN_PAIRS']
const idPattern = /^(?:batch|task)-[a-f0-9]{64}$/
const digestPattern = /^[a-f0-9]{64}$/
export const POLICY = Object.freeze({ version: 'zero-cost-plan-v1', mode: 'ZERO_COST_ONLY', batch_attempt_limit: 3, daily_attempt_limit: 6, retry_limit: 2 })

function demand(condition, code) { if (!condition) throw new Error(code) }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype }
function keys(value, allowed) {
  demand(object(value) && Object.keys(value).every((key) => allowed.includes(key)), 'INVALID_OR_UNEXPECTED_FIELDS')
}
function integer(value) { return Number.isSafeInteger(value) && value >= 0 }
function dateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return false
  const parsed = new Date(value.replace(' ', 'T') + ':00Z')
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 16).replace('T', ' ') === value
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }; return value }
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered)
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]))
  demand(value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value)), 'NON_JSON_INPUT')
  return value
}
export const fingerprint = (value) => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')

/** Accept only the normalized metadata DTO, never arbitrary runtime/GM objects. */
export function validateSnapshot(input) {
  keys(input, ['version', 'chronicle_id', 'worldline_id', 'season_id', 'visibility', 'source_revision', 'source_save_version', 'source_game_time', 'source_checkpoint', 'coverage_status', 'sources'])
  demand(input.version === 'publication-snapshot-v1', 'UNSUPPORTED_SNAPSHOT_VERSION')
  const namespace = namespaces[input.chronicle_id]
  demand(namespace && namespace[0] === input.worldline_id, 'CHRONICLE_ISOLATION_VIOLATION')
  demand(typeof input.season_id === 'string' && /^S\d{2,3}$/.test(input.season_id), 'INVALID_SEASON')
  demand(input.visibility === 'PUBLIC_ARCHIVE', 'NON_PUBLIC_SNAPSHOT')
  demand(input.coverage_status === 'PARTIAL', 'UNSUPPORTED_COMPLETE_COVERAGE_CLAIM')
  demand(typeof input.source_revision === 'string' && /^[a-f0-9]{40}$/.test(input.source_revision), 'IMMUTABLE_SOURCE_REVISION_REQUIRED')
  demand(integer(input.source_save_version) && input.source_save_version > 0, 'INVALID_SAVE_ANCHOR')
  demand(dateTime(input.source_game_time), 'INVALID_TIME_ANCHOR')
  const checkpointRoot = input.chronicle_id === 'C01-HAN-JUNHO' ? `${namespace[1]}/${input.season_id}/` : `${namespace[1]}/seasons/${input.season_id}/`
  demand(typeof input.source_checkpoint === 'string' && input.source_checkpoint.startsWith(checkpointRoot) && /^[A-Za-z0-9_/-]+\.md$/.test(input.source_checkpoint), 'INVALID_CHECKPOINT_REFERENCE')
  demand(Array.isArray(input.sources) && input.sources.length <= 1000, 'INVALID_SOURCE_INVENTORY')
  const seen = new Set()
  for (const source of input.sources) {
    keys(source, ['session_id', 'source_ref', 'source_digest', 'visibility', 'capture_quality', 'atomic_pairing_complete', 'captured_message_range', 'user_messages', 'gm_public_blocks'])
    demand(typeof source.session_id === 'string' && /^SESSION_\d{3}$/.test(source.session_id), 'INVALID_SESSION_ID')
    demand(!seen.has(source.session_id), 'DUPLICATE_SESSION')
    seen.add(source.session_id)
    demand(source.visibility === 'PUBLIC_ARCHIVE', 'NON_PUBLIC_SOURCE')
    const prefix = `archive/content/transcripts/${input.chronicle_id}/${input.season_id}/${source.session_id}/`
    demand([prefix + 'SOURCE_MANIFEST.json', prefix + 'SOURCE_INDEX.md'].includes(source.source_ref), 'CROSS_NAMESPACE_SOURCE_REFERENCE')
    demand(typeof source.source_digest === 'string' && digestPattern.test(source.source_digest), 'INVALID_SOURCE_DIGEST')
    demand(qualities.includes(source.capture_quality), 'UNKNOWN_CAPTURE_QUALITY')
    demand(integer(source.user_messages) && integer(source.gm_public_blocks), 'INVALID_SOURCE_COUNTS')
    if (source.capture_quality === 'LEGACY_SOURCE_REVIEW') {
      demand(source.atomic_pairing_complete === null && source.captured_message_range === null, 'LEGACY_COVERAGE_MUST_NOT_BE_INFERRED')
      continue
    }
    const paired = source.capture_quality === 'VERIFIED_CONTIGUOUS_TURN_PAIRS'
    demand(source.atomic_pairing_complete === paired, 'PAIRING_FLAG_CONFLICT')
    demand(source.user_messages + source.gm_public_blocks > 0, 'EMPTY_CAPTURE')
    if (paired) demand(source.user_messages > 0 && source.user_messages === source.gm_public_blocks, 'PAIRING_COUNTS_CONFLICT')
    const range = source.captured_message_range
    keys(range, ['start', 'end'])
    demand(dateTime(range.start) && dateTime(range.end) && range.start <= range.end, 'INVALID_CAPTURE_RANGE')
    demand(range.end <= input.source_game_time, 'FUTURE_SOURCE_OUTSIDE_SNAPSHOT')
  }
  const snapshot = structuredClone(input)
  snapshot.sources.sort((a, b) => a.session_id < b.session_id ? -1 : a.session_id > b.session_id ? 1 : 0)
  return freeze(snapshot)
}

/** Stable identity excludes the checkout SHA: an unrelated code commit is not a new batch. */
export function createBatch(input) {
  const snapshot = validateSnapshot(input)
  const { source_revision, ...identity } = snapshot
  return freeze({ batch_id: `batch-${fingerprint(identity)}`, snapshot })
}

/** Simulated eligibility only. A result of ELIGIBLE never makes an external call. */
export function assessExternalCapability(capability = {}) {
  keys(capability, ['cost_class', 'zero_cost_verified', 'capability_verified', 'enabled', 'included_units_remaining', 'evidence_ref'])
  const { cost_class: cost = 'UNKNOWN' } = capability
  demand(['INCLUDED', 'UNKNOWN', 'PAID'].includes(cost), 'INVALID_COST_CLASS')
  for (const key of ['zero_cost_verified', 'capability_verified', 'enabled']) {
    demand(capability[key] === undefined || typeof capability[key] === 'boolean', 'INVALID_CAPABILITY_BOOLEAN')
  }
  demand(capability.included_units_remaining === undefined || integer(capability.included_units_remaining), 'INVALID_INCLUDED_QUOTA')
  if (cost !== 'INCLUDED') return freeze({ eligible: false, status: 'WAITING_HUMAN_COST_APPROVAL', reason: cost })
  if (capability.zero_cost_verified !== true || typeof capability.evidence_ref !== 'string' || !capability.evidence_ref.trim()) {
    return freeze({ eligible: false, status: 'WAITING_HUMAN_COST_APPROVAL', reason: 'INCLUDED_NOT_VERIFIED' })
  }
  if (capability.capability_verified !== true) return freeze({ eligible: false, status: 'PRODUCT_BOUNDARY_BLOCKED', reason: 'CAPABILITY_NOT_VERIFIED' })
  if (capability.enabled !== true) return freeze({ eligible: false, status: 'DISABLED', reason: 'NOT_ENABLED' })
  if (!integer(capability.included_units_remaining) || capability.included_units_remaining < 1) return freeze({ eligible: false, status: 'WAITING_INCLUDED_QUOTA', reason: 'QUOTA_NOT_AVAILABLE' })
  return freeze({ eligible: true, status: 'ELIGIBLE_FOR_FUTURE_ADAPTER', reason: 'VERIFIED_INCLUDED_CAPABILITY' })
}

/** All attempts, including failures/retries, consume the proposed limits. No durable counter yet. */
export function assessAttemptBudget({ batch_attempts = 0, daily_attempts = 0, asset_attempts = 0 } = {}) {
  demand([batch_attempts, daily_attempts, asset_attempts].every(integer), 'INVALID_ATTEMPT_COUNTER')
  if (asset_attempts >= 1 + POLICY.retry_limit) return freeze({ eligible: false, available: 0, reason: 'RETRY_LIMIT' })
  const available = Math.max(0, Math.min(POLICY.batch_attempt_limit - batch_attempts, POLICY.daily_attempt_limit - daily_attempts))
  return freeze({ eligible: available > 0, available, reason: available ? 'WITHIN_LIMIT' : 'BATCH_OR_DAILY_LIMIT' })
}

/** Returns a plan, never GENERATED/PUBLISHED. Completion receipts are supplied by a future ledger. */
export function planPublication(input, options = {}) {
  keys(options, ['completed_task_ids', 'capabilities', 'usage'])
  const batch = createBatch(input)
  const done = options.completed_task_ids ?? []
  demand(Array.isArray(done) && done.every((id) => typeof id === 'string' && idPattern.test(id) && id.startsWith('task-')), 'INVALID_COMPLETION_RECEIPTS')
  const capabilities = options.capabilities ?? {}
  keys(capabilities, ['image', 'storage', 'publication'])
  const gates = Object.fromEntries(['image', 'storage', 'publication'].map((key) => {
    try { return [key, assessExternalCapability(capabilities[key])] }
    catch { return [key, { eligible: false, status: 'CONFIG_REJECTED', reason: 'INVALID_CAPABILITY_CONFIGURATION' }] }
  }))
  keys(options.usage ?? {}, ['batch_attempts', 'daily_attempts', 'asset_attempts'])
  const budget = assessAttemptBudget(options.usage)
  const tasks = []
  const task = (kind, sourceRefs, status) => {
    const task_id = `task-${fingerprint({ batch_id: batch.batch_id, kind, sourceRefs })}`
    tasks.push({ task_id, kind, source_refs: sourceRefs, status: done.includes(task_id) ? 'NOOP_ALREADY_COMPLETED' : status })
  }
  for (const source of batch.snapshot.sources) {
    const status = source.capture_quality === 'LEGACY_SOURCE_REVIEW' ? 'DEFERRED_LEGACY_ADAPTER'
      : source.atomic_pairing_complete ? 'PLANNED_READER_INPUT' : 'PRESERVE_FRAGMENT_ONLY'
    task('TEXT_SOURCE', [source.source_ref], status)
  }
  task('GRAPH_RECONCILIATION', [], 'WAITING_PUBLIC_CANON_INPUT')
  task('VISUAL_POINT_SCAN', [], 'WAITING_PUBLIC_CANON_INPUT')
  task('IMAGE_GENERATION', [], gates.image.eligible ? 'WAITING_VISUAL_BRIEF' : gates.image.status)
  task('IMAGE_STORAGE', [], gates.storage.eligible ? 'WAITING_IMAGE' : gates.storage.status)
  task('SITE_PUBLICATION', [], gates.publication.eligible ? 'WAITING_BUILD_OUTPUT' : gates.publication.status)
  const paired = batch.snapshot.sources.filter((s) => s.atomic_pairing_complete === true)
  const fragments = batch.snapshot.sources.filter((s) => s.capture_quality === 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING')
  return freeze({
    mode: 'DRY_RUN_ONLY', batch_id: batch.batch_id,
    plan_id: `plan-${fingerprint({ batch_id: batch.batch_id, policy: POLICY, gates, budget, tasks })}`,
    snapshot: batch.snapshot, policy: POLICY, gates, budget, tasks,
    summary: {
      sources: batch.snapshot.sources.length, reader_input_spans: paired.length,
      paired_turns: paired.reduce((n, s) => n + s.user_messages, 0),
      rolling_captured_messages: [...paired, ...fragments].reduce((n, s) => n + s.user_messages + s.gm_public_blocks, 0),
      preserved_fragments: fragments.length,
      legacy_sources_deferred: batch.snapshot.sources.filter((s) => s.capture_quality === 'LEGACY_SOURCE_REVIEW').length,
      completed_tasks_skipped: tasks.filter((t) => t.status === 'NOOP_ALREADY_COMPLETED').length,
      images_generated: 0, records_written: 0, external_calls: 0, site_publications: 0,
    },
  })
}

/** Maintenance callers get a bounded failure; no input, hidden values or stack is logged. */
export function safePlanPublication(input, options) {
  try { return { ok: true, plan: planPublication(input, options) } }
  catch { return { ok: false, mode: 'DRY_RUN_ONLY', error: 'PUBLICATION_INPUT_REJECTED', game_affected: false, records_written: 0, external_calls: 0 } }
}
