import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OperatorDashboard, emptyInbox, knowledgeReviewEditorHref, type ProductionStatus, type SystemStatus, type ReviewItem, type ReviewDetail } from './OperatorDashboard'

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
    expect(markup).toContain('주요 사이트 · 48시간 배포 현황')
    expect(markup.match(/class="operator-site-card"/g)).toHaveLength(3)
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
    expect(card).toContain('처리 중 0건 · 검수 보류 0건 · 저장소 반영 3건')
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
    const wholeDashboard = renderDashboard({ systemStatus: {
      ...systemStatus,
      a_wiki: { job_count: 4, active_count: 0, human_review_count: 1, published_count: 3,
        latest_job: { status: 'HUMAN_REVIEW', blocker_code: 'REVIEWER_HUMAN_REVIEW' } },
    } })
    expect(wholeDashboard).toContain('<span>사람이 확인할 항목</span><strong>1</strong>')
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

function knowledgeCard(c: NonNullable<SystemStatus['knowledge_semantic']>) {
  return renderDashboard({ systemStatus: { ...systemStatus, knowledge_semantic: c } })
    .split('C · 생존 지식')[1].split('</article>')[0]
}
const healthyC = { active_count: 0, machine_active_count: 0, human_review_count: 0,
  unresolved_blocked_count: 0, machine_stalled_count: 0, latest_job: null, prep: null }
describe('C live runtime contract', () => {
  it('does not report normal or infer machine activity from a legacy DB contract', () => {
    const card = knowledgeCard({ active_count: 2, latest_job: { status: 'HOLD' }, prep: null })
    expect(card).toContain('상태 조회 필요')
    expect(card).toContain('<dt>진행 중</dt><dd>조회 필요')
    expect(card).toContain('<dt>현재 복구할 오류</dt><dd>조회 필요')
  })

  it('two human reviews occupy no machine slot and are not stalled even when old', () => {
    const card = knowledgeCard({ ...healthyC, human_review_count: 2,
      latest_job: { status: 'HUMAN_REVIEW', brief_id: 'K-018', stalled_code: 'KNOWLEDGE_PR_STALLED' } })
    expect(card).toContain('사람 검토 2건')
    expect(card).toContain('<dt>진행 중</dt><dd>0건')
    expect(card).toContain('<dt>사람 검토 대기</dt><dd>2건')
    expect(card).toContain('<dt>현재 복구할 오류</dt><dd>0건')
    expect(card).toContain('사람 검토 대기')
    expect(card).not.toContain('확인 필요')
    expect(card).not.toContain('KNOWLEDGE_PR_STALLED')
  })
  it('normal duplicate HOLD uses live K-024 instead of static K-010', () => {
    const card = knowledgeCard({ ...healthyC,
      latest_job: { status: 'HOLD', brief_id: 'K-024', blocker_code: 'SEMANTIC_DUPLICATE' },
      latest_published_job: { brief_id: 'K-021', status: 'PUBLISHED' } })
    expect(card).toContain('K-024 · 중복으로 보류')
    expect(card).toContain('<dt>최근 저장소 반영</dt><dd>K-021')
    expect(card).toContain('<dt>막힌 이유</dt><dd>없음')
    expect(card).not.toContain('K-010')
    expect(card).not.toContain('확인 필요')
    expect(card).not.toContain('기술 상세 확인이 필요합니다.')
  })
  it('latest HOLD cannot hide two actionable Finalizer errors', () => {
    const card = knowledgeCard({ ...healthyC, human_review_count: 2, unresolved_blocked_count: 2,
      latest_job: { brief_id: 'K-024', status: 'HOLD', disposition_code: 'SEMANTIC_DUPLICATE' },
      latest_blocked_job: { brief_id: 'K-023', status: 'BLOCKED', blocker_code: 'KNOWLEDGE_CONTRACT', blocker_stage: 'FINALIZER' } })
    expect(card).toContain('작업 장애 2건')
    expect(card).toContain('<dt>현재 복구할 오류</dt><dd>2건')
    expect(card).toContain('<dt>최근 오류</dt><dd>K-023')
    expect(card).toContain('지식 글 형식 검증에서 문제가 발견됐습니다.')
    expect(card).toContain('FINALIZER')
  })
  it('machine stall outranks human review and latest normal HOLD', () => {
    const card = knowledgeCard({ ...healthyC, machine_active_count: 1, human_review_count: 2, machine_stalled_count: 1,
      latest_job: { brief_id: 'K-024', status: 'HOLD' },
      latest_stalled_job: { brief_id: 'K-022', status: 'PR_OPEN', stalled_code: 'KNOWLEDGE_PR_STALLED' } })
    expect(card).toContain('작업 장애 1건')
    expect(card).toContain('<dt>현재 복구할 오류</dt><dd>1건')
  })
})

describe('Resolved incidents render as normal progress instead of current failures', () => {
  it('keeps the merged A-Wiki success distinct from the next Production deploy', () => {
    const card = wikiCard({ systemStatus: { ...systemStatus, a_wiki: {
      job_count: 4, active_count: 0, human_review_count: 0, published_count: 4,
      latest_job: { status: 'PUBLISHED', season_id: 'S04', session_id: 'SESSION_002', merge_sha: 'a'.repeat(40) },
    } } })
    expect(card).toContain('저장소 반영 완료')
    expect(card).toContain('<dt>공개 사이트</dt><dd>배포 미확인')
    expect(card).not.toContain('작업 장애 확인')
  })
  it('recognizes B PREPARED as waiting rather than a prior job fault', () => {
    const page = renderDashboard({ systemStatus: { ...systemStatus,
      visual: { ...systemStatus.visual, active_count: 1,
        latest_job: { status: 'PREPARED', title: '오세훈', subject_id: 'char-sehoon' } },
    } })
    const card = page.split('B · 일러스트')[1].split('</article>')[0]
    expect(card).toContain('이미지 생성 대기')
    expect(card).toContain('오세훈')
    expect(card).toContain('이전 이미지의 차단·재시도 이력은 보존')
    expect(card).not.toContain('복구 필요')
  })
  it('keeps seven C human-review drafts out of the active error count', () => {
    const card = knowledgeCard({ ...healthyC, human_review_count: 7,
      latest_job: { status: 'HUMAN_REVIEW', brief_id: 'K-029' },
      latest_published_job: { status: 'PUBLISHED', brief_id: 'K-023' } })
    expect(card).toContain('사람 검토 7건')
    expect(card).toContain('<dt>현재 복구할 오류</dt><dd>0건')
    expect(card).toContain('새 원고 제작')
    expect(card).not.toContain('작업 장애')
  })
})


describe('C human review uses one editable route', () => {
  const reviewId = '263d256d-2cf8-45cf-82fb-98aab2e52d12'
  const jobId = 'c8da8c82-c60c-4dd9-9556-b3f0d08c9507'
  const review: ReviewItem = {
    id: reviewId, source_worker: 'C_KNOWLEDGE', item_type: 'KNOWLEDGE',
    chronicle_id: null, priority: 'P1', title: '긴급 복구 요청의 우선순위는 어떻게 정할까',
    summary: 'Generic machine review note', risk_level: 'HIGH',
    source_ref: 'https://github.com/cetin072/survival-interactive-series', status: 'PENDING',
    created_at: '2026-10-21T10:00:00Z',
  }
  const jobs = { [reviewId]: jobId }
  it('opens the exact existing editor and omits generic one-click approval for C', () => {
    const selected: ReviewDetail = {
      ...review, payload: {}, updated_at: review.created_at,
      decided_at: null, decision_note: null, decision_history: [],
    }
    const markup = renderDashboard({
      inbox: { ...emptyInbox, pending_count: 1, items: [review] },
      knowledgeReviewJobs: jobs, selected,
    })
    expect(markup).toContain('href="/operator/knowledge/' + jobId + '/"')
    expect(markup).toContain('원고 읽기 · 수정 · 발행 요청')
    expect(markup).toContain('여기에서는 바로 승인하지 않습니다')
    expect(markup).not.toMatch(/<button[^>]*>승인<\/button>/)
  })
  it('fails closed to the existing inbox if a job is unresolved', () => {
    expect(knowledgeReviewEditorHref(review, {})).toBe('/operator/knowledge/')
    expect(knowledgeReviewEditorHref(review, { [reviewId]: '../unsafe' })).toBe('/operator/knowledge/')
    expect(knowledgeReviewEditorHref({ ...review, source_worker: 'A_WIKI' }, jobs)).toBeNull()
  })
  it('retains ordinary non-C review buttons and decisions', () => {
    const other = { ...review, source_worker: 'A_WIKI' }
    const markup = renderDashboard({
      inbox: { ...emptyInbox, pending_count: 1, items: [other] },
      selected: { ...other, payload: {}, updated_at: other.created_at, decided_at: null, decision_note: null, decision_history: [] },
      knowledgeReviewJobs: jobs,
    })
    expect(markup).toMatch(/<button[^>]*>승인<\/button>/)
  })
})

describe('audit regressions: independent execution and current observation', () => {
  const observation = (conclusion: string) => ({ checkedAt: new Date().toISOString(), error: false,
    run: { id: 1, status: 'completed', conclusion, createdAt: new Date().toISOString(), url: 'https://github.com/cetin072/survival-interactive-series/actions/runs/1' } })
  it('latest Prepare failure outranks a successful old B job and successful dispatch', () => {
    const page = renderDashboard({ workflows: { visual: observation('failure') }, systemStatus: {
      ...systemStatus, visual: { ...systemStatus.visual, latest_job: { status: 'SUCCEEDED' },
        prep_cron: { active: true, last_status: 'succeeded' }, retry_cron: { active: true, last_status: 'succeeded' } },
    } })
    const card = page.split('B · 일러스트')[1].split('</article>')[0]
    expect(card).toContain('operator-status-badge danger')
    expect(card).toContain('최근 실행 실패')
    expect(card).toContain('마지막 생성 작업')
    expect(card).not.toContain('준비·재시도 정상')
    expect(card).not.toContain('<dt>현재 장애</dt><dd>없음')
  })
  it('dispatch success alone cannot imply successful A-Core processing', () => {
    const page = renderDashboard({ systemStatus: { ...systemStatus, archive: { ...systemStatus.archive, cron: {active: true,last_status: 'succeeded'} } } })
    const card = page.split('A · 기록 보관')[1].split('</article>')[0]
    expect(card).toContain('실행 결과 조회 불가')
    expect(card).not.toContain('정상 작동')
  })
  it('shows continuous review errors and approvals even when the old native job is published', () => {
    const card = wikiCard({ systemStatus: { ...systemStatus, a_wiki: { ...systemStatus.a_wiki!, latest_job: {status:'PUBLISHED'},
      continuous_review: {worker_connected:false,last_scan_at:null,next_status:'EXISTING_JOB',current_chronicle_id:'C01',current_work_type:'SOURCE_REVIEW',current_status:'EXTRACTOR_READY',new_source_count:6,review_count:14,candidate_count:80,published_count:0,duplicate_count:0,no_change_count:3,human_review_count:2,human_approval_required_count:9,error_count:1,last_success_at:null} } } })
    expect(card).toContain('재검수 오류 1건')
    expect(card).toContain('9건 / 2건')
    expect(card).toContain('Worker 연결 미확인')
    expect(card).not.toContain('예약 OFF')
    const blocked = wikiCard({ systemStatus: { ...systemStatus, a_wiki: { ...systemStatus.a_wiki!, latest_job: {status:'BLOCKED'}, continuous_review: {worker_connected:false,last_scan_at:null,next_status:'EXISTING_JOB',current_chronicle_id:'C01',current_work_type:'SOURCE_REVIEW',current_status:'EXTRACTOR_READY',new_source_count:1,review_count:1,candidate_count:1,published_count:0,duplicate_count:0,no_change_count:0,human_review_count:1,human_approval_required_count:1,error_count:0,last_success_at:null} } } })
    expect(blocked).toContain('operator-status-badge danger')
    expect(blocked).toContain('작업 장애 확인')
  })
  it('expired DB snapshots and failed inbox reads never render empty or zero counts as current', () => {
    const page = renderDashboard({ lastRefreshedAt: new Date(Date.now()-121000).toISOString(), inboxAvailable: false })
    expect(page).toContain('조회한 지 2분')
    expect(page).toContain('조회 불가')
    expect(page).not.toContain('현재 대기 중인 검토 항목이 없습니다')
    expect(page).not.toContain('7번째 기록 묶음')
  })
  it('C published jobs never assert verified public deployment', () => {
    const card = knowledgeCard({...healthyC,latest_job:{status:'PUBLISHED',brief_id:'K-048'},latest_published_job:{status:'PUBLISHED',brief_id:'K-048'}})
    expect(card).toContain('저장소 반영 완료 · 공개 확인 별도')
    expect(card).toContain('실제 배포 미확인')
    expect(card).not.toContain('게시 완료')
  })
})
