import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { chronicleRegistry } from './chronicleRegistry'
import { supabaseClient } from './supabaseClient'
import { googleOAuthErrorMessage, oauthRedirectError, operatorOAuthRedirectUrl } from './operatorAuth'

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

const emptyInbox: Inbox = { pending_count: 0, automation_error_count: 0, items: [] }
const rpcError = (error: { message: string }) => error.message.replace(/^.*SURVIVAL_ARCHIVE_/, '권한 또는 요청 오류: SURVIVAL_ARCHIVE_')

export default function OperatorConsole() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inbox, setInbox] = useState<Inbox>(emptyInbox)
  const [selected, setSelected] = useState<ReviewDetail | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true); setError('')
    const { data, error: inboxError } = await supabaseClient.rpc('archive_operator_review_inbox')
    if (inboxError) setError(rpcError(inboxError))
    else setInbox((data ?? emptyInbox) as Inbox)
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
    const redirectError = oauthRedirectError(window.location)
    if (redirectError) {
      setError(redirectError)
      window.history.replaceState({}, '', '/operator/')
    }
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
    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) queueMicrotask(() => void refresh())
      else { setInbox(emptyInbox); setSelected(null) }
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [refresh])

  useEffect(() => { if (user) void refresh() }, [user, refresh])

  async function signInWithGoogle() {
    if (!supabaseClient) return
    setBusy(true); setError('')
    const { error: authError } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: operatorOAuthRedirectUrl(window.location.origin) },
    })
    if (authError) {
      setError(googleOAuthErrorMessage(authError.message))
      setBusy(false)
    }
  }

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
  if (!user) return <section className="operator-page operator-login"><p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p><h1>운영자 로그인</h1><p>Google 계정으로 로그인한 뒤에도 서버가 실제 운영자 권한을 다시 확인합니다.</p>
    {error && <p className="operator-error" role="alert">{error}</p>}
    <button className="operator-google-login" disabled={busy} onClick={() => void signInWithGoogle()}><span aria-hidden="true">G</span>{busy ? 'Google 로그인 연결 중…' : 'Google로 로그인'}</button>
    <p className="operator-login-help">Google 비밀번호는 이 사이트에 입력하지 않습니다. Google 공식 로그인 화면에서만 인증합니다.</p>
    <details className="operator-login-fallback"><summary>기존 이메일 운영자 로그인 사용</summary><form onSubmit={signIn}><label>이메일<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={busy}>{busy ? '확인 중…' : '이메일로 로그인'}</button></form></details>
  </section>

  return <section className="operator-page"><header className="operator-heading"><div><p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p><h1>Review Inbox</h1><p>{user.email} · 데이터 변경은 권한 검사를 거치는 서버 RPC로 처리됩니다.</p></div><button className="operator-secondary" disabled={busy} onClick={() => void signOut()}>로그아웃</button></header>
    {error && <p className="operator-error" role="alert">{error}</p>}
    <div className="operator-counts"><article><span>Human Review</span><strong>{inbox.pending_count}</strong></article><article><span>Automation Error</span><strong>{inbox.automation_error_count}</strong></article><article><span>Security Alert</span><strong>—</strong></article><article><span>Cost Alert</span><strong>—</strong></article></div>
    <div className="operator-grid"><section className="operator-panel"><header><h2>대기 항목</h2><button className="operator-secondary" disabled={busy} onClick={() => void refresh()}>새로고침</button></header>
      {busy && <p className="operator-muted" aria-live="polite">처리 중…</p>}{!inbox.items.length && <p className="operator-empty">현재 대기 중인 검토 항목이 없습니다.</p>}
      <ul className="operator-inbox">{inbox.items.map((item) => <li key={item.id}><button className={selected?.id === item.id ? 'selected' : ''} onClick={() => void loadDetail(item.id)}><span><b>{item.priority}</b><b>{item.item_type}</b><b>{item.risk_level}</b></span><strong>{item.title}</strong><small>{item.source_worker} · {item.status} · {item.chronicle_id ?? '공용'}</small><p>{item.summary}</p></button></li>)}</ul>
    </section><section className="operator-panel operator-detail"><h2>항목 상세</h2>{!selected ? <p className="operator-empty">검토 항목을 선택하세요.</p> : <>
      <p className="archive-eyebrow">{selected.priority} · {selected.risk_level} · {selected.status}</p><h3>{selected.title}</h3><p>{selected.summary}</p><dl><div><dt>유형</dt><dd>{selected.source_worker} / {selected.item_type}</dd></div><div><dt>Chronicle</dt><dd>{selected.chronicle_id ?? '공용'}</dd></div><div><dt>원본</dt><dd><a href={selected.source_ref} target="_blank" rel="noreferrer">원본 열기</a></dd></div></dl>
      <details><summary>Payload</summary><pre>{JSON.stringify(selected.payload, null, 2)}</pre></details>
      {!!selected.decision_history.length && <div className="operator-history"><h4>결정 기록</h4>{selected.decision_history.map((entry, index) => <p key={index}>{entry.decision} · {entry.actor ?? '운영자'} · {new Date(entry.created_at).toLocaleString()} {entry.note && `· ${entry.note}`}</p>)}</div>}
      {selected.status === 'PENDING' && <div className="operator-decision"><label>검토 메모<textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label><div><button disabled={busy} onClick={() => void decide('APPROVED')}>승인</button><button className="operator-secondary" disabled={busy} onClick={() => void decide('HOLD')}>보류</button><button className="operator-danger" disabled={busy} onClick={() => void decide('REJECTED')}>거절</button></div></div>}
    </>}</section></div>
    <section className="operator-panel operator-chronicles"><h2>Chronicles</h2><div>{chronicleRegistry.map((item) => <span key={item.id}>C{String(item.number).padStart(2,'0')} · {item.title}</span>)}</div></section>
    <p className="operator-muted">A Archive · B Visual · C Knowledge · 검토 결정은 Supabase에만 기록되며 GitHub merge 또는 Netlify 배포를 실행하지 않습니다.</p>
  </section>
}
