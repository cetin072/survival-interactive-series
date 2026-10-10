import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BunkerOsDashboardView, type BunkerOsDashboard } from './OperatorBunkerOsDashboard'

const dashboard: BunkerOsDashboard = {
  current_cycle: 'MONTH01_FIND_THE_ENGINE',
  total_count: 3,
  completed_count: 1,
  blocked_count: 0,
  approval_count: 1,
  latest_at: '2026-10-10T13:00:00Z',
  logs: [{
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
      invalidated_hypotheses: ['글 수를 늘리는 것만으로 차별화된다는 가설은 약함'],
      source_candidates: [{ title: 'Example', url: 'https://example.com', note: '도구형 서비스' }],
      decision_candidates: ['Week 2는 행동도구 1개에 집중'],
      experiment_candidates: ['가족 비상연락표 CTA'],
      approvals: [{ title: '분석도구 도입', reason: '행동 집계', cost: '월 2만원' }],
      next_actions: ['수익지도 작성'],
    },
    occurred_at: '2026-10-10T13:00:00Z',
  }],
}

describe('Bunker OS supervisor dashboard', () => {
  it('shows current cycle, useful work log and approval requests without edit controls', () => {
    const markup = renderToStaticMarkup(createElement(BunkerOsDashboardView, {
      email: 'operator@example.com',
      busy: false,
      error: '',
      dashboard,
      onRefresh: () => {},
      onSignOut: () => {},
    }))
    expect(markup).toContain('감독 대시보드')
    expect(markup).toContain('Month 01 · FIND THE ENGINE')
    expect(markup).toContain('시장지도 조사')
    expect(markup).toContain('핵심 발견')
    expect(markup).toContain('감독 승인 필요')
    expect(markup).toContain('월 2만원')
    expect(markup).toContain('https://example.com')
    expect(markup).not.toContain('textarea')
  })
})
