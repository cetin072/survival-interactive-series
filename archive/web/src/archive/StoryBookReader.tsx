import { useEffect, useMemo, useState } from 'react'
import { archiveNodes } from './archiveData'
import { chaptersForChronicle, chronicleBooks, type ReaderChapter } from './storyData'
import type { ChronicleId } from './chronicleRegistry'
import { SafeMarkdown } from './SafeMarkdown'

const nodeById = new Map(archiveNodes.map((node) => [node.id, node]))
const progressKey = (chronicleId: string) => 'survival-diary-archive:story-progress:v1:' + chronicleId

export function StoryBookReader({ chronicleId, initialChapterId, onChapterChange, onOpenNode, onBack }: {
  chronicleId: ChronicleId
  initialChapterId?: string
  onChapterChange: (chapterId: string) => void
  onOpenNode: (id: string) => void
  onBack: () => void
}) {
  const book = chronicleBooks.find((item) => item.chronicleId === chronicleId)!
  const chapters = useMemo(() => chaptersForChronicle(chronicleId), [chronicleId])
  const [chapterId, setChapterId] = useState(initialChapterId ?? chapters[0]?.id)
  const [progress, setProgress] = useState(0)
  const selected = chapters.find((chapter) => chapter.id === chapterId) ?? chapters[0]
  const index = chapters.findIndex((chapter) => chapter.id === selected?.id)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(progressKey(chronicleId))
      const restored = saved && chapters.some((chapter) => chapter.id === saved) ? saved : initialChapterId
      setChapterId(restored && chapters.some((chapter) => chapter.id === restored) ? restored : chapters[0]?.id)
    } catch { setChapterId(initialChapterId ?? chapters[0]?.id) }
  }, [chronicleId, initialChapterId, chapters])

  useEffect(() => {
    if (!selected) return
    try { window.localStorage.setItem(progressKey(chronicleId), selected.id) } catch { /* optional storage */ }
    const updateProgress = () => {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
      setProgress(Math.round((window.scrollY / max) * 100))
    }
    updateProgress(); window.addEventListener('scroll', updateProgress, { passive: true })
    return () => window.removeEventListener('scroll', updateProgress)
  }, [chronicleId, selected?.id])

  const openChapter = (chapter: ReaderChapter) => { setChapterId(chapter.id); onChapterChange(chapter.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  if (!selected) return null
  const groups = Array.from(new Set(chapters.map((chapter) => chapter.seasonId ?? chapter.partId ?? '기록'))).map((id) => {
    const chapter = chapters.find((item) => (item.seasonId ?? item.partId ?? '기록') === id)
    return { id, label: chapter?.arcLabel ? `${id} · ${chapter.arcLabel}` : id }
  })
  const previous = chapters[index - 1]
  const next = chapters[index + 1]

  return <section className="book-reader" aria-label={book.title + ' reader'}>
    <aside className="book-toc"><button className="text-button" onClick={onBack}>← 책장</button><p className="archive-eyebrow">{book.title}</p><h2>목차</h2>
      {groups.map((group) => <section key={group.id}><h3>{group.label}</h3>{chapters.filter((chapter) => (chapter.seasonId ?? chapter.partId ?? '기록') === group.id).map((chapter) => <button className={chapter.id === selected.id ? 'selected' : ''} key={chapter.id} onClick={() => openChapter(chapter)}><span>제{chapter.chapterNumber}장</span>{chapter.title}</button>)}</section>)}
    </aside>
    <article className="book-prose">
      <header><p className="archive-eyebrow">{selected.dateLabel} · 제{selected.chapterNumber}장</p><h1>{selected.title}</h1><p>{selected.subtitle}</p><div className="reader-progress" aria-label={'읽기 진행률 ' + progress + '%'}><strong>{progress}%</strong><span><i style={{ width: progress + '%' }} /></span></div></header>
      <div className="reader-body"><SafeMarkdown body={selected.body} /></div>
      {selected.relatedNodeIds.length > 0 && <section className="book-related"><p className="archive-eyebrow">세계 탐색</p><h2>이 장의 인물과 장소</h2><div>{selected.relatedNodeIds.map((id) => { const node = nodeById.get(id); return node ? <button key={id} onClick={() => onOpenNode(id)}><strong>{node.label}</strong><span>{node.subtitle}</span></button> : null })}</div></section>}
      <nav className="book-pager" aria-label="이전과 다음 장">{previous ? <button onClick={() => openChapter(previous)}>← 제{previous.chapterNumber}장 {previous.title}</button> : <span />}{next ? <button onClick={() => openChapter(next)}>제{next.chapterNumber}장 {next.title} →</button> : <span />}</nav>
    </article>
  </section>
}
