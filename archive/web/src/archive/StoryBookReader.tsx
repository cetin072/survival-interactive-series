import { useEffect, useMemo, useRef, useState } from 'react'
import { archiveNodes } from './archiveData'
import { readerContentsForChronicle, chronicleBooks } from './storyData'
import { getChronicle, type ChronicleId } from './chronicleRegistry'
import type { ReaderEntry } from './readerContents'
import { SafeMarkdown } from './SafeMarkdown'
import { selectReaderItem, storyProgressKey } from './readerNavigation'
import { useReaderPosition } from './useReaderPosition'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'
import './storyReader.css'

const nodeById = new Map(archiveNodes.map((node) => [node.id, node]))

export function StoryBookReader({ chronicleId, initialChapterId, onChapterChange, onOpenNode, onBack, onOpenChronicle }: {
  chronicleId: ChronicleId
  initialChapterId?: string
  onChapterChange: (chapterId: string) => void
  onOpenNode: (id: string) => void
  onBack: () => void
  onOpenChronicle: () => void
}) {
  const book = chronicleBooks.find((item) => item.chronicleId === chronicleId)
  const title = book?.title ?? getChronicle(chronicleId).title
  const contents = useMemo(() => readerContentsForChronicle(chronicleId), [chronicleId])
  const selectedChapter = selectReaderItem(contents.entries.map((entry) => entry.chapter), initialChapterId)
  const index = contents.entries.findIndex((entry) => entry.chapter.id === selectedChapter?.id)
  const current = contents.entries[index]
  const selected = current?.chapter
  const { articleRef, progress, scrollToStart } = useReaderPosition(selected?.id, '.wiki-topbar')
  const [openGroups, setOpenGroups] = useState(() => new Set(current ? [current.groupId] : []))
  const [tocOpen, setTocOpen] = useState(true)
  const tocRef = useRef<HTMLDetailsElement>(null)
  const tocContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 861px)')
    const update = () => setTocOpen(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (current) setOpenGroups((previous) => new Set([...previous, current.groupId]))
    if (selected) {
      try { window.localStorage.setItem(storyProgressKey(chronicleId), selected.id) } catch { /* optional bookmark */ }
    }
  }, [chronicleId, selected?.id, current?.groupId])

  useEffect(() => {
    const toc = tocRef.current
    const button = toc?.querySelector<HTMLElement>('[aria-current="page"]')
    const scrollContainer = window.matchMedia('(max-width: 860px)').matches ? tocContentRef.current : toc
    if (!scrollContainer || !button || !tocOpen || !button.getClientRects().length) return
    const top = button.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top
    if (top < 0 || top > scrollContainer.clientHeight - button.offsetHeight) scrollContainer.scrollTop += top - 80
  }, [selected?.id, openGroups, tocOpen])

  const openChapter = (entry: ReaderEntry) => {
    if (entry.chapter.id === selected?.id) scrollToStart()
    else onChapterChange(entry.chapter.id)
    if (window.matchMedia('(max-width: 860px)').matches) setTocOpen(false)
  }
  const previous = contents.entries[index - 1]
  const next = contents.entries[index + 1]

  return <main className="wiki-shell story-reader-shell">
    <WikiTopbar />
    <div className="wiki-home-frame story-reader-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <button onClick={onBack}>이야기</button><span>›</span><button onClick={onOpenChronicle}>{title}</button>
        {current && <><span>›</span><span>{current.groupLabel}</span><span>›</span><strong aria-current="page">{current.label} · {selected?.title}</strong></>}
      </nav>
      <div className="wiki-home-actions story-reader-actions"><a href="/?view=story" onClick={(event) => { event.preventDefault(); onBack() }}>이야기 목록</a><a href={'/?view=wiki-preview&page=chronicle&chronicle=' + encodeURIComponent(chronicleId)} onClick={(event) => { event.preventDefault(); onOpenChronicle() }}>생존기 소개</a></div>
      {!selected || !current ? <section className="wiki-home-section"><p role="status">아직 공개된 장이 없습니다.</p></section> : <section className="book-reader" aria-label={title + ' reader'}>
        <aside className="book-toc">
          <details className="book-toc-disclosure" ref={tocRef} open={tocOpen} onToggle={(event) => setTocOpen(event.currentTarget.open)}>
            <summary>목차 · {contents.entries.length}장</summary>
            <div className="book-toc-content" ref={tocContentRef}>
              <p className="wiki-document-kicker">{title}</p><h2>목차 <small>{contents.entries.length}장</small></h2>
              {contents.groups.map((group) => <details className="book-toc-group" key={group.id} open={openGroups.has(group.id)} onToggle={(event) => {
                const open = event.currentTarget.open
                setOpenGroups((previous) => {
                  if (previous.has(group.id) === open) return previous
                  const updated = new Set(previous)
                  if (open) updated.add(group.id); else updated.delete(group.id)
                  return updated
                })
              }}><summary>{group.label} <small>{group.entries.length}장</small></summary><ol>{group.entries.map((entry) => <li key={entry.chapter.id}><button className={entry.chapter.id === selected.id ? 'selected' : ''} aria-current={entry.chapter.id === selected.id ? 'page' : undefined} data-chapter-id={entry.chapter.id} onClick={() => openChapter(entry)}><span>{entry.label}</span>{entry.chapter.title}</button></li>)}</ol></details>)}
            </div>
          </details>
        </aside>
        <article className="book-prose" ref={articleRef} data-chapter-id={selected.id}>
          <header><p className="wiki-document-kicker">{current.groupLabel} · {current.label}{selected.dateLabel && ' · ' + selected.dateLabel}</p><h1>{selected.title}</h1><p>{selected.subtitle}</p><div className="reader-progress" aria-label={'읽기 진행률 ' + progress + '%'}><strong>{progress}%</strong><span><i style={{ width: progress + '%' }} /></span></div></header>
          {book?.beginningStatus === 'MISSING_BEGINNING' && <aside className="reader-integrity-note"><strong>초기 기록 복구 중</strong><p>현재 공개본은 확보된 첫 검증 장면부터 시작합니다.</p></aside>}
          {book?.beginningGap && selected.id === 'c03-afterfall-chapter-01' && <aside className="reader-integrity-note"><strong>{book.beginningGap.label}</strong><p>{book.beginningGap.after} 이후부터 {book.beginningGap.before} 시작 전까지의 공개 원문은 확보되지 않았습니다.</p></aside>}
          <div className="reader-body"><SafeMarkdown body={selected.body} /></div>
          {book?.beginningGap && selected.id === 'c03-afterfall-opening-01' && <aside className="reader-integrity-note"><strong>{book.beginningGap.label}</strong><p>{book.beginningGap.after} 이후부터 {book.beginningGap.before} 시작 전까지의 공개 원문은 확보되지 않았습니다.</p></aside>}
          {selected.relatedNodeIds.length > 0 && <section className="book-related"><p className="wiki-document-kicker">세계 탐색</p><h2>이 장의 인물과 장소</h2><div>{selected.relatedNodeIds.map((id) => { const node = nodeById.get(id); return node ? <button key={id} onClick={() => onOpenNode(id)}><strong>{node.label}</strong><span>{node.subtitle}</span></button> : null })}</div></section>}
          <nav className="book-pager" aria-label="이전과 다음 장">{previous ? <button onClick={() => openChapter(previous)}>← {previous.groupLabel} · {previous.label} {previous.chapter.title}</button> : <span />}{next ? <button onClick={() => openChapter(next)}>{next.groupLabel} · {next.label} {next.chapter.title} →</button> : <span />}</nav>
        </article>
      </section>}
    </div>
  </main>
}
