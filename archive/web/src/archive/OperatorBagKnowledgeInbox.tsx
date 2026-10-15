import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SafeMarkdown } from './SafeMarkdown'
import {
  BAG_QUEUE_PATH, BAG_WRITING_BRANCH, bagDraftLabel, fetchGithubDraft,
  githubDraftWebUrl, joinBagReviewStates, parseBagDraft, readBagDraftQueue,
  type BagDraftItem,
} from './bagKnowledgeDraftInbox'

type Filter = 'ALL' | 'WAITING' | 'APPROVED'

export function OperatorBagKnowledgeInbox() {
  const [items, setItems] = useState<BagDraftItem[]>([])
  const [filter, setFilter] = useState<Filter>('WAITING')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<BagDraftItem | null>(null)
  const [article, setArticle] = useState<{ title: string; content: string } | null>(null)
  const [articleBusy, setArticleBusy] = useState(false)
  const [articleError, setArticleError] = useState('')
  const readGeneration = useRef(0)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // Working-branch queue has new hourly drafts; main queue alone authorizes publication.
      const [working, publicQueue] = await Promise.all([
        fetchGithubDraft(BAG_QUEUE_PATH, BAG_WRITING_BRANCH),
        fetchGithubDraft(BAG_QUEUE_PATH, 'main'),
      ])
      setItems(joinBagReviewStates(readBagDraftQueue(working), readBagDraftQueue(publicQueue)))
    } catch (cause) {
      setError(cause instanceof Error ? `원고 목록을 조회하지 못했습니다 (${cause.message}).` : '원고 목록을 조회하지 못했습니다.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const visible = useMemo(() => items.filter((item) =>
    filter === 'ALL' || (filter === 'APPROVED' ? item.published : !item.published)), [items, filter])
  const pending = items.filter((item) => !item.published).length
  const approved = items.filter((item) => item.published).length

  const openDraft = async (item: BagDraftItem) => {
    const myGeneration = ++readGeneration.current
    setSelected(item); setArticle(null); setArticleBusy(true); setArticleError('')
    try {
      const raw = await fetchGithubDraft(`docs/bunker_os/bag_knowledge/${item.file}`)
      const parsed = parseBagDraft(raw, item.id)
      if (readGeneration.current === myGeneration) setArticle(parsed)
    } catch (cause) {
      if (readGeneration.current === myGeneration) {
        setArticleError(cause instanceof Error ? cause.message : '원고를 읽지 못했습니다.')
      }
    } finally {
      if (readGeneration.current === myGeneration) setArticleBusy(false)
    }
  }

  return <section className="operator-panel operator-bag-drafts" id="bag-knowledge-draft-inbox"
    aria-labelledby="bag-knowledge-draft-heading">
    <header>
      <div>
        <p className="archive-eyebrow">BAG KNOWLEDGE · HOURLY DRAFTS</p>
        <h2 id="bag-knowledge-draft-heading">생존가방 원고 보관함</h2>
      </div>
      <strong>{items.length}/49편 작성 · 검수 대기 {pending}편</strong>
    </header>
    <p className="operator-muted">
      한 시간에 한 편씩 작성한 물품지식 원고를 GitHub 집필 보관소에서 직접 읽습니다.
      검수 대기 수와 관계없이 집필은 진행되며, 검수와 프론트엔드 공개는 별도 승인으로 처리합니다.
    </p>
    <div className="operator-heading-actions operator-bag-draft-filters">
      {([
        ['WAITING', `검수할 원고 ${pending}`],
        ['APPROVED', `게시 승인 ${approved}`],
        ['ALL', `전체 ${items.length}`],
      ] as const).map(([value, title]) =>
        <button className="operator-secondary" type="button" key={value} aria-pressed={filter === value}
          onClick={() => setFilter(value)}>{title}</button>)}
      <button className="operator-secondary" type="button" onClick={() => void refresh()} disabled={loading}>
        {loading ? '가져오는 중…' : '목록 새로고침'}
      </button>
    </div>
    {error && <p className="operator-error" role="alert">{error} GitHub 연결 상태를 확인하세요.</p>}
    <p className="operator-muted">이 화면은 읽기 전용입니다. 원고 파일은 공개 GitHub 저장소에 있지만, <strong>미승인 글을 생존지식 홈페이지에 게시하지 않습니다.</strong></p>
    {loading && !items.length && <p className="operator-muted" aria-live="polite">집필 원고를 불러오는 중…</p>}
    {!loading && !error && !visible.length && <p className="operator-empty">이 조건에 해당하는 원고가 없습니다.</p>}
    <ul className="operator-bag-draft-list">
      {visible.map((item) => <li key={item.id}>
        <button type="button" className="operator-bag-draft-button"
          aria-pressed={selected?.id === item.id} onClick={() => void openDraft(item)}>
          <strong>{item.name}</strong>
          <small>{bagDraftLabel(item.state)} · {item.id}</small>
          <span>원고 읽기 →</span>
        </button>
      </li>)}
    </ul>
    {selected && <article className="operator-bag-draft-reader" aria-label={`${selected.name} 원고`}>
      <div className="operator-bag-draft-reader-heading">
        <div>
          <p className="archive-eyebrow">검토용 원고 · 프론트엔드 미승인 글은 비게시</p>
          <h3>{article?.title ?? selected.name}</h3>
          <small>{bagDraftLabel(selected.state)} · 현재 읽는 품목: {selected.id}</small>
        </div>
        <div className="operator-heading-actions">
          <a className="operator-secondary" href={githubDraftWebUrl(selected.file, selected.id)}
            target="_blank" rel="noopener noreferrer">GitHub 원본 ↗</a>
          <button className="operator-secondary" type="button" onClick={() => {
            ++readGeneration.current; setSelected(null); setArticle(null); setArticleError('')
          }}>닫기</button>
        </div>
      </div>
      {articleBusy && <p role="status">원고 본문을 불러오는 중…</p>}
      {articleError && <p className="operator-error" role="alert">원고를 불러오지 못했습니다: {articleError}</p>}
      {article && <div className="operator-bag-draft-article"><SafeMarkdown body={article.content} /></div>}
      <p className="operator-muted">이 페이지는 검토용입니다. 실제 발행은 별도 사용자 승인·내용 및 링크 QA를 통과한 뒤에만 진행합니다.</p>
    </article>}
  </section>
}
