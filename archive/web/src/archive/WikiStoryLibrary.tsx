import { activeChronicle, chronicleRegistry } from './chronicleRegistry'
import { chaptersForChronicle, chronicleBooks } from './storyData'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

const chronicleHref = (id: string) => '/?view=wiki-preview&page=chronicle&chronicle=' + encodeURIComponent(id)
const storyHref = (id: string) => '/?view=story&chronicle=' + encodeURIComponent(id)

export function WikiStoryLibrary() {
  return <main className="wiki-shell wiki-home-shell">
    <WikiTopbar />
    <div className="wiki-home-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span><strong>이야기</strong>
      </nav>
      <header className="wiki-home-intro">
        <p className="wiki-document-kicker">SURVIVAL DIARY · STORIES</p>
        <h1>이야기</h1>
        <p>공개된 생존기를 골라 읽고, 각 생존기의 기록을 살펴보세요.</p>
      </header>

      <section className="wiki-home-section wiki-current-chronicle" aria-labelledby="wiki-story-current-title">
        <div className="wiki-section-heading">
          <div><span>현재 진행 중</span><h2 id="wiki-story-current-title">{activeChronicle.title}</h2></div>
          <strong>생존기 {String(activeChronicle.number).padStart(2, '0')}</strong>
        </div>
        <p>{activeChronicle.protagonist} 생존기 · 현재 플레이가 이어지고 있습니다.</p>
        <div className="wiki-home-actions">
          {chaptersForChronicle(activeChronicle.id).length > 0 && <a className="primary" href={storyHref(activeChronicle.id)}>이야기 읽기</a>}
          <a href={chronicleHref(activeChronicle.id)}>생존기 보기</a>
        </div>
      </section>

      <section className="wiki-home-section" aria-labelledby="wiki-story-list-title">
        <div className="wiki-section-heading">
          <h2 id="wiki-story-list-title">전체 생존기 목록</h2><span>{chronicleRegistry.length}개</span>
        </div>
        {chronicleRegistry.map((chronicle) => {
          const book = chronicleBooks.find((item) => item.chronicleId === chronicle.id)
          const chapterCount = chaptersForChronicle(chronicle.id).length
          return <article className="wiki-home-section" key={chronicle.id}>
            <div className="wiki-section-heading">
              <h2>{chronicle.title}</h2>
              <span>생존기 {String(chronicle.number).padStart(2, '0')} · {chronicle.status === 'LIVE' ? '진행 중' : '완결'}</span>
            </div>
            <p>{chronicle.protagonist} 생존기 · {book?.description ?? chronicle.availabilityNote}</p>
            <div className="wiki-home-actions">
              {chapterCount > 0 && <a className="primary" href={storyHref(chronicle.id)}>이야기 읽기 · {chapterCount}장</a>}
              <a href={chronicleHref(chronicle.id)}>생존기 보기</a>
            </div>
          </article>
        })}
      </section>
    </div>
  </main>
}