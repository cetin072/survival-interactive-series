import { useCallback, useEffect, useState } from 'react'
import { supabaseClient } from './supabaseClient'
import { formatOperatorTime } from './operatorSystemStatus'

export type BunkerOsSourceCandidate = { title: string; url?: string | null; note?: string | null }
export type BunkerOsApproval = { title: string; reason?: string | null; cost?: string | null }
export type BunkerOsLogDetails = {
  actions?: string[]
  findings?: string[]
  invalidated_hypotheses?: string[]
  source_candidates?: BunkerOsSourceCandidate[]
  decision_candidates?: string[]
  experiment_candidates?: string[]
  approvals?: BunkerOsApproval[]
  next_actions?: string[]
}
export type BunkerOsLog = {
  id: string
  cycle_key: string
  phase: string
  day_index: number | null
  status: 'RUNNING' | 'COMPLETED' | 'BLOCKED' | 'APPROVAL_REQUIRED'
  title: string
  summary: string
  details: BunkerOsLogDetails
  occurred_at: string
}
export type BunkerOsDashboard = {
  current_cycle: string | null
  total_count: number
  completed_count: number
  blocked_count: number
  approval_count: number
  latest_at: string | null
  logs: BunkerOsLog[]
}

export const emptyBunkerOsDashboard: BunkerOsDashboard = {
  current_cycle: null,
  total_count: 0,
  completed_count: 0,
  blocked_count: 0,
  approval_count: 0,
  latest_at: null,
  logs: [],
}

const statusLabel = (status: BunkerOsLog['status']) =>
  status === 'COMPLETED' ? '완료' : status === 'BLOCKED' ? '막힘' : status === 'APPROVAL_REQUIRED' ? '승인 필요' : '진행 중'
const statusTone = (status: BunkerOsLog['status']) =>
  status === 'COMPLETED' ? 'ok' : status === 'RUNNING' ? 'neutral' : 'warning'
const cycleLabel = (cycle: string | null) =>
  cycle === 'MONTH01_FIND_THE_ENGINE' ? 'Month 01 · FIND THE ENGINE' : cycle ?? '아직 기록 없음'

function TextList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return <section className="bunker-os-log-section"><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
}

export function BunkerOsDashboardView({
  email,
  busy,
  error,
  dashboard,
  onRefresh,
  onSignOut,
}: {
  email?: string | null
  busy: boolean
  error: string
  dashboard: BunkerOsDashboard
  onRefresh: () => void
  onSignOut: () => void
}) {
  return <section className="operator-page">
    <header className="operator-heading">
      <div>
        <p className="archive-eyebrow">SURVIVAL DIARY · BUNKER OS</p>
        <h1>감독 대시보드</h1>
        <p>{email} · AI 운영총괄의 조사·판단·실험 기록을 날짜순으로 확인합니다.</p>
      </div>
      <div className="operator-heading-actions">
        <a className="operator-secondary" href="/operator/">운영 상황판</a>
        <a className="operator-secondary" href="/operator/knowledge/">생존 지식 검토함</a>
        <button className="operator-secondary" disabled={busy} onClick={onSignOut}>로그아웃</button>
      </div>
    </header>

    {error && <p className="operator-error" role="alert">{error}</p>}

    <section className="operator-system bunker-os-overview">
      <header>
        <div>
          <p className="archive-eyebrow">CURRENT CYCLE</p>
          <h2>{cycleLabel(dashboard.current_cycle)}</h2>
          <p className="operator-muted">마지막 기록 {formatOperatorTime(dashboard.latest_at)} · 일일 실행은 작업일지에 누적되고 중요한 학습만 GitHub Bunker OS로 승격됩니다.</p>
        </div>
        <button className="operator-secondary operator-refresh-button" disabled={busy} onClick={onRefresh}>↻ 새로고침</button>
      </header>
    </section>

    <div className="operator-counts bunker-os-counts">
      <article><span>운영 기록</span><strong>{dashboard.total_count}</strong></article>
      <article><span>완료</span><strong>{dashboard.completed_count}</strong></article>
      <article><span>승인 대기</span><strong>{dashboard.approval_count}</strong></article>
      <article><span>막힘</span><strong>{dashboard.blocked_count}</strong></article>
    </div>

    <section className="operator-panel">
      <header><h2>AI 운영 일지</h2><strong>{dashboard.logs.length}건 표시</strong></header>
      {busy && !dashboard.logs.length && <p className="operator-muted" aria-live="polite">기록을 불러오는 중…</p>}
      {!busy && !dashboard.logs.length && <p className="operator-empty">아직 기록된 Bunker OS 운영일지가 없습니다.</p>}
      <div className="bunker-os-log-list">
        {dashboard.logs.map((log) => <article className="bunker-os-log" key={log.id}>
          <header>
            <div>
              <p className="archive-eyebrow">{log.phase}{log.day_index ? ` · Day ${log.day_index}` : ''}</p>
              <h3>{log.title}</h3>
              <small>{formatOperatorTime(log.occurred_at)}</small>
            </div>
            <span className={`operator-status-badge ${statusTone(log.status)}`}>{statusLabel(log.status)}</span>
          </header>
          <p>{log.summary}</p>
          <TextList title="실행한 것" items={log.details.actions} />
          <TextList title="핵심 발견" items={log.details.findings} />
          <TextList title="틀린 가설·반박" items={log.details.invalidated_hypotheses} />
          {!!log.details.source_candidates?.length && <section className="bunker-os-log-section"><h4>Source 후보</h4><ul>{log.details.source_candidates.map((source, index) => <li key={index}>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}{source.note ? ` · ${source.note}` : ''}</li>)}</ul></section>}
          <TextList title="Decision 후보" items={log.details.decision_candidates} />
          <TextList title="Experiment 후보" items={log.details.experiment_candidates} />
          {!!log.details.approvals?.length && <section className="bunker-os-log-section bunker-os-approval"><h4>감독 승인 필요</h4><ul>{log.details.approvals.map((approval, index) => <li key={index}><strong>{approval.title}</strong>{approval.reason ? ` · ${approval.reason}` : ''}{approval.cost ? ` · 비용 ${approval.cost}` : ''}</li>)}</ul></section>}
          <TextList title="다음 작업" items={log.details.next_actions} />
        </article>)}
      </div>
    </section>
  </section>
}

export function OperatorBunkerOsDashboard({ email, busy: parentBusy, onSignOut }: { email?: string | null; busy: boolean; onSignOut: () => void }) {
  const [dashboard, setDashboard] = useState<BunkerOsDashboard>(emptyBunkerOsDashboard)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true); setError('')
    const { data, error: rpcError } = await supabaseClient.rpc('archive_operator_bunker_os_dashboard', { p_limit: 50 })
    if (rpcError) setError('Bunker OS 운영일지를 불러오지 못했습니다.')
    else setDashboard((data ?? emptyBunkerOsDashboard) as BunkerOsDashboard)
    setBusy(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return <BunkerOsDashboardView
    email={email}
    busy={parentBusy || busy}
    error={error}
    dashboard={dashboard}
    onRefresh={() => void refresh()}
    onSignOut={onSignOut}
  />
}
