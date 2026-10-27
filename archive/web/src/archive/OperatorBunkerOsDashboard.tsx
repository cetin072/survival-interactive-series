import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { roadmapStage, safeSourceUrl, roadmapDocuments } from './operatorRoadmapModel'
import { supabaseClient } from './supabaseClient'
import { formatOperatorTime } from './operatorSystemStatus'

export function bunkerLink(path: string, changes: Record<string,string|null> = {}): string {
  const current = new URLSearchParams(typeof window==='undefined'?'':window.location.search)
  const query = new URLSearchParams()
  for (const key of ['cycle','stage','page','category','cyclesPage']) {
    const value = current.get(key)
    if (value && value.length<=120 && (key!=='stage'||roadmapStage(value))) query.set(key,value)
  }
  for (const [key,value] of Object.entries(changes)) value===null ? query.delete(key) : query.set(key,value)
  const [pathname,hash] = path.split('#')
  return pathname+(query.size?'?'+query.toString():'')+(hash?'#'+hash:'')
}
function pageNumber(value:string|null):number { return value&&/^\d{1,6}$/.test(value)?Number(value):0 }
function PageLinks({total,size}:{total:number;size:number}) {
  const page=pageNumber(typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('page'))
  const path=typeof window==='undefined'?'/operator/bunker-os/logs/':window.location.pathname
  return <nav aria-label="조회 페이지"><p>전체 {total}건 · {total?Math.min(total,page*size+1):0}–{Math.min(total,(page+1)*size)}건 조회 · 페이지당 최대 {size}건</p>
    {page>0&&<a href={bunkerLink(path,{page:String(page-1)})}>← 이전 페이지</a>}{' '}
    {(page+1)*size<total&&<a href={bunkerLink(path,{page:String(page+1)})}>다음 페이지 →</a>}
  </nav>
}
function SourceLink({url,title}:{url?:string|null;title:string}) {
  const safe=safeSourceUrl(url)
  return safe?<a href={safe} target="_blank" rel="noopener noreferrer">{title||'제목 없는 자료'} ↗</a>:<span>{title||'제목 없는 자료'} · 유효한 원문 링크 없음</span>
}

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
      <a className="operator-secondary" href={bunkerLink("/operator/#operator-roadmap")}>전체 로드맵</a>
      <a className="operator-secondary" href={bunkerLink("/operator/bunker-os/",{page:null})}>상황판</a>
      <a className="operator-secondary" href={bunkerLink("/operator/bunker-os/logs/")}>작업 기록</a>
      <a className="operator-secondary" href={bunkerLink("/operator/bunker-os/sources/",{page:null})}>자료함</a>
      <a className="operator-secondary" href={bunkerLink("/operator/")}>자동화 상황판</a>
      <button className="operator-secondary" disabled={busy} onClick={onSignOut}>로그아웃</button>
    </div>
  </header>
}

function RecentLogs({ logs }: { logs: BunkerOsLog[] }) {
  if (!logs.length) return <p className="operator-empty">아직 기록이 없습니다.</p>
  return <ul className="bunker-os-board-list">
    {logs.slice(0, 3).map((log) => <li key={log.id}>
      <a href={bunkerLink(`/operator/bunker-os/log/${log.id}/`)}>
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
          <p className="operator-muted">{dashboard.latest_at && Date.now() - Date.parse(dashboard.latest_at) > 48 * 3600000 ? '오래된 기록 · 실제 진행 여부 재확인 필요. ' : ''}마지막 기록 {formatOperatorTime(dashboard.latest_at)} · 중요한 장기 판단만 GitHub Bunker OS에 따로 남깁니다.</p>
        </div>
        <button className="operator-secondary operator-refresh-button" disabled={busy} onClick={onRefresh}>↻ 새로고침</button>
      </header>
    </section>

    <div className="operator-counts bunker-os-counts">
      <a href={bunkerLink("/operator/bunker-os/running/",{page:null})}><span>진행 중</span><strong>{dashboard.running_count}</strong><small>지금 하고 있는 일</small></a>
      <a href={bunkerLink("/operator/bunker-os/review/",{page:null})}><span>내 확인 필요</span><strong>{dashboard.approval_count}</strong><small>내가 버튼을 눌러야 하는 일</small></a>
      <a href={bunkerLink("/operator/bunker-os/completed/",{page:null})}><span>완료</span><strong>{dashboard.completed_count}</strong><small>끝난 작업</small></a>
      <a href={bunkerLink("/operator/bunker-os/blocked/",{page:null})}><span>막힘</span><strong>{dashboard.blocked_count}</strong><small>문제가 있어 멈춘 일</small></a>
    </div>

    <div className="bunker-os-quick-links">
      <a className="operator-secondary" href={bunkerLink("/operator/bunker-os/logs/")}>전체 작업 기록 {dashboard.total_count}건</a>
      <a className="operator-secondary" href={bunkerLink("/operator/bunker-os/sources/",{page:null})}>모아둔 자료 보기</a>
    </div>

    <section className="operator-panel bunker-os-recent">
      <header><h2>최근 작업</h2><a href={bunkerLink("/operator/bunker-os/logs/")}>전체 보기 →</a></header>
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
        <a href={bunkerLink("/operator/bunker-os/logs/")}>전체</a><a href={bunkerLink("/operator/bunker-os/running/",{page:null})}>진행 중</a>
        <a href={bunkerLink("/operator/bunker-os/review/",{page:null})}>내 확인 필요</a><a href={bunkerLink("/operator/bunker-os/completed/",{page:null})}>완료</a><a href={bunkerLink("/operator/bunker-os/blocked/",{page:null})}>막힘</a>
      </div>
      <PageLinks total={list.total_count} size={100} />
      {!busy && !error && !list.logs.length && <p className="operator-empty">해당 상태의 작업이 없습니다.</p>}
      <ul className="bunker-os-board-list">
        {list.logs.map((log) => <li key={log.id}>
          <a href={bunkerLink(`/operator/bunker-os/log/${log.id}/`)}>
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
        {!!log.details.source_candidates?.length && <section className="bunker-os-log-section"><h4>모아둔 자료</h4><ul>{log.details.source_candidates.map((source, index) => <li key={index}><b>{sourceCategoryLabel(source.category ?? 'OTHER')}</b> · <SourceLink url={source.url} title={source.title} />{source.note ? ` · ${source.note}` : ''}</li>)}</ul></section>}
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
        <footer className="bunker-os-detail-footer"><a className="operator-secondary" href={bunkerLink("/operator/bunker-os/logs/")}>작업 목록으로</a><button className="operator-secondary" disabled={busy} onClick={onRefresh}>새로고침</button></footer>
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
  const requested=typeof window==='undefined'?'ALL':new URLSearchParams(window.location.search).get('category')??'ALL'
  const filter=sourceCategories.find(value=>value===requested)??'ALL'
  const visible = useMemo(() => filter === 'ALL' ? data.sources : data.sources.filter((source) => source.category === filter), [data.sources, filter])
  return <section className="operator-page">
    <BunkerOsHeader email={email} busy={busy} onSignOut={onSignOut} />
    {error && <p className="operator-error" role="alert">{error}</p>}
    <section className="operator-panel">
      <header><div><p className="archive-eyebrow">자료함</p><h2>모아둔 자료</h2></div><button className="operator-secondary" disabled={busy} onClick={onRefresh}>새로고침</button></header>
      <p className="operator-muted">선택한 주기 일지의 source_candidates 자료만 모아봅니다. 저장소 전체 자동수집이 아닙니다. 외부 원문이 열리지 않으면 관련 일지에서 제목·이동·접근 권한을 확인하세요.</p>
      <div className="bunker-os-source-filters">
        {sourceCategories.map((category) => <button key={category} className="operator-secondary" aria-pressed={filter === category} onClick={() => window.location.assign(bunkerLink('/operator/bunker-os/sources/',{category,page:null}))}>
          {category === 'ALL' ? '전체' : sourceCategoryLabel(category)}
        </button>)}
      </div>
      <PageLinks total={data.total_count} size={200} /><p>현재 분류 {visible.length}건 표시</p><details><summary>기획문서 목록</summary><ul>{roadmapDocuments.map(doc=><li key={doc.url}><SourceLink {...doc} /></li>)}</ul></details>
      {!busy && !error && !visible.length && <p className="operator-empty">이 분류에 모아둔 자료가 없습니다.</p>}
      <ul className="bunker-os-source-list">
        {visible.map((source) => <li key={source.source_key}>
          <article>
            <span>{sourceCategoryLabel(source.category)}</span>
            <h3><SourceLink url={source.url} title={source.title} /></h3>
            {source.note && <p>{source.note}</p>}
            <small>{formatOperatorTime(source.occurred_at)} · <a href={bunkerLink(`/operator/bunker-os/log/${source.log_id}/`)}>관련 작업: {source.log_title}</a></small>
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
  const query=new URLSearchParams(window.location.search)
  const cycle=query.get('cycle')||null
  const offset=pageNumber(query.get('page'))*(page.kind==='sources'?200:100)
  const category=query.get('category')||'ALL'
  const cyclesOffset=pageNumber(query.get('cyclesPage'))*100
  const [cycles,setCycles]=useState<{cycle_key:string}[]>([])
  const [cycleTotal,setCycleTotal]=useState(0)
  const [selectedCycle,setSelectedCycle]=useState<string|null>(cycle)
  const request=useRef(0)
  const [dashboard, setDashboard] = useState<BunkerOsDashboard>(emptyBunkerOsDashboard)
  const [list, setList] = useState<BunkerOsLogList>(emptyBunkerOsLogList)
  const [detail, setDetail] = useState<BunkerOsLog | null>(null)
  const [sources, setSources] = useState<BunkerOsSources>(emptyBunkerOsSources)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabaseClient) {setError('연결 설정을 확인하지 못했습니다.'); return}
    const generation=++request.current
    setBusy(true); setError(''); setDetail(null)
    try {
      const cycleResult=await supabaseClient.rpc('archive_operator_bunker_os_read_v2',{p_view:'cycles',p_offset:cyclesOffset,p_limit:100}).abortSignal(AbortSignal.timeout(15000))
      if(generation!==request.current)return
      if(cycleResult.error||!Array.isArray(cycleResult.data?.cycles))throw new Error('주기 조회 실패 · 과거 주기 조회 계약 적용 여부와 접근 권한을 확인하세요.')
      setCycles(cycleResult.data.cycles); setCycleTotal(cycleResult.data.total_count)
      if (page.kind === 'detail') {
        const result=await supabaseClient.rpc('archive_operator_bunker_os_log_detail',{p_log_id:page.id}).abortSignal(AbortSignal.timeout(15000))
        if(generation!==request.current)return
        if(result.error||!result.data?.id||!result.data?.details)throw new Error('상세 기록을 찾거나 조회하지 못했습니다. 목록에서 참조를 확인하세요.')
        setDetail(result.data as BunkerOsLog);setNote(result.data.review_note??'');setSelectedCycle(result.data.cycle_key)
        if(cycle!==result.data.cycle_key)window.history.replaceState(null,'',bunkerLink(window.location.pathname,{cycle:result.data.cycle_key}))
      } else {
        const result=await supabaseClient.rpc('archive_operator_bunker_os_read_v2',{
          p_view:page.kind==='list'?'logs':page.kind,p_cycle:cycle,p_offset:offset,
          p_status:page.kind==='list'?page.filter:null,p_limit:page.kind==='sources'?200:100,p_category:category,
        }).abortSignal(AbortSignal.timeout(15000))
        if(generation!==request.current)return
        if(result.error||!result.data||!Number.isSafeInteger(result.data.total_count)||result.data.total_count<0||!Array.isArray(page.kind==='sources'?result.data.sources:result.data.logs))throw new Error('기록 조회 실패 · 읽기 계약과 접근 권한을 확인하고 다시 조회하세요.')
        setSelectedCycle(result.data.current_cycle)
        if(!cycle&&result.data.current_cycle)window.history.replaceState(null,'',bunkerLink(window.location.pathname,{cycle:result.data.current_cycle}))
        if(page.kind==='dashboard')setDashboard(result.data as BunkerOsDashboard)
        else if(page.kind==='list')setList(result.data as BunkerOsLogList)
        else setSources(result.data as BunkerOsSources)
      }
    } catch(cause) {
      if(generation===request.current)setError(cause instanceof Error?cause.message:'조회 실패 · 다시 시도하세요.')
    } finally { if(generation===request.current)setBusy(false) }
  }, [page.kind, page.kind==='list'?page.filter:null,page.kind==='detail'?page.id:null,cycle,offset,category,cyclesOffset])
  useEffect(() => { void refresh(); return ()=>{request.current++} }, [refresh])

  const markReviewed = useCallback(async () => {
    if (!supabaseClient || page.kind !== 'detail') return
    setBusy(true); setError('')
    const { error: rpcError } = await supabaseClient.rpc('archive_operator_bunker_os_mark_reviewed', { p_log_id: page.id, p_note: note.trim() || null })
    if (rpcError) { setError('확인 완료 처리를 하지 못했습니다.'); setBusy(false); return }
    window.location.assign(bunkerLink('/operator/bunker-os/completed/',{page:null}))
  }, [page.kind, page.kind === 'detail' ? page.id : null, note])

  const shared = { email, busy: parentBusy || busy, error, onRefresh: () => void refresh(), onSignOut }
  if (error) return <section className="operator-page"><BunkerOsHeader email={email} busy={busy} onSignOut={onSignOut} /><p role="alert" className="operator-error">{error}</p><button onClick={() => void refresh()}>다시 조회</button></section>
  if (busy) return <section className="operator-page"><BunkerOsHeader email={email} busy={busy} onSignOut={onSignOut}/><p role="status">선택한 주기의 기록을 불러오는 중…</p></section>
  return <>
    <nav className="bunker-cycle-navigation" aria-label="활동 주기">
      <label>활동 주기 <select value={selectedCycle??''} onChange={event=>window.location.assign(bunkerLink('/operator/bunker-os/',{cycle:event.target.value,page:null}))}>
        {!selectedCycle&&<option value="">아직 기록 없음</option>}
        {selectedCycle&&!cycles.some(item=>item.cycle_key===selectedCycle)&&<option value={selectedCycle}>{cycleLabel(selectedCycle)}</option>}
        {cycles.map(item=><option key={item.cycle_key} value={item.cycle_key}>{cycleLabel(item.cycle_key)}</option>)}
      </select></label>
      <span>주기 목록 {cyclesOffset+1}–{Math.min(cycleTotal,cyclesOffset+100)} / {cycleTotal}</span>
      {cyclesOffset>0&&<a href={bunkerLink(window.location.pathname,{cyclesPage:String(cyclesOffset/100-1)})}>이전 주기 목록</a>}
      {cyclesOffset+100<cycleTotal&&<a href={bunkerLink(window.location.pathname,{cyclesPage:String(cyclesOffset/100+1)})}>다음 주기 목록</a>}
    </nav>
    {page.kind==='list'?<BunkerOsLogListView {...shared} list={list} filter={page.filter}/>:
      page.kind==='detail'?<BunkerOsLogDetailView {...shared} log={detail} note={note} onNoteChange={setNote} onMarkReviewed={()=>void markReviewed()}/>:
      page.kind==='sources'?<BunkerOsSourcesView {...shared} data={sources}/>:<BunkerOsDashboardView {...shared} dashboard={dashboard}/>}
  </>
}
