import { chronicleBooks } from './storyData'
import { activeChronicle, chronicleRegistry } from './chronicleRegistry'

type Props = {
  onOpenChronicle: (id: string) => void
  onOpenBook: (id: string) => void
  onOpenExplorer: (id: string) => void
}

export function StoryLibrary({ onOpenChronicle, onOpenBook, onOpenExplorer }: Props) {
  const featuredBook = chronicleBooks.find((book) => book.chronicleId === activeChronicle.id)
  return <section className="story-library archive-hub" aria-label="생존일기 Chronicle Hub">
    <header className="library-intro hub-intro">
      <p className="archive-eyebrow">SURVIVAL DIARY · IP ARCHIVE</p>
      <h1>생존일기</h1>
      <p>여러 생존 이야기를 기록하고, 그 이야기에서 세계와 현실의 생존 지식을 쌓아가는 Archive입니다.</p>
    </header>
    <section className="featured-chronicle" aria-labelledby="featured-title">
      <div><p className="archive-eyebrow">현재 진행 중 · CHRONICLE {String(activeChronicle.number).padStart(2, '0')}</p>
        <h2 id="featured-title">{activeChronicle.title}</h2>
        <p>{activeChronicle.protagonist} 생존기 · Season 3</p>
        <div className="hub-actions">
          <button className="primary" onClick={() => onOpenBook(activeChronicle.id)}>이야기 읽기</button>
          <button onClick={() => onOpenExplorer(activeChronicle.id)}>세계 탐색</button>
          <button onClick={() => onOpenChronicle(activeChronicle.id)}>Chronicle 방 열기</button>
        </div>
      </div>
      <span className="featured-index">03</span>
    </section>
    <section aria-labelledby="chronicles-title">
      <div className="hub-section-heading"><div><p className="archive-eyebrow">STORIES</p><h2 id="chronicles-title">Chronicles</h2></div><span>{chronicleRegistry.length}개의 이야기</span></div>
      <div className="book-shelf chronicle-shelf">
        {chronicleRegistry.map((chronicle) => {
          const book = chronicleBooks.find((item) => item.chronicleId === chronicle.id)
          return <article className="book-card chronicle-card" key={chronicle.id}>
            <p className="archive-eyebrow">CHRONICLE {String(chronicle.number).padStart(2, '0')} · {chronicle.status === 'LIVE' ? '현재 진행 중' : '완결'}</p>
            <h3>{chronicle.title}</h3>
            <p className="book-subtitle">{chronicle.protagonist} 생존기</p>
            <p>{book?.description ?? chronicle.availabilityNote}</p>
            <dl><div><dt>입력 유형</dt><dd>{chronicle.sourceClass}</dd></div><div><dt>공개 기록</dt><dd>{book ? 'Reader 제공' : '아직 기록 없음'}</dd></div></dl>
            <button className="primary" onClick={() => onOpenChronicle(chronicle.id)}>Chronicle 방 열기</button>
          </article>
        })}
      </div>
    </section>
    <section className="shared-archive-links" aria-label="공용 Archive">
      <a href="/knowledge/"><span>공용 지식 보관소</span><strong>Knowledge →</strong></a>
      <a href="/?view=tools"><span>체크리스트와 자료</span><strong>Tools →</strong></a>
      <a href="/?view=media"><span>삽화와 미디어 자료</span><strong>Media →</strong></a>
    </section>
  </section>
}
