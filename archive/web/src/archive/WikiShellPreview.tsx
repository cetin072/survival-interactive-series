import publicGraph from '../../../content/graphs/C03-AFTERFALL/GRAPH.json'
import type { ArchiveNode } from './archiveData'
import { archiveArticleByNodeId } from './archiveArticleData'
import { confirmedAppearanceFor } from './characterAppearance'
import { chapterForNode } from './storyData'
import { siteVisualFor } from './siteVisual'
import './wikiShell.css'

const subjectId = 'char-jinwoo'
function requireGraphRecord(id: string) {
  const found = publicGraph.nodes.find((item) => item.id === id)
  if (!found) throw new Error('Wiki vertical slice source missing: ' + id)
  return found
}
const record = requireGraphRecord(subjectId)

const node = record.data as ArchiveNode
const appearance = confirmedAppearanceFor(node)
const article = archiveArticleByNodeId[subjectId]
const visual = siteVisualFor(subjectId)
const chapter = chapterForNode(subjectId)
const nodeById = new Map(publicGraph.nodes.map((item) => [item.id, item.data as ArchiveNode]))
const relations = publicGraph.relations
  .filter((item) => item.data.from === subjectId || item.data.to === subjectId)
  .map((item) => {
    const otherId = item.data.from === subjectId ? item.data.to : item.data.from
    return { label: item.data.label, node: nodeById.get(otherId), otherId }
  })
  .filter((item): item is { label: string; node: ArchiveNode; otherId: string } => Boolean(item.node))

const statusLabel: Record<string, string> = {
  ACTIVE: '활동 중',
  INACTIVE: '비활성',
}
const affiliationLabel: Record<string, string> = {
  CORE_FOUR: '핵심 4인',
}

const toc = [
  ['wiki-overview', '개요'],
  ['wiki-appearance', '외형'],
  ['wiki-role', '생존기에서의 역할'],
  ['wiki-history', '주요 행적'],
  ['wiki-relations', '관계'],
  ['wiki-visuals', '삽화'],
  ['wiki-sources', '관련 이야기 · 기록 근거'],
] as const

const roleSection = article?.sections.find((section) => section.id === 'jinwoo-role')
const historySections = article?.sections.filter((section) => section.id !== 'jinwoo-role') ?? []

export function WikiShellPreview() {
  return <main className="wiki-shell" id="wiki-top">
    <header className="wiki-topbar">
      <a className="wiki-brand" href="/" aria-label="생존일기 홈">
        <strong>생존일기</strong>
        <span>WIKI PREVIEW</span>
      </a>
      <form className="wiki-search" onSubmit={(event) => event.preventDefault()} role="search">
        <input aria-label="문서 검색" placeholder="인물, 장소, 사건, 생존 지식 검색" />
        <button type="submit" aria-label="검색은 다음 단계에서 연결">검색</button>
      </form>
      <nav aria-label="공용 메뉴">
        <a href="/">이야기</a>
        <a href="/knowledge/">생존 지식</a>
        <a href="/?view=tools">자료실</a>
      </nav>
    </header>

    <div className="wiki-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span>
        <a href="/?view=chronicle&chronicle=C03-AFTERFALL">AFTERFALL</a><span>›</span>
        <span>인물</span><span>›</span><strong>{node.label}</strong>
      </nav>

      <article className="wiki-document">
        <header className="wiki-document-header">
          <p className="wiki-document-kicker">C03 AFTERFALL · 인물</p>
          <h1>{node.label}</h1>
          <p>{node.subtitle}</p>
        </header>

        <aside className="wiki-infobox" aria-label={node.label + ' 정보표'}>
          <div className={'wiki-infobox-cover' + (visual ? ' has-image' : '')}>
            {visual
              ? <img src={visual.public_path} width={visual.width} height={visual.height} alt={node.label + ' 대표 삽화'} />
              : <span>대표 삽화 없음</span>}
          </div>
          <h2>{node.label}</h2>
          <dl>
            <div><dt>유형</dt><dd>인물</dd></div>
            <div><dt>생존기</dt><dd>C03 AFTERFALL</dd></div>
            <div><dt>역할</dt><dd>{node.subtitle}</dd></div>
            <div><dt>상태</dt><dd>{statusLabel[node.meta?.상태 ?? ''] ?? node.meta?.상태 ?? '공개 기록'}</dd></div>
            <div><dt>소속</dt><dd>{affiliationLabel[node.meta?.소속 ?? ''] ?? node.meta?.소속 ?? '기록 없음'}</dd></div>
            <div><dt>기록 기준</dt><dd>{record.anchor.game_time}</dd></div>
          </dl>
        </aside>

        <details className="wiki-toc" id="wiki-toc" open>
          <summary>목차</summary>
          <ol>{toc.map(([id, label]) => <li key={id}><a href={'#' + id}>{label}</a></li>)}</ol>
        </details>

        <div className="wiki-article-body">
          <section id="wiki-overview">
            <h2><span>1.</span> 개요</h2>
            <p className="wiki-lead">{node.summary}</p>
            {article?.lead.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>

          <section id="wiki-appearance">
            <h2><span>2.</span> 외형</h2>
            {appearance?.publicDescription
              ? <p>{appearance.publicDescription}</p>
              : <p className="wiki-muted">현재 공개 가능한 외형 기록이 없습니다.</p>}
          </section>

          <section id="wiki-role">
            <h2><span>3.</span> 생존기에서의 역할</h2>
            {roleSection
              ? <>
                  {roleSection.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                  {!!roleSection.bullets?.length && <ul className="wiki-bullet-list">{roleSection.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
                </>
              : <p>{node.summary}</p>}
          </section>

          <section id="wiki-history">
            <h2><span>4.</span> 주요 행적</h2>
            {historySections.map((section, sectionIndex) => <div className="wiki-subsection" key={section.id}>
              <h3>4.{sectionIndex + 1}. {section.title}</h3>
              {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>)}
            {!!article?.timeline.length && <div className="wiki-timeline">
              {article.timeline.map((item) => <article key={item.date + item.title}>
                <time>{item.date}</time>
                <div><strong>{item.title}</strong><p>{item.text}</p></div>
              </article>)}
            </div>}
          </section>

          <section id="wiki-relations">
            <h2><span>5.</span> 관계</h2>
            <div className="wiki-relation-list">
              {relations.map(({ label, node: related }) => <a key={related.id + label} href={'/?view=archive&node=' + encodeURIComponent(related.id)}>
                <strong>{related.label}</strong>
                <span>{label}</span>
                <small>{related.subtitle}</small>
              </a>)}
            </div>
          </section>

          <section id="wiki-visuals">
            <h2><span>6.</span> 삽화</h2>
            {visual
              ? <figure className="wiki-main-visual"><img src={visual.public_path} width={visual.width} height={visual.height} alt={node.label + ' 공개 삽화'} /><figcaption>{visual.caption ?? node.label + ' · 공개 삽화'}</figcaption></figure>
              : <p className="wiki-muted">현재 공개된 삽화가 없습니다.</p>}
          </section>

          <section id="wiki-sources">
            <h2><span>7.</span> 관련 이야기 · 기록 근거</h2>
            <div className="wiki-source-box">
              <strong>관련 이야기</strong>
              <span>{chapter
                ? <a href={'/?view=story&chronicle=C03-AFTERFALL&chapter=' + encodeURIComponent(chapter.id)}>{chapter.title}</a>
                : '직접 연결된 공개 장 없음'}</span>
              <strong>현재 상태</strong>
              <span>공개 Graph · {record.anchor.game_time} · save {record.anchor.save_version}</span>
              <strong>원문 기록</strong>
              <span>{article?.transcriptPartIds.length
                ? article.transcriptPartIds.map((partId, index) => <span className="wiki-inline-source" key={partId}><a href={'/?view=raw&chronicle=C03-AFTERFALL&part=' + encodeURIComponent(partId)}>{partId}</a>{index < article.transcriptPartIds.length - 1 ? ' · ' : ''}</span>)
                : '연결된 공개 원문 없음'}</span>
            </div>
          </section>
        </div>

        <footer className="wiki-document-footer" id="wiki-bottom">
          <strong>관련 문서</strong>
          <nav>
            {relations.slice(0, 8).map(({ node: related }) => <a key={related.id} href={'/?view=archive&node=' + encodeURIComponent(related.id)}>{related.label}</a>)}
          </nav>
        </footer>
      </article>
    </div>

    <nav className="wiki-floating-nav" aria-label="문서 빠른 이동">
      <a href="#wiki-toc" aria-label="목차">☷</a>
      <a href="#wiki-top" aria-label="맨 위로">↑</a>
      <a href="#wiki-bottom" aria-label="맨 아래로">↓</a>
    </nav>
  </main>
}
