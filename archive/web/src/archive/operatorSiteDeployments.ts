// Public, read-only observations. No token, Build Hook, mutation, or deploy trigger.
export const deploymentSites = [
  { name: '태장', repository: 'cetin072/taejang_homepage', site: 'taejang-homepage',
    siteId: '9caa5a1a-f86d-4a9f-aed4-f560e1c2101f', policyPath: 'deployment/release-policy.json' },
  { name: '생존일기', repository: 'cetin072/survival-interactive-series', site: 'survival-diary-archive',
    siteId: '4b344369-f418-48ba-81b8-991be8974486', policyPath: 'archive/automation/release-policy.json' },
  { name: '업무수첩', repository: 'cetin072/worklog-voice-pwa', site: 'worklog-voice-pwa',
    siteId: '1ab24b2c-a3e7-479f-8c1b-bbd0a567a25d', policyPath: 'scripts/release-policy.json' },
] as const
export type DeploymentSite = typeof deploymentSites[number]
export type SiteReleasePolicy = {
  repository: string; site_id: string; workflow: string
  schedule_anchor_utc: string; schedule_interval_hours: number; schedule_window_hours: number
  deploy_inputs: string[]; deploy_excludes: string[]
}
export type PublicDeploy = {
  id: string; site_id: string; context: string; state: string; branch: string
  commit_ref: string; created_at: string; published_at: string | null
  skipped?: boolean | null
}
export type ScheduledRun = {
  id: number; event: string; head_branch: string; created_at: string
  run_started_at?: string | null
  status: string; conclusion: string | null
}
export type SiteDeploymentObservation = {
  site: DeploymentSite; checkedAt: string; policy: SiteReleasePolicy | null
  published: PublicDeploy | null; mainSha: string | null
  webChanges: boolean | null; latestProduction: PublicDeploy | null
  scheduledRun: ScheduledRun | null; errors: string[]
}
const HOUR = 3_600_000
const shaPattern = /^[a-f0-9]{40}$/
export const DEPLOYMENT_FRESH_MS = 120_000
const dateValid = (s: unknown): s is string => typeof s === 'string' && Number.isFinite(Date.parse(s))

export function validateSitePolicy(value: SiteReleasePolicy, site: DeploymentSite): SiteReleasePolicy {
  if (!value || value.repository !== site.repository || value.site_id !== site.siteId
    || !/^[a-zA-Z0-9_-]+\.yml$/.test(value.workflow)
    || !dateValid(value.schedule_anchor_utc) || value.schedule_interval_hours !== 48
    || value.schedule_window_hours !== 24 || !Array.isArray(value.deploy_inputs) || !value.deploy_inputs.length
    || !Array.isArray(value.deploy_excludes)) throw new Error('POLICY_INVALID')
  for (const pattern of [...value.deploy_inputs, ...value.deploy_excludes]) {
    if (typeof pattern !== 'string' || pattern.length > 500) throw new Error('POLICY_INVALID')
    new RegExp(pattern)
  }
  return value
}

// Same epoch/index rule as scheduled-netlify-release.mjs: index 0 establishes
// the baseline; the first scheduled slot is index 1. UTC arithmetic survives
// month/year boundaries. The UI never changes the actual scheduler.
export function deploymentSlot(policy: Pick<SiteReleasePolicy, 'schedule_anchor_utc' | 'schedule_interval_hours' | 'schedule_window_hours'>, now: number) {
  const anchor = Date.parse(policy.schedule_anchor_utc)
  const interval = policy.schedule_interval_hours * HOUR
  const window = policy.schedule_window_hours * HOUR
  if (!Number.isFinite(anchor) || !Number.isFinite(now) || interval !== 48 * HOUR || window !== 24 * HOUR) return null
  const index = Math.floor((now - anchor) / interval)
  const start = anchor + index * interval
  return {
    next: new Date(anchor + Math.max(1, index + 1) * interval).toISOString(),
    currentStart: index >= 1 && now < start + window ? new Date(start).toISOString() : null,
    currentExpires: index >= 1 && now < start + window ? new Date(start + window).toISOString() : null,
  }
}

export function isDeploymentInput(policy: SiteReleasePolicy, file: string) {
  // Reuse scheduler exclusions, including test files not shipped to the web.
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /(?:^|\/)(?:tests?|__tests__)\//.test(file)) return false
  return policy.deploy_inputs.some((pattern) => new RegExp(pattern).test(file))
    && !policy.deploy_excludes.some((pattern) => new RegExp(pattern).test(file))
}

export function compareWebChanges(value: {
  status: string; base_commit: { sha: string }; merge_base_commit: { sha: string }
  files: { filename: string; previous_filename?: string }[]
}, policy: SiteReleasePolicy, publishedSha: string) {
  if (!value || !['ahead', 'identical'].includes(value.status)
    || value.base_commit?.sha !== publishedSha || value.merge_base_commit?.sha !== publishedSha
    || !Array.isArray(value.files) || value.files.length >= 300) throw new Error('COMPARE_INCOMPLETE')
  return value.files.some((file) => {
    if (typeof file.filename !== 'string') throw new Error('COMPARE_INCOMPLETE')
    // Renaming out of a deployment directory is also a deployment change.
    return isDeploymentInput(policy, file.filename)
      || (!!file.previous_filename && isDeploymentInput(policy, file.previous_filename))
  })
}

export function validatePublished(snapshot: { id: string; published_deploy: PublicDeploy }, site: DeploymentSite, now: number) {
  const d = snapshot?.published_deploy
  if (snapshot?.id !== site.siteId || !d || d.site_id !== site.siteId || d.context !== 'production'
    || d.state !== 'ready' || d.branch !== 'main' || !/^[a-f0-9]{24}$/.test(d.id)
    || !shaPattern.test(d.commit_ref) || !dateValid(d.published_at) || Date.parse(d.published_at) > now
    || !dateValid(d.created_at) || Date.parse(d.created_at) > Date.parse(d.published_at)) throw new Error('PUBLICATION_INVALID')
  // Only keep the fields this screen uses, never whole provider responses.
  return pickDeploy(d)
}
function pickDeploy(d: PublicDeploy): PublicDeploy {
  return { id: d.id, site_id: d.site_id, context: d.context, state: d.state, branch: d.branch,
    commit_ref: d.commit_ref, created_at: d.created_at, published_at: d.published_at }
}

export function latestProductionAttempt(deploys: PublicDeploy[], site: DeploymentSite, published: PublicDeploy, now: number) {
  if (!Array.isArray(deploys)) throw new Error('DEPLOYS_INVALID')
  // Netlify explicitly marks ignored builds as skipped. These are not failed
  // deployment attempts (ordinary main pushes may intentionally be ignored).
  const production = deploys.filter((d) => d.context === 'production' && d.branch === 'main' && d.skipped !== true)
  if (deploys.length >= 20 && !production.some((d) => d.id === published.id)) throw new Error('DEPLOYS_INCOMPLETE')
  for (const d of production) {
    if (d.site_id !== site.siteId || !dateValid(d.created_at) || Date.parse(d.created_at) > now
      || !/^[a-f0-9]{24}$/.test(d.id) || !shaPattern.test(d.commit_ref)) throw new Error('DEPLOYS_INVALID')
  }
  const latest = production.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  return latest && latest.id !== published.id && Date.parse(latest.created_at) >= Date.parse(published.published_at!)
    ? pickDeploy(latest) : null
}

export type DeploymentSignal = { label: string; tone: 'ok' | 'warning' | 'danger' | 'running' | 'neutral'; detail: string }
export function siteDeploymentSignal(observation: SiteDeploymentObservation | null | undefined, now: number): DeploymentSignal {
  const unknown = (detail: string): DeploymentSignal => ({ label: '상태 조회 불가', tone: 'neutral', detail })
  if (!observation) return unknown('운영자 권한 확인 후 상태를 조회합니다.')
  const age = now - Date.parse(observation.checkedAt)
  if (!Number.isFinite(age) || age < 0 || age >= DEPLOYMENT_FRESH_MS) return unknown('확인한 정보가 오래되었습니다. 상태 새로고침을 눌러 주세요.')
  if (observation.errors.length || !observation.policy || !observation.published || observation.webChanges === null || !observation.mainSha)
    return unknown('필요한 자료를 모두 확인하지 못했습니다. 기술 상세에서 조회 결과를 확인해 주세요.')
  const { latestProduction: attempt, scheduledRun: run, published } = observation
  if (attempt && ['error', 'failed'].includes(attempt.state)) return {
    label: '배포 실패·확인 필요', tone: 'danger', detail: '최근 정식 사이트 배포가 실패했습니다. 이전 공개본은 유지됩니다.',
  }
  if (attempt && ['new', 'pending_review', 'enqueued', 'building', 'uploading', 'uploaded', 'preparing', 'processing'].includes(attempt.state)) return {
    label: '배포 진행 중', tone: 'running', detail: '정식 사이트 빌드가 진행 중입니다. 실제 공개 완료는 아직 확인되지 않았습니다.',
  }
  if (run && ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'].includes(run.conclusion ?? '')
    && Date.parse(run.created_at) > Date.parse(published.published_at!)) return {
    label: '배포 실패·확인 필요', tone: 'danger', detail: '최근 예약 실행이 실패하거나 중단됐습니다. 실제 공개본과 실행 결과를 확인해 주세요.',
  }
  if (attempt) return unknown('게시 확인 중입니다. 빌드 결과와 현재 정식 사이트 공개본이 아직 일치하지 않습니다.')
  if (run?.conclusion === 'skipped' && Date.parse(run.created_at) > Date.parse(published.published_at!))
    return unknown('최근 예약 실행이 건너뛰어졌습니다. 배포 정책과 실행 조건을 확인해 주세요.')
  if (observation.webChanges) return {
    label: '배포 대기', tone: 'warning', detail: '저장소의 웹 변경사항이 아직 정식 사이트에 반영되지 않았습니다.',
  }
  if (observation.mainSha !== published.commit_ref) return {
    label: '배포할 변경 없음', tone: 'ok', detail: '저장소에 새 기록이 있지만 웹 배포 대상 파일의 변경은 없습니다.',
  }
  return { label: '배포 완료', tone: 'ok', detail: '현재 저장소 버전이 정식 사이트에 실제 공개된 것을 확인했습니다.' }
}

export function formatDeploymentTime(value?: string | null) {
  if (!dateValid(value)) return '확인되지 않음'
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value))
}
export function deploymentCountdown(value: string | null | undefined, now: number) {
  if (!dateValid(value)) return '다음 배포 기준 시각을 확인할 수 없습니다.'
  const minutes = Math.max(0, Math.ceil((Date.parse(value) - now) / 60_000))
  return `다음 배포 기준 시각까지 ${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
}

export function emptySiteObservation(site: DeploymentSite, checkedAt: string): SiteDeploymentObservation {
  return { site, checkedAt, policy: null, published: null, mainSha: null, webChanges: null, latestProduction: null, scheduledRun: null, errors: [] }
}

type Fetcher = typeof fetch
async function publicJson<T>(url: string, fetcher: Fetcher): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetcher(url, { method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw new Error(`HTTP_${response.status}`)
    return await response.json() as T
  } finally { clearTimeout(timeout) }
}

export async function observeSiteDeployment(site: DeploymentSite, fetcher: Fetcher = fetch, now: () => number = Date.now): Promise<SiteDeploymentObservation> {
  const result = emptySiteObservation(site, new Date(now()).toISOString())
  const github = `https://api.github.com/repos/${site.repository}`
  const netlify = `https://api.netlify.com/api/v1/sites/${site.siteId}`
  const capture = async <T,>(key: string, task: () => Promise<T>): Promise<T | null> => {
    try { return await task() } catch (error) {
      const code = error instanceof Error && /^(HTTP_\d+|[A-Z_]+)$/.test(error.message) ? error.message : 'NETWORK_OR_RESPONSE'
      result.errors.push(`${key}: ${code}`)
      return null
    }
  }
  await Promise.all([
    capture('MAIN_POLICY', async () => {
      const ref = await publicJson<{ object: { sha: string } }>(`${github}/git/ref/heads/main`, fetcher)
      if (!shaPattern.test(ref?.object?.sha ?? '')) throw new Error('MAIN_INVALID')
      result.mainSha = ref.object.sha
      // Pin the policy to the observed main so a moving branch cannot mix versions.
      const file = await publicJson<{ encoding: string; content: string }>(`${github}/contents/${site.policyPath}?ref=${result.mainSha}`, fetcher)
      if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('POLICY_INVALID')
      const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), (c) => c.charCodeAt(0))
      result.policy = validateSitePolicy(JSON.parse(new TextDecoder().decode(bytes)), site)
      const runs = await publicJson<{ workflow_runs: ScheduledRun[] }>(`${github}/actions/workflows/${result.policy.workflow}/runs?branch=main&event=schedule&per_page=1`, fetcher)
      if (!Array.isArray(runs.workflow_runs)) throw new Error('RUNS_INVALID')
      const run = runs.workflow_runs[0]
      if (run && (!Number.isSafeInteger(run.id) || run.event !== 'schedule' || run.head_branch !== 'main'
        || !dateValid(run.created_at) || Date.parse(run.created_at) > now()
        || !['queued', 'in_progress', 'completed', 'waiting', 'pending', 'requested'].includes(run.status)
        || (run.status === 'completed' && !['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'skipped', 'neutral', 'startup_failure', 'stale'].includes(run.conclusion ?? '')))) throw new Error('RUNS_INVALID')
      result.scheduledRun = run ? { id: run.id, event: run.event, head_branch: run.head_branch, created_at: run.created_at,
        run_started_at: dateValid(run.run_started_at) ? run.run_started_at : null, status: run.status, conclusion: run.conclusion } : null
    }),
    capture('NETLIFY', async () => {
      result.published = validatePublished(await publicJson(netlify, fetcher), site, now())
      result.latestProduction = latestProductionAttempt(await publicJson<PublicDeploy[]>(`${netlify}/deploys?production=true&per_page=20`, fetcher), site, result.published, now())
    }),
  ])
  if (result.policy && result.published && result.mainSha) {
    if (result.mainSha === result.published.commit_ref) result.webChanges = false
    else result.webChanges = await capture('COMPARE', async () => compareWebChanges(
      await publicJson(`${github}/compare/${result.published!.commit_ref}...${result.mainSha}`, fetcher), result.policy!, result.published!.commit_ref))
  }
  return result
}

// Memory only; no user data, localStorage, polling, or stale-on-error fallback.
const observations = new Map<string, { at: number; value: Promise<SiteDeploymentObservation> }>()
export function loadSiteDeployments(fetcher: Fetcher = fetch, now: () => number = Date.now, onObservation?: (value: SiteDeploymentObservation) => void) {
  return Promise.all(deploymentSites.map((site) => {
    const cached = observations.get(site.siteId)
    const validCache = fetcher === fetch && cached && now() - cached.at >= 0 && now() - cached.at < DEPLOYMENT_FRESH_MS
    const value = validCache ? cached.value : observeSiteDeployment(site, fetcher, now)
    if (fetcher === fetch && !validCache) observations.set(site.siteId, { at: now(), value })
    return value.then((observation) => { onObservation?.(observation); return observation })
  }))
}
export function clearSiteDeployments() { observations.clear() }
