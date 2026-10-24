import { chronicleRegistry } from './chronicleRegistry'
import { OperatorRoadmap } from './OperatorRoadmap'
import { OperatorSiteDeployments } from './OperatorSiteDeployments'
import type { SiteDeploymentObservation } from './siteDeploymentStatus'
import type { RoadmapLog } from './operatorRoadmapModel'
import {
  aWikiPublicationStatus,
  aWikiOperatorGuidance,
  aWikiStatusLabel,
  aWikiContinuousGuidance,
  blockerLabel,
  decisionLabel,
  formatOperatorRefreshTime,
  formatOperatorTime,
  jobTypeLabel,
  operatorStaticStatus,
  productionStatusTone,
  shortSha,
  sessionLabel,
  sourceKindLabel,
  statusLabel,
  subjectWithKorean,
  timezoneLabel,
  visualStatusTone,
  visualOperatorSignal,
  knowledgeOperatorSignal,
} from './operatorSystemStatus'
import type { AWikiContinuousStatus } from './operatorSystemStatus'

export type ReviewItem = {
  id: string; source_worker: string; item_type: string; chronicle_id: string | null
  priority: string; title: string; summary: string; risk_level: string
  source_ref: string; status: string; created_at: string
}
type Decision = { decision: string; note: string | null; created_at: string; actor: string | null }
export type ReviewDetail = ReviewItem & {
  payload: Record<string, unknown>; updated_at: string; decided_at: string | null
  decision_note: string | null; decision_history: Decision[]
}
export type Inbox = { pending_count: number; automation_error_count: number; items: ReviewItem[] }

// All C Knowledge approvals must flow through the existing revision-bound
// editor, not the generic review-decision RPC on this dashboard.
export function knowledgeReviewEditorHref(item: Pick<ReviewItem, 'source_worker' | 'item_type' | 'id'>, jobs: Record<string, string> = {}): string | null {
  if (item.source_worker !== 'C_KNOWLEDGE' || item.item_type !== 'KNOWLEDGE') return null
  const id = jobs[item.id]
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  return typeof id === 'string' && uuid.test(id) ? `/operator/knowledge/${id}/` : '/operator/knowledge/'
}
type CronStatus = {
  jobname?: string | null; schedule?: string | null; active?: boolean | null
  last_status?: string | null; last_start_at?: string | null; last_end_at?: string | null
  last_message?: string | null
}
type ArchiveDispatch = {
  id?: number | null; requested_at?: string | null; workflow_file?: string | null
  git_ref?: string | null; request_id?: number | null; origin?: string | null
}
type VisualJob = {
  job_id?: string | null; date_kst?: string | null; status?: string | null; attempt_no?: number | null
  subject_id?: string | null; title?: string | null; review_decision?: string | null
  review_summary?: string | null; blocker_code?: string | null; blocker_stage?: string | null
  last_error_code?: string | null; last_error_stage?: string | null; stalled_code?: string | null
  provider_failure_count?: number | null; ingest_failure_count?: number | null; review_failure_count?: number | null
  age_minutes?: number | null
  created_at?: string | null; updated_at?: string | null; provider_completed_at?: string | null
  reviewed_at?: string | null; finalized_at?: string | null
}
type KnowledgeSemanticJob = {
  brief_id?: string | null; job_id?: string; job_type?: string; status?: string; source_kind?: string; source_ref?: string
  prepared_at?: string | null; submitted_at?: string | null; age_minutes?: number | null
  disposition_code?: string | null; stalled_code?: string | null; result_decision?: string | null; final_pr_number?: number | null
  final_head_sha?: string | null; merge_sha?: string | null; blocker_code?: string | null; blocker_stage?: string | null
}
type AWikiJob = {
  job_id?: string; status?: string; session_id?: string; season_id?: string; source_ref?: string
  completion_origin?: 'NATIVE' | 'NATIVE_REVIEWED_MERGE' | 'EXTERNAL_REVIEWED_MERGE' | null
  blocker_code?: string | null; review_decision?: string | null; review_note?: string | null
  final_pr_number?: number | null; merge_sha?: string | null
  dispatch_count?: number | null; dispatch_at?: string | null; age_minutes?: number | null
  created_at?: string | null; updated_at?: string | null; extractor_submitted_at?: string | null
  review_ready_at?: string | null; review_submitted_at?: string | null; finalizing_at?: string | null
  published_at?: string | null
}
export type SystemStatus = {
  archive: {
    dispatch_count: number
    latest_dispatch: ArchiveDispatch | null
    cron: CronStatus | null
  }
  visual: {
    job_count: number
    today_job_count: number
    today_success_count: number
    active_count: number
    latest_job: VisualJob | null
    prep_cron: CronStatus | null
    retry_cron: CronStatus | null
  }
  review: { pending_count: number; automation_error_count: number }
  a_wiki?: { job_count: number; active_count: number; human_review_count?: number; published_count: number; latest_job: AWikiJob | null; continuous_review?: AWikiContinuousStatus | null }
  knowledge_semantic?: {
    active_count: number
    machine_active_count?: number
    human_review_count?: number
    unresolved_blocked_count?: number
    machine_stalled_count?: number
    latest_published_job?: KnowledgeSemanticJob | null
    latest_blocked_job?: KnowledgeSemanticJob | null
    latest_machine_job?: KnowledgeSemanticJob | null
    latest_stalled_job?: KnowledgeSemanticJob | null
    latest_job: KnowledgeSemanticJob | null
    prep: { last_status?: string; last_stage?: string; blocker_code?: string | null; checked_at?: string | null } | null
  }
}
export type ReleaseMarker = {
  source_main_sha?: string; released_on_kst?: string; interval_days?: number
  release_attempt?: number; policy?: string
}
export type DeployMeta = { context?: string; commit_ref?: string; build_id?: string; provider?: string }
export type ProductionStatus = { release: ReleaseMarker | null; deploy: DeployMeta | null }

export const emptyInbox: Inbox = { pending_count: 0, automation_error_count: 0, items: [] }

export function OperatorDashboard({
  email,
  busy,
  refreshing,
  lastRefreshedAt,
  error,
  statusError,
  inbox,
  knowledgeReviewJobs = {},
  roadmapLogs,
  roadmapError,
  systemStatus,
  productionStatus,
  siteDeployments,
  selected,
  note,
  onNoteChange,
  onRefresh,
  onLoadDetail,
  onDecide,
  onSignOut,
}: {
  email?: string | null
  busy: boolean
  refreshing: boolean
  lastRefreshedAt: string | null
  error: string
  statusError: string
  inbox: Inbox
  knowledgeReviewJobs?: Record<string, string>
  roadmapLogs?: RoadmapLog[] | null
  roadmapError?: string
  systemStatus: SystemStatus | null
  productionStatus: ProductionStatus
  siteDeployments?: SiteDeploymentObservation[] | null
  selected: ReviewDetail | null
  note: string
  onNoteChange: (value: string) => void
  onRefresh: () => void
  onLoadDetail: (id: string) => void
  onDecide: (decision: 'APPROVED' | 'HOLD' | 'REJECTED') => void
  onSignOut: () => void
}) {
  const archiveCron = systemStatus?.archive.cron ?? null
  const archiveDispatch = systemStatus?.archive.latest_dispatch ?? null
  const archiveHealthy = archiveCron?.active === true && archiveCron.last_status === 'succeeded'

  const aWikiLatest = systemStatus?.a_wiki?.latest_job ?? null
  const aWikiBlocker = aWikiLatest?.blocker_code ?? null
  const aWikiGuidance = aWikiOperatorGuidance(aWikiLatest)
  const aWikiContinuous = systemStatus?.a_wiki?.continuous_review
  const aWikiContinuousHelp = aWikiContinuousGuidance(aWikiContinuous)
  const aWikiHumanReview = aWikiLatest?.status === 'HUMAN_REVIEW'
  const aWikiHumanCount = systemStatus?.a_wiki?.human_review_count ?? (aWikiHumanReview ? 1 : 0)
  const aWikiPublication = aWikiPublicationStatus(aWikiLatest, productionStatus)
  const aWikiBadgeClass = !systemStatus?.a_wiki ? 'neutral'
    : aWikiLatest?.status === 'BLOCKED' ? 'danger'
    : aWikiGuidance.badge ? 'warning'
    : systemStatus.a_wiki.active_count > 0 ? 'running'
    : aWikiLatest?.status === 'PUBLISHED' ? 'ok' : visualStatusTone(aWikiLatest?.status)
  // A published repository merge is a success even when the next regular
  // Production deployment has not yet reflected the content.
  const aWikiBadge = !systemStatus?.a_wiki ? '상태 조회 필요'
    : aWikiGuidance.badge ?? (systemStatus.a_wiki.active_count > 0 ? '처리 중'
      : aWikiLatest?.status === 'PUBLISHED' ? '저장소 반영 완료'
      : aWikiLatest?.status ? aWikiStatusLabel(aWikiLatest.status) : '실행 이력 없음')

  const visualLatest = systemStatus?.visual.latest_job ?? null
  const visualPrepHealthy = systemStatus?.visual.prep_cron?.active === true
    && systemStatus?.visual.prep_cron?.last_status === 'succeeded'
    && systemStatus?.visual.retry_cron?.active === true
    && systemStatus?.visual.retry_cron?.last_status === 'succeeded'
  const visualSignal = visualOperatorSignal(visualLatest, !!systemStatus?.visual)
  // Historical last-error codes must not turn a new/successful job red.
  const visualBlocker = visualLatest?.status === 'BLOCKED'
    ? visualLatest.blocker_code ?? visualLatest.last_error_code ?? null
    : visualLatest?.stalled_code ?? null
  const visualBadgeClass = visualSignal.tone

  const semantic = systemStatus?.knowledge_semantic
  const hasLiveContract = semantic?.machine_active_count !== undefined
    && semantic?.human_review_count !== undefined && semantic?.unresolved_blocked_count !== undefined
  const semanticLatest = semantic?.latest_job ?? null
  const machineStatuses = ['PREPARED', 'SUBMITTED', 'FINALIZING', 'PR_OPEN']
  const machineCount = semantic?.machine_active_count ?? 0
  const humanCount = semantic?.human_review_count ?? 0
  const blockedCount = semantic?.unresolved_blocked_count ?? (semanticLatest?.status === 'BLOCKED' ? 1 : 0)
  const stalledJob = semantic?.latest_stalled_job
    ?? (machineStatuses.includes(semanticLatest?.status ?? '') && semanticLatest?.stalled_code ? semanticLatest : null)
  const blockedJob = blockedCount > 0 ? semantic?.latest_blocked_job
    ?? (semanticLatest?.status === 'BLOCKED' ? semanticLatest : null) : null
  const prepFailed = ['BLOCKED', 'FAILED', 'ERROR'].includes(semantic?.prep?.last_status ?? '')
  const semanticBlocker = blockedJob?.blocker_code ?? stalledJob?.stalled_code
    ?? (prepFailed ? semantic?.prep?.blocker_code : null) ?? null
  const knowledgeErrorCount = blockedCount + (semantic?.machine_stalled_count ?? (stalledJob ? 1 : 0))
  const knowledgeLatestBrief = semanticLatest?.brief_id ?? (semanticLatest ? '조회 필요' : '없음')
  const knowledgeSignal = knowledgeOperatorSignal({
    available: hasLiveContract,
    machineActive: machineCount,
    humanReview: humanCount,
    unresolvedBlocked: blockedCount,
    machineStalled: semantic?.machine_stalled_count ?? (stalledJob ? 1 : 0),
    prepFailed,
  })
  const knowledgeBadge = knowledgeSignal.badge
  const knowledgeBadgeClass = knowledgeSignal.tone
  const latestProcessing = semanticLatest?.status === 'HOLD' && (semanticLatest.disposition_code ?? semanticLatest.blocker_code) === 'SEMANTIC_DUPLICATE'
    ? '중복으로 보류' : statusLabel(semanticLatest?.status)

  const productionContext = productionStatus.deploy?.context ?? null

  return <section className="operator-page">
    <header className="operator-heading">
      <div>
        <p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p>
        <h1>운영 상황판</h1>
        <p>{email} · 자동화가 잘 돌아가는지와 확인이 필요한 항목을 한눈에 봅니다.</p>
      </div>
      <div className="operator-heading-actions">
        <a className="operator-secondary" href="/operator/bunker-os/">Bunker OS 감독</a>
        <a className="operator-secondary" href="/operator/vault/">일러스트 보관함</a>
        <a className="operator-secondary" href="/operator/knowledge/">생존 지식 검토함</a>
        <a className="operator-secondary" href="/operator/visuals/">이미지 제작 정보</a>
        <button className="operator-secondary" disabled={busy} onClick={onSignOut}>로그아웃</button>
      </div>
    </header>

    {error && <p className="operator-error" role="alert">{error}</p>}
    {statusError && <p className="operator-error" role="alert">{statusError}</p>}

    <OperatorRoadmap logs={roadmapLogs ?? null} error={roadmapError ?? ""} />

    <div className="operator-counts">
      <article><span>사람이 확인할 항목</span><strong>{inbox.pending_count + aWikiHumanCount}</strong></article>
      <article><span>자동화 문제</span><strong>{inbox.automation_error_count}</strong></article>
      <article><span>보안 알림</span><strong className="operator-unwired">미연결</strong></article>
      <article><span>비용 알림</span><strong className="operator-unwired">미연결</strong></article>
    </div>

    <section className="operator-system">
      <header>
        <div>
          <p className="archive-eyebrow">자동화 운영 현황</p>
          <h2>자동화 상태</h2>
          <p className="operator-refresh-time" aria-live="polite">마지막 갱신 {formatOperatorRefreshTime(lastRefreshedAt)}</p>
        </div>
        <button className={`operator-secondary operator-refresh-button ${refreshing ? 'refreshing' : ''}`} disabled={busy} aria-busy={refreshing} onClick={onRefresh}>
          <span aria-hidden="true">↻</span>{refreshing ? '새로고침 중…' : '상태 새로고침'}
        </button>
      </header>

      <div className="operator-signal-legend" aria-label="자동화 상태 표시 안내">
        <span><i className="ok" aria-hidden="true" />정상·완료</span>
        <span><i className="running" aria-hidden="true" />진행·예약 대기</span>
        <span><i className="warning" aria-hidden="true" />사람 검토</span>
        <span><i className="danger" aria-hidden="true" />장애·복구 필요</span>
        <span><i className="neutral" aria-hidden="true" />조회 불가</span>
      </div>
      <p className="operator-status-help">DB 작업 상태와 ChatGPT 예약 ON/OFF는 별개입니다. 이 화면은 ChatGPT 예약의 실제 ON/OFF를 직접 조회하지 않습니다.</p>
      <div className="operator-system-grid">
        <article className="operator-system-card">
          <div className="operator-system-title">
            <h3>A · 기록 보관 <small>게임 기록 자동 저장</small></h3>
            <span className={`operator-status-badge ${archiveHealthy ? 'ok' : archiveCron ? 'warning' : 'neutral'}`}>
              {archiveHealthy ? '정상 작동' : archiveCron?.active === false ? '중지됨' : archiveCron ? statusLabel(archiveCron.last_status) : '기록 없음'}
            </span>
          </div>
          <dl>
            <div><dt>운영 방식</dt><dd>{statusLabel(operatorStaticStatus.archive.mode)}</dd></div>
            <div><dt>자동 실행</dt><dd>{archiveCron?.active ? '켜짐' : archiveCron ? '꺼짐' : '기록 없음'} · {statusLabel(archiveCron?.last_status)}</dd></div>
            <div><dt>최근 실행</dt><dd>{formatOperatorTime(archiveCron?.last_end_at ?? archiveCron?.last_start_at)}</dd></div>
            <div><dt>최근 작업 전달</dt><dd>{formatOperatorTime(archiveDispatch?.requested_at)}</dd></div>
            <div><dt>누적 작업 전달</dt><dd>{systemStatus?.archive.dispatch_count ?? 0}건</dd></div>
          </dl>
          <details className="operator-tech-details">
            <summary>기술 상세</summary>
            <dl>
              <div><dt>상태 코드</dt><dd><code>{archiveCron?.last_status ?? '없음'}</code></dd></div>
              <div><dt>작업 요청 번호</dt><dd>{archiveDispatch?.request_id ? `#${archiveDispatch.request_id}` : '없음'}</dd></div>
              <div><dt>작업 이름</dt><dd><code>{archiveCron?.jobname ?? '없음'}</code></dd></div>
            </dl>
          </details>
        </article>

        <article className="operator-system-card">
          <div className="operator-system-title">
            <h3>A-Wiki · 세계관 위키 <small>인물·장소·사건 자동 정리</small></h3>
            <span className={`operator-status-badge ${aWikiBadgeClass}`}>{aWikiBadge}</span>
          </div>
          <dl>
            <div><dt>최근 작업</dt><dd>{aWikiLatest?.season_id ? `${aWikiLatest.season_id} · ` : ''}{sessionLabel(aWikiLatest?.session_id)}</dd></div>
            <div><dt>멀티 세계관 연결</dt><dd>{aWikiContinuousHelp.connection}</dd></div>
            <div><dt>정기예약</dt><dd>{aWikiContinuousHelp.schedule}</dd></div>
            <div><dt>재검수 대상</dt><dd>{aWikiContinuous?.current_chronicle_id ?? '조회 필요'} · {aWikiContinuousHelp.workType}</dd></div>
            <div><dt>재검수 처리 상태</dt><dd>{aWikiContinuous?.current_status ? aWikiContinuous.current_status === 'HUMAN_APPROVAL_REQUIRED' ? '독립 검수 통과 · 사람 공개 승인 대기' : aWikiStatusLabel(aWikiContinuous.current_status) : '조회 필요'}</dd></div>
            <div><dt>재검수 독립 검수</dt><dd>{aWikiContinuous?.review_decision ? decisionLabel(aWikiContinuous.review_decision) : '검수 결과 대기'}</dd></div>
            <div><dt>별도 공개 승인 대기</dt><dd>{aWikiContinuous ? `${aWikiContinuous.human_approval_required_count ?? 0}건 · 초기 SEED 승인은 새 사실에 승계되지 않음` : '집계 미확인'}</dd></div>
            <div><dt>전체 원문 탐색</dt><dd>{formatOperatorTime(aWikiContinuous?.last_scan_at)}</dd></div>
            <div><dt>기존 세계관 다음 작업</dt><dd>{aWikiContinuousHelp.next}</dd></div>
            <div><dt>재검수 집계</dt><dd>{aWikiContinuous ? `신규 원문 ${aWikiContinuous.new_source_count} · 재검수 ${aWikiContinuous.review_count} · 후보 ${aWikiContinuous.candidate_count} · 게시 ${aWikiContinuous.published_count}` : '탐색 집계 연결 필요'}</dd></div>
            <div><dt>재검수 결과</dt><dd>{aWikiContinuous ? `중복 제외 ${aWikiContinuous.duplicate_count} · 변경 없음 ${aWikiContinuous.no_change_count} · 사람 검수 ${aWikiContinuous.human_review_count} · 시스템 오류 ${aWikiContinuous.error_count}` : '집계 미확인'}</dd></div>
            <div><dt>마지막 재검수 성공</dt><dd>{formatOperatorTime(aWikiContinuous?.last_success_at)}</dd></div>
            <div><dt>작업 수</dt><dd>{systemStatus?.a_wiki ? `처리 중 ${systemStatus.a_wiki.active_count}건 · 검수 보류 ${aWikiHumanCount}건 · 저장소 반영 ${systemStatus.a_wiki.published_count}건` : '조회 필요'}</dd></div>
            <div><dt>현 상태</dt><dd>{systemStatus?.a_wiki ? aWikiLatest?.status === 'PUBLISHED' ? '세계관 기록 저장소 반영 완료' : aWikiGuidance.category : '조회 필요'}</dd></div>
            <div><dt>내용 검수</dt><dd>{systemStatus?.a_wiki ? aWikiPublication.review : '조회 필요'}</dd></div>
            <div><dt>저장소 반영</dt><dd>{systemStatus?.a_wiki ? aWikiPublication.repository : '조회 필요'}</dd></div>
            <div><dt>공개 사이트</dt><dd>{systemStatus?.a_wiki ? aWikiPublication.deployment : '조회 필요'}</dd></div>
            <div><dt>다음 작업</dt><dd>{!systemStatus?.a_wiki ? '조회 필요' : aWikiGuidance.next ?? (systemStatus.a_wiki.active_count > 0 ? '현재 기록 처리 중' : '다음 공개 원문 처리 대기')}</dd></div>
            <div><dt>최근 갱신</dt><dd>{formatOperatorTime(aWikiLatest?.published_at ?? aWikiLatest?.updated_at ?? aWikiLatest?.created_at)}</dd></div>
            <div><dt>막힌 이유</dt><dd>{!systemStatus?.a_wiki ? '조회 필요' : aWikiHumanReview ? blockerLabel('REVIEWER_HUMAN_REVIEW') : aWikiBlocker ? blockerLabel(aWikiBlocker) : '없음'}</dd></div>
          </dl>
          {aWikiHumanReview && <section className="operator-wiki-review-guidance" aria-label="A-Wiki 독립 검수 결과">
            <strong>검수자가 지적한 내용</strong>
            <p>{aWikiLatest?.review_note?.trim() || aWikiGuidance.reason}</p>
            <p>이 작업은 검수 때문에 게시 전 대기 중입니다. 자동화가 꺼졌다는 뜻은 아닙니다. 원문에 맞게 수정하고 독립 검수를 다시 통과해야 합니다.</p>
          </section>}
          <p className="operator-status-help">{systemStatus?.a_wiki ? aWikiGuidance.schedule : '위키 실행 상태를 불러오지 못했습니다. 상태를 새로고침해 주세요.'}</p>
          <p className="operator-status-help">{systemStatus?.a_wiki ? aWikiPublication.deploymentDetail : '위키 실행 상태를 불러오지 못했습니다.'}</p>
          <details className="operator-tech-details">
            <summary>기술 상세</summary>
            <dl>
              <div><dt>상태 코드</dt><dd><code>{aWikiLatest?.status ?? '없음'}</code>{aWikiLatest?.status ? aWikiStatusLabel(aWikiLatest.status) : ''}</dd></div>
              <div><dt>기록 ID</dt><dd><code>{aWikiLatest?.session_id ?? '없음'}</code></dd></div>
              <div><dt>반영 방식</dt><dd>{aWikiLatest?.completion_origin === 'EXTERNAL_REVIEWED_MERGE' ? '외부 검수·병합 결과 확인' : aWikiLatest?.completion_origin === 'NATIVE' || aWikiLatest?.completion_origin === 'NATIVE_REVIEWED_MERGE' ? '기본 위키 처리 경로' : '기록 없음'}</dd></div>
              <div><dt>저장소 검증</dt><dd>{aWikiLatest?.final_pr_number ? `#${aWikiLatest.final_pr_number}` : '없음'}</dd></div>
              <div><dt>반영 코드</dt><dd><code>{aWikiLatest?.merge_sha?.slice(0, 12) ?? '없음'}</code></dd></div>
              <div><dt>배포 원본</dt><dd><code>{shortSha(productionStatus.release?.source_main_sha)}</code></dd></div>
              <div><dt>현재 상태 시간</dt><dd>{aWikiLatest?.age_minutes == null ? '—' : `${aWikiLatest.age_minutes}분`}</dd></div>
              <div><dt>작업 전달</dt><dd>{aWikiLatest?.dispatch_count ?? 0}회 · {formatOperatorTime(aWikiLatest?.dispatch_at)}</dd></div>
              <div><dt>문제 코드</dt><dd><code>{aWikiBlocker ?? '없음'}</code></dd></div>
            </dl>
            <p>다음 작업 대기는 현재 진행 중인 작업이 없다는 뜻입니다. 새 공개 원문 유무는 원문 탐색 결과에서 별도로 확인해야 합니다.</p>
          </details>
        </article>

        <article className="operator-system-card">
          <div className="operator-system-title">
            <h3>B · 일러스트 <small>이미지 자동 제작</small></h3>
            <span className={`operator-status-badge ${visualBadgeClass}`}>{visualSignal.badge}</span>
          </div>
          <dl>
            <div><dt>DB 예약</dt><dd>{visualPrepHealthy ? '준비·재시도 정상' : '준비·재시도 확인 필요'} · ChatGPT 예약 별도</dd></div>
            <div><dt>현재 판정</dt><dd>{visualSignal.summary}</dd></div>
            <div><dt>다음 조치</dt><dd>{visualSignal.next}</dd></div>
            <div><dt>오늘 시도 / 성공</dt><dd>{systemStatus?.visual.today_job_count ?? 0}건 / {systemStatus?.visual.today_success_count ?? 0}건</dd></div>
            <div><dt>진행 중</dt><dd>{systemStatus?.visual.active_count ?? 0}건</dd></div>
            <div><dt>최근 대상</dt><dd>{visualLatest?.title ?? subjectWithKorean(visualLatest?.subject_id).split(' · ')[0]}</dd></div>
            <div><dt>최근 갱신</dt><dd>{formatOperatorTime(visualLatest?.finalized_at ?? visualLatest?.reviewed_at ?? visualLatest?.updated_at ?? visualLatest?.created_at)}</dd></div>
            <div><dt>이미지 생성 완료</dt><dd>{formatOperatorTime(visualLatest?.provider_completed_at)}</dd></div>
            <div><dt>현재 상태 시간</dt><dd>{visualLatest?.age_minutes == null ? '—' : `${visualLatest.age_minutes}분`}</dd></div>
            <div><dt>실패 횟수</dt><dd>생성 {visualLatest?.provider_failure_count ?? 0} · 저장 {visualLatest?.ingest_failure_count ?? 0} · 검수 {visualLatest?.review_failure_count ?? 0}</dd></div>
            <div><dt>검수 결과</dt><dd>{visualLatest?.review_decision ? statusLabel(visualLatest.review_decision) : '아직 없음'}</dd></div>
            <div><dt>현재 장애</dt><dd>{visualBlocker ? blockerLabel(visualBlocker) : '없음'}</dd></div>
          </dl>
          <p className="operator-status-help">이전 이미지의 차단·재시도 이력은 보존되며 최신 작업의 현재 장애로 합산하지 않습니다.</p>
          <details className="operator-tech-details">
            <summary>기술 상세</summary>
            <dl>
              <div><dt>상태 코드</dt><dd><code>{visualLatest?.status ?? '없음'}</code></dd></div>
              <div><dt>대상 ID</dt><dd><code>{visualLatest?.subject_id ?? '없음'}</code></dd></div>
              <div><dt>이번 시도</dt><dd>{visualLatest?.attempt_no ?? '—'}회</dd></div>
              <div><dt>누적 작업</dt><dd>{systemStatus?.visual.job_count ?? 0}건</dd></div>
              <div><dt>문제 코드</dt><dd><code>{visualBlocker ?? '없음'}</code></dd></div>
              <div><dt>문제 단계</dt><dd><code>{visualLatest?.blocker_stage ?? visualLatest?.last_error_stage ?? '없음'}</code></dd></div>
            </dl>
          </details>
        </article>

        <article className="operator-system-card">
          <div className="operator-system-title">
            <h3>C · 생존 지식 <small>지식 글 자동 제작</small></h3>
            <span className={`operator-status-badge ${knowledgeBadgeClass}`}>{knowledgeBadge}</span>
          </div>
          <dl>
            <div><dt>현재 판정</dt><dd>{knowledgeSignal.summary}</dd></div>
            <div><dt>다음 조치</dt><dd>{knowledgeSignal.next}</dd></div>
            <div><dt>진행 중</dt><dd>{semantic?.machine_active_count === undefined ? '조회 필요' : `${machineCount}건`}</dd></div>
            <div><dt>최근 처리</dt><dd>{knowledgeLatestBrief} · {latestProcessing}</dd></div>
            <div><dt>최근 게시</dt><dd>{hasLiveContract ? semantic?.latest_published_job?.brief_id ?? '없음' : '조회 필요'}</dd></div>
            <div><dt>현재 복구할 오류</dt><dd>{hasLiveContract ? `${knowledgeErrorCount}건` : '조회 필요'}</dd></div>
            <div><dt>최근 오류</dt><dd>{blockedJob?.brief_id ?? stalledJob?.brief_id ?? '없음'}</dd></div>
            <div><dt>원본</dt><dd>{sourceKindLabel(semanticLatest?.source_kind)}</dd></div>
            <div><dt>작업 시작 / 제출</dt><dd>{formatOperatorTime(semanticLatest?.prepared_at)} / {formatOperatorTime(semanticLatest?.submitted_at)}</dd></div>
            <div><dt>사람 검토 대기</dt><dd>{semantic?.human_review_count === undefined ? '조회 필요' : `${humanCount}건`}</dd></div>
            <div><dt>게시 상태</dt><dd>{latestProcessing}</dd></div>
            <div><dt>막힌 이유</dt><dd>{semanticBlocker ? blockerLabel(semanticBlocker) : '없음'}</dd></div>
            <div><dt>자동 실행 주기</dt><dd>{operatorStaticStatus.knowledge.triggerIntervalHours}시간 · {timezoneLabel(operatorStaticStatus.knowledge.timezone)}</dd></div>
          </dl>
          <p className="operator-status-help">과거에 해결된 실패 이력과 사람 검토 대기 원고는 ‘현재 복구할 오류’에 포함하지 않습니다. 사람 검토가 쌓여도 새 글의 자동 집필은 별도로 진행됩니다.</p>
          <details className="operator-tech-details">
            <summary>기술 상세</summary>
            <dl>
              <div><dt>작업 종류</dt><dd><code>{semanticLatest?.job_type ?? '없음'}</code> · {jobTypeLabel(semanticLatest?.job_type)}</dd></div>
              <div><dt>원본 종류</dt><dd><code>{semanticLatest?.source_kind ?? '없음'}</code></dd></div>
              <div><dt>원본 경로</dt><dd><code>{semanticLatest?.source_ref ?? '없음'}</code></dd></div>
              <div><dt>게시 검증</dt><dd>{semanticLatest?.final_pr_number ? `#${semanticLatest.final_pr_number}` : '없음'}</dd></div>
              <div><dt>상태 코드</dt><dd><code>{semanticLatest?.status ?? '없음'}</code></dd></div>
              <div><dt>문제 코드</dt><dd><code>{semanticBlocker ?? '없음'}</code></dd></div>
              <div><dt>문제 단계</dt><dd><code>{blockedJob?.blocker_stage ?? (stalledJob ? 'MACHINE' : '없음')}</code></dd></div>
            </dl>
          </details>
        </article>
      </div>

      <OperatorSiteDeployments observations={siteDeployments} refreshing={refreshing} />
      <div className="operator-release-strip">
        <strong>실사이트 배포 <small>이 화면의 빌드 검증 정보</small></strong>
        <span className={`operator-status-badge ${productionStatusTone(productionContext)}`}>{productionContext === 'production' ? '정식 사이트 빌드' : '검수 빌드 또는 확인 필요'}</span>
        <span>배포 기록 {productionStatus.release?.released_on_kst ?? '기록 없음'}</span>
        <span>고정 기준점 이후 {operatorStaticStatus.release.productionIntervalDays}일 간격 · {operatorStaticStatus.release.releaseTimeKst}</span>
        <details className="operator-tech-details operator-release-tech">
          <summary>기술 상세</summary>
          <span>원본 코드 <code>{shortSha(productionStatus.release?.source_main_sha)}</code></span>
          <span>배포 코드 <code>{shortSha(productionStatus.deploy?.commit_ref)}</code></span>
          <span>환경 <code>{productionContext ?? '없음'}</code></span>
        </details>
      </div>
      <p className="operator-muted">A는 게임 기록 저장, A-Wiki는 세계관 위키 갱신, B는 일러스트 제작, C는 생존 지식 글 제작 상태입니다. 평소에는 쉬운 상태만 보고, 문제가 있을 때만 각 카드의 ‘기술 상세’를 열어보면 됩니다.</p>
    </section>

    <div className="operator-grid">
      <section className="operator-panel">
        <header><h2>대기 항목</h2><button className={`operator-secondary operator-refresh-button ${refreshing ? 'refreshing' : ''}`} disabled={busy} aria-busy={refreshing} onClick={onRefresh}><span aria-hidden="true">↻</span>{refreshing ? '새로고침 중…' : '새로고침'}</button></header>
        {busy && <p className="operator-muted" aria-live="polite">처리 중…</p>}
        {!inbox.items.length && <p className="operator-empty">현재 대기 중인 검토 항목이 없습니다.</p>}
        <ul className="operator-inbox">
          {inbox.items.map((item) => {
            const editorHref = knowledgeReviewEditorHref(item, knowledgeReviewJobs)
            const description = editorHref
              ? 'AI가 게시 전에 확인을 요청한 글입니다. 전체 원고와 검토 이유를 읽고 수정할 수 있습니다.'
              : item.summary
            const content = <>
              <span><b>{item.priority}</b><b>{item.item_type === 'KNOWLEDGE' ? '생존지식' : item.item_type}</b><b>{item.risk_level}</b></span>
              <strong>{item.title}</strong>
              <small>{item.source_worker} · {editorHref ? '편집·검토 대기' : item.status} · {item.chronicle_id ?? '공용'}</small>
              <p>{description}</p>
            </>
            return <li key={item.id}>{editorHref
              ? <a href={editorHref} aria-label={`${item.title} 원고 읽고 수정하기`}>{content}<em>원고 읽기 · 수정 · 발행 요청 →</em></a>
              : <button className={selected?.id === item.id ? 'selected' : ''} onClick={() => onLoadDetail(item.id)}>{content}</button>
            }</li>
          })}
        </ul>
      </section>

      <section className="operator-panel operator-detail">
        <h2>항목 상세</h2>
        {!selected ? <p className="operator-empty">검토 항목을 선택하세요.</p> : <>
          <p className="archive-eyebrow">{selected.priority} · {selected.risk_level} · {selected.status}</p>
          <h3>{selected.title}</h3>
          <p>{selected.summary}</p>
          <dl>
            <div><dt>유형</dt><dd>{selected.source_worker} / {selected.item_type}</dd></div>
            <div><dt>생존기</dt><dd>{selected.chronicle_id ?? '공용'}</dd></div>
            <div><dt>원본</dt><dd><a href={selected.source_ref} target="_blank" rel="noreferrer">원본 열기</a></dd></div>
          </dl>
          <details><summary>기술 상세 데이터</summary><pre>{JSON.stringify(selected.payload, null, 2)}</pre></details>
          {!!selected.decision_history.length && <div className="operator-history"><h4>결정 기록</h4>{selected.decision_history.map((entry, index) => <p key={index}>{entry.decision} · {entry.actor ?? '운영자'} · {new Date(entry.created_at).toLocaleString()} {entry.note && `· ${entry.note}`}</p>)}</div>}
          {selected.status === 'PENDING' && (knowledgeReviewEditorHref(selected, knowledgeReviewJobs)
            ? <div className="operator-decision">
                <p className="operator-muted">생존지식 글은 원고를 읽고 수정한 뒤 전용 편집기에서 발행을 요청합니다. 여기에서는 바로 승인하지 않습니다.</p>
                <a className="operator-secondary" href={knowledgeReviewEditorHref(selected, knowledgeReviewJobs) ?? '/operator/knowledge/'}>원고 읽기 · 수정 · 발행 요청 →</a>
              </div>
            : <div className="operator-decision">
                <label>검토 메모<textarea maxLength={1000} value={note} onChange={(event) => onNoteChange(event.target.value)} /></label>
                <div>
                  <button disabled={busy} onClick={() => onDecide('APPROVED')}>승인</button>
                  <button className="operator-secondary" disabled={busy} onClick={() => onDecide('HOLD')}>보류</button>
                  <button className="operator-danger" disabled={busy} onClick={() => onDecide('REJECTED')}>거절</button>
                </div>
              </div>)}
        </>}
      </section>
    </div>

    <section className="operator-panel operator-chronicles">
      <h2>Chronicles</h2>
      <div>{chronicleRegistry.map((item) => <span key={item.id}>C{String(item.number).padStart(2,'0')} · {item.title}</span>)}</div>
    </section>
    <p className="operator-muted">생존지식은 전용 검토함에서 읽기·수정·발행 요청을 진행합니다. 검토가 끝나도 기존 근거 검사와 정규 Production 배포를 통과한 글만 공개됩니다.</p>
  </section>
}
