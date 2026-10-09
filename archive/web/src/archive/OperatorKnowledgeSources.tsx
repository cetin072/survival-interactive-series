import { useState } from 'react'
import { knowledgeHref, publishedKnowledgeGuides } from './knowledgeGuide'
import {
  sourceDecisionLabel,
  sourceInboxRecords,
  sourceStatusLabel,
  sourceUseLabel,
  type SourceStatus,
} from './knowledgeSourceInbox'

type SourceFilter = SourceStatus | 'ALL'
const filters: readonly SourceFilter[] = ['ALL', 'RECEIVED', 'UPDATE_CANDIDATE', 'REVIEW_NEEDED', 'USED', 'HELD']

export function OperatorKnowledgeSources() {
  const [filter, setFilter] = useState<SourceFilter>('ALL')
  const visible = filter === 'ALL' ? sourceInboxRecords : sourceInboxRecords.filter((item) => item.status === filter)

  return <section className="operator-panel knowledge-source-section" aria-labelledby="knowledge-source-heading">
    <header>
      <div>
        <p className="archive-eyebrow">SOURCE LIBRARY · V1</p>
        <h2 id="knowledge-source-heading">글감·근거 보관함</h2>
      </div>
      <strong>{sourceInboxRecords.length}건 보존</strong>
    </header>
    <p className="operator-muted">
      원본 링크와 이용조건을 기록하는 보관함입니다. 출처는 사용 후에도 남고, 기존 글의 대조 후보로만 연결됩니다.
      보관함 등록은 공개 승인이나 자동 개정이 아닙니다.
    </p>
    <p className="operator-muted">
      첫 실행본은 GitHub에 기록된 자료를 읽기 전용으로 보여줍니다.
      신규 링크의 모바일 직접 저장과 자동화 C 연결은 아직 미구현입니다.
    </p>
    <div className="knowledge-source-filters" role="group" aria-label="글감·근거 자료 상태 필터">
      {filters.map((value) => <button key={value} type="button" className="operator-secondary"
        aria-pressed={filter === value} onClick={() => setFilter(value)}>
        {value === 'ALL' ? '전체' : sourceStatusLabel[value]}
      </button>)}
    </div>
    {!visible.length && <p className="operator-empty">해당 상태의 보관 자료가 없습니다.</p>}
    <ul className="knowledge-source-list">
      {visible.map((source) => <li key={source.id}>
        <article className="knowledge-source-card">
          <header>
            <small>{source.id} · {sourceStatusLabel[source.status]} · {sourceDecisionLabel[source.decision]}</small>
            <h3>{source.title}</h3>
            <p>{source.publisher} · 확인 {source.checked_at}</p>
          </header>
          <p><strong>검토할 질문</strong> · {source.question}</p>
          <p className="operator-muted">{source.note}</p>
          <p><strong>주제</strong> · {source.topics.join(' · ')}</p>
          <dl className="knowledge-source-rights">
            <div><dt>표시 이용유형</dt><dd>{source.rights.label}</dd></div>
            <div><dt>상업적 이용</dt><dd>{sourceUseLabel[source.rights.commercial_use]}</dd></div>
            <div><dt>변경·각색</dt><dd>{sourceUseLabel[source.rights.modification]}</dd></div>
            <div><dt>출처표시</dt><dd>{source.rights.attribution === 'REQUIRED' ? '필수' : source.rights.attribution === 'UNKNOWN' ? '미확인' : '요구 없음'}</dd></div>
          </dl>
          <div className="knowledge-source-links">
            <a href={source.url} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>
            <a href={source.rights.policy_url} target="_blank" rel="noopener noreferrer">이용조건 확인 ↗</a>
          </div>
          <details>
            <summary>기존 글 대조 후보 · {source.related_guides.length}건</summary>
            {source.related_guides.length === 0 && <p>아직 관련 글을 지정하지 않았습니다.</p>}
            <ul>
              {source.related_guides.map((target) => {
                const guide = publishedKnowledgeGuides.find((item) => item.id === target.id)
                return <li key={target.id}>
                  {guide
                    ? <a href={knowledgeHref(guide)} target="_blank" rel="noopener noreferrer">{target.id} · {guide.label}</a>
                    : <span>{target.id} · 공개 지식 정보 확인 필요</span>}
                  <p className="operator-muted">{target.relation === 'REVIEW_CANDIDATE' ? '개정 후보 · 미반영' : target.relation} — {target.reason}</p>
                </li>
              })}
            </ul>
          </details>
          <details>
            <summary>출처 범위 · 검토 이력</summary>
            <dl>
              <div><dt>원문 게시일</dt><dd>{source.published_at ?? '미확인'}</dd></div>
              <div><dt>수정일</dt><dd>{source.modified_at ?? '미확인'}</dd></div>
              <div><dt>이용조건 확인일</dt><dd>{source.rights.checked_at}</dd></div>
              <div><dt>본문·사진·첨부 범위</dt><dd>{source.rights.scope_note}</dd></div>
            </dl>
            <p><strong>다음 검토</strong> · {source.next_action}</p>
            <ul>{source.history.map((item, index) => <li key={index}>{item.date} · {sourceDecisionLabel[item.decision]} · {item.note}</li>)}</ul>
          </details>
        </article>
      </li>)}
    </ul>
  </section>
}
