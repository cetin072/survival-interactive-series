import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseClient } from './supabaseClient'
import { formatOperatorTime } from './operatorSystemStatus'

type KnowledgeItem = {
  job_id: string
  job_type?: string | null
  status: string
  source_kind?: string | null
  source_ref?: string | null
  prepared_at?: string | null
  submitted_at?: string | null
  published_at?: string | null
  result_decision?: string | null
  brief_id?: string | null
  candidate_id?: string | null
  title?: string | null
  risk_level?: string | null
  code?: string | null
  note?: string | null
  final_pr_number?: number | null
  merge_sha?: string | null
  review_item_id?: string | null
  review_status?: string | null
  review_decision_note?: string | null
}

type KnowledgeInbox = {
  total_count: number
  working_count: number
  review_count: number
  held_count: number
  published_count: number
  items: KnowledgeItem[]
}

type KnowledgeDetail = KnowledgeItem & {
  source_sha256?: string | null
  work_key?: string | null
  policy_version?: string | null
  main_sha_at_prepare?: string | null
  blocker_code?: string | null
  blocker_stage?: string | null
  final_head_ref?: string | null
  final_head_sha?: string | null
  context?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
}

type Filter = 'ALL' | 'WORKING' | 'REVIEW' | 'HELD' | 'PUBLISHED'

const emptyInbox: KnowledgeInbox = {
  total_count: 0, working_count: 0, review_count: 0, held_count: 0, published_count: 0, items: [],
}

const bucketFor = (item: KnowledgeItem): Exclude<Filter, 'ALL'> => {
  if (item.status === 'PUBLISHED') return 'PUBLISHED'
  if (item.status === 'HUMAN_REVIEW') return 'REVIEW'
  if (item.status === 'HOLD' || item.status === 'BLOCKED') return 'HELD'
  return 'WORKING'
}

const bucketLabel: Record<Exclude<Filter, 'ALL'>, string> = {
  WORKING: '작업 중',
  REVIEW: '사람 검토',
  HELD: '보관',
  PUBLISHED: '게시됨',
}

export function OperatorKnowledgeInbox({ email, busy: parentBusy, onSignOut }: { email?: string | null; busy: boolean; onSignOut: () => void }) {
  const [inbox, setInbox] = useState<KnowledgeInbox>(emptyInbox)
  const [selected, setSelected] = useState<KnowledgeDetail | null>(null)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewNote, setReviewNote] = useState('')

  const refresh = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true); setError('')
    const { data, error: rpcError } = await supabaseClient.rpc('archive_operator_knowledge_inbox')
    if (rpcError) setError('Knowledge Inbox를 불러오지 못했습니다.')
    else setInbox((data ?? emptyInbox) as KnowledgeInbox)
    setBusy(false)
  }, [])

  const loadDetail = useCallback(async (jobId: string) => {
    if (!supabaseClient) return
    setBusy(true); setError('')
    const { data, error: rpcError } = await supabaseClient.rpc('archive_operator_knowledge_job_detail', { p_job_id: jobId })
    if (rpcError) setError('글감 상세를 불러오지 못했습니다.')
    else {
      const detail = data as KnowledgeDetail
      setSelected(detail)
      setReviewNote(detail.review_decision_note ?? '')
    }
    setBusy(false)
  }, [])

  const decideReview = useCallback(async (decision: 'APPROVED' | 'HOLD' | 'REJECTED') => {
    if (!supabaseClient || !selected?.review_item_id) return
    setBusy(true); setError('')
    const { error: decisionError } = await supabaseClient.rpc('archive_operator_decide_review_item', {
      p_item_id: selected.review_item_id,
      p_decision: decision,
      p_note: reviewNote.trim() || null,
    })
    if (decisionError) setError('검토 결정을 저장하지 못했습니다.')
    else {
      await refresh()
      await loadDetail(selected.job_id)
    }
    setBusy(false)
  }, [loadDetail, refresh, reviewNote, selected])

  useEffect(() => { void refresh() }, [refresh])

  const visibleItems = useMemo(() => filter === 'ALL' ? inbox.items : inbox.items.filter((item) => bucketFor(item) === filter), [filter, inbox.items])

  return <section className="operator-page">
    <header className="operator-heading">
      <div>
        <p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p>
        <h1>Knowledge Inbox</h1>
        <p>{email} · 모든 C3 글감은 먼저 이곳에 쌓이고, 검증을 통과한 글만 공개 Knowledge로 승격됩니다.</p>
      </div>
      <div className="operator-heading-actions">
        <a className="operator-secondary" href="/operator/">대시보드</a>
        <a className="operator-secondary" href="/operator/visuals/">시각 제작 메타</a>
        <button className="operator-secondary" disabled={parentBusy || busy} onClick={onSignOut}>로그아웃</button>
      </div>
    </header>

    {error && <p className="operator-error" role="alert">{error}</p>}

    <div className="operator-counts">
      <article><span>전체 글감</span><strong>{inbox.total_count}</strong></article>
      <article><span>작업 중</span><strong>{inbox.working_count}</strong></article>
      <article><span>사람 검토 / 보관</span><strong>{inbox.review_count + inbox.held_count}</strong></article>
      <article><span>공개 게시됨</span><strong>{inbox.published_count}</strong></article>
    </div>

    <section className="operator-system">
      <header>
        <div><p className="archive-eyebrow">STAGING FLOW</p><h2>글감 → 검수 → 공개 승격</h2></div>
        <button className="operator-secondary" disabled={busy} onClick={() => void refresh()}>새로고침</button>
      </header>
      <p className="operator-muted">고위험이라고 삭제하지 않습니다. 강한 질문이면 HUMAN_REVIEW로 완전한 Candidate + Evidence + BRIEF를 보관하고, 중복·자료부족 같은 항목은 HOLD/BLOCKED 기록으로 남깁니다.</p>
      <div className="operator-heading-actions">
        {(['ALL','WORKING','REVIEW','HELD','PUBLISHED'] as const).map((value) =>
          <button key={value} className="operator-secondary" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === 'ALL' ? '전체' : bucketLabel[value]}
          </button>
        )}
      </div>
    </section>

    <div className="operator-grid">
      <section className="operator-panel">
        <header><h2>글감 목록</h2><strong>{visibleItems.length}건</strong></header>
        {busy && <p className="operator-muted" aria-live="polite">불러오는 중…</p>}
        {!visibleItems.length && <p className="operator-empty">해당 상태의 글감이 없습니다.</p>}
        <ul className="operator-inbox">
          {visibleItems.map((item) => <li key={item.job_id}>
            <button className={selected?.job_id === item.job_id ? 'selected' : ''} onClick={() => void loadDetail(item.job_id)}>
              <span>
                <b>{bucketLabel[bucketFor(item)]}</b>
                <b>{item.result_decision ?? item.status}</b>
                {item.risk_level && <b>{item.risk_level}</b>}
              </span>
              <strong>{item.title ?? item.brief_id ?? item.candidate_id ?? item.source_ref?.split('/').at(-1) ?? item.job_id}</strong>
              <small>{item.job_type ?? '—'} · {item.source_kind ?? '—'} · {formatOperatorTime(item.prepared_at)}</small>
              {item.note && <p>{item.note}</p>}
            </button>
          </li>)}
        </ul>
      </section>

      <section className="operator-panel operator-detail">
        <h2>글감 상세</h2>
        {!selected ? <p className="operator-empty">왼쪽에서 글감을 선택하세요.</p> : <>
          <p className="archive-eyebrow">{bucketLabel[bucketFor(selected)]} · {selected.result_decision ?? selected.status} · {selected.risk_level ?? '위험도 미정'}</p>
          <h3>{selected.title ?? selected.brief_id ?? selected.job_id}</h3>
          {selected.note && <p>{selected.note}</p>}
          <dl>
            <div><dt>Candidate</dt><dd>{selected.candidate_id ?? '아직 미작성'}</dd></div>
            <div><dt>BRIEF</dt><dd>{selected.brief_id ?? '아직 미작성'}</dd></div>
            <div><dt>Source</dt><dd>{selected.source_ref ?? '—'}</dd></div>
            <div><dt>준비</dt><dd>{formatOperatorTime(selected.prepared_at)}</dd></div>
            <div><dt>제출</dt><dd>{formatOperatorTime(selected.submitted_at)}</dd></div>
            <div><dt>PR</dt><dd>{selected.final_pr_number ? `#${selected.final_pr_number}` : '—'}</dd></div>
            <div><dt>차단 코드</dt><dd>{selected.code ?? selected.blocker_code ?? '없음'}</dd></div>
            <div><dt>사람 검토</dt><dd>{selected.review_status ?? (selected.status === 'HUMAN_REVIEW' ? '검토 항목 준비 중' : '해당 없음')}</dd></div>
          </dl>
          {selected.review_status === 'PENDING' && <div className="operator-decision">
            <label>검토 메모<textarea maxLength={1000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label>
            <div>
              <button disabled={busy} onClick={() => void decideReview('APPROVED')}>공개 승격 승인</button>
              <button className="operator-secondary" disabled={busy} onClick={() => void decideReview('HOLD')}>보류</button>
              <button className="operator-danger" disabled={busy} onClick={() => void decideReview('REJECTED')}>거절</button>
            </div>
            <p className="operator-muted">승인은 즉시 공개하지 않습니다. 기존 C3 승인 소비자가 다시 검증한 뒤 exact-head 병합하고, Production은 기존 배치 게이트를 따릅니다.</p>
          </div>}
          {selected.review_status && selected.review_status !== 'PENDING' && <p className="operator-muted">검토 결과: {selected.review_status}{selected.review_decision_note ? ` · ${selected.review_decision_note}` : ''}</p>}
          <details><summary>Prepared context</summary><pre>{JSON.stringify(selected.context, null, 2)}</pre></details>
          <details><summary>Semantic result · Candidate / Evidence / BRIEF</summary><pre>{JSON.stringify(selected.result, null, 2)}</pre></details>
        </>}
      </section>
    </div>
  </section>
}
