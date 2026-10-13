import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OperatorDashboard, emptyInbox, type ProductionStatus, type SystemStatus } from './OperatorDashboard'

const systemStatus: SystemStatus = {
  archive: { dispatch_count: 1, latest_dispatch: null, cron: null },
  a_wiki: { job_count: 1, active_count: 1, published_count: 0, latest_job: { status: 'EXTRACTOR_READY', session_id: 'SESSION_007' } },
  visual: {
    job_count: 1,
    today_job_count: 1,
    today_success_count: 0,
    active_count: 1,
    latest_job: { status: 'PREPARED', subject_id: 'char-test' },
    prep_cron: null,
    retry_cron: null,
  },
  review: { pending_count: 0, automation_error_count: 0 },
  knowledge_semantic: { active_count: 0, latest_job: null, prep: null },
}

const productionStatus: ProductionStatus = {
  release: { source_main_sha: '1234567890abcdef1234567890abcdef12345678', released_on_kst: '2026-10-04' },
  deploy: { context: 'production', commit_ref: 'abcdef1234567890abcdef1234567890abcdef12' },
}

function renderDashboard(overrides: Partial<ComponentProps<typeof OperatorDashboard>> = {}) {
  return renderToStaticMarkup(createElement(OperatorDashboard, {
    email: 'operator@example.com',
    busy: false,
    refreshing: false,
    lastRefreshedAt: null,
    error: '',
    statusError: '',
    inbox: emptyInbox,
    systemStatus,
    productionStatus,
    selected: null,
    note: '',
    onNoteChange: () => {},
    onRefresh: () => {},
    onLoadDetail: () => {},
    onDecide: () => {},
    onSignOut: () => {},
    ...overrides,
  }))
}

function wikiCard(overrides: Partial<ComponentProps<typeof OperatorDashboard>>) {
  return renderDashboard(overrides).split('A-Wiki · 세계관 위키')[1].split('</article>')[0]
}

describe('Operator dashboard structure', () => {
  it('keeps exactly four automation boards and Production outside the grid', () => {
    const markup = renderDashboard()

    expect(markup).toContain('A · 기록 보관')
    expect(markup).toContain('A-Wiki · 세계관 위키')
    expect(markup).toContain('B · 일러스트')
    expect(markup).toContain('C · 생존 지식')
    expect(markup.match(/operator-system-card/g)).toHaveLength(4)
    expect(markup).toContain('operator-release-strip')
    expect(markup).toContain('실사이트 배포')
    expect(markup).toContain('기술 상세')
    expect(markup).toContain('7번째 기록 묶음')
    expect(markup).toContain('내용 추출 대기')
    expect(markup).not.toContain('C · Semantic')
    expect(markup).not.toContain('VISUAL METADATA')
  })

  it('separates reviewed and merged wiki work from public deployment without calling it posted', () => {
    const card = wikiCard({
      systemStatus: {
        ...systemStatus,
        a_wiki: {
          job_count: 3, active_count: 0, published_count: 3,
          latest_job: {
            status: 'PUBLISHED', season_id: 'S03', session_id: 'SESSION_008',
            merge_sha: '7'.repeat(40), completion_origin: 'EXTERNAL_REVIEWED_MERGE',
          },
        },
      },
    })
    expect(card).toContain('S03 · 8번째 기록 묶음')
    expect(card).toContain('<dt>내용 검수</dt><dd>검수 통과')
    expect(card).toContain('<dt>저장소 반영</dt><dd>반영 완료')
    expect(card).toContain('<dt>공개 사이트</dt><dd>배포 미확인')
    expect(card).not.toContain('게시 완료')
    expect(card).not.toContain('공개 반영 확인')
    expect(card).toContain('진행 0건 · 저장소 반영 3건')
    expect(card).toContain('다음 공개 원문 처리 대기')
    expect(card).not.toContain('새 원문 없음')
    expect(card).toContain('외부 검수·병합 결과 확인')
    expect(card).toContain('<details class="operator-tech-details">')
  })

  it('explains genuine independent human review without implying a disabled worker', () => {
    const reviewNote = '장태훈 관계의 경유 규격·품질 확인은 완료된 검사처럼 보일 수 있으나 원문은 일부 시료만 확인했다고 말합니다.'
    const card = wikiCard({ systemStatus: {
      ...systemStatus,
      a_wiki: {
        job_count: 4, active_count: 0, human_review_count: 1, published_count: 3,
        latest_job: {
          status: 'HUMAN_REVIEW', season_id: 'S04', session_id: 'SESSION_002',
          blocker_code: 'REVIEWER_HUMAN_REVIEW', review_decision: 'HUMAN_REVIEW',
          review_note: reviewNote,
        },
      },
    } })
    expect(card).toContain('내용 검수 보류')
    expect(card).toContain('처리 중 0건 · 검수 보류 1건 · 저장소 반영 3건')
    expect(card).toContain('콘텐츠 사실 확인 · 자동화 장애와 다름')
    expect(card).toContain('<dt>내용 검수</dt><dd>사람 검토 필요')
    expect(card).toContain('원문에 맞게 수정하고 독립 검수를 다시 통과')
    expect(card).toContain(reviewNote)
    expect(card).toContain('예약 ON/OFF는 이 화면에서 직접 확인할 수 없습니다')
    expect(card).toContain('표현 정정 후 독립 재검수')
    expect(card).not.toContain('현재 작업 확인 필요')
    expect(card).not.toContain('진행 0건 · 저장소 반영 3건')
    expect(card).not.toContain('자동화 꺼짐')
  })

  it('provides a safe fallback when the legacy operator API lacks reviewer details', () => {
    const card = wikiCard({ systemStatus: { ...systemStatus,
      a_wiki: { job_count: 4, active_count: 0, published_count: 3,
        latest_job: { status: 'HUMAN_REVIEW', blocker_code: 'REVIEWER_HUMAN_REVIEW' } },
    } })
    expect(card).toContain('검수 보류 1건')
    expect(card).toContain('독립 검수에서 원문보다 강하게 확정한 사실 표현')
    expect(card).toContain('자동화가 꺼졌다는 뜻은 아닙니다')
  })

  it('distinguishes program-level errors from content-review holds', () => {
    const card = wikiCard({ systemStatus: { ...systemStatus,
      a_wiki: { job_count: 2, active_count: 1, human_review_count: 0, published_count: 1,
        latest_job: { status: 'BLOCKED', blocker_code: 'A_WIKI_COMMAND_GH_1' } },
    } })
    expect(card).toContain('작업 장애 확인')
    expect(card).toContain('시스템 처리 오류 또는 검증 차단')
    expect(card).not.toContain('검수자가 지적한 내용')
  })

  it('reports unavailable wiki status without inventing zero jobs or a source waiting state', () => {
    const card = wikiCard({ systemStatus: { ...systemStatus, a_wiki: undefined } })
    expect(card).toContain('상태 조회 필요')
    expect(card).toContain('위키 실행 상태를 불러오지 못했습니다.')
    expect(card).not.toContain('실행 이력 없음')
    expect(card).not.toContain('진행 0건')
    expect(card).not.toContain('다음 공개 원문 처리 대기')
    expect(card).toContain('<dt>막힌 이유</dt><dd>조회 필요')
  })

  it.each(['NATIVE_REVIEWED_MERGE', 'NATIVE'] as const)('recognizes the ordinary native completion origin %s', (completion_origin) => {
    const card = wikiCard({
      systemStatus: {
        ...systemStatus,
        a_wiki: {
          job_count: 1, active_count: 0, published_count: 1,
          latest_job: { status: 'PUBLISHED', merge_sha: '7'.repeat(40), completion_origin },
        },
      },
    })
    expect(card).toContain('<dt>반영 방식</dt><dd>기본 위키 처리 경로')
    expect(card).not.toContain('<dt>반영 방식</dt><dd>기록 없음')
  })

  it('confirms public deployment only when production metadata identifies the same merged source', () => {
    const card = wikiCard({
      systemStatus: {
        ...systemStatus,
        a_wiki: {
          job_count: 1, active_count: 0, published_count: 1,
          latest_job: { status: 'PUBLISHED', merge_sha: productionStatus.release!.source_main_sha },
        },
      },
    })
    expect(card).toContain('<dt>공개 사이트</dt><dd>공개 반영 확인')
    expect(card).toContain('현재 사이트의 배포 원본이 이 위키의 저장소 반영 버전과 일치합니다.')
  })
})
