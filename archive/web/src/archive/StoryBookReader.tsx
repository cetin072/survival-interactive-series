import { useEffect, useMemo } from 'react'
import { archiveNodes } from './archiveData'
import { chaptersForChronicle, chronicleBooks, type ReaderChapter } from './storyData'
import type { ChronicleId } from './chronicleRegistry'
import { SafeMarkdown } from './SafeMarkdown'
import { selectReaderItem, storyProgressKey } from './readerNavigation'
import { useReaderPosition } from './useReaderPosition'

const nodeById = new Map(archiveNodes.map((node) => [node.id, node]))

export function StoryBookReader({ chronicleId, initialChapterId, onChapterChange, onOpenNode, onBack }: {
  chronicleId: ChronicleId
  initialChapterId?: string
  onChapterChange: (chapterId: string) => void
  onOpenNode: (id: string) => void
  onBack: () => void
}) {
  const book = chronicleBooks.find((item) => item.chronicleId === chronicleId)!
  const chapters = useMemo(() => chaptersForChronicle(chronicleId), [chronicleId])
  const selected = selectReaderItem(chapters, initialChapterId)
  const index = chapters.findIndex((chapter) => chapter.id === selected?.id)
  const { articleRef, progress, scrollToStart } = useReaderPosition(selected?.id)

  useEffect(() => {
    if (selected) {
      try { window.localStorage.setItem(storyProgressKey(chronicleId), selected.id) } catch { /* optional bookmark */ }
    }
  }, [chronicleId, selected?.id])

  const openChapter = (chapter: ReaderChapter) => {
    if (chapter.id === selected?.id) scrollToStart()
    else onChapterChange(chapter.id)
  }
  if (!selected) return <section className="book-reader"><p role="status">아직 공개된 장이 없습니다.</p><button onClick={onBack}>← 책장</button></section>
  const groups = Array.from(new Set(chapters.map((chapter) => chapter.seasonId ?? chapter.partId ?? '기록'))).map((id) => {
    const chapter = chapters.find((item) => (item.seasonId ?? item.partId ?? '기록') === id)
    return { id, label: chapter?.arcLabel ? `${id} · ${chapter.arcLabel}` : id }
  })
  const previous = chapters[index - 1]
  const next = chapters[index + 1]

  return <section className="book-reader" aria-label={book.title + ' reader'}>
    <aside className="book-toc"><button className="text-button" onClick={onBack}>← 책장</button><p className="archive-eyebrow">{book.title}</p><h2>목차</h2>
      {groups.map((group) => <section key={group.id}><h3>{group.label}</h3>{chapters.filter((chapter) => (chapter.seasonId ?? chapter.partId ?? '기록') === group.id).map((chapter) => <button className={chapter.id === selected.id ? 'selected' : ''} aria-current={chapter.id === selected.id ? 'page' : undefined} data-chapter-id={chapter.id} key={chapter.id} onClick={() => openChapter(chapter)}><span>제{chapter.chapterNumber}장</span>{chapter.title}</button>)}</section>)}
    </aside>
    <article className="book-prose" ref={articleRef} data-chapter-id={selected.id}>
      <header><p className="archive-eyebrow">{selected.dateLabel} · 제{selected.chapterNumber}장</p><h1>{selected.title}</h1><p>{selected.subtitle}</p><div className="reader-progress" aria-label={'읽기 진행률 ' + progress + '%'}><strong>{progress}%</strong><span><i style={{ width: progress + '%' }} /></span></div></header>
      {book.beginningStatus === 'MISSING_BEGINNING' && <aside className="reader-integrity-note"><strong>초기 기록 복구 중</strong><p>현재 공개본은 확보된 첫 검증 장면부터 시작합니다.</p></aside>}
      <div className="reader-body"><SafeMarkdown body={selected.body} /></div>
      {selected.relatedNodeIds.length > 0 && <section className="book-related"><p className="archive-eyebrow">세계 탐색</p><h2>이 장의 인물과 장소</h2><div>{selected.relatedNodeIds.map((id) => { const node = nodeById.get(id); return node ? <button key={id} onClick={() => onOpenNode(id)}><strong>{node.label}</strong><span>{node.subtitle}</span></button> : null })}</div></section>}
      <nav className="book-pager" aria-label="이전과 다음 장">{previous ? <button onClick={() => openChapter(previous)}>← 제{previous.chapterNumber}장 {previous.title}</button> : <span />}{next ? <button onClick={() => openChapter(next)}>제{next.chapterNumber}장 {next.title} →</button> : <span />}</nav>
    </article>
  </section>
}
