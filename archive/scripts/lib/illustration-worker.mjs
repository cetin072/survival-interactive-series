import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const DEFAULT_BATCH_LIMIT = 3
export const DAILY_GENERATION_CAP = 6
export const BATCH_GENERATION_CAP = 3
export const MAX_ASSET_ATTEMPTS = 3
export const DEFAULT_PROVIDER = 'shadow'
export const SUPPORTED_PROVIDERS = ['shadow', 'native_chatgpt', 'api_openai', 'manual_import']
export const RECEIPT_MODES = ['LIVE_MANUAL']
export const GENERATION_PROVIDERS = ['native_chatgpt', 'api_openai']
export const RECEIPT_STATUSES = ['FAILED', 'SUCCEEDED']
export const RECEIPT_REASON_CODES = ['GENERATION_FAILED', 'PROVIDER_UNAVAILABLE']
export const RECEIPT_VERSION = 'illustration-receipts-v2'
const ALLOWED_PRIORITIES = [0, 10, 20, 25, 30]

const ID = {
  point: /^point-[a-f0-9]{64}$/,
  generation: /^generation-[a-f0-9]{64}$/,
}

const sameIdentity = (left, right) => left.point_id === right.point_id && left.generation_key === right.generation_key
const isoUTC = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const sha256OrNull = (value) => value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
const safePublishedAssetRef = (value) => value === null
  || (typeof value === 'string' && /^\/visual-assets\/[a-f0-9]{64}\.png$/.test(value))

const KST_DATE = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function kstCalendarDay(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.valueOf())) throw new Error('INVALID_ILLUSTRATION_TIMESTAMP')
  const parts = Object.fromEntries(KST_DATE.formatToParts(date).map(({ type, value: part }) => [type, part]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export function validateReceipts(receipts) {
  if (receipts?.version !== RECEIPT_VERSION || !Array.isArray(receipts.attempts)) {
    throw new Error('INVALID_ILLUSTRATION_RECEIPTS')
  }
  const nextAttemptNo = new Map()
  const dailyGenerationCounts = new Map()
  for (const attempt of receipts.attempts) {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)
      || !ID.point.test(attempt.point_id ?? '') || !ID.generation.test(attempt.generation_key ?? '')
      || typeof attempt.subject_id !== 'string' || attempt.subject_id.trim().length === 0
      || !RECEIPT_MODES.includes(attempt.mode) || !GENERATION_PROVIDERS.includes(attempt.provider)
      || !Number.isInteger(attempt.attempt_no) || attempt.attempt_no < 1 || attempt.attempt_no > MAX_ASSET_ATTEMPTS
      || attempt.attempt_count !== 1 || !RECEIPT_STATUSES.includes(attempt.last_status)
      || !isoUTC(attempt.last_run_at) || attempt.last_status !== attempt.status || attempt.last_run_at !== attempt.occurred_at
      || !RECEIPT_STATUSES.includes(attempt.status)
      || !(attempt.reason_code === null || RECEIPT_REASON_CODES.includes(attempt.reason_code))
      || (attempt.status === 'FAILED' && !RECEIPT_REASON_CODES.includes(attempt.reason_code))
      || (attempt.status === 'SUCCEEDED' && attempt.reason_code !== null)
      || !isoUTC(attempt.occurred_at) || !/^\d{4}-\d{2}-\d{2}$/.test(attempt.date_kst)
      || !validCalendarDate(attempt.date_kst) || attempt.date_kst !== kstCalendarDay(attempt.occurred_at)
      || attempt.counts_toward_daily_generation_cap !== true
      || !sha256OrNull(attempt.output_sha256) || !safePublishedAssetRef(attempt.published_asset_ref)
      || (attempt.status === 'SUCCEEDED' && !/^[a-f0-9]{64}$/.test(attempt.output_sha256 ?? ''))) {
      throw new Error('INVALID_ILLUSTRATION_RECEIPT_ENTRY')
    }
    const identity = `${attempt.point_id}:${attempt.generation_key}`
    const expectedAttemptNo = (nextAttemptNo.get(identity) ?? 0) + 1
    if (attempt.attempt_no !== expectedAttemptNo) throw new Error('INVALID_ILLUSTRATION_ATTEMPT_SEQUENCE')
    nextAttemptNo.set(identity, expectedAttemptNo)
    const dateCount = (dailyGenerationCounts.get(attempt.date_kst) ?? 0) + 1
    if (dateCount > DAILY_GENERATION_CAP) throw new Error('INVALID_ILLUSTRATION_DAILY_CAP')
    dailyGenerationCounts.set(attempt.date_kst, dateCount)
  }
  return receipts
}

function validCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function dailyGenerationUsed(receipts, dateKst = kstCalendarDay(new Date())) {
  validateReceipts(receipts)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKst) || !validCalendarDate(dateKst)) throw new Error('INVALID_ILLUSTRATION_KST_DATE')
  return receipts.attempts.filter((attempt) => attempt.counts_toward_daily_generation_cap && attempt.date_kst === dateKst).length
}

export function appendIllustrationReceipt(receipts, point, { mode = 'LIVE_MANUAL', provider, status, reasonCode = null, outputSha256 = null, publishedAssetRef = null, now = new Date() }) {
  validateReceipts(receipts)
  if (!validPoint(point) || !RECEIPT_MODES.includes(mode) || !GENERATION_PROVIDERS.includes(provider)
    || !RECEIPT_STATUSES.includes(status) || !(reasonCode === null || RECEIPT_REASON_CODES.includes(reasonCode))
    || (status === 'FAILED' && !RECEIPT_REASON_CODES.includes(reasonCode))
    || (status === 'SUCCEEDED' && reasonCode !== null)
    || !sha256OrNull(outputSha256) || !safePublishedAssetRef(publishedAssetRef)) {
    throw new Error('INVALID_ILLUSTRATION_ATTEMPT')
  }
  const identityHistory = receipts.attempts.filter((attempt) => sameIdentity(attempt, point))
  if (identityHistory.some((attempt) => attempt.status === 'SUCCEEDED')) throw new Error('ILLUSTRATION_ALREADY_SUCCEEDED')
  if (identityHistory.length >= MAX_ASSET_ATTEMPTS) throw new Error('ILLUSTRATION_RETRY_CAP_REACHED')
  const occurredAt = now.toISOString()
  const dateKst = kstCalendarDay(occurredAt)
  if (dailyGenerationUsed(receipts, dateKst) >= DAILY_GENERATION_CAP) throw new Error('ILLUSTRATION_DAILY_CAP_REACHED')
  const attempt = {
    point_id: point.point_id,
    generation_key: point.generation_key,
    subject_id: point.subject_id,
    mode,
    provider,
    attempt_no: identityHistory.length + 1,
    attempt_count: 1,
    status,
    last_status: status,
    reason_code: reasonCode,
    occurred_at: occurredAt,
    last_run_at: occurredAt,
    date_kst: dateKst,
    counts_toward_daily_generation_cap: true,
    output_sha256: outputSha256,
    published_asset_ref: publishedAssetRef,
  }
  const updated = { ...receipts, attempts: [...receipts.attempts, attempt] }
  validateReceipts(updated)
  return updated
}

export function buildDailyRunSummary(receipts, dateKst, deferredCandidates = []) {
  validateReceipts(receipts)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKst) || !validCalendarDate(dateKst)) throw new Error('INVALID_ILLUSTRATION_KST_DATE')
  const attempts = receipts.attempts.filter((attempt) => attempt.date_kst === dateKst)
  const deferred = new Set(deferredCandidates.filter(validPoint)
    .map((point) => `${point.point_id}:${point.generation_key}`))
  return {
    date_kst: dateKst,
    generation_attempts: attempts.length,
    succeeded: attempts.filter((attempt) => attempt.status === 'SUCCEEDED').length,
    failed: attempts.filter((attempt) => attempt.status === 'FAILED').length,
    deferred: deferred.size,
    daily_generation_cap: DAILY_GENERATION_CAP,
    cap_exhausted: attempts.length >= DAILY_GENERATION_CAP,
    results: attempts.map((attempt) => ({
      subject_id: attempt.subject_id,
      point_id: attempt.point_id,
      generation_key: attempt.generation_key,
      attempt_no: attempt.attempt_no,
      provider: attempt.provider,
      status: attempt.status,
      reason_code: attempt.reason_code,
    })),
  }
}

async function writeJsonAtomically(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    await rename(temporaryPath, path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
}

/** Persist only a completed actual LIVE_MANUAL AI generation attempt; SHADOW/import never call this. */
export async function persistIllustrationAttempt({ receiptsPath, point, provider, status, reasonCode = null, outputSha256 = null, publishedAssetRef = null, now = new Date(), deferredCandidates = [] }) {
  const lockPath = `${receiptsPath}.lock`
  let lock
  try { lock = await open(lockPath, 'wx') }
  catch (error) { if (error.code === 'EEXIST') throw new Error('ILLUSTRATION_RECEIPTS_LOCKED'); throw error }
  try {
    const receipts = validateReceipts(await readJson(receiptsPath))
    let updated
    try {
      updated = appendIllustrationReceipt(receipts, point, {
        mode: 'LIVE_MANUAL', provider, status, reasonCode, outputSha256, publishedAssetRef, now,
      })
    } catch (error) {
      if (error.message === 'ILLUSTRATION_DAILY_CAP_REACHED') {
        const dateKst = kstCalendarDay(now)
        const summary = buildDailyRunSummary(receipts, dateKst, deferredCandidates)
        const dailyRunPath = join(dirname(receiptsPath), 'illustration-runs', `${dateKst}.json`)
        await writeJsonAtomically(dailyRunPath, summary)
      }
      throw error
    }
    const attempt = updated.attempts.at(-1)
    await writeJsonAtomically(receiptsPath, updated)
    const dailySummary = buildDailyRunSummary(updated, attempt.date_kst, deferredCandidates)
    const dailyRunPath = join(dirname(receiptsPath), 'illustration-runs', `${attempt.date_kst}.json`)
    await writeJsonAtomically(dailyRunPath, dailySummary)
    return { attempt, dailySummary, dailyRunPath }
  } finally {
    await lock.close()
    await unlink(lockPath).catch(() => {})
  }
}

function validPoint(point) {
  return ID.point.test(point?.point_id ?? '')
    && ID.generation.test(point?.generation_key ?? '')
    && typeof point.subject_id === 'string' && point.subject_id.length > 0
}

function handoffContract(point) {
  const brief = point.brief ?? {}
  return {
    contract_version: 'illustration-handoff-v1',
    point_id: point.point_id,
    generation_key: point.generation_key,
    subject_id: point.subject_id,
    subject_label: brief.subject?.label ?? point.title ?? point.subject_id,
    brief: structuredClone(brief),
    canonical_facts: structuredClone(brief.canon_facts ?? {}),
    mood: brief.art_direction?.mood ?? null,
    style: {
      style_version: brief.art_direction?.style_version ?? null,
      rendering: structuredClone(brief.art_direction?.rendering ?? []),
      theme: brief.art_direction?.theme ?? null,
    },
    safety_constraints: structuredClone(brief.safeguards ?? []),
    output_spec: {
      format: 'image/png',
      max_width: 8192,
      max_height: 8192,
      original_visibility: 'PRIVATE',
      site_derivative: 'DETERMINISTIC_ONLY_AFTER_VALIDATION',
      embedded_text: 'FORBIDDEN',
    },
  }
}

export function selectIllustrationCandidates({ catalog, siteAssets, receipts, now = new Date(), batchLimit = DEFAULT_BATCH_LIMIT, subjectIds = null }) {
  validateReceipts(receipts)
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > BATCH_GENERATION_CAP) throw new Error('INVALID_ILLUSTRATION_BATCH_LIMIT')
  if (!Array.isArray(catalog?.points) || !Array.isArray(siteAssets?.assets)) throw new Error('INVALID_ILLUSTRATION_INPUT')

  const ready = catalog.points.filter((point) => point.status === 'READY')
  const published = siteAssets.assets
  const attempts = receipts.attempts
  const today = kstCalendarDay(now)
  const generationAttemptsToday = dailyGenerationUsed(receipts, today)
  const requested = subjectIds ? new Set(subjectIds) : null
  const counts = {
    total_ready_points: ready.length,
    skipped_existing_assets: 0,
    skipped_previous_success: 0,
    skipped_retry_cap: 0,
    skipped_invalid_identity: 0,
    skipped_invalid_priority: 0,
    skipped_daily_cap: 0,
  }
  const eligible = []

  for (const point of ready) {
    if (!validPoint(point)) { counts.skipped_invalid_identity++; continue }
    if (!ALLOWED_PRIORITIES.includes(point.priority)) { counts.skipped_invalid_priority++; continue }
    if (published.some((asset) => sameIdentity(asset, point))) { counts.skipped_existing_assets++; continue }
    const history = attempts.filter((attempt) => sameIdentity(attempt, point))
    if (history.some((attempt) => attempt.status === 'SUCCEEDED')) {
      counts.skipped_previous_success++
      continue
    }
    const attemptsForAsset = history.length
    if (attemptsForAsset >= MAX_ASSET_ATTEMPTS) { counts.skipped_retry_cap++; continue }
    eligible.push(point)
  }

  let ordered = eligible.sort((a, b) => a.priority - b.priority
    || a.point_id.localeCompare(b.point_id))
  if (requested) ordered = ordered.filter((point) => requested.has(point.subject_id))
  const dailyCapacity = Math.max(0, DAILY_GENERATION_CAP - generationAttemptsToday)
  if (ordered.length > dailyCapacity) counts.skipped_daily_cap = ordered.length - dailyCapacity
  const selected = ordered.slice(0, Math.min(batchLimit, dailyCapacity))
  const candidates = selected.map((point) => ({
    point_id: point.point_id,
    subject_id: point.subject_id,
    generation_key: point.generation_key,
    priority: point.priority,
    handoff: handoffContract(point),
  }))

  return {
    counts,
    candidates,
    published_subjects: [...new Set(published.map((asset) => asset.subject_id).filter(Boolean))].sort(),
    generation_attempts_today: generationAttemptsToday,
    daily_generation_cap: DAILY_GENERATION_CAP,
    daily_capacity_remaining: dailyCapacity,
    batch_limit: batchLimit,
  }
}

export function createProvider(provider) {
  if (!SUPPORTED_PROVIDERS.includes(provider)) throw new Error('UNSUPPORTED_ILLUSTRATION_PROVIDER')
  return {
    name: provider,
    async generateIllustration(request) {
      const identity = { point_id: request.point_id, generation_key: request.generation_key }
      if (provider === 'shadow') {
        return { ...identity, provider, status: 'WOULD_GENERATE', original_ref: null, width: null, height: null,
          mime_type: null, sha256: null, metadata: { calls_made: 0, cost: 0, counts_toward_daily_generation_cap: false } }
      }
      if (provider === 'native_chatgpt') {
        return { ...identity, provider, status: 'STUBBED', original_ref: null, width: null, height: null,
          mime_type: null, sha256: null, metadata: { support: 'HANDOFF_READY_NOT_PROVEN', calls_made: 0, counts_toward_daily_generation_cap: false } }
      }
      if (provider === 'api_openai') {
        return { ...identity, provider, status: 'LIVE_DISABLED', original_ref: null, width: null, height: null,
          mime_type: null, sha256: null, metadata: { reason: 'PAID_API_DISABLED_BY_ZERO_COST_POLICY', calls_made: 0, counts_toward_daily_generation_cap: false } }
      }
      const imported = request.imported_result
      if (!imported || typeof imported.original_ref !== 'string' || !Number.isInteger(imported.width)
        || !Number.isInteger(imported.height) || imported.mime_type !== 'image/png'
        || !/^[a-f0-9]{64}$/.test(imported.sha256 ?? '')) {
        return { ...identity, provider, status: 'AWAITING_IMPORT', original_ref: null, width: null, height: null,
          mime_type: null, sha256: null, metadata: { calls_made: 0, counts_toward_daily_generation_cap: false } }
      }
      return { ...identity, provider, status: 'IMPORTED', original_ref: imported.original_ref,
        width: imported.width, height: imported.height, mime_type: imported.mime_type,
        sha256: imported.sha256, metadata: { calls_made: 0, counts_toward_daily_generation_cap: false } }
    },
  }
}

export function createShadowReport(plan, { provider = DEFAULT_PROVIDER, mode = 'SHADOW', createdAt = new Date().toISOString() } = {}) {
  if (mode !== 'SHADOW') throw new Error('LIVE_EXECUTION_DISABLED')
  if (!SUPPORTED_PROVIDERS.includes(provider)) throw new Error('UNSUPPORTED_ILLUSTRATION_PROVIDER')
  return {
    report_version: 'illustration-shadow-report-v1',
    mode,
    created_at: createdAt,
    would_use_provider: provider,
    provider_status: provider === 'shadow' ? 'IMPLEMENTED' : provider === 'native_chatgpt' ? 'STUBBED' : provider === 'api_openai' ? 'LIVE_DISABLED' : 'IMPLEMENTED',
    live_auto_implemented: false,
    live_auto_enabled: false,
    daily_notifications: 'OFF',
    ...plan.counts,
    published_subjects: plan.published_subjects,
    selected_for_generation: plan.candidates.length,
    would_generate_count: plan.candidates.length,
    generation_calls_made: 0,
    generation_attempts_consumed: 0,
    generation_attempts_today: plan.generation_attempts_today,
    daily_generation_cap: plan.daily_generation_cap,
    daily_capacity_remaining: plan.daily_capacity_remaining,
    batch_limit: plan.batch_limit,
    candidates: plan.candidates,
    estimated_next_step: plan.candidates.length
      ? 'A manual image worker can consume each handoff contract, then validate and privately store the original before creating a deterministic site derivative.'
      : 'No generation handoff is queued; check receipt limits or wait for a new READY point.',
    site_assets_mutated: false,
    storage_written: false,
    receipts_mutated: false,
  }
}
