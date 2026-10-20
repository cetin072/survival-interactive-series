import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { OperatorSiteDeployments } from './OperatorSiteDeployments'
import {
  deploymentSites, deploymentSlot, isDeploymentInput, compareWebChanges, validateSitePolicy,
  validatePublished, latestProductionAttempt, siteDeploymentSignal, formatDeploymentTime,
  deploymentCountdown, observeSiteDeployment, loadSiteDeployments, clearSiteDeployments,
  emptySiteObservation, type SiteReleasePolicy, type PublicDeploy, type SiteDeploymentObservation,
  NETLIFY_IGNORED_BUILD,
} from './operatorSiteDeployments'
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

describe('fixed 48-hour slots and Korean clock', () => {
  it.each([
    ['2026-10-19T08:20:00Z', '2026-10-21T08:20:00.000Z', false],
    ['2026-10-20T09:05:00Z', '2026-10-21T08:20:00.000Z', false],
    ['2026-10-21T08:19:59Z', '2026-10-21T08:20:00.000Z', false],
    ['2026-10-21T08:20:00Z', '2026-10-23T08:20:00.000Z', true],
    ['2026-10-22T08:19:59Z', '2026-10-23T08:20:00.000Z', true],
    ['2026-10-22T08:20:00Z', '2026-10-23T08:20:00.000Z', false],
    ['2026-10-31T09:00:00Z', '2026-11-02T08:20:00.000Z', true],
    ['2026-12-31T23:59:59Z', '2027-01-01T08:20:00.000Z', false],
    ['2027-01-01T08:20:00Z', '2027-01-03T08:20:00.000Z', true],
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
  it('hides technical details initially and separates failure from pending', () => {
    const markup = renderToStaticMarkup(createElement(OperatorSiteDeployments, { at: now,
      observations: deploymentSites.map((s) => ({ ...healthy(), site: s, policy: { ...policy, site_id: s.siteId, repository: s.repository } })),
    }))
    expect(markup.match(/class="operator-site-card"/g)).toHaveLength(3)
    expect(markup.match(/<details class="operator-tech-details">/g)).toHaveLength(3)
    expect(markup).not.toContain(' open=')
    expect(markup).not.toContain('work-notebook-app')
    expect(markup).not.toContain('· 23시 ·')
    expect(markup).toContain('10월 21일 (수) 오후 5:20')
  })
})
