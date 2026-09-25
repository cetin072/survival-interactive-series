import { chronicleBooks, chaptersForChronicle, type ChronicleBook } from './storyData'

export function StoryLibrary({ onOpenBook }: { onOpenBook: (chronicleId: ChronicleBook['chronicleId']) => void }) {
  const active = chronicleBooks.filter((book) => book.active)
  const past = chronicleBooks.filter((book) => !book.active)
  const shelf = (books: ChronicleBook[]) => <div className="book-shelf">
    {books.map((book) => {
      const chapters = chaptersForChronicle(book.chronicleId)
      const seasons = new Set(chapters.map((chapter) => chapter.seasonId))
      return <article className="book-card" key={book.chronicleId}>
        <p className="archive-eyebrow">{book.active ? '현재 생존기 · 연재중' : '지난 생존기'}</p>
        <h2>{book.title}</h2>
        <p className="book-subtitle">{book.subtitle}</p>
        <p>{book.description}</p>
        <dl><div><dt>Chronicle</dt><dd>{book.chronicleId.slice(0, 3)}</dd></div><div><dt>Worldline</dt><dd>{book.worldlineId}</dd></div><div><dt>구성</dt><dd>{seasons.size} Season · {chapters.length} Chapter</dd></div></dl>
        <button className="primary" onClick={() => onOpenBook(book.chronicleId)}>이야기 읽기</button>
      </article>
    })}
  </div>

  return <section className="story-library" aria-label="생존기 책장">
    <header className="library-intro"><p className="archive-eyebrow">SURVIVAL DIARY · READER EDITION</p><h1>생존기 책장</h1><p>서로 다른 주인공의 독립된 생존기를 읽습니다.</p></header>
    <section><h2 className="shelf-title">현재 연재</h2>{shelf(active)}</section>
    <section><h2 className="shelf-title">지난 생존기</h2>{shelf(past)}</section>
  </section>
}
