import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { chronicleRegistry } from './chronicleRegistry'
import { OperatorVisualMetadata } from './OperatorVisualMetadata'
import { OperatorKnowledgeInbox } from './OperatorKnowledgeInbox'
import { OperatorIllustrationVault } from './OperatorIllustrationVault'
import { supabaseClient } from './supabaseClient'
import { operatorPasswordRedirectUrl, validatePasswordChange } from './operatorPassword'
import {
  explainMachineCode,
  formatOperatorTime,
  operatorStaticStatus,
  productionStatusTone,
  shortSha,
  statusWithKorean,
  subjectWithKorean,
  timezoneWithKorean,
  visualStatusTone,
} from './operatorSystemStatus'

type ReviewItem = {
  id: string; source_worker: string; item_type: string; chronicle_id: string | null
  priority: string; title: string; summary: string; risk_level: string
  source_ref: string; status: string; created_at: string
}
type Decision = { decision: string; note: string | null; created_at: string; actor: string | null }
type ReviewDetail = ReviewItem & {
  payload: Record<string, unknown>; updated_at: string; decided_at: string | null
  decision_note: string | null; decision_history: Decision[]
}
type Inbox = { pending_count: number; automation_error_count: number; items: ReviewItem[] }
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
  last_error_code?: string | null; last_error_stage?: string | null
  created_at?: string | null; updated_at?: string | null; reviewed_at?: string | null; finalized_at?: string | null
}
type KnowledgeSemanticJob = {
  job_id?: string; job_type?: string; status?: string; source_kind?: string; source_ref?: string
  prepared_at?: string | null; submitted_at?: string | null; age_minutes?: number | null
  stalled_code?: string | null; result_decision?: string | null; final_pr_number?: number | null
  final_head_sha?: string | null; merge_sha?: string | null; blocker_code?: string | null; blocker_stage?: string | null
}
type SystemStatus = {
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
  knowledge_semantic?: { active_count: number; latest_job: KnowledgeSemanticJob | null; prep: { last_status?: string; last_stage?: string; blocker_code?: string | null; checked_at?: string | null } | null }
}
type ReleaseMarker = {
  source_main_sha?: string; released_on_kst?: string; interval_days?: number
  release_attempt?: number; policy?: string
}
type DeployMeta = { context?: string; commit_ref?: string; build_id?: string; provider?: string }
type ProductionStatus = { release: ReleaseMarker | null; deploy: DeployMeta | null }

const emptyInbox: Inbox = { pending_count: 0, automation_error_count: 0, items: [] }
const rpcError = (error: { message: string }) => error.message.replace(/^.*SURVIVAL_ARCHIVE_/, '권한 또는 요청 오류: SURVIVAL_ARCHIVE_')
const readJson = async <T,>(path: string): Promise<T | null> => {
  try {
    const response = await fetch(path, { cache: 'no-store' })
    return response.ok ? await response.json() as T : null
  } catch {
    return null
  }
}

export default function OperatorConsole({ view = 'dashboard' }: { view?: 'dashboard' | 'visuals' | 'knowledge' | 'vault' }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inbox, setInbox] = useState<Inbox>(emptyInbox)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [productionStatus, setProductionStatus] = useState<ProductionStatus>({ release: null, deploy: null })
  const [statusError, setStatusError] = useState('')
  const [selected, setSelected] = useState<ReviewDetail | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const initialDashboardLoaded = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true); setError(''); setStatusError('')
    const [inboxResult, systemResult, release, deploy] = await Promise.all([
      supabaseClient.rpc('archive_operator_review_inbox'),
      supabaseClient.rpc('archive_operator_system_status'),
      readJson<ReleaseMarker>('/release/production.json'),
      readJson<DeployMeta>('/deploy-meta.json'),
    ])
    if (inboxResult.error) setError(rpcError(inboxResult.error))
    else setInbox((inboxResult.data ?? emptyInbox) as Inbox)
    if (systemResult.error) setStatusError('자동화 실행 상태를 불러오지 못했습니다.')
    else setSystemStatus(systemResult.data as SystemStatus)
    setProductionStatus({ release, deploy })
    setBusy(false)
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    if (!supabaseClient) return
    setBusy(true); setError('')
    const { data, error: detailError } = await supabaseClient.rpc('archive_operator_review_item_detail', { p_item_id: id })
    if (detailError) setError(rpcError(detailError))
    else { setSelected(data as ReviewDetail); setNote((data as ReviewDetail).decision_note ?? '') }
    setBusy(false)
  }, [])

  useEffect(() => {
    if (!supabaseClient) { setReady(true); return }
    let alive = true
    // Restore cached session state without blocking the console on an auth-network round trip.
    // Database RPCs still perform the authoritative role/capability checks.
    void supabaseClient.auth.getSession().then(({ data, error: sessionError }) => {
      if (alive) {
        if (sessionError) setError('인증 상태를 확인하지 못했습니다. 다시 로그인하세요.')
        setUser(data.session?.user ?? null); setReady(true)
      }
    }).catch(() => { if (alive) setReady(true) })
    const { data: listener } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      setUser(session?.user ?? null)
      if (!session?.user) {
        initialDashboardLoaded.current = false
        setInbox(emptyInbox); setSelected(null)
      }
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [refresh, view])

  useEffect(() => {
    if (!user) {
      initialDashboardLoaded.current = false
      return
    }
    if (view === 'dashboard' && !initialDashboardLoaded.current) {
      initialDashboardLoaded.current = true
      void refresh()
    }
  }, [user?.id, refresh, view])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!supabaseClient) return
    setBusy(true); setError('')
    const { data, error: authError } = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password })
    setPassword('')
    if (authError) setError('로그인할 수 없습니다. 계정과 비밀번호를 확인하세요.')
    else setUser(data.user)
    setBusy(false)
  }

  async function requestPasswordReset() {
    if (!supabaseClient) return
    const target = email.trim()
    if (!target) { setError('비밀번호 재설정 메일을 받을 이메일을 먼저 입력하세요.'); return }
    setBusy(true); setError(''); setResetSent(false)
    const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(target, {
      redirectTo: operatorPasswordRedirectUrl(window.location.origin),
    })
    if (resetError) setError('비밀번호 재설정 메일을 보내지 못했습니다. 이메일을 확인하고 다시 시도하세요.')
    else setResetSent(true)
    setBusy(false)
  }

  async function finishPasswordRecovery(event: FormEvent) {
    event.preventDefault()
    if (!supabaseClient) return
    const validation = validatePasswordChange('', newPassword, confirmPassword, true)
    if (validation) { setError(validation); return }
    setBusy(true); setError('')
    const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPassword })
    if (updateError) setError('새 비밀번호를 저장하지 못했습니다. 다시 시도하세요.')
    else {
      setNewPassword(''); setConfirmPassword(''); setRecoveryMode(false)
    }
    setBusy(false)
  }

  async function decide(decision: 'APPROVED' | 'HOLD' | 'REJECTED') {
    if (!supabaseClient || !selected) return
    setBusy(true); setError('')
    const { data, error: decisionError } = await supabaseClient.rpc('archive_operator_decide_review_item', {
      p_item_id: selected.id, p_decision: decision, p_note: note.trim() || null,
    })
    if (decisionError) setError(rpcError(decisionError))
    else { setSelected(data as ReviewDetail); await refresh() }
    setBusy(false)
  }

  async function signOut() {
    if (!supabaseClient) return
    setBusy(true); const { error: signOutError } = await supabaseClient.auth.signOut()
    if (signOutError) setError('로그아웃에 실패했습니다.')
    setBusy(false)
  }

  if (!supabaseClient) return <section className="operator-page"><p className="archive-eyebrow">OPERATOR</p><h1>운영자 설정 필요</h1><p>VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY를 설정하면 기존 Supabase Auth로 로그인할 수 있습니다.</p></section>
  if (!ready) return <section className="operator-page" aria-live="polite">인증 상태를 확인하는 중…</section>
  if (recoveryMode) return <section className="operator-page operator-login"><p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p><h1>새 비밀번호 설정</h1><p>재설정 링크 인증이 완료되었습니다. 새 비밀번호를 직접 설정하세요.</p>
    {error && <p className="operator-error" role="alert">{error}</p>}
    <form onSubmit={finishPasswordRecovery}><label>새 비밀번호<input type="password" minLength={10} autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label><label>새 비밀번호 확인<input type="password" minLength={10} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><button disabled={busy}>{busy ? '저장 중…' : '새 비밀번호 저장'}</button></form>
  </section>

  if (!user) return <section className="operator-page operator-login"><p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p><h1>운영자 로그인</h1><p>활성 운영 계정의 이메일과 비밀번호로 로그인하세요.</p>
    {error && <p className="operator-error" role="alert">{error}</p>}
    {resetSent && <p className="operator-success" role="status">비밀번호 재설정 메일을 요청했습니다. 메일의 링크를 열어 새 비밀번호를 설정하세요.</p>}
    <form onSubmit={signIn}><label>이메일<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={busy}>{busy ? '확인 중…' : '로그인'}</button></form>
    <button type="button" className="operator-reset-link" disabled={busy} onClick={() => void requestPasswordReset()}>비밀번호를 모르겠어요 · 재설정 메일 받기</button>
  </section>

  if (view === 'knowledge') return <OperatorKnowledgeInbox email={user.email} busy={busy} onSignOut={() => void signOut()} />
  if (view === 'vault') return <OperatorIllustrationVault email={user.email} busy={busy} onSignOut={() => void signOut()} />

  if (view === 'visuals') return <section className="operator-page">
    <header className="operator-heading"><div><p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p><h1>시각 제작 메타</h1><p>{user.email} · 이미지 제작과 운영 검수에만 사용하는 내부 메타입니다.</p></div><div className="operator-heading-actions"><a className="operator-secondary" href="/operator/">대시보드로 돌아가기</a><a className="operator-secondary" href="/operator/vault/">일러스트 보관함</a><a className="operator-secondary" href="/operator/knowledge/">Knowledge Inbox</a><button className="operator-secondary" disabled={busy} onClick={() => void signOut()}>로그아웃</button></div></header>
  </section>

  const archiveCron = systemStatus?.archive.cron ?? null
  const archiveDispatch = systemStatus?.archive.latest_dispatch ?? null
  const archiveHealthy = archiveCron?.active === true && archiveCron.last_status === 'succeeded'
  const visualLatest = systemStatus?.visual.latest_job ?? null
  const visualPrepHealthy = systemStatus?.visual.prep_cron?.active === true
    && systemStatus?.visual.prep_cron?.last_status === 'succeeded'
    && systemStatus?.visual.retry_cron?.active === true
    && systemStatus?.visual.retry_cron?.last_status === 'succeeded'
  const semanticLatest = systemStatus?.knowledge_semantic?.latest_job ?? null
  const semanticBlocker = semanticLatest?.stalled_code ?? semanticLatest?.blocker_code ?? systemStatus?.knowledge_semantic?.prep?.blocker_code ?? null
  const semanticBadgeClass = semanticBlocker ? 'warning' : semanticLatest?.status === 'PUBLISHED' ? 'ok' : ['HUMAN_REVIEW','BLOCKED','HOLD'].includes(semanticLatest?.status ?? '') ? 'warning' : 'neutral'
  const knowledgeLatestBrief = operatorStaticStatus.knowledge.latestBriefIds.at(-1) ?? '없음'
  const knowledgeNeedsReview = inbox.pending_count > 0
  const productionContext = productionStatus.deploy?.context ?? null

  return <section className="operator-page"><header className="operator-heading"><div><p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p><h1>Operator Dashboard</h1><p>{user.email} · 실제 자동화 상태와 검토 대기 항목을 한곳에서 확인합니다.</p></div><div className="operator-heading-actions"><a className="operator-secondary" href="/operator/vault/">일러스트 보관함</a><a className="operator-secondary" href="/operator/knowledge/">Knowledge Inbox</a><a className="operator-secondary" href="/operator/visuals/">시각 제작 메타</a><button className="operator-secondary" disabled={busy} onClick={() => void signOut()}>로그아웃</button></div></header>
    {error && <p className="operator-error" role="alert">{error}</p>}
    {statusError && <p className="operator-error" role="alert">{statusError}</p>}
    <div className="operator-counts"><article><span>사람 검토 · Human Review</span><strong>{inbox.pending_count}</strong></article><article><span>자동화 오류 · Automation Error</span><strong>{inbox.automation_error_count}</strong></article><article><span>보안 알림 · Security</span><strong className="operator-unwired">미연결</strong></article><article><span>비용 알림 · Cost</span><strong className="operator-unwired">미연결</strong></article></div>

    <section className="operator-system">
      <header><div><p className="archive-eyebrow">SYSTEM STATUS</p><h2>자동화 상태</h2></div><button className="operator-secondary" disabled={busy} onClick={() => void refresh()}>상태 새로고침</button></header>
      <div className="operator-system-grid">
        <article className="operator-system-card">
          <div className="operator-system-title"><h3>A · Archive <small>아카이브</small></h3><span className={`operator-status-badge ${archiveHealthy ? 'ok' : archiveCron ? 'warning' : 'neutral'}`}>{archiveHealthy ? '작동 중' : archiveCron?.active === false ? '중지' : archiveCron ? statusWithKorean(archiveCron.last_status) : '기록 없음'}</span></div>
          <dl>
            <div><dt>모드</dt><dd>{statusWithKorean(operatorStaticStatus.archive.mode)}</dd></div>
            <div><dt>자동 실행</dt><dd>{archiveCron?.active ? '켜짐' : archiveCron ? '꺼짐' : '기록 없음'} · {statusWithKorean(archiveCron?.last_status)}</dd></div>
            <div><dt>최근 Cron</dt><dd>{formatOperatorTime(archiveCron?.last_end_at ?? archiveCron?.last_start_at)}</dd></div>
            <div><dt>최근 GitHub 호출</dt><dd>{formatOperatorTime(archiveDispatch?.requested_at)}{archiveDispatch?.request_id ? ` · #${archiveDispatch.request_id}` : ''}</dd></div>
            <div><dt>누적 외부 호출</dt><dd>{systemStatus?.archive.dispatch_count ?? 0}건</dd></div>
          </dl>
        </article>

        <article className="operator-system-card">
          <div className="operator-system-title"><h3>B · Visual <small>이미지</small></h3><span className={`operator-status-badge ${visualStatusTone(visualLatest?.status)}`}>{visualLatest?.status ? statusWithKorean(visualLatest.status) : '실행이력 없음'}</span></div>
          <dl>
            <div><dt>Prep 자동실행</dt><dd>{visualPrepHealthy ? '정상' : '확인 필요'}</dd></div>
            <div><dt>오늘 시도 / 성공</dt><dd>{systemStatus?.visual.today_job_count ?? 0}건 / {systemStatus?.visual.today_success_count ?? 0}건</dd></div>
            <div><dt>활성 작업</dt><dd>{systemStatus?.visual.active_count ?? 0}건</dd></div>
            <div><dt>최근 대상</dt><dd>{visualLatest?.title ? `${visualLatest.title} · ${visualLatest.subject_id ?? ''}` : subjectWithKorean(visualLatest?.subject_id)}</dd></div>
            <div><dt>최근 상태 시각</dt><dd>{formatOperatorTime(visualLatest?.finalized_at ?? visualLatest?.reviewed_at ?? visualLatest?.updated_at ?? visualLatest?.created_at)}</dd></div>
            <div><dt>검수 판정</dt><dd>{visualLatest?.review_decision ? statusWithKorean(visualLatest.review_decision) : '—'}</dd></div>
            <div><dt>상세</dt><dd>{visualLatest?.blocker_code || visualLatest?.last_error_code ? <><code>{visualLatest.blocker_code ?? visualLatest.last_error_code}</code>{explainMachineCode(visualLatest.blocker_code ?? visualLatest.last_error_code) && <small className="operator-code-help">{explainMachineCode(visualLatest.blocker_code ?? visualLatest.last_error_code)}</small>}{(visualLatest.blocker_stage ?? visualLatest.last_error_stage) && <small className="operator-code-help">{visualLatest.blocker_stage ?? visualLatest.last_error_stage}</small>}</> : <>attempt {visualLatest?.attempt_no ?? '—'} · 누적 {systemStatus?.visual.job_count ?? 0}건</>}</dd></div>
          </dl>
        </article>

        <article className="operator-system-card">
          <div className="operator-system-title"><h3>C · Semantic <small>Knowledge 작업</small></h3><span className={`operator-status-badge ${semanticBadgeClass}`}>{semanticBlocker ?? semanticLatest?.status ?? '실행이력 없음'}</span></div>
          <dl>
            <div><dt>활성 작업</dt><dd>{systemStatus?.knowledge_semantic?.active_count ?? 0}건</dd></div>
            <div><dt>종류 / 판정</dt><dd>{semanticLatest?.job_type ?? '—'} · {semanticLatest?.result_decision ?? '—'}</dd></div>
            <div><dt>Source</dt><dd>{semanticLatest?.source_kind ?? '—'} · {semanticLatest?.source_ref?.split('/').slice(-2).join('/') ?? '—'}</dd></div>
            <div><dt>준비 / 제출</dt><dd>{formatOperatorTime(semanticLatest?.prepared_at)} / {formatOperatorTime(semanticLatest?.submitted_at)}</dd></div>
            <div><dt>경과</dt><dd>{semanticLatest?.age_minutes == null ? '—' : `${semanticLatest.age_minutes}분`}</dd></div>
            <div><dt>PR / 결과</dt><dd>{semanticLatest?.final_pr_number ? `#${semanticLatest.final_pr_number}` : '—'} · {semanticLatest?.status ?? '—'}</dd></div>
            <div><dt>Merge SHA</dt><dd>{semanticLatest?.merge_sha?.slice(0, 12) ?? '—'}</dd></div>
            <div><dt>차단 사유</dt><dd>{semanticBlocker ? <><code>{semanticBlocker}</code>{semanticLatest?.blocker_stage && <small className="operator-code-help">{semanticLatest.blocker_stage}</small>}</> : '없음'}</dd></div>
            <div><dt>Prep 상태</dt><dd>{systemStatus?.knowledge_semantic?.prep?.last_status ?? '기록 없음'} · {systemStatus?.knowledge_semantic?.prep?.last_stage ?? '—'}</dd></div>
          </dl>
        </article>

        <article className="operator-system-card">
          <div className="operator-system-title"><h3>C · Knowledge <small>생존 지식</small></h3><span className={`operator-status-badge ${knowledgeNeedsReview ? 'warning' : 'ok'}`}>{knowledgeNeedsReview ? '검토 필요' : operatorStaticStatus.knowledge.workerEnabled ? '정상' : '중지'}</span></div>
          <dl>
            <div><dt>최근 처리</dt><dd>{knowledgeLatestBrief}</dd></div>
            <div><dt>처리 시각</dt><dd>{formatOperatorTime(operatorStaticStatus.knowledge.latestProcessedAt)}</dd></div>
            <div><dt>검토 대기</dt><dd>{inbox.pending_count}건</dd></div>
            <div><dt>주기</dt><dd>{operatorStaticStatus.knowledge.triggerIntervalHours}시간 · {timezoneWithKorean(operatorStaticStatus.knowledge.timezone)}</dd></div>
          </dl>
        </article>

        <article className="operator-system-card">
          <div className="operator-system-title"><h3>Production <small>실사이트 배포</small></h3><span className={`operator-status-badge ${productionStatusTone(productionContext)}`}>{productionContext === 'production' ? '정상' : productionContext ?? '확인 필요'}</span></div>
          <dl>
            <div><dt>원본 기준</dt><dd><code>{shortSha(productionStatus.release?.source_main_sha)}</code><small className="operator-code-help">Source SHA · 배포에 포함된 원본 코드 기준값</small></dd></div>
            <div><dt>배포 기준</dt><dd><code>{shortSha(productionStatus.deploy?.commit_ref)}</code><small className="operator-code-help">Deploy SHA · 실제 사이트에 올라간 코드 버전</small></dd></div>
            <div><dt>최근 배치</dt><dd>{productionStatus.release?.released_on_kst ?? '기록 없음'}</dd></div>
            <div><dt>정책</dt><dd>{operatorStaticStatus.release.productionIntervalDays}일 배치 · {operatorStaticStatus.release.releaseHourKst}시 · 일 최대 {operatorStaticStatus.release.maxProductionDeploysPerDay}회</dd></div>
          </dl>
        </article>
      </div>
      <p className="operator-muted">A는 실제 Supabase Cron과 GitHub 외부 호출 기록, B는 현재 이미지 Render/Review/Finalizer job 상태를 보여줍니다. C는 생존 지식 자동화의 최근 처리 상태를 보여줍니다. 상태는 로그인 시 한 번 불러오며 이후에는 상태 새로고침 버튼을 눌렀을 때 갱신됩니다.</p>
    </section>

    <div className="operator-grid"><section className="operator-panel"><header><h2>대기 항목</h2><button className="operator-secondary" disabled={busy} onClick={() => void refresh()}>새로고침</button></header>
      {busy && <p className="operator-muted" aria-live="polite">처리 중…</p>}{!inbox.items.length && <p className="operator-empty">현재 대기 중인 검토 항목이 없습니다.</p>}
      <ul className="operator-inbox">{inbox.items.map((item) => <li key={item.id}><button className={selected?.id === item.id ? 'selected' : ''} onClick={() => void loadDetail(item.id)}><span><b>{item.priority}</b><b>{item.item_type}</b><b>{item.risk_level}</b></span><strong>{item.title}</strong><small>{item.source_worker} · {item.status} · {item.chronicle_id ?? '공용'}</small><p>{item.summary}</p></button></li>)}</ul>
    </section><section className="operator-panel operator-detail"><h2>항목 상세</h2>{!selected ? <p className="operator-empty">검토 항목을 선택하세요.</p> : <>
      <p className="archive-eyebrow">{selected.priority} · {selected.risk_level} · {selected.status}</p><h3>{selected.title}</h3><p>{selected.summary}</p><dl><div><dt>유형</dt><dd>{selected.source_worker} / {selected.item_type}</dd></div><div><dt>Chronicle</dt><dd>{selected.chronicle_id ?? '공용'}</dd></div><div><dt>원본</dt><dd><a href={selected.source_ref} target="_blank" rel="noreferrer">원본 열기</a></dd></div></dl>
      <details><summary>Payload</summary><pre>{JSON.stringify(selected.payload, null, 2)}</pre></details>
      {!!selected.decision_history.length && <div className="operator-history"><h4>결정 기록</h4>{selected.decision_history.map((entry, index) => <p key={index}>{entry.decision} · {entry.actor ?? '운영자'} · {new Date(entry.created_at).toLocaleString()} {entry.note && `· ${entry.note}`}</p>)}</div>}
      {selected.status === 'PENDING' && <div className="operator-decision"><label>검토 메모<textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label><div><button disabled={busy} onClick={() => void decide('APPROVED')}>승인</button><button className="operator-secondary" disabled={busy} onClick={() => void decide('HOLD')}>보류</button><button className="operator-danger" disabled={busy} onClick={() => void decide('REJECTED')}>거절</button></div></div>}
    </>}</section></div>
    <OperatorVisualMetadata />
    <section className="operator-panel operator-chronicles"><h2>Chronicles</h2><div>{chronicleRegistry.map((item) => <span key={item.id}>C{String(item.number).padStart(2,'0')} · {item.title}</span>)}</div></section>
    <p className="operator-muted">검토 결정은 Supabase에 기록되고, 승인된 C 항목만 기존 GitHub CI와 Batched Production 흐름으로 이어집니다. Security/Cost는 실제 데이터원이 연결될 때까지 미연결로 표시합니다.</p>
  </section>
}
