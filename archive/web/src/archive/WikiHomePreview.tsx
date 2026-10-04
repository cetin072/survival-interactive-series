import { activeChronicle, chronicleRegistry } from './chronicleRegistry'
import { buildWikiDocuments, wikiCharacterIndex, wikiEventIndex, wikiLocationIndex, wikiSupportedNodeIds } from './wikiDocument'
import { publishedKnowledgeEntries } from './wikiSearch'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

const recentWorldDocuments = buildWikiDocuments(wikiSupportedNodeIds)
  .sort((a, b) => b.anchor.gameTime.localeCompare(a.anchor.gameTime) || b.anchor.saveVersion - a.anchor.saveVersion)
  .slice(0, 7)

const wikiHref = (nodeId: string) => '/?view=wiki-preview&node=' + encodeURIComponent(nodeId)
const chronicleHref = (chronicleId: string) => '/?view=wiki-preview&page=chronicle&chronicle=' + encodeURIComponent(chronicleId)
const storyHref = (chronicleId: string) => '/?view=story&chronicle=' + encodeURIComponent(chronicleId)

export function WikiHomePreview() {
  return <main className="wiki-shell wiki-home-shell">
    <WikiTopbar />

    <div className="wiki-home-frame">
      <header className="wiki-home-intro">
        <p className="wiki-document-kicker">SURVIVAL DIARY · STORY ARCHIVE</p>
        <h1>생존일기</h1>
        <p>생존 이야기를 읽고, 인물·장소·사건을 문서로 따라가며 세계를 탐색하는 기록 보관소입니다.</p>
      </header>

      <section className="wiki-home-section wiki-current-chronicle" aria-labelledby="wiki-current-title">
        <div className="wiki-section-heading">
          <div><span>현재 진행 중</span><h2 id="wiki-current-title">{activeChronicle.title}</h2></div>
          <strong>생존기 {String(activeChronicle.number).padStart(2, '0')}</strong>
        </div>
        <p>{activeChronicle.protagonist} 생존기 · 현재 플레이가 이어지고 있습니다.</p>
        <div className="wiki-home-actions">
          <a className="primary" href={chronicleHref(activeChronicle.id)}>생존기 보기</a>
          <a href={storyHref(activeChronicle.id)}>이야기 읽기</a>
        </div>
      </section>

      <div className="wiki-home-columns">
        <div>
          <section className="wiki-home-section" aria-labelledby="wiki-recent-title">
            <div className="wiki-section-heading"><h2 id="wiki-recent-title">최근 세계관 기록</h2><span>최근 기준시각 순</span></div>
            <div className="wiki-change-list">
              {recentWorldDocuments.map((document) => <a key={document.id} href={wikiHref(document.id)}>
                <span className="wiki-type-badge">{document.typeLabel}</span>
                <strong>{document.title}</strong>
                <small>{document.subtitle}</small>
                <time>{document.anchor.gameTime}</time>
              </a>)}
            </div>
          </section>

          <section className="wiki-home-section" aria-labelledby="wiki-category-title">
            <div className="wiki-section-heading"><h2 id="wiki-category-title">세계관 분류</h2><span>현재 공개 Graph 기준</span></div>
            <div className="wiki-category-grid">
              <section><strong>인물</strong><b>{wikiCharacterIndex.length}</b><div>{wikiCharacterIndex.slice(0, 6).map((item) => <a key={item.id} href={wikiHref(item.id)}>{item.title}</a>)}</div></section>
              <section><strong>장소</strong><b>{wikiLocationIndex.length}</b><div>{wikiLocationIndex.slice(0, 6).map((item) => <a key={item.id} href={wikiHref(item.id)}>{item.title}</a>)}</div></section>
              <section><strong>사건</strong><b>{wikiEventIndex.length}</b><div>{wikiEventIndex.slice(0, 6).map((item) => <a key={item.id} href={wikiHref(item.id)}>{item.title}</a>)}</div></section>
            </div>
          </section>
        </div>

        <aside>
          <section className="wiki-home-section" aria-labelledby="wiki-chronicles-title">
            <div className="wiki-section-heading"><h2 id="wiki-chronicles-title">생존기</h2><span>{chronicleRegistry.length}개</span></div>
            <div className="wiki-chronicle-list">
              {chronicleRegistry.map((chronicle) => <article key={chronicle.id}>
                <span>{String(chronicle.number).padStart(2, '0')}</span>
                <div><strong>{chronicle.title}</strong><small>{chronicle.protagonist} · {chronicle.status === 'LIVE' ? '진행 중' : '완결'}</small></div>
                {chronicle.id === activeChronicle.id
                  ? <a href={chronicleHref(chronicle.id)}>보기</a>
                  : <a href={storyHref(chronicle.id)}>읽기</a>}
              </article>)}
            </div>
          </section>

          <section className="wiki-home-section" aria-labelledby="wiki-knowledge-title">
            <div className="wiki-section-heading"><h2 id="wiki-knowledge-title">최근 생존 지식</h2><a href="/?view=knowledge-preview">전체 보기</a></div>
            <div className="wiki-knowledge-list">
              {publishedKnowledgeEntries.slice(0, 5).map((entry) => <a key={entry.id} href={entry.href}>
                <strong>{entry.title}</strong>
                <small>{entry.subtitle}{entry.publishedAt ? ' · ' + entry.publishedAt : ''}</small>
              </a>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  </main>
}
