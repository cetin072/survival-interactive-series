import { getChronicle } from './chronicleRegistry'
import { wikiCharacterIndex, wikiEventIndex, wikiLocationIndex } from './wikiDocument'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

const wikiHref = (nodeId: string) => '/?view=wiki-preview&node=' + encodeURIComponent(nodeId)
const chronicleHref = (chronicleId: string) => '/?view=wiki-preview&page=chronicle&chronicle=' + encodeURIComponent(chronicleId)

type WikiIndexItem = { id: string; title: string; subtitle: string }

function WorldIndexSection({
  id,
  title,
  countLabel,
  items,
}: {
  id: string
  title: string
  countLabel: string
  items: WikiIndexItem[]
}) {
  return <section className="wiki-home-section wiki-world-index-section" id={id}>
    <div className="wiki-section-heading">
      <h2>{title}</h2>
      <span>{items.length}{countLabel}</span>
    </div>
    <div className="wiki-world-index-list">
      {items.map((item) => <a key={item.id} href={wikiHref(item.id)}>
        <strong>{item.title}</strong>
        {item.subtitle && <small>{item.subtitle}</small>}
      </a>)}
    </div>
  </section>
}

export function WikiWorldIndexPreview({ chronicleId = 'C03-AFTERFALL' }: { chronicleId?: string }) {
  const chronicle = getChronicle(chronicleId)

  return <main className="wiki-shell">
    <WikiTopbar />

    <div className="wiki-home-frame wiki-world-index-page">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/?view=wiki-preview">생존일기</a><span>›</span>
        <a href={chronicleHref(chronicle.id)}>{chronicle.title}</a><span>›</span>
        <strong>세계관 전체보기</strong>
      </nav>

      <header className="wiki-chronicle-header">
        <p className="wiki-document-kicker">인물 · 장소 · 사건</p>
        <h1>{chronicle.title} · 세계관 전체보기</h1>
        <p>현재 공개된 세계관 문서를 한곳에서 찾아보고 바로 열 수 있습니다.</p>
        <nav className="wiki-world-index-jump" aria-label="세계관 분류 바로가기">
          <a href="#characters">인물 {wikiCharacterIndex.length}</a>
          <a href="#locations">장소 {wikiLocationIndex.length}</a>
          <a href="#events">사건 {wikiEventIndex.length}</a>
        </nav>
      </header>

      <WorldIndexSection id="characters" title="인물" countLabel="명" items={wikiCharacterIndex} />
      <WorldIndexSection id="locations" title="장소" countLabel="곳" items={wikiLocationIndex} />
      <WorldIndexSection id="events" title="사건" countLabel="건" items={wikiEventIndex} />
    </div>
  </main>
}
