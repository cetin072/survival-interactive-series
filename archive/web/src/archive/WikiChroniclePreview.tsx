import { hasPublishedWorldWiki } from './worldWikiIndexData'
import { getChronicle } from './chronicleRegistry'
import { chaptersForChronicle } from './storyData'
import { buildWikiDocuments, wikiCharacterIndex, wikiEventIndex, wikiLocationIndex, wikiSupportedNodeIds } from './wikiDocument'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

const wikiHref = (nodeId: string) => '/?view=wiki-preview&node=' + encodeURIComponent(nodeId)
const storyHref = (chronicleId: string) => '/?view=story&chronicle=' + encodeURIComponent(chronicleId)
const worldHref = (chronicleId: string, section?: 'characters' | 'locations' | 'events') => '/?view=wiki-preview&page=world&chronicle=' + encodeURIComponent(chronicleId) + (section ? '#' + section : '')

export function WikiChroniclePreview({ chronicleId }: { chronicleId: string }) {
  const chronicle = getChronicle(chronicleId)
  const chapters = chaptersForChronicle(chronicleId)
  const hasWorldWiki = hasPublishedWorldWiki(chronicleId)
  const recentDocuments = hasWorldWiki
    ? buildWikiDocuments(wikiSupportedNodeIds)
      .sort((a, b) => b.anchor.gameTime.localeCompare(a.anchor.gameTime) || (b.anchor.saveVersion ?? 0) - (a.anchor.saveVersion ?? 0))
      .slice(0, 8)
    : []

  return <main className="wiki-shell">
    <WikiTopbar />

    <div className="wiki-home-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/?view=wiki-preview">생존일기</a><span>›</span><strong>{chronicle.title}</strong>
      </nav>

      <header className="wiki-chronicle-header">
        <p className="wiki-document-kicker">생존기 {String(chronicle.number).padStart(2, '0')} · {chronicle.status === 'LIVE' ? '현재 진행 중' : '완결 기록'}</p>
        <h1>{chronicle.title}</h1>
        <p>{chronicle.protagonist}의 생존 기록</p>
        <div className="wiki-home-actions">
          {chapters.length > 0 && <a className="primary" href={storyHref(chronicle.id)}>이야기 읽기 · {chapters.length}장</a>}
          {hasWorldWiki && <a href={wikiHref('char-jinwoo')}>세계관 문서 보기</a>}
        </div>
      </header>

      {hasWorldWiki ? <div className="wiki-home-columns wiki-chronicle-columns">
        <div>
          <section className="wiki-home-section" aria-labelledby="wiki-world-title">
            <div className="wiki-section-heading"><h2 id="wiki-world-title">세계관</h2><span>인물 · 장소 · 사건</span></div>
            <div className="wiki-category-grid">
              <section><strong>인물</strong><b>{wikiCharacterIndex.length}</b><div>{wikiCharacterIndex.slice(0, 8).map((item) => <a key={item.id} href={wikiHref(item.id)}>{item.title}</a>)}</div><a className="wiki-category-more" href={worldHref(chronicle.id, 'characters')}>인물 전체보기 →</a></section>
              <section><strong>장소</strong><b>{wikiLocationIndex.length}</b><div>{wikiLocationIndex.slice(0, 8).map((item) => <a key={item.id} href={wikiHref(item.id)}>{item.title}</a>)}</div><a className="wiki-category-more" href={worldHref(chronicle.id, 'locations')}>장소 전체보기 →</a></section>
              <section><strong>사건</strong><b>{wikiEventIndex.length}</b><div>{wikiEventIndex.slice(0, 8).map((item) => <a key={item.id} href={wikiHref(item.id)}>{item.title}</a>)}</div><a className="wiki-category-more" href={worldHref(chronicle.id, 'events')}>사건 전체보기 →</a></section>
            </div>
          </section>

          <section className="wiki-home-section" aria-labelledby="wiki-chronicle-recent-title">
            <div className="wiki-section-heading"><h2 id="wiki-chronicle-recent-title">최근 기록</h2><span>공개 Graph 기준</span></div>
            <div className="wiki-change-list">
              {recentDocuments.map((document) => <a key={document.id} href={wikiHref(document.id)}>
                <span className="wiki-type-badge">{document.typeLabel}</span>
                <strong>{document.title}</strong>
                <small>{document.subtitle}</small>
                <time>{document.anchor.gameTime}</time>
              </a>)}
            </div>
          </section>
        </div>

        <aside>
          <section className="wiki-home-section">
            <div className="wiki-section-heading"><h2>이 생존기</h2><span>C03</span></div>
            <dl className="wiki-chronicle-info">
              <div><dt>주인공</dt><dd>{chronicle.protagonist}</dd></div>
              <div><dt>상태</dt><dd>{chronicle.status === 'LIVE' ? '현재 진행 중' : '완결'}</dd></div>
              <div><dt>이야기</dt><dd>{chapters.length}장 공개</dd></div>
              <div><dt>인물</dt><dd>{wikiCharacterIndex.length}명</dd></div>
              <div><dt>장소</dt><dd>{wikiLocationIndex.length}곳</dd></div>
              <div><dt>사건</dt><dd>{wikiEventIndex.length}건</dd></div>
            </dl>
          </section>

          <section className="wiki-home-section">
            <div className="wiki-section-heading"><h2>바로가기</h2></div>
            <nav className="wiki-quick-links">
              <a href={wikiHref('char-jinwoo')}>서진우</a>
              <a href={wikiHref('loc-agri')}>북유성 농업기술 실증단지</a>
              <a href={wikiHref('event-fireline')}>서쪽 대형화재 방어선</a>
            </nav>
          </section>
        </aside>
      </div> : <section className="wiki-home-section wiki-legacy-chronicle">
        <div className="wiki-section-heading"><h2>공개 기록</h2><span>{chapters.length}장</span></div>
        <p>이 생존기는 현재 이야기 Reader 중심으로 공개되어 있습니다. 인물·장소·사건 Wiki는 검증된 세계관 데이터가 준비되는 순서대로 연결합니다.</p>
        {chapters.length > 0 && <a className="wiki-text-link" href={storyHref(chronicle.id)}>이야기 읽기 →</a>}
      </section>}
    </div>
  </main>
}
