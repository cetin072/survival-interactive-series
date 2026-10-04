import { chronicleRegistry } from './chronicleRegistry'
import {
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
} from './operatorSystemStatus'

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
  job_id?: string; job_type?: string; status?: string; source_kind?: string; source_ref?: string
  prepared_at?: string | null; submitted_at?: string | null; age_minutes?: number | null
  stalled_code?: string | null; result_decision?: string | null; final_pr_number?: number | null
  final_head_sha?: string | null; merge_sha?: string | null; blocker_code?: string | null; blocker_stage?: string | null
}
type AWikiJob = {
  job_id?: string; status?: string; session_id?: string; source_ref?: string
  blocker_code?: string | null; final_pr_number?: number | null; merge_sha?: string | null
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
  a_wiki?: { job_count: number; active_count: number; published_count: number; latest_job: AWikiJob | null }
  knowledge_semantic?: {
    active_count: number
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
  systemStatus,
  productionStatus,
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
  systemStatus: SystemStatus | null
  productionStatus: ProductionStatus
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
  const aWikiBadgeClass = aWikiBlocker ? 'warning' : visualStatusTone(aWikiLatest?.status)

  const visualLatest = systemStatus?.visual.latest_job ?? null
  const visualPrepHealthy = systemStatus?.visual.prep_cron?.active === true
    && systemStatus?.visual.prep_cron?.last_status === 'succeeded'
    && systemStatus?.visual.retry_cron?.active === true
    && systemStatus?.visual.retry_cron?.last_status === 'succeeded'
  const visualBlocker = visualLatest?.stalled_code ?? visualLatest?.blocker_code ?? visualLatest?.last_error_code ?? null
  const visualBadgeClass = visualBlocker ? 'warning' : visualStatusTone(visualLatest?.status)

  const semanticLatest = systemStatus?.knowledge_semantic?.latest_job ?? null
  const semanticBlocker = semanticLatest?.stalled_code ?? semanticLatest?.blocker_code ?? systemStatus?.knowledge_semantic?.prep?.blocker_code ?? null
  const knowledgeLatestBrief = operatorStaticStatus.knowledge.latestBriefIds.at(-1) ?? '없음'
  const knowledgeNeedsReview = inbox.pending_count > 0
  const knowledgeBadgeClass = semanticBlocker || knowledgeNeedsReview
    ? 'warning'
    : semanticLatest?.status === 'PUBLISHED'
      ? 'ok'
      : operatorStaticStatus.knowledge.workerEnabled ? 'neutral' : 'warning'

  const productionContext = productionStatus.deploy?.context ?? null

  return <section className="operator-page">
    <header className="operator-heading">
      <div>
        <p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p>
        <h1>운영 상황판</h1>
        <p>{email} · 자동화가 잘 돌아가는지와 확인이 필요한 항목을 한눈에 봅니다.</p>
      </div>
      <div className="operator-heading-actions">
        <a className="operator-secondary" href="/operator/vault/">일러스트 보관함</a>
        <a className="operator-secondary" href="/operator/knowledge/">생존 지식 검토함</a>
        <a className="operator-secondary" href="/operator/visuals/">이미지 제작 정보</a>
        <button className="operator-secondary" disabled={busy} onClick={onSignOut}>로그아웃</button>
      </div>
    </header>

    {error && <p className="operator-error" role="alert">{error}</p>}
    {statusError && <p className="operator-error" role="alert">{statusError}</p>}

    <div className="operator-counts">
      <article><span>사람이 확인할 항목</span><strong>{inbox.pending_count}</strong></article>
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
            <span className={`operator-status-badge ${aWikiBadgeClass}`}>{aWikiBlocker ? '확인 필요' : aWikiLatest?.status ? statusLabel(aWikiLatest.status) : '실행 이력 없음'}</span>
          </div>
          <dl>
            <div><dt>최근 작업</dt><dd>{sessionLabel(aWikiLatest?.session_id)}</dd></div>
            <div><dt>진행 중 / 완료</dt><dd>{systemStatus?.a_wiki?.active_count ?? 0}건 / {systemStatus?.a_wiki?.published_count ?? 0}건</dd></div>
            <div><dt>최근 갱신</dt><dd>{formatOperatorTime(aWikiLatest?.published_at ?? aWikiLatest?.updated_at ?? aWikiLatest?.created_at)}</dd></div>
            <div><dt>현재 상태 시간</dt><dd>{aWikiLatest?.age_minutes == null ? '—' : `${aWikiLatest.age_minutes}분`}</dd></div>
            <div><dt>막힌 이유</dt><dd>{aWikiBlocker ? blockerLabel(aWikiBlocker) : '없음'}</dd></div>
          </dl>
          <details className="operator-tech-details">
            <summary>기술 상세</summary>
            <dl>
              <div><dt>상태 코드</dt><dd><code>{aWikiLatest?.status ?? '없음'}</code></dd></div>
              <div><dt>기록 ID</dt><dd><code>{aWikiLatest?.session_id ?? '없음'}</code></dd></div>
              <div><dt>게시 검증</dt><dd>{aWikiLatest?.final_pr_number ? `#${aWikiLatest.final_pr_number}` : '없음'}</dd></div>
              <div><dt>반영 코드</dt><dd><code>{aWikiLatest?.merge_sha?.slice(0, 12) ?? '없음'}</code></dd></div>
              <div><dt>작업 전달</dt><dd>{aWikiLatest?.dispatch_count ?? 0}회 · {formatOperatorTime(aWikiLatest?.dispatch_at)}</dd></div>
              <div><dt>문제 코드</dt><dd><code>{aWikiBlocker ?? '없음'}</code></dd></div>
            </dl>
          </details>
        </article>

        <article className="operator-system-card">
          <div className="operator-system-title">
            <h3>B · 일러스트 <small>이미지 자동 제작</small></h3>
            <span className={`operator-status-badge ${visualBadgeClass}`}>{visualBlocker ? '확인 필요' : visualLatest?.status ? statusLabel(visualLatest.status) : '실행 이력 없음'}</span>
          </div>
          <dl>
            <div><dt>자동 실행</dt><dd>{visualPrepHealthy ? '정상' : '확인 필요'}</dd></div>
            <div><dt>오늘 시도 / 성공</dt><dd>{systemStatus?.visual.today_job_count ?? 0}건 / {systemStatus?.visual.today_success_count ?? 0}건</dd></div>
            <div><dt>진행 중</dt><dd>{systemStatus?.visual.active_count ?? 0}건</dd></div>
            <div><dt>최근 대상</dt><dd>{visualLatest?.title ?? subjectWithKorean(visualLatest?.subject_id).split(' · ')[0]}</dd></div>
            <div><dt>최근 갱신</dt><dd>{formatOperatorTime(visualLatest?.finalized_at ?? visualLatest?.reviewed_at ?? visualLatest?.updated_at ?? visualLatest?.created_at)}</dd></div>
            <div><dt>이미지 생성 완료</dt><dd>{formatOperatorTime(visualLatest?.provider_completed_at)}</dd></div>
            <div><dt>현재 상태 시간</dt><dd>{visualLatest?.age_minutes == null ? '—' : `${visualLatest.age_minutes}분`}</dd></div>
            <div><dt>실패 횟수</dt><dd>생성 {visualLatest?.provider_failure_count ?? 0} · 저장 {visualLatest?.ingest_failure_count ?? 0} · 검수 {visualLatest?.review_failure_count ?? 0}</dd></div>
            <div><dt>검수 결과</dt><dd>{visualLatest?.review_decision ? statusLabel(visualLatest.review_decision) : '아직 없음'}</dd></div>
            <div><dt>문제</dt><dd>{visualBlocker ? blockerLabel(visualBlocker) : '없음'}</dd></div>
          </dl>
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
            <span className={`operator-status-badge ${knowledgeBadgeClass}`}>{semanticBlocker ? '확인 필요' : knowledgeNeedsReview ? '검토 필요' : semanticLatest?.status ? statusLabel(semanticLatest.status) : operatorStaticStatus.knowledge.workerEnabled ? '대기 중' : '중지됨'}</span>
          </div>
          <dl>
            <div><dt>진행 중</dt><dd>{systemStatus?.knowledge_semantic?.active_count ?? 0}건</dd></div>
            <div><dt>최근 글</dt><dd>{knowledgeLatestBrief} · {decisionLabel(semanticLatest?.result_decision)}</dd></div>
            <div><dt>원본</dt><dd>{sourceKindLabel(semanticLatest?.source_kind)}</dd></div>
            <div><dt>작업 시작 / 제출</dt><dd>{formatOperatorTime(semanticLatest?.prepared_at)} / {formatOperatorTime(semanticLatest?.submitted_at)}</dd></div>
            <div><dt>사람 검토 대기</dt><dd>{inbox.pending_count}건</dd></div>
            <div><dt>게시 상태</dt><dd>{statusLabel(semanticLatest?.status)}</dd></div>
            <div><dt>막힌 이유</dt><dd>{semanticBlocker ? blockerLabel(semanticBlocker) : '없음'}</dd></div>
            <div><dt>자동 실행 주기</dt><dd>{operatorStaticStatus.knowledge.triggerIntervalHours}시간 · {timezoneLabel(operatorStaticStatus.knowledge.timezone)}</dd></div>
          </dl>
          <details className="operator-tech-details">
            <summary>기술 상세</summary>
            <dl>
              <div><dt>작업 종류</dt><dd><code>{semanticLatest?.job_type ?? '없음'}</code> · {jobTypeLabel(semanticLatest?.job_type)}</dd></div>
              <div><dt>원본 종류</dt><dd><code>{semanticLatest?.source_kind ?? '없음'}</code></dd></div>
              <div><dt>원본 경로</dt><dd><code>{semanticLatest?.source_ref ?? '없음'}</code></dd></div>
              <div><dt>게시 검증</dt><dd>{semanticLatest?.final_pr_number ? `#${semanticLatest.final_pr_number}` : '없음'}</dd></div>
              <div><dt>상태 코드</dt><dd><code>{semanticLatest?.status ?? '없음'}</code></dd></div>
              <div><dt>문제 코드</dt><dd><code>{semanticBlocker ?? '없음'}</code></dd></div>
              <div><dt>문제 단계</dt><dd><code>{semanticLatest?.blocker_stage ?? '없음'}</code></dd></div>
            </dl>
          </details>
        </article>
      </div>

      <div className="operator-release-strip">
        <strong>실사이트 배포 <small>공개 사이트에 반영된 상태</small></strong>
        <span className={`operator-status-badge ${productionStatusTone(productionContext)}`}>{productionContext === 'production' ? '정상' : '확인 필요'}</span>
        <span>최근 배포 {productionStatus.release?.released_on_kst ?? '기록 없음'}</span>
        <span>배포 주기 {operatorStaticStatus.release.productionIntervalDays}일 · {operatorStaticStatus.release.releaseHourKst}시 · 하루 최대 {operatorStaticStatus.release.maxProductionDeploysPerDay}회</span>
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
          {inbox.items.map((item) => <li key={item.id}>
            <button className={selected?.id === item.id ? 'selected' : ''} onClick={() => onLoadDetail(item.id)}>
              <span><b>{item.priority}</b><b>{item.item_type}</b><b>{item.risk_level}</b></span>
              <strong>{item.title}</strong>
              <small>{item.source_worker} · {item.status} · {item.chronicle_id ?? '공용'}</small>
              <p>{item.summary}</p>
            </button>
          </li>)}
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
          {selected.status === 'PENDING' && <div className="operator-decision">
            <label>검토 메모<textarea maxLength={1000} value={note} onChange={(event) => onNoteChange(event.target.value)} /></label>
            <div>
              <button disabled={busy} onClick={() => onDecide('APPROVED')}>승인</button>
              <button className="operator-secondary" disabled={busy} onClick={() => onDecide('HOLD')}>보류</button>
              <button className="operator-danger" disabled={busy} onClick={() => onDecide('REJECTED')}>거절</button>
            </div>
          </div>}
        </>}
      </section>
    </div>

    <section className="operator-panel operator-chronicles">
      <h2>Chronicles</h2>
      <div>{chronicleRegistry.map((item) => <span key={item.id}>C{String(item.number).padStart(2,'0')} · {item.title}</span>)}</div>
    </section>
    <p className="operator-muted">검토 결정은 Supabase에 기록되고, 승인된 C 항목만 기존 GitHub CI와 Batched Production 흐름으로 이어집니다. Security/Cost는 실제 데이터원이 연결될 때까지 미연결로 표시합니다.</p>
  </section>
}
