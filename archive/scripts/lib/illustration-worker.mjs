import { readFile } from 'node:fs/promises'

export const DEFAULT_BATCH_LIMIT = 3
export const DAILY_ATTEMPT_CAP = 6
export const MAX_ASSET_ATTEMPTS = 3
export const DEFAULT_PROVIDER = 'shadow'
export const SUPPORTED_PROVIDERS = ['shadow', 'native_chatgpt', 'api_openai', 'manual_import']

const ID = {
  point: /^point-[a-f0-9]{64}$/,
  generation: /^generation-[a-f0-9]{64}$/,
}

const sameIdentity = (left, right) => left.point_id === right.point_id && left.generation_key === right.generation_key
const dayOf = (timestamp) => typeof timestamp === 'string' ? timestamp.slice(0, 10) : ''

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export function validateReceipts(receipts) {
  if (receipts?.version !== 'illustration-receipts-v1' || !Array.isArray(receipts.attempts)) {
    throw new Error('INVALID_ILLUSTRATION_RECEIPTS')
  }
  for (const attempt of receipts.attempts) {
    if (!ID.point.test(attempt.point_id) || !ID.generation.test(attempt.generation_key)
      || typeof attempt.subject_id !== 'string' || !Number.isInteger(attempt.attempt_count)
      || attempt.attempt_count !== 1 || typeof attempt.last_status !== 'string') {
      throw new Error('INVALID_ILLUSTRATION_RECEIPT_ENTRY')
    }
  }
  return receipts
}

export function appendIllustrationReceipt(receipts, point, { mode = 'LIVE_MANUAL', provider, status, outputSha256 = null, publishedAssetRef = null, now = new Date() }) {
  validateReceipts(receipts)
  if (!validPoint(point) || mode !== 'LIVE_MANUAL' || !SUPPORTED_PROVIDERS.includes(provider)
    || typeof status !== 'string' || !status || (outputSha256 !== null && !/^[a-f0-9]{64}$/.test(outputSha256))) {
    throw new Error('INVALID_ILLUSTRATION_ATTEMPT')
  }
  const identityHistory = receipts.attempts.filter((attempt) => sameIdentity(attempt, point))
  if (identityHistory.some((attempt) => ['SUCCEEDED', 'PUBLISHED'].includes(attempt.last_status))) throw new Error('ILLUSTRATION_ALREADY_SUCCEEDED')
  if (identityHistory.length >= MAX_ASSET_ATTEMPTS) throw new Error('ILLUSTRATION_RETRY_CAP_REACHED')
  const today = now.toISOString().slice(0, 10)
  const todayCount = receipts.attempts.filter((attempt) => dayOf(attempt.last_run_at) === today)
    .reduce((sum, attempt) => sum + attempt.attempt_count, 0)
  if (todayCount >= DAILY_ATTEMPT_CAP) throw new Error('ILLUSTRATION_DAILY_CAP_REACHED')
  const attempt = {
    point_id: point.point_id,
    generation_key: point.generation_key,
    subject_id: point.subject_id,
    mode,
    provider,
    attempt_count: 1,
    last_status: status,
    last_run_at: now.toISOString(),
    output_sha256: outputSha256,
    published_asset_ref: publishedAssetRef,
  }
  return { ...receipts, attempts: [...receipts.attempts, attempt] }
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
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > DEFAULT_BATCH_LIMIT) throw new Error('INVALID_ILLUSTRATION_BATCH_LIMIT')
  if (!Array.isArray(catalog?.points) || !Array.isArray(siteAssets?.assets)) throw new Error('INVALID_ILLUSTRATION_INPUT')

  const ready = catalog.points.filter((point) => point.status === 'READY')
  const published = siteAssets.assets
  const attempts = receipts.attempts
  const today = now.toISOString().slice(0, 10)
  const attemptCountToday = attempts.filter((attempt) => dayOf(attempt.last_run_at) === today)
    .reduce((sum, attempt) => sum + attempt.attempt_count, 0)
  const requested = subjectIds ? new Set(subjectIds) : null
  const counts = {
    total_ready_points: ready.length,
    skipped_existing_assets: 0,
    skipped_previous_success: 0,
    skipped_retry_cap: 0,
    skipped_invalid_identity: 0,
    skipped_daily_cap: 0,
  }
  const eligible = []

  for (const point of ready) {
    if (!validPoint(point)) { counts.skipped_invalid_identity++; continue }
    if (published.some((asset) => sameIdentity(asset, point))) { counts.skipped_existing_assets++; continue }
    const history = attempts.filter((attempt) => sameIdentity(attempt, point))
    if (history.some((attempt) => ['SUCCEEDED', 'PUBLISHED'].includes(attempt.last_status))) {
      counts.skipped_previous_success++
      continue
    }
    const attemptsForAsset = history.length
    if (attemptsForAsset >= MAX_ASSET_ATTEMPTS) { counts.skipped_retry_cap++; continue }
    eligible.push(point)
  }

  let ordered = eligible.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    || a.point_id.localeCompare(b.point_id))
  if (requested) ordered = ordered.filter((point) => requested.has(point.subject_id))
  const dailyCapacity = Math.max(0, DAILY_ATTEMPT_CAP - attemptCountToday)
  if (ordered.length > dailyCapacity) counts.skipped_daily_cap = ordered.length - dailyCapacity
  const selected = ordered.slice(0, Math.min(batchLimit, dailyCapacity))
  const candidates = selected.map((point) => ({
    point_id: point.point_id,
    subject_id: point.subject_id,
    generation_key: point.generation_key,
    priority: point.priority ?? 0,
    handoff: handoffContract(point),
  }))

  return {
    counts,
    candidates,
    published_subjects: [...new Set(published.map((asset) => asset.subject_id).filter(Boolean))].sort(),
    attempt_count_today: attemptCountToday,
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
          mime_type: null, sha256: null, metadata: { calls_made: 0, cost: 0 } }
      }
      if (provider === 'native_chatgpt') {
        return { ...identity, provider, status: 'STUBBED', original_ref: null, width: null, height: null,
          mime_type: null, sha256: null, metadata: { support: 'HANDOFF_READY_NOT_PROVEN', calls_made: 0 } }
      }
      if (provider === 'api_openai') {
        return { ...identity, provider, status: 'LIVE_DISABLED', original_ref: null, width: null, height: null,
          mime_type: null, sha256: null, metadata: { reason: 'PAID_API_DISABLED_BY_ZERO_COST_POLICY', calls_made: 0 } }
      }
      const imported = request.imported_result
      if (!imported || typeof imported.original_ref !== 'string' || !Number.isInteger(imported.width)
        || !Number.isInteger(imported.height) || imported.mime_type !== 'image/png'
        || !/^[a-f0-9]{64}$/.test(imported.sha256 ?? '')) {
        return { ...identity, provider, status: 'AWAITING_IMPORT', original_ref: null, width: null, height: null,
          mime_type: null, sha256: null, metadata: { calls_made: 0 } }
      }
      return { ...identity, provider, status: 'IMPORTED', original_ref: imported.original_ref,
        width: imported.width, height: imported.height, mime_type: imported.mime_type,
        sha256: imported.sha256, metadata: { calls_made: 0 } }
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
    ...plan.counts,
    published_subjects: plan.published_subjects,
    selected_for_generation: plan.candidates.length,
    would_generate_count: plan.candidates.length,
    attempt_count_today: plan.attempt_count_today,
    daily_capacity_remaining: plan.daily_capacity_remaining,
    batch_limit: plan.batch_limit,
    candidates: plan.candidates,
    estimated_next_step: plan.candidates.length
      ? 'A manual image worker can consume each handoff contract, then validate and privately store the original before creating a deterministic site derivative.'
      : 'No generation handoff is queued; check receipt limits or wait for a new READY point.',
    site_assets_mutated: false,
    storage_written: false,
  }
}
