import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseClient } from './supabaseClient'
import { formatOperatorTime } from './operatorSystemStatus'

export type BunkerOsStatus = 'RUNNING' | 'COMPLETED' | 'BLOCKED' | 'APPROVAL_REQUIRED'
export type BunkerOsSourceCategory = 'DISASTER_SURVIVAL' | 'BUNKER_BUILD' | 'BUSINESS_STRATEGY' | 'PRODUCT_MARKET' | 'TECH_AUTOMATION' | 'OTHER'
export type BunkerOsSourceCandidate = { title: string; url?: string | null; note?: string | null; category?: BunkerOsSourceCategory | string | null }
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
  status: BunkerOsStatus
  title: string
  summary: string
  details: BunkerOsLogDetails
  occurred_at: string
  reviewed_at?: string | null
  review_note?: string | null
  reviewer?: string | null
}
export type BunkerOsDashboard = {
  current_cycle: string | null
  total_count: number
  running_count: number
  completed_count: number
  blocked_count: number
  approval_count: number
  latest_at: string | null
  logs: BunkerOsLog[]
}
export type BunkerOsLogList = { total_count: number; logs: BunkerOsLog[] }
export type BunkerOsSourceItem = {
  source_key: string
  title: string
  url?: string | null
  note?: string | null
  category: string
  log_id: string
  log_title: string
  cycle_key: string
  occurred_at: string
}
export type BunkerOsSources = { total_count: number; sources: BunkerOsSourceItem[] }

export const emptyBunkerOsDashboard: BunkerOsDashboard = {
  current_cycle: null, total_count: 0, running_count: 0, completed_count: 0,
  blocked_count: 0, approval_count: 0, latest_at: null, logs: [],
}
export const emptyBunkerOsLogList: BunkerOsLogList = { total_count: 0, logs: [] }
export const emptyBunkerOsSources: BunkerOsSources = { total_count: 0, sources: [] }

export const statusLabel = (status: BunkerOsStatus) =>
  status === 'COMPLETED' ? '완료' : status === 'BLOCKED' ? '막힘' : status === 'APPROVAL_REQUIRED' ? '내 확인 필요' : '진행 중'
const statusTone = (status: BunkerOsStatus) =>
  status === 'COMPLETED' ? 'ok' : status === 'RUNNING' ? 'neutral' : 'warning'
export const cycleLabel = (cycle: string | null) =>
  cycle === 'MONTH01_FIND_THE_ENGINE' ? '첫 달 · 돈이 되는 엔진 찾기' : cycle ?? '아직 기록 없음'
export const phaseLabel = (phase: string) => ({
  SYSTEM_SETUP: '시스템 준비',
  WEEK_1_FIND_THE_GAME: '1주차 · 방향 찾기',
  WEEK_2_FIND_THE_ACTION: '2주차 · 행동 찾기',
  WEEK_3_FIND_THE_TRAFFIC: '3주차 · 유입 찾기',
  WEEK_4_FIND_THE_ENGINE: '4주차 · 엔진 찾기',
}[phase] ?? phase.replaceAll('_', ' '))

export const sourceCategoryLabel = (category: string) => ({
  DISASTER_SURVIVAL: '재난·생존',
  BUNKER_BUILD: '벙커·건축',
  BUSINESS_STRATEGY: '사업·전략',
  PRODUCT_MARKET: '상품·시장',
  TECH_AUTOMATION: '기술·자동화',
  OTHER: '기타',
}[category] ?? '기타')

function TextList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return <section className="bunker-os-log-section"><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
}

function BunkerOsHeader({ email, busy, onSignOut }: { email?: string | null; busy: boolean; onSignOut: () => void }) {
  return <header className="operator-heading">
    <div>
      <p className="archive-eyebrow">생존일기 · 감독 화면</p>
      <h1>Bunker OS</h1>
      <p>{email} · AI 운영총괄이 한 일과 내가 확인할 일을 쉽게 나눠 봅니다.</p>
    </div>
    <div className="operator-heading-actions">
      <a className="operator-secondary" href="/operator/bunker-os/">상황판</a>
      <a className="operator-secondary" href="/operator/bunker-os/logs/">작업 기록</a>
      <a className="operator-secondary" href="/operator/bunker-os/sources/">자료함</a>
      <a className="operator-secondary" href="/operator/">자동화 상황판</a>
      <button className="operator-secondary" disabled={busy} onClick={onSignOut}>로그아웃</button>
    </div>
  </header>
}

function RecentLogs({ logs }: { logs: BunkerOsLog[] }) {
  if (!logs.length) return <p className="operator-empty">아직 기록이 없습니다.</p>
  return <ul className="bunker-os-board-list">
    {logs.slice(0, 3).map((log) => <li key={log.id}>
      <a href={`/operator/bunker-os/log/${log.id}/`}>
        <span><b>{phaseLabel(log.phase)}</b><b>{statusLabel(log.status)}</b></span>
        <strong>{log.title}</strong>
        <p>{log.summary}</p>
        <small>{formatOperatorTime(log.occurred_at)} · 자세히 보기 →</small>
      </a>
    </li>)}
  </ul>
}

export function BunkerOsDashboardView({
  email, busy, error, dashboard, onRefresh, onSignOut,
}: {
  email?: string | null; busy: boolean; error: string; dashboard: BunkerOsDashboard
  onRefresh: () => void; onSignOut: () => void
}) {
  return <section className="operator-page">
    <BunkerOsHeader email={email} busy={busy} onSignOut={onSignOut} />
    {error && <p className="operator-error" role="alert">{error}</p>}

    <section className="operator-system bunker-os-overview">
      <header>
        <div>
          <p className="archive-eyebrow">현재 진행</p>
          <h2>{cycleLabel(dashboard.current_cycle)}</h2>
          <p className="operator-muted">마지막 기록 {formatOperatorTime(dashboard.latest_at)} · 중요한 장기 판단만 GitHub Bunker OS에 따로 남깁니다.</p>
        </div>
        <button className="operator-secondary operator-refresh-button" disabled={busy} onClick={onRefresh}>↻ 새로고침</button>
      </header>
    </section>

    <div className="operator-counts bunker-os-counts">
      <a href="/operator/bunker-os/running/"><span>진행 중</span><strong>{dashboard.running_count}</strong><small>지금 하고 있는 일</small></a>
      <a href="/operator/bunker-os/review/"><span>내 확인 필요</span><strong>{dashboard.approval_count}</strong><small>내가 버튼을 눌러야 하는 일</small></a>
      <a href="/operator/bunker-os/completed/"><span>완료</span><strong>{dashboard.completed_count}</strong><small>끝난 작업</small></a>
      <a href="/operator/bunker-os/blocked/"><span>막힘</span><strong>{dashboard.blocked_count}</strong><small>문제가 있어 멈춘 일</small></a>
    </div>

    <div className="bunker-os-quick-links">
      <a className="operator-secondary" href="/operator/bunker-os/logs/">전체 작업 기록 {dashboard.total_count}건</a>
      <a className="operator-secondary" href="/operator/bunker-os/sources/">모아둔 자료 보기</a>
    </div>

    <section className="operator-panel bunker-os-recent">
      <header><h2>최근 작업</h2><a href="/operator/bunker-os/logs/">전체 보기 →</a></header>
      <RecentLogs logs={dashboard.logs} />
    </section>
  </section>
}

const listTitle = (filter: BunkerOsStatus | null) =>
  filter === 'RUNNING' ? '진행 중인 작업' :
  filter === 'APPROVAL_REQUIRED' ? '내 확인이 필요한 작업' :
  filter === 'COMPLETED' ? '완료된 작업' :
  filter === 'BLOCKED' ? '막힌 작업' : '전체 작업 기록'

export function BunkerOsLogListView({
  email, busy, error, list, filter, onRefresh, onSignOut,
}: {
  email?: string | null; busy: boolean; error: string; list: BunkerOsLogList; filter: BunkerOsStatus | null
  onRefresh: () => void; onSignOut: () => void
}) {
  return <section className="operator-page">
    <BunkerOsHeader email={email} busy={busy} onSignOut={onSignOut} />
    {error && <p className="operator-error" role="alert">{error}</p>}
    <section className="operator-panel">
      <header><div><p className="archive-eyebrow">작업 기록</p><h2>{listTitle(filter)}</h2></div><button className="operator-secondary" disabled={busy} onClick={onRefresh}>새로고침</button></header>
      <div className="bunker-os-status-nav">
        <a href="/operator/bunker-os/logs/">전체</a><a href="/operator/bunker-os/running/">진행 중</a>
        <a href="/operator/bunker-os/review/">내 확인 필요</a><a href="/operator/bunker-os/completed/">완료</a><a href="/operator/bunker-os/blocked/">막힘</a>
      </div>
      <p className="operator-muted">{list.total_count}건 · 제목을 누르면 별도 상세 글로 열립니다.</p>
      {!list.logs.length && <p className="operator-empty">해당 상태의 작업이 없습니다.</p>}
      <ul className="bunker-os-board-list">
        {list.logs.map((log) => <li key={log.id}>
          <a href={`/operator/bunker-os/log/${log.id}/`}>
            <span><b>{phaseLabel(log.phase)}</b><b>{statusLabel(log.status)}</b>{log.day_index ? <b>Day {log.day_index}</b> : null}</span>
            <strong>{log.title}</strong>
            <p>{log.summary}</p>
            <small>{formatOperatorTime(log.occurred_at)} · 상세 글 보기 →</small>
          </a>
        </li>)}
      </ul>
    </section>
  </section>
}

export function BunkerOsLogDetailView({
  email, busy, error, log, note, onNoteChange, onMarkReviewed, onRefresh, onSignOut,
}: {
  email?: string | null; busy: boolean; error: string; log: BunkerOsLog | null; note: string
  onNoteChange: (value: string) => void; onMarkReviewed: () => void; onRefresh: () => void; onSignOut: () => void
}) {
  return <section className="operator-page">
    <BunkerOsHeader email={email} busy={busy} onSignOut={onSignOut} />
    {error && <p className="operator-error" role="alert">{error}</p>}
    {!log ? <section className="operator-panel"><p className="operator-empty">{busy ? '기록을 불러오는 중…' : '기록을 찾지 못했습니다.'}</p></section> :
      <article className="operator-panel bunker-os-detail-page">
        <header className="bunker-os-detail-head">
          <div><p className="archive-eyebrow">{phaseLabel(log.phase)}{log.day_index ? ` · Day ${log.day_index}` : ''}</p><h2>{log.title}</h2><small>{formatOperatorTime(log.occurred_at)}</small></div>
          <span className={`operator-status-badge ${statusTone(log.status)}`}>{statusLabel(log.status)}</span>
        </header>
        <p className="bunker-os-detail-summary">{log.summary}</p>
        <TextList title="한 일" items={log.details.actions} />
        <TextList title="중요하게 알아낸 것" items={log.details.findings} />
        <TextList title="생각이 바뀐 점" items={log.details.invalidated_hypotheses} />
        {!!log.details.source_candidates?.length && <section className="bunker-os-log-section"><h4>모아둔 자료</h4><ul>{log.details.source_candidates.map((source, index) => <li key={index}><b>{sourceCategoryLabel(source.category ?? 'OTHER')}</b> · {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}{source.note ? ` · ${source.note}` : ''}</li>)}</ul></section>}
        <TextList title="판단할 것" items={log.details.decision_candidates} />
        <TextList title="시험해볼 것" items={log.details.experiment_candidates} />
        {!!log.details.approvals?.length && <section className="bunker-os-log-section bunker-os-approval"><h4>내 확인이 필요한 것</h4><ul>{log.details.approvals.map((approval, index) => <li key={index}><strong>{approval.title}</strong>{approval.reason ? ` · ${approval.reason}` : ''}{approval.cost ? ` · 비용 ${approval.cost}` : ''}</li>)}</ul></section>}
        <TextList title="다음 할 일" items={log.details.next_actions} />
        {log.reviewed_at && <section className="bunker-os-review-receipt"><strong>확인 완료</strong><span>{formatOperatorTime(log.reviewed_at)}{log.reviewer ? ` · ${log.reviewer}` : ''}{log.review_note ? ` · ${log.review_note}` : ''}</span></section>}
        {log.status === 'APPROVAL_REQUIRED' && <section className="operator-decision bunker-os-human-check">
          <h3>내 확인</h3>
          <p>내용을 확인했다면 버튼을 누르세요. 이 작업은 완료 목록으로 이동합니다.</p>
          <label>메모 (선택)<textarea maxLength={1000} value={note} onChange={(event) => onNoteChange(event.target.value)} /></label>
          <div><button disabled={busy} onClick={onMarkReviewed}>{busy ? '처리 중…' : '확인 완료'}</button></div>
        </section>}
        <footer className="bunker-os-detail-footer"><a className="operator-secondary" href="/operator/bunker-os/logs/">작업 목록으로</a><button className="operator-secondary" disabled={busy} onClick={onRefresh}>새로고침</button></footer>
      </article>}
  </section>
}

const sourceCategories = ['ALL','DISASTER_SURVIVAL','BUNKER_BUILD','BUSINESS_STRATEGY','PRODUCT_MARKET','TECH_AUTOMATION','OTHER'] as const

export function BunkerOsSourcesView({
  email, busy, error, data, onRefresh, onSignOut,
}: {
  email?: string | null; busy: boolean; error: string; data: BunkerOsSources
  onRefresh: () => void; onSignOut: () => void
}) {
  const [filter, setFilter] = useState<(typeof sourceCategories)[number]>('ALL')
  const visible = useMemo(() => filter === 'ALL' ? data.sources : data.sources.filter((source) => source.category === filter), [data.sources, filter])
  return <section className="operator-page">
    <BunkerOsHeader email={email} busy={busy} onSignOut={onSignOut} />
    {error && <p className="operator-error" role="alert">{error}</p>}
    <section className="operator-panel">
      <header><div><p className="archive-eyebrow">자료함</p><h2>모아둔 자료</h2></div><button className="operator-secondary" disabled={busy} onClick={onRefresh}>새로고침</button></header>
      <p className="operator-muted">조사 중 발견한 뉴스·영상·문서·사례를 작업일지와 분리해 모아봅니다. 중요한 자료만 나중에 GitHub Bunker OS 장기자료로 승격합니다.</p>
      <div className="bunker-os-source-filters">
        {sourceCategories.map((category) => <button key={category} className="operator-secondary" aria-pressed={filter === category} onClick={() => setFilter(category)}>
          {category === 'ALL' ? '전체' : sourceCategoryLabel(category)}
        </button>)}
      </div>
      <p className="operator-muted">전체 {data.total_count}건 · 현재 {visible.length}건 표시</p>
      {!visible.length && <p className="operator-empty">이 분류에 모아둔 자료가 없습니다.</p>}
      <ul className="bunker-os-source-list">
        {visible.map((source) => <li key={source.source_key}>
          <article>
            <span>{sourceCategoryLabel(source.category)}</span>
            <h3>{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}</h3>
            {source.note && <p>{source.note}</p>}
            <small>{formatOperatorTime(source.occurred_at)} · <a href={`/operator/bunker-os/log/${source.log_id}/`}>관련 작업: {source.log_title}</a></small>
          </article>
        </li>)}
      </ul>
    </section>
  </section>
}

type BunkerPage =
  | { kind: 'dashboard' }
  | { kind: 'list'; filter: BunkerOsStatus | null }
  | { kind: 'detail'; id: string }
  | { kind: 'sources' }

export function bunkerPageFromPath(pathname: string): BunkerPage {
  const detail = /^\/operator\/bunker-os\/log\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i.exec(pathname)
  if (detail) return { kind: 'detail', id: detail[1].toLowerCase() }
  if (pathname.startsWith('/operator/bunker-os/sources')) return { kind: 'sources' }
  if (pathname.startsWith('/operator/bunker-os/running')) return { kind: 'list', filter: 'RUNNING' }
  if (pathname.startsWith('/operator/bunker-os/review')) return { kind: 'list', filter: 'APPROVAL_REQUIRED' }
  if (pathname.startsWith('/operator/bunker-os/completed')) return { kind: 'list', filter: 'COMPLETED' }
  if (pathname.startsWith('/operator/bunker-os/blocked')) return { kind: 'list', filter: 'BLOCKED' }
  if (pathname.startsWith('/operator/bunker-os/logs')) return { kind: 'list', filter: null }
  return { kind: 'dashboard' }
}

export function OperatorBunkerOsDashboard({ email, busy: parentBusy, onSignOut }: { email?: string | null; busy: boolean; onSignOut: () => void }) {
  const page = bunkerPageFromPath(window.location.pathname)
  const [dashboard, setDashboard] = useState<BunkerOsDashboard>(emptyBunkerOsDashboard)
  const [list, setList] = useState<BunkerOsLogList>(emptyBunkerOsLogList)
  const [detail, setDetail] = useState<BunkerOsLog | null>(null)
  const [sources, setSources] = useState<BunkerOsSources>(emptyBunkerOsSources)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true); setError('')
    try {
      if (page.kind === 'dashboard') {
        const { data, error: rpcError } = await supabaseClient.rpc('archive_operator_bunker_os_dashboard', { p_limit: 5 })
        if (rpcError) setError('감독 상황판을 불러오지 못했습니다.')
        else setDashboard((data ?? emptyBunkerOsDashboard) as BunkerOsDashboard)
      } else if (page.kind === 'list') {
        const { data, error: rpcError } = await supabaseClient.rpc('archive_operator_bunker_os_logs', { p_status: page.filter, p_limit: 100 })
        if (rpcError) setError('작업 기록을 불러오지 못했습니다.')
        else setList((data ?? emptyBunkerOsLogList) as BunkerOsLogList)
      } else if (page.kind === 'detail') {
        const { data, error: rpcError } = await supabaseClient.rpc('archive_operator_bunker_os_log_detail', { p_log_id: page.id })
        if (rpcError) setError('상세 기록을 불러오지 못했습니다.')
        else {
          const log = data as BunkerOsLog
          setDetail(log); setNote(log.review_note ?? '')
        }
      } else {
        const { data, error: rpcError } = await supabaseClient.rpc('archive_operator_bunker_os_sources', { p_limit: 200 })
        if (rpcError) setError('자료함을 불러오지 못했습니다.')
        else setSources((data ?? emptyBunkerOsSources) as BunkerOsSources)
      }
    } finally {
      setBusy(false)
    }
  }, [page.kind, page.kind === 'list' ? page.filter : null, page.kind === 'detail' ? page.id : null])

  useEffect(() => { void refresh() }, [refresh])

  const markReviewed = useCallback(async () => {
    if (!supabaseClient || page.kind !== 'detail') return
    setBusy(true); setError('')
    const { error: rpcError } = await supabaseClient.rpc('archive_operator_bunker_os_mark_reviewed', { p_log_id: page.id, p_note: note.trim() || null })
    if (rpcError) { setError('확인 완료 처리를 하지 못했습니다.'); setBusy(false); return }
    window.location.assign('/operator/bunker-os/completed/')
  }, [page.kind, page.kind === 'detail' ? page.id : null, note])

  const shared = { email, busy: parentBusy || busy, error, onRefresh: () => void refresh(), onSignOut }
  if (page.kind === 'list') return <BunkerOsLogListView {...shared} list={list} filter={page.filter} />
  if (page.kind === 'detail') return <BunkerOsLogDetailView {...shared} log={detail} note={note} onNoteChange={setNote} onMarkReviewed={() => void markReviewed()} />
  if (page.kind === 'sources') return <BunkerOsSourcesView {...shared} data={sources} />
  return <BunkerOsDashboardView {...shared} dashboard={dashboard} />
}
