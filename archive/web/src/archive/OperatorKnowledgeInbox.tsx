import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseClient } from './supabaseClient'
import { OperatorKnowledgeSources } from './OperatorKnowledgeSources'
import { formatOperatorTime } from './operatorSystemStatus'
import {
  emptyKnowledgeInbox,
  knowledgeBucketFor,
  knowledgeBucketLabel,
  knowledgeSourceLabel,
  type KnowledgeFilter,
  type KnowledgeInbox,
} from './knowledgeOperatorModel'

export function OperatorKnowledgeInbox({ email, busy: parentBusy, onSignOut }: { email?: string | null; busy: boolean; onSignOut: () => void }) {
  const [inbox, setInbox] = useState<KnowledgeInbox>(emptyKnowledgeInbox)
  const [filter, setFilter] = useState<KnowledgeFilter>('REVIEW')
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

  const pendingReviewCount = inbox.items.filter((item) => knowledgeBucketFor(item) === 'REVIEW').length
  const approvedReviewCount = inbox.items.filter((item) => knowledgeBucketFor(item) === 'APPROVED').length

  const visibleItems = useMemo(
    () => filter === 'ALL' ? inbox.items : inbox.items.filter((item) => knowledgeBucketFor(item) === filter),
    [filter, inbox.items],
  )

  return <section className="operator-page">
    <header className="operator-heading">
      <div>
        <p className="archive-eyebrow">SURVIVAL DIARY · OPERATOR</p>
        <h1>생존지식 검토함</h1>
        <p>{email} · 먼저 사람 검토가 필요한 글을 보여줍니다. 글을 눌러 AI가 지목한 부분을 확인하고 수정한 다음 발행을 요청하세요.</p>
      </div>
      <div className="operator-heading-actions">
        <a className="operator-secondary" href="/operator/">대시보드</a>
        <a className="operator-secondary" href="/operator/visuals/">시각 제작 메타</a>
        <button className="operator-secondary" disabled={parentBusy || busy} onClick={onSignOut}>로그아웃</button>
      </div>
    </header>

    {error && <p className="operator-error" role="alert">{error}</p>}

    <div className="operator-counts">
      <article><span>C3 작업 글감</span><strong>{inbox.total_count}</strong></article>
      <article><span>작업 중</span><strong>{inbox.working_count}</strong></article>
      <article><span>사람 검토</span><strong>{pendingReviewCount}</strong></article>
      <article><span>휴먼체크 완료 · 발행 대기</span><strong>{approvedReviewCount}</strong></article>
      <article><span>보관</span><strong>{inbox.held_count}</strong></article>
      <article><span>공개 게시됨</span><strong>{inbox.published_count}</strong></article>
    </div>

    <section className="operator-system">
      <header>
        <div><p className="archive-eyebrow">사람 검토</p><h2>글 선택 → 읽고 수정 → 검토 완료·발행 요청</h2></div>
        <button className="operator-secondary" disabled={busy} onClick={() => void refresh()}>새로고침</button>
      </header>
      <p className="operator-muted">문제 문장은 강조하고 그 아래에 AI 판단 이유를 표시합니다. 해당 부분만 고치거나 전체 편집을 할 수 있습니다. 근거·출처가 해결되지 않은 글은 수정본을 저장하고 검증 대기 상태로 보관합니다.</p>
      <div className="operator-heading-actions">
        {(['ALL','WORKING','REVIEW','APPROVED','HELD','PUBLISHED'] as const).map((value) =>
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
            <small>{item.job_type ?? '—'} · {knowledgeSourceLabel(item.source_kind)} · {formatOperatorTime(item.prepared_at)}</small>
            {item.note && <p>{item.note}</p>}
            {item.review_status === 'APPROVED' && <p>사람 검토 완료 · 자동 게시 검증 및 정규 배포 대기</p>}
            <em>상세 열기 →</em>
          </a>
        </li>)}
      </ul>
    </section>
    <OperatorKnowledgeSources />
  </section>
}
