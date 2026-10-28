import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { OperatorSiteDeployments } from './OperatorSiteDeployments'
import {
  deploymentSites, deploymentSlot, isDeploymentInput, compareWebChanges, validateSitePolicy,
  validatePublished, latestProductionAttempt, siteDeploymentSignal, siteWebChangeSignal, formatDeploymentTime,
  deploymentCountdown, observeSiteDeployment, loadSiteDeployments, clearSiteDeployments,
  emptySiteObservation, type SiteReleasePolicy, type PublicDeploy, type SiteDeploymentObservation,
  NETLIFY_IGNORED_BUILD,
} from './siteDeploymentStatus'
import survivalPolicy from '../../../automation/release-policy.json'

const site = deploymentSites[1]
const policy = survivalPolicy as SiteReleasePolicy
const now = Date.parse('2026-10-20T09:05:00Z')
const sha = 'a'.repeat(40), main = 'b'.repeat(40)
const published: PublicDeploy = { id: 'a'.repeat(24), site_id: site.siteId, context: 'production', state: 'ready', branch: 'main', commit_ref: sha,
  created_at: '2026-10-19T08:00:00Z', published_at: '2026-10-19T08:04:00Z' }
const healthy = (): SiteDeploymentObservation => ({ ...emptySiteObservation(site, new Date(now).toISOString()), policy,
  published, mainSha: sha, webChanges: false })
const compare = { status: 'ahead', base_commit: { sha }, merge_base_commit: { sha }, files: [] as { filename: string; previous_filename?: string }[] }

describe('fixed 72-hour slots and Korean clock', () => {
  it.each([
    ['2026-10-19T08:20:00Z', '2026-10-22T08:20:00.000Z', false],
    ['2026-10-20T09:05:00Z', '2026-10-22T08:20:00.000Z', false],
    ['2026-10-22T08:19:59Z', '2026-10-22T08:20:00.000Z', false],
    ['2026-10-22T08:20:00Z', '2026-10-25T08:20:00.000Z', true],
    ['2026-10-23T08:19:59Z', '2026-10-25T08:20:00.000Z', true],
    ['2026-10-23T08:20:00Z', '2026-10-25T08:20:00.000Z', false],
    ['2026-10-31T09:00:00Z', '2026-11-03T08:20:00.000Z', true],
    ['2026-12-31T23:59:59Z', '2027-01-02T08:20:00.000Z', false],
    ['2027-01-02T08:20:00Z', '2027-01-05T08:20:00.000Z', true],
  ])('uses the original epoch at %s', (at, next, active) => {
    const result = deploymentSlot(policy, Date.parse(at))!
    expect(result.next).toBe(next)
    expect(!!result.currentStart).toBe(active)
  })
  it('rejects inconsistent schedule rather than using old release_hour_kst', () => {
    expect(deploymentSlot({ ...policy, schedule_interval_hours: 24 }, now)).toBeNull()
    expect(() => validateSitePolicy({ ...policy, schedule_window_hours: 2 }, site)).toThrow()
    expect(() => validateSitePolicy({ ...policy, repository: 'cetin072/work-notebook-app' }, site)).toThrow()
    expect(() => validateSitePolicy({ ...policy, deploy_inputs: ['['] }, site)).toThrow()
  })
  it('formats Seoul time regardless of host timezone', () => {
    expect(formatDeploymentTime('2026-10-21T08:20:00Z')).toBe('10월 21일 (수) 오후 5:20')
    expect(deploymentCountdown('2026-10-21T08:20:00Z', now)).toBe('다음 배포 기준 시각까지 23시간 15분')
  })
})

describe('deployment file scope matches the scheduler', () => {
  it('ignores marker, generated metadata, docs and tests', () => {
    for (const name of ['archive/web/public/release/production.json', 'archive/web/public/deploy-meta.json', 'docs/notes.md',
      'archive/web/src/archive/OperatorDashboard.test.tsx', 'archive/web/tests/scenario.ts', 'archive/web/README.md']) expect(isDeploymentInput(policy, name)).toBe(false)
    expect(isDeploymentInput(policy, 'archive/web/src/archive/OperatorDashboard.tsx')).toBe(true)
  })
  it('distinguishes a documentation-only main from web changes and renames out of scope', () => {
    expect(compareWebChanges({ ...compare, files: [{ filename: 'docs/a.md' }] }, policy, sha)).toBe(false)
    expect(compareWebChanges({ ...compare, files: [{ filename: 'archive/web/src/app.tsx' }] }, policy, sha)).toBe(true)
    expect(compareWebChanges({ ...compare, files: [{ filename: 'docs/old.tsx', previous_filename: 'archive/web/src/app.tsx' }] }, policy, sha)).toBe(true)
  })
  it('never infers no change from truncated, diverged, or mismatched comparisons', () => {
    expect(() => compareWebChanges({ ...compare, files: Array(300).fill({ filename: 'docs/a.md' }) }, policy, sha)).toThrow()
    expect(() => compareWebChanges({ ...compare, status: 'diverged' }, policy, sha)).toThrow()
    expect(() => compareWebChanges({ ...compare, merge_base_commit: { sha: main } }, policy, sha)).toThrow()
  })
})

describe('actual Production evidence', () => {
  it.each([
    { ...published, context: 'deploy-preview' }, { ...published, state: 'building' },
    { ...published, published_at: null }, { ...published, commit_ref: 'main' },
    { ...published, published_at: '2026-10-30T00:00:00Z' }, { ...published, site_id: deploymentSites[0].siteId },
  ])('rejects invalid published evidence %o', (d) => {
    expect(() => validatePublished({ id: site.siteId, published_deploy: d }, site, now)).toThrow()
  })
  it('does not treat a Preview build as a Production attempt', () => {
    expect(latestProductionAttempt([{ ...published, id: 'c'.repeat(24), context: 'deploy-preview', created_at: '2026-10-20T08:00:00Z' }, published], site, published, now)).toBeNull()
  })
  it('does not turn an explicitly skipped Production build into a release failure', () => {
    const skipped = { ...published, id: 'c'.repeat(24), state: 'error', skipped: true, created_at: '2026-10-20T08:00:00Z' }
    expect(latestProductionAttempt([skipped, published], site, published, now)).toBeNull()
    expect(latestProductionAttempt([{ ...skipped, skipped: false }, published], site, published, now)?.state).toBe('error')
  })
  it('recognizes the exact live Netlify ignore result without hiding genuine errors or inventing no changes', () => {
    const ignored = { ...published, id: 'c'.repeat(24), state: 'error', skipped: null,
      error_message: NETLIFY_IGNORED_BUILD, created_at: '2026-10-20T08:00:00Z' }
    const latest = latestProductionAttempt([ignored, published], site, published, now)
    expect(latest).toBeNull()
    expect(siteDeploymentSignal({ ...healthy(), latestProduction: latest, mainSha: main, webChanges: true }, now).label).toBe('배포 대기')
    expect(latestProductionAttempt([{ ...ignored, error_message: 'Build command failed' }, published], site, published, now)?.state).toBe('error')
  })
  it('keeps ready-but-unpublished distinct from published', () => {
    const d = { ...published, id: 'c'.repeat(24), created_at: '2026-10-20T08:00:00Z', published_at: null }
    const attempt = latestProductionAttempt([d, published], site, published, now)
    expect(siteDeploymentSignal({ ...healthy(), latestProduction: attempt }, now).label).toBe('상태 조회 불가')
  })
})

describe('truthful status signals', () => {
  it.each([
    [{}, '배포 완료'],
    [{ mainSha: main }, '배포할 변경 없음'],
    [{ mainSha: main, webChanges: true }, '배포 대기'],
    [{ webChanges: null }, '상태 조회 불가'],
    [{ errors: ['NETLIFY: HTTP_429'] }, '상태 조회 불가'],
    [{ checkedAt: new Date(now - 120_000).toISOString() }, '상태 조회 불가'],
    [{ checkedAt: new Date(now + 1).toISOString() }, '상태 조회 불가'],
    [{ latestProduction: { ...published, state: 'building' } }, '배포 진행 중'],
    [{ latestProduction: { ...published, state: 'error' } }, '배포 실패·확인 필요'],
  ] as [Partial<SiteDeploymentObservation>, string][])('classifies %o', (patch, label) => {
    expect(siteDeploymentSignal({ ...healthy(), ...patch }, now).label).toBe(label)
  })
  it('a successful scheduled action cannot prove publication; an old failure cannot poison a new publication', () => {
    const run = { id: 1, event: 'schedule', head_branch: 'main', created_at: '2026-10-20T08:00:00Z', status: 'completed', conclusion: 'success' }
    expect(siteDeploymentSignal({ ...healthy(), mainSha: main, webChanges: true, scheduledRun: run }, now).label).toBe('배포 대기')
    expect(siteDeploymentSignal({ ...healthy(), scheduledRun: { ...run, conclusion: 'failure' } }, now).label).toBe('배포 실패·확인 필요')
    expect(siteDeploymentSignal({ ...healthy(), scheduledRun: { ...run, conclusion: 'failure', created_at: '2026-10-18T00:00:00Z' } }, now).label).toBe('배포 완료')
  })
  it('elapsed 48 hours alone is never failure', () => {
    expect(siteDeploymentSignal({ ...healthy(), published: { ...published, published_at: '2026-10-17T08:04:00Z' }, webChanges: true }, now).label).toBe('배포 대기')
  })
})

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function fixtureFetcher(failSite = '') {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('omit')
    expect(init?.headers).toBeUndefined()
    expect(init?.signal).toBeDefined()
    const s = deploymentSites.find((s) => url.includes(s.siteId) || url.includes(s.repository))!
    if (s.siteId === failSite) return response({}, 429)
    const p = { ...policy, repository: s.repository, site_id: s.siteId }
    const d = { ...published, site_id: s.siteId }
    if (url.endsWith('/git/ref/heads/main')) return response({ object: { sha: main } })
    if (url.includes('/contents/')) return response({ encoding: 'base64', content: btoa(JSON.stringify(p)) })
    if (url.includes('/actions/')) return response({ workflow_runs: [] })
    if (url.includes('/compare/')) return response({ ...compare, files: [{ filename: 'docs/a.md' }] })
    if (url.includes('/deploys?')) return response([d])
    return response({ id: s.siteId, published_deploy: d })
  })
}
afterEach(() => { clearSiteDeployments(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('independent web-publication and release-execution signals', () => {
  it('shows verified pending web changes when Netlify hides a historical cancellation reason', () => {
    const observation = { ...healthy(), mainSha: main, webChanges: true,
      errors: ['NETLIFY: DEPLOY_DETAIL_INCOMPLETE'] }
    expect(siteWebChangeSignal(observation, now).label).toBe('웹 변경 반영 대기')
    expect(siteDeploymentSignal(observation, now).label).toBe('상태 조회 불가')
    const markup = renderToStaticMarkup(createElement(OperatorSiteDeployments, { at: now, observations: [observation] }))
    expect(markup).toContain('<strong>웹 반영 상태</strong>')
    expect(markup).toContain('<strong>배포 실행 상태</strong>')
    expect(markup).toContain('operator-status-badge warning')
    expect(markup).toContain('웹 변경 반영 대기')
    expect(markup).toContain('상태 조회 불가')
    expect(markup).toContain('최근 배포 시도의 실패·정책상 취소 사유')
  })
  it('does not upgrade an unknown or expired web comparison into a green badge', () => {
    expect(siteWebChangeSignal({ ...healthy(), webChanges: null }, now).label).toBe('웹 반영 확인 불가')
    expect(siteWebChangeSignal({ ...healthy(), checkedAt: new Date(now - 120_000).toISOString() }, now).label).toBe('웹 반영 확인 불가')
    expect(siteWebChangeSignal({ ...healthy(), mainSha: main, webChanges: false,
      errors: ['NETLIFY: DEPLOY_DETAIL_INCOMPLETE'] }, now).label).toBe('웹 배포 대상 변경 없음')
    expect(siteWebChangeSignal({ ...healthy() }, now).label).toBe('최신 웹 반영 확인')
  })
  it('prioritizes a confirmed failed scheduled run even if unrelated Netlify cancel details are missing', () => {
    const observation: SiteDeploymentObservation = { ...healthy(), mainSha: main, webChanges: true,
      errors: ['NETLIFY: DEPLOY_DETAIL_INCOMPLETE'],
      scheduledRun: { id: 42, event: 'schedule', head_branch: 'main',
        created_at: '2026-10-20T08:00:00Z', status: 'completed', conclusion: 'failure' } }
    expect(siteDeploymentSignal(observation, now).label).toBe('배포 실패·확인 필요')
    expect(siteWebChangeSignal(observation, now).label).toBe('웹 변경 반영 대기')
    const markup = renderToStaticMarkup(createElement(OperatorSiteDeployments, { at: now, observations: [observation] }))
    expect(markup).toContain('operator-status-badge danger')
    expect(markup).toContain('배포 실패·확인 필요')
    expect(markup).toContain('웹 변경 반영 대기')
  })
  it('marks a proven Production build as in progress without reclassifying pending web files as deployed', () => {
    const observation: SiteDeploymentObservation = { ...healthy(), mainSha: main, webChanges: true,
      latestProduction: { ...published, state: 'building' } }
    expect(siteDeploymentSignal(observation, now).label).toBe('배포 진행 중')
    expect(siteWebChangeSignal(observation, now).label).toBe('웹 변경 반영 대기')
  })
})

describe('bounded, isolated public reads', () => {
  it('pins policies and compares actual Production rather than metadata/merge times', async () => {
    const fetcher = fixtureFetcher()
    const o = await observeSiteDeployment(site, fetcher, () => now)
    expect(o.errors).toEqual([])
    expect(o.webChanges).toBe(false)
    expect(fetcher.mock.calls.some(([u]) => String(u).includes(`ref=${main}`))).toBe(true)
    expect(siteDeploymentSignal(o, now).label).toBe('배포할 변경 없음')
  })
  it('one rate-limited site cannot suppress the other two', async () => {
    const seen: string[] = []
    const rows = await loadSiteDeployments(fixtureFetcher(deploymentSites[0].siteId), () => now, (o) => seen.push(o.site.name))
    expect(seen).toHaveLength(3)
    expect(rows.map((o) => siteDeploymentSignal(o, now).label)).toEqual(['상태 조회 불가', '배포할 변경 없음', '배포할 변경 없음'])
  })
  it('reads recent error details because the actual list endpoint omits ignore reasons', async () => {
    const base = fixtureFetcher()
    const ignored = { ...published, id: 'c'.repeat(24), state: 'error', skipped: null,
      created_at: '2026-10-20T08:00:00Z', published_at: null }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/deploys?')) return response([ignored, published])
      if (String(input).endsWith(`/deploys/${ignored.id}`)) return response({ ...ignored, error_message: NETLIFY_IGNORED_BUILD })
      return base(input, init)
    })
    const o = await observeSiteDeployment(site, fetcher, () => now)
    expect(o.errors).toEqual([])
    expect(o.latestProduction).toBeNull()
    expect(siteDeploymentSignal(o, now).label).toBe('배포할 변경 없음')
    expect(fetcher.mock.calls.some(([u]) => String(u).endsWith(`/deploys/${ignored.id}`))).toBe(true)
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).includes('/deploys?')) return response([ignored, published])
      if (String(input).endsWith(`/deploys/${ignored.id}`)) return response(ignored)
      return base(input, init)
    })
    const incomplete = await observeSiteDeployment(site, fetcher, () => now)
    expect(incomplete.errors).toContain('NETLIFY: DEPLOY_DETAIL_INCOMPLETE')
    expect(siteDeploymentSignal(incomplete, now).label).toBe('상태 조회 불가')
  })
  it('shows an actual current Production build without requiring older error reasons', async () => {
    const base = fixtureFetcher()
    const older = { ...published, id: 'c'.repeat(24), state: 'error', published_at: null, created_at: '2026-10-20T07:00:00Z' }
    const building = { ...older, id: 'd'.repeat(24), state: 'building', created_at: '2026-10-20T08:00:00Z' }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/deploys?')) return response([building, older, published])
      if (String(input).includes('/api/v1/deploys/')) throw new Error('Older details unavailable')
      return base(input, init)
    })
    const o = await observeSiteDeployment(site, fetcher, () => now)
    expect(o.errors).toEqual([])
    expect(siteDeploymentSignal(o, now).label).toBe('배포 진행 중')
  })
  it('cache hits do not extend freshness; failed refresh never restores old success', async () => {
    let time = now
    const fetcher = fixtureFetcher()
    vi.stubGlobal('fetch', fetcher)
    await loadSiteDeployments(fetcher, () => time)
    const calls = fetcher.mock.calls.length
    time += 60_000
    await loadSiteDeployments(fetcher, () => time)
    expect(fetcher).toHaveBeenCalledTimes(calls)
    time += 61_000
    fetcher.mockImplementation(async () => response({}, 503))
    const rows = await loadSiteDeployments(fetcher, () => time)
    expect(fetcher.mock.calls.length).toBeGreaterThan(calls)
    expect(rows.every((o) => siteDeploymentSignal(o, time).label === '상태 조회 불가')).toBe(true)
  })
  it('an aborted external request fails closed', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('ABORTED')))
    }))
    const pending = observeSiteDeployment(site, fetcher, () => now)
    await vi.advanceTimersByTimeAsync(8_001)
    const row = await pending
    expect(row.errors).toHaveLength(2)
    expect(siteDeploymentSignal(row, now).label).toBe('상태 조회 불가')
  })
})

describe('three-site presentation', () => {
  it('preserves independently verified repository facts while the overall deployment state is unavailable', () => {
    const markup = renderToStaticMarkup(createElement(OperatorSiteDeployments, { at: now,
      observations: [{ ...healthy(), mainSha: main, webChanges: true, errors: ['NETLIFY: DEPLOY_DETAIL_INCOMPLETE'] }],
    }))
    expect(markup).toContain('웹 변경 반영 대기')
    expect(markup).toContain('실패·정책상 취소 사유가 공개 자료에 없어')
    expect(markup).toContain('상태 조회 불가')
  })
  it('hides technical details initially and separates failure from pending', () => {
    const markup = renderToStaticMarkup(createElement(OperatorSiteDeployments, { at: now,
      observations: deploymentSites.map((s) => ({ ...healthy(), site: s, policy: { ...policy, site_id: s.siteId, repository: s.repository } })),
    }))
    expect(markup.match(/class="operator-site-card"/g)).toHaveLength(3)
    expect(markup.match(/<details class="operator-tech-details">/g)).toHaveLength(3)
    expect(markup).not.toContain(' open=')
    expect(markup).not.toContain('work-notebook-app')
    expect(markup).not.toContain('· 23시 ·')
    expect(markup).toContain('10월 22일 (목) 오후 5:20')
  })
})

it('excludes disabled worklog from shared schedule, retains server status and exposes authenticated workflow links', () => {
  const observations = deploymentSites.map((entry, i) => ({ ...healthy(), site: entry,
    policy: { ...policy, schedule_enabled: i !== 2, workflow: i === 1 ? 'archive-production-release.yml' : 'production-release.yml' } }))
  expect(deploymentSlot(observations[2].policy, now)).toBeNull()
  const html = renderToStaticMarkup(createElement(OperatorSiteDeployments, { observations, at: now }))
  expect(html).toContain('정기 배포 제외')
  expect(html).toContain('10월 22일 (목) 오후 5:20')
  expect(html).not.toContain('공개 간격 최소 48시간')
  expect(html.match(/>즉시 배포<\/a>/g)).toHaveLength(3)
  expect(html).toContain('/actions/workflows/archive-production-release.yml')
  expect(html).toContain('main → deploy-now → Run workflow')
})
