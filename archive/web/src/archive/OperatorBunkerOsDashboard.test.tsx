import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  BunkerOsDashboardView,
  BunkerOsLogDetailView,
  BunkerOsLogListView,
  bunkerPageFromPath,
  type BunkerOsDashboard,
  type BunkerOsLog,
} from './OperatorBunkerOsDashboard'

const log: BunkerOsLog = {
  id: '11111111-1111-4111-8111-111111111111',
  cycle_key: 'MONTH01_FIND_THE_ENGINE',
  phase: 'WEEK_1_FIND_THE_GAME',
  day_index: 2,
  status: 'APPROVAL_REQUIRED',
  title: '시장지도 조사',
  summary: '경쟁 서비스와 수익모델을 비교했습니다.',
  details: {
    actions: ['해외 서비스 5곳 조사'],
    findings: ['정보보다 실행 도구가 반복 사용에 유리한 후보'],
    invalidated_hypotheses: ['글 수만 늘리면 차별화된다는 생각은 약함'],
    source_candidates: [{ title: 'Example', url: 'https://example.com', note: '도구형 서비스', category: 'BUSINESS_STRATEGY' }],
    decision_candidates: ['2주차는 행동도구 1개에 집중'],
    experiment_candidates: ['가족 비상연락표 버튼'],
    approvals: [{ title: '분석도구 도입', reason: '행동 집계', cost: '월 2만원' }],
    next_actions: ['수익지도 작성'],
  },
  occurred_at: '2026-10-10T13:00:00Z',
}

const dashboard: BunkerOsDashboard = {
  current_cycle: 'MONTH01_FIND_THE_ENGINE',
  total_count: 3, running_count: 1, completed_count: 1, blocked_count: 0, approval_count: 1,
  latest_at: log.occurred_at,
  logs: [log],
}

describe('Bunker OS supervisor dashboard v1.1', () => {
  it('keeps the first screen short and makes status boards clickable', () => {
    const markup = renderToStaticMarkup(createElement(BunkerOsDashboardView, {
      email: 'operator@example.com', busy: false, error: '', dashboard,
      onRefresh: () => {}, onSignOut: () => {},
    }))
    expect(markup).toContain('첫 달 · 돈이 되는 엔진 찾기')
    expect(markup).toContain('href="/operator/bunker-os/running/"')
    expect(markup).toContain('href="/operator/bunker-os/review/"')
    expect(markup).toContain('href="/operator/bunker-os/completed/"')
    expect(markup).toContain('모아둔 자료 보기')
    expect(markup).toContain('최근 작업')
    expect(markup).not.toContain('중요하게 알아낸 것')
  })

  it('renders a board-style filtered list that links to dedicated detail pages', () => {
    const markup = renderToStaticMarkup(createElement(BunkerOsLogListView, {
      email: 'operator@example.com', busy: false, error: '',
      list: { total_count: 1, logs: [log] }, filter: 'APPROVAL_REQUIRED',
      onRefresh: () => {}, onSignOut: () => {},
    }))
    expect(markup).toContain('내 확인이 필요한 작업')
    expect(markup).toContain('/operator/bunker-os/log/11111111-1111-4111-8111-111111111111/')
    expect(markup).toContain('상세 글 보기')
  })

  it('shows easy Korean labels and a human-check completion button on detail', () => {
    const markup = renderToStaticMarkup(createElement(BunkerOsLogDetailView, {
      email: 'operator@example.com', busy: false, error: '', log, note: '',
      onNoteChange: () => {}, onMarkReviewed: () => {}, onRefresh: () => {}, onSignOut: () => {},
    }))
    expect(markup).toContain('중요하게 알아낸 것')
    expect(markup).toContain('생각이 바뀐 점')
    expect(markup).toContain('모아둔 자료')
    expect(markup).toContain('판단할 것')
    expect(markup).toContain('시험해볼 것')
    expect(markup).toContain('내 확인이 필요한 것')
    expect(markup).toContain('확인 완료')
    expect(markup).toContain('사업·전략')
    expect(markup).not.toContain('Source 후보')
    expect(markup).not.toContain('Experiment 후보')
  })

  it('routes Bunker OS subpages without changing the Archive router contract', () => {
    expect(bunkerPageFromPath('/operator/bunker-os/')).toEqual({ kind: 'dashboard' })
    expect(bunkerPageFromPath('/operator/bunker-os/running/')).toEqual({ kind: 'list', filter: 'RUNNING' })
    expect(bunkerPageFromPath('/operator/bunker-os/review/')).toEqual({ kind: 'list', filter: 'APPROVAL_REQUIRED' })
    expect(bunkerPageFromPath('/operator/bunker-os/sources/')).toEqual({ kind: 'sources' })
    expect(bunkerPageFromPath('/operator/bunker-os/log/11111111-1111-4111-8111-111111111111/')).toEqual({ kind: 'detail', id: '11111111-1111-4111-8111-111111111111' })
  })
})
