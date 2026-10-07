const SHA = /^[a-f0-9]{40}$/
export const RELEASE_VERSION = 'production-release-v1'

const KST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function kstDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.valueOf())) throw new Error('INVALID_RELEASE_TIME')
  const parts = Object.fromEntries(KST.formatToParts(date).map(({ type, value: v }) => [type, v]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_RELEASE_DATE')
  const ms = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(ms)) throw new Error('INVALID_RELEASE_DATE')
  return Math.floor(ms / 86400000)
}

export function validateReleasePolicy(policy) {
  if (!policy || policy.version !== 1 || policy.mode !== 'BATCHED'
    || policy.site !== 'survival-diary-archive'
    || !Number.isInteger(policy.production_interval_days) || policy.production_interval_days < 1
    || policy.production_interval_days > 30
    || !Number.isInteger(policy.release_hour_kst) || policy.release_hour_kst < 0 || policy.release_hour_kst > 23
    || policy.max_production_deploys_per_day !== 1) {
    throw new Error('INVALID_RELEASE_POLICY')
  }
  return policy
}

export function validateReleaseMarker(marker) {
  if (!marker || marker.version !== RELEASE_VERSION
    || marker.site !== 'survival-diary-archive'
    || !SHA.test(marker.source_main_sha ?? '')
    || !/^\d{4}-\d{2}-\d{2}$/.test(marker.released_on_kst ?? '')
    || !Number.isInteger(marker.interval_days) || marker.interval_days < 1
    || !Number.isInteger(marker.release_attempt) || marker.release_attempt < 1) {
    throw new Error('INVALID_RELEASE_MARKER')
  }
  return marker
}

export function decideRelease({ headSha, lastReleaseCommit = null, marker = null, policy, now = new Date(), force = false, hasSiteChanges = true }) {
  validateReleasePolicy(policy)
  if (!SHA.test(headSha)) throw new Error('INVALID_RELEASE_HEAD')
  if (lastReleaseCommit !== null && !SHA.test(lastReleaseCommit)) throw new Error('INVALID_LAST_RELEASE_COMMIT')
  if (marker !== null) validateReleaseMarker(marker)

  if ((!hasSiteChanges && marker) || (lastReleaseCommit && headSha === lastReleaseCommit)) {
    return { status: 'NO_CHANGES', due: false }
  }

  if (!marker || !lastReleaseCommit) {
    return { status: 'RELEASE_DUE', due: true, reason: 'BOOTSTRAP' }
  }

  const today = kstDate(now)
  const elapsed = dayNumber(today) - dayNumber(marker.released_on_kst)
  if (elapsed < 1) return { status: 'DAILY_LIMIT_REACHED', due: false }
  if (!force && elapsed < policy.production_interval_days) {
    return {
      status: 'WAITING_WINDOW',
      due: false,
      elapsed_days: elapsed,
      remaining_days: policy.production_interval_days - elapsed,
    }
  }

  return { status: 'RELEASE_DUE', due: true, reason: force ? 'FORCED' : 'INTERVAL_ELAPSED' }
}

export function nextReleaseMarker({ sourceMainSha, policy, previousMarker = null, now = new Date() }) {
  validateReleasePolicy(policy)
  if (!SHA.test(sourceMainSha)) throw new Error('INVALID_RELEASE_HEAD')
  if (previousMarker !== null) validateReleaseMarker(previousMarker)
  return {
    version: RELEASE_VERSION,
    site: policy.site,
    source_main_sha: sourceMainSha,
    released_on_kst: kstDate(now),
    interval_days: policy.production_interval_days,
    release_attempt: (previousMarker?.release_attempt ?? 0) + 1,
    policy: 'BATCHED_PRODUCTION',
  }
}
