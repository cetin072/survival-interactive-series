import { chronicleRegistry, getChronicle } from './chronicleRegistry'
import { chaptersForChronicle } from './storyData'
import { hasPublishedWorldWiki, publishedWorldWikiIndex, type WorldWikiIndexItem } from './worldWikiIndexData'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'
import './worldIndexDisclosure.css'

import { wikiNodeHref } from './wikiLinks'
const chronicleHref = (id: string) => '/?view=wiki-preview&page=chronicle&chronicle=' + encodeURIComponent(id)
const worldHref = (id: string) => '/?view=wiki-preview&page=world&chronicle=' + encodeURIComponent(id)
const storyHref = (id: string) => '/?view=story&chronicle=' + encodeURIComponent(id)

const worldIndexPreviewLimit = 6

function WorldIndexLinks({ items, chronicleId }: { items: readonly WorldWikiIndexItem[]; chronicleId: string }) {
  return <div className="wiki-world-index-list">
    {items.map((item) => <a key={item.id} href={wikiNodeHref(chronicleId, item.id)}>
      <strong>{item.title}</strong>
      {item.subtitle && <small>{item.subtitle}</small>}
    </a>)}
  </div>
}

export function WorldIndexSection({
  id,
  title,
  countLabel,
  chronicleId = 'C03-AFTERFALL',
  items,
}: {
  id: string
  title: string
  countLabel: string
  chronicleId?: string
  items: readonly WorldWikiIndexItem[]
}) {
  const first = items.slice(0, worldIndexPreviewLimit)
  const remaining = items.slice(worldIndexPreviewLimit)

  return <section className="wiki-home-section wiki-world-index-section" id={id} aria-label={title + ' 전체 목록'}>
    <div className="wiki-section-heading">
      <h2>{title}</h2>
      <span>{items.length}{countLabel}</span>
    </div>
    <WorldIndexLinks items={first} chronicleId={chronicleId} />
    {remaining.length > 0 && <details className="wiki-world-index-disclosure">
      <summary>
        <span className="wiki-world-index-more-label">나머지 {remaining.length}{countLabel} 더 보기</span>
        <span className="wiki-world-index-less-label">목록 접기</span>
      </summary>
      <WorldIndexLinks items={remaining} chronicleId={chronicleId} />
    </details>}
  </section>
}

function ChronicleWorldList() {
  return <section className="wiki-home-section" aria-labelledby="world-chronicle-list-title">
    <div className="wiki-section-heading">
      <h2 id="world-chronicle-list-title">생존기별 세계관</h2>
      <span>{chronicleRegistry.length}개 생존기</span>
    </div>
    <div className="wiki-chronicle-list">
      {chronicleRegistry.map((item) => <article key={item.id}>
        <span>{String(item.number).padStart(2, '0')}</span>
        <div>
          <strong>{item.title}</strong>
          <small>{hasPublishedWorldWiki(item.id) ? (publishedWorldWikiIndex(item.id)?.recent[0]?.notice ? '세계관 위키 검수 후보' : '세계관 문서 공개') : '세계관 위키 준비 중'}</small>
        </div>
        <a href={hasPublishedWorldWiki(item.id) ? worldHref(item.id) : chronicleHref(item.id)}>
          {hasPublishedWorldWiki(item.id) ? '위키 보기' : '생존기 보기'}
        </a>
      </article>)}
    </div>
  </section>
}

export function WikiWorldIndexPreview({ chronicleId = 'C03-AFTERFALL' }: { chronicleId?: string }) {
  const chronicle = getChronicle(chronicleId)
  const world = publishedWorldWikiIndex(chronicleId)
  const chapters = chaptersForChronicle(chronicle.id)

  return <main className="wiki-shell wiki-home-shell">
    <WikiTopbar />

    <div className="wiki-home-frame wiki-world-index-page">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span>
        <a href={chronicleHref(chronicle.id)}>{chronicle.title}</a><span>›</span>
        <strong>세계관 전체보기</strong>
      </nav>

      <header className="wiki-home-intro">
        <p className="wiki-document-kicker">SURVIVAL DIARY · WORLD WIKI</p>
        <h1>{chronicle.title} · 세계관 전체보기</h1>
        <p>{world ? '인물·장소·사건과 최근 세계관 기록을 작품별로 찾아보는 세계관 위키입니다.' : '이 작품에서 검증되어 공개된 세계관 문서를 확인하는 공간입니다.'}</p>
        <div className="wiki-home-actions">
          <a href={chronicleHref(chronicle.id)}>생존기 소개</a>
          {chapters.length > 0 && <a href={storyHref(chronicle.id)}>이야기 읽기</a>}
        </div>
      </header>

      {world?.recent[0]?.notice && <p className="wiki-muted">{world.recent[0].notice}</p>}
      {world ? <>
        <div className="wiki-home-columns">
          <div>
            <section className="wiki-home-section" aria-labelledby="world-recent-title">
              <div className="wiki-section-heading">
                <h2 id="world-recent-title">최근 세계관 기록</h2>
                <span>{world.recent.some((document) => document.recordBasis) ? '공개 이야기의 장 순서 기준' : '작품 속 최근 기준시각 순'}</span>
              </div>
              <div className="wiki-change-list">
                {world.recent.map((document) => <a key={document.id} href={wikiNodeHref(chronicleId, document.id)}>
                  <span className="wiki-type-badge">{document.typeLabel}</span>
                  <strong>{document.title}</strong>
                  <small>{document.subtitle}</small>
                  <time>{document.anchor.gameTime}</time>
                </a>)}
              </div>
            </section>

            <section className="wiki-home-section" aria-labelledby="world-categories-title">
              <div className="wiki-section-heading">
                <h2 id="world-categories-title">세계관 분류</h2>
                <span>현재 공개된 세계관 문서 기준</span>
              </div>
              <div className="wiki-category-grid">
                {world.categories.map((category) => <section key={category.id}>
                  <strong>{category.label}</strong><b>{category.items.length}</b>
                  <div>{category.items.slice(0, 6).map((item) =>
                    <a key={item.id} href={wikiNodeHref(chronicleId, item.id)}>{item.title}</a>)}</div>
                  <a className="wiki-category-more" href={'#' + category.id}>{category.label} 전체보기 →</a>
                </section>)}
              </div>
            </section>
          </div>

          <aside>
            <ChronicleWorldList />
          </aside>
        </div>

        <section className="wiki-home-section" aria-labelledby="world-all-documents-title">
          <div className="wiki-section-heading">
            <h2 id="world-all-documents-title">전체 세계관 문서</h2>
            <span>인물 · 장소 · 사건</span>
          </div>
          <nav className="wiki-world-index-jump" aria-label="세계관 분류 바로가기">
            {world.categories.map((category) => <a key={category.id} href={'#' + category.id}>
              {category.label} {category.items.length}
            </a>)}
          </nav>
        </section>
        {world.categories.map((category) => <WorldIndexSection
          key={category.id}
          id={category.id}
          title={category.label}
          countLabel={category.counter}
          items={category.items}
          chronicleId={chronicleId}
        />)}
      </> : <>
        <section className="wiki-home-section" aria-labelledby="world-unavailable-title">
          <div className="wiki-section-heading"><h2 id="world-unavailable-title">세계관 문서 준비 중</h2></div>
          <p>아직 공개 검증을 마친 {chronicle.title} 세계관 문서가 없습니다.
            다른 생존기의 인물·장소·사건을 대신 표시하지 않습니다.</p>
          <div className="wiki-home-actions">
            {chapters.length > 0 && <a className="primary" href={storyHref(chronicle.id)}>공개 이야기 읽기</a>}
            <a href={chronicleHref(chronicle.id)}>생존기 정보 보기</a>
          </div>
        </section>
        <ChronicleWorldList />
      </>}
    </div>
  </main>
}
