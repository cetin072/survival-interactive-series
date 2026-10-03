import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseClient } from './supabaseClient'
import { formatOperatorTime } from './operatorSystemStatus'
import {
  emptyKnowledgeInbox,
  knowledgeBucketFor,
  knowledgeBucketLabel,
  type KnowledgeFilter,
  type KnowledgeInbox,
} from './knowledgeOperatorModel'

export function OperatorKnowledgeInbox({ email, busy: parentBusy, onSignOut }: { email?: string | null; busy: boolean; onSignOut: () => void }) {
  const [inbox, setInbox] = useState<KnowledgeInbox>(emptyKnowledgeInbox)
  const [filter, setFilter] = useState<KnowledgeFilter>('ALL')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!supabaseClient) return
    setBusy(true); setError('')
    const { data, error: rpcError } = await supabaseClient.rpc('archive_operator_knowledge_inbox')
    if (rpcError) setError('Knowledge Inbox를 불러오지 못했습니다.')
    else setInbox((data ?? emptyKnowledgeInbox) as KnowledgeInbox)
    setBusy(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const visibleItems = useMemo(
    () => filter === 'ALL' ? inbox.items : inbox.items.filter((item) => knowledgeBucketFor(item) === filter),
    [filter, inbox.items],
  )

  return <section className="operator-page">
    <header className="operator-heading">
      <div>
        <p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p>
        <h1>Knowledge Inbox</h1>
        <p>{email} · 모든 C3 글감은 이곳에서 상태를 확인하고, 글을 누르면 별도 상세 페이지에서 읽고 편집합니다.</p>
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
      <article><span>사람 검토</span><strong>{inbox.review_count}</strong></article>
      <article><span>보관</span><strong>{inbox.held_count}</strong></article>
      <article><span>공개 게시됨</span><strong>{inbox.published_count}</strong></article>
    </div>

    <section className="operator-system">
      <header>
        <div><p className="archive-eyebrow">STAGING FLOW</p><h2>글감 → 상세 → 편집 → 공개 승격</h2></div>
        <button className="operator-secondary" disabled={busy} onClick={() => void refresh()}>새로고침</button>
      </header>
      <p className="operator-muted">글감을 누르면 별도 상세 페이지가 열립니다. HUMAN_REVIEW 완성 초안은 그 페이지에서 한글 편집·이미지·YouTube·초안 저장·공개 승인을 처리합니다.</p>
      <div className="operator-heading-actions">
        {(['ALL','WORKING','REVIEW','HELD','PUBLISHED'] as const).map((value) =>
          <button key={value} className="operator-secondary" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === 'ALL' ? '전체' : knowledgeBucketLabel[value]}
          </button>
        )}
      </div>
    </section>

    <section className="operator-panel knowledge-inbox-list-page">
      <header><h2>글감 목록</h2><strong>{visibleItems.length}건</strong></header>
      {busy && <p className="operator-muted" aria-live="polite">불러오는 중…</p>}
      {!visibleItems.length && <p className="operator-empty">해당 상태의 글감이 없습니다.</p>}
      <ul className="operator-inbox">
        {visibleItems.map((item) => <li key={item.job_id}>
          <a href={`/operator/knowledge/${item.job_id}/`} aria-label={`${item.title ?? item.brief_id ?? 'Knowledge 글감'} 상세 열기`}>
            <span>
              <b>{knowledgeBucketLabel[knowledgeBucketFor(item)]}</b>
              <b>{item.result_decision ?? item.status}</b>
              {item.risk_level && <b>{item.risk_level}</b>}
            </span>
            <strong>{item.title ?? item.brief_id ?? item.candidate_id ?? item.source_ref?.split('/').at(-1) ?? item.job_id}</strong>
            <small>{item.job_type ?? '—'} · {item.source_kind ?? '—'} · {formatOperatorTime(item.prepared_at)}</small>
            {item.note && <p>{item.note}</p>}
            <em>상세 열기 →</em>
          </a>
        </li>)}
      </ul>
    </section>
  </section>
}
