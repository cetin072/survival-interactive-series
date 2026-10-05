import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { OperatorVisualMetadata } from './OperatorVisualMetadata'
import { OperatorKnowledgeInbox } from './OperatorKnowledgeInbox'
import { OperatorKnowledgeDetail } from './OperatorKnowledgeDetail'
import { OperatorIllustrationVault } from './OperatorIllustrationVault'
import { supabaseClient } from './supabaseClient'
import { operatorPasswordRedirectUrl, validatePasswordChange } from './operatorPassword'
import './operator.css'
import {
  OperatorDashboard,
  emptyInbox,
  type DeployMeta,
  type Inbox,
  type ProductionStatus,
  type ReleaseMarker,
  type ReviewDetail,
  type SystemStatus,
} from './OperatorDashboard'

const rpcError = (error: { message: string }) => error.message.replace(/^.*SURVIVAL_ARCHIVE_/, '권한 또는 요청 오류: SURVIVAL_ARCHIVE_')
const readJson = async <T,>(path: string): Promise<T | null> => {
  try {
    const response = await fetch(path, { cache: 'no-store' })
    return response.ok ? await response.json() as T : null
  } catch {
    return null
  }
}

export default function OperatorConsole({ view = 'dashboard', knowledgeJobId }: { view?: 'dashboard' | 'visuals' | 'knowledge' | 'knowledge-detail' | 'vault'; knowledgeJobId?: string }) {
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
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const initialDashboardLoaded = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true); setRefreshing(true); setError(''); setStatusError('')
    try {
      const [inboxResult, systemResult, release, deploy] = await Promise.all([
        supabaseClient.rpc('archive_operator_review_inbox'),
        supabaseClient.rpc('archive_operator_system_status'),
        readJson<ReleaseMarker>('/release/production.json'),
        readJson<DeployMeta>('/deploy-meta.json'),
      ])
      if (inboxResult.error) setError(rpcError(inboxResult.error))
      else setInbox((inboxResult.data ?? emptyInbox) as Inbox)
      if (systemResult.error) {
        setSystemStatus(null)
        setStatusError('자동화 실행 상태를 불러오지 못했습니다.')
      }
      else setSystemStatus(systemResult.data as SystemStatus)
      setProductionStatus({ release, deploy })
      setLastRefreshedAt(new Date().toISOString())
    } finally {
      setRefreshing(false)
      setBusy(false)
    }
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
  if (view === 'knowledge-detail' && knowledgeJobId) return <OperatorKnowledgeDetail jobId={knowledgeJobId} email={user.email} busy={busy} onSignOut={() => void signOut()} />
  if (view === 'vault') return <OperatorIllustrationVault email={user.email} busy={busy} onSignOut={() => void signOut()} />

  if (view === 'visuals') return <section className="operator-page">
    <header className="operator-heading"><div><p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p><h1>시각 제작 메타</h1><p>{user.email} · 이미지 제작과 운영 검수에만 사용하는 내부 메타입니다.</p></div><div className="operator-heading-actions"><a className="operator-secondary" href="/operator/">대시보드로 돌아가기</a><a className="operator-secondary" href="/operator/vault/">일러스트 보관함</a><a className="operator-secondary" href="/operator/knowledge/">Knowledge Inbox</a><button className="operator-secondary" disabled={busy} onClick={() => void signOut()}>로그아웃</button></div></header>
    <OperatorVisualMetadata />
  </section>

  return <OperatorDashboard
    email={user.email}
    busy={busy}
    refreshing={refreshing}
    lastRefreshedAt={lastRefreshedAt}
    error={error}
    statusError={statusError}
    inbox={inbox}
    systemStatus={systemStatus}
    productionStatus={productionStatus}
    selected={selected}
    note={note}
    onNoteChange={setNote}
    onRefresh={() => void refresh()}
    onLoadDetail={(id) => void loadDetail(id)}
    onDecide={(decision) => void decide(decision)}
    onSignOut={() => void signOut()}
  />
}
