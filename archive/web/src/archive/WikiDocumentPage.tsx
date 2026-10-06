import type { ReactNode } from 'react'
import { getChronicle } from './chronicleRegistry'
import type { WikiDocument } from './wikiDocument'
import type { WikiSourceLink } from './wikiSources'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

type PlannedSection = {
  id: string
  label: string
  kind: 'overview' | 'activities' | 'appearance' | 'role' | 'history' | 'relations' | 'visuals' | 'sources'
}

export function wikiSectionPlan(document: WikiDocument): PlannedSection[] {
  const roleSection = document.sections.find((section) => /(?:^|-)role$/.test(section.id))
  const historySections = document.sections.filter((section) => section !== roleSection)
  const plan: PlannedSection[] = [{ id: 'wiki-overview', label: '개요', kind: 'overview' }]

  if (document.activities.length) plan.push({ id: 'wiki-activities', label: '확인된 활동 · 사건', kind: 'activities' })
  if (document.appearance) plan.push({ id: 'wiki-appearance', label: '외형', kind: 'appearance' })
  if (roleSection) plan.push({ id: 'wiki-role', label: '생존기에서의 역할', kind: 'role' })
  if (document.history.length || historySections.length || document.timeline.length) plan.push({ id: 'wiki-history', label: '주요 기록', kind: 'history' })
  if (document.relations.length) plan.push({ id: 'wiki-relations', label: '관계', kind: 'relations' })
  if (document.visual) plan.push({ id: 'wiki-visuals', label: '삽화', kind: 'visuals' })
  plan.push({ id: 'wiki-sources', label: '관련 이야기 · 기록 근거', kind: 'sources' })
  return plan
}

function SourceLinks({ sources, chronicleId }: { sources: WikiSourceLink[]; chronicleId: string }) {
  return sources.length ? <nav className="wiki-record-sources" aria-label="이 기록의 근거">
    {sources.map((source) => <span key={source.chapterId + source.partId}>
      <a href={'/?view=story&chronicle=' + encodeURIComponent(chronicleId) + '&chapter=' + encodeURIComponent(source.chapterId)}>이야기 읽기</a>
      <a href={'/?view=raw&chronicle=' + encodeURIComponent(chronicleId) + '&part=' + encodeURIComponent(source.partId)}>공개 원문</a>
    </span>)}
  </nav> : null
}

export function WikiDocumentPage({
  document,
  previewTools,
  relationHref,
}: {
  document: WikiDocument
  previewTools?: ReactNode
  relationHref?: (relation: WikiDocument['relations'][number]) => string
}) {
  const plan = wikiSectionPlan(document)
  const chronicle = getChronicle(document.chronicleId)
  const numberFor = (kind: PlannedSection['kind']) => plan.findIndex((section) => section.kind === kind) + 1
  const roleSection = document.sections.find((section) => /(?:^|-)role$/.test(section.id))
  const historySections = document.sections.filter((section) => section !== roleSection)
  const hrefForRelation = relationHref ?? ((relation: WikiDocument['relations'][number]) => '/?view=archive&node=' + encodeURIComponent(relation.nodeId))

  return <main className="wiki-shell" id="wiki-top">
    <WikiTopbar />

    <div className="wiki-frame">
      {previewTools}
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/?view=wiki-preview">생존일기</a><span>›</span>
        <a href="/?view=wiki-preview&page=chronicle&chronicle=C03-AFTERFALL">{chronicle.title}</a><span>›</span>
        <span>{document.typeLabel}</span><span>›</span><strong>{document.title}</strong>
      </nav>

      <article className="wiki-document">
        <header className="wiki-document-header">
          <p className="wiki-document-kicker">생존기 {String(chronicle.number).padStart(2, '0')} · {chronicle.title} · {document.typeLabel}</p>
          <h1>{document.title}</h1>
          <p>{document.subtitle}</p>
        </header>

        <aside className="wiki-infobox" aria-label={document.title + ' 정보표'}>
          <div className={'wiki-infobox-cover' + (document.visual ? ' has-image' : '')}>
            {document.visual
              ? <img src={document.visual.public_path} width={document.visual.width} height={document.visual.height} alt={document.title + ' 대표 삽화'} />
              : <span>대표 삽화 없음</span>}
          </div>
          <h2>{document.title}</h2>
          <dl>
            {document.metaRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
            <div><dt>기록 기준</dt><dd>{document.anchor.gameTime}</dd></div>
          </dl>
        </aside>

        <details className="wiki-toc" id="wiki-toc" open>
          <summary>목차</summary>
          <ol>{plan.map((section) => <li key={section.id}><a href={'#' + section.id}>{section.label}</a></li>)}</ol>
        </details>

        <div className="wiki-article-body">
          <section id="wiki-overview">
            <h2><span>{numberFor('overview')}.</span> 개요</h2>
            <p className="wiki-lead">{document.summary}</p>
            {!!document.lead.length && <details className="wiki-previous-context">
              <summary>이전 기록의 개요와 해설</summary>
              {document.lead.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </details>}
          </section>

          {!!document.activities.length && <section id="wiki-activities">
            <h2><span>{numberFor('activities')}.</span> 확인된 활동 · 사건</h2>
            <p className="wiki-muted">공개 기록에서 확인된 연결을 최근 사건부터 보여줍니다.</p>
            <div className="wiki-timeline">
              {document.activities.map((item) => <article key={item.nodeId}>
                <time>{item.date}</time>
                <div>
                  <strong><a href={'/?view=wiki-preview&node=' + encodeURIComponent(item.nodeId)}>{item.title}</a></strong>
                  <p className="wiki-activity-role">{item.relationship}</p>
                  <p>{item.summary}</p>
                  <SourceLinks sources={item.sources} chronicleId={document.chronicleId} />
                </div>
              </article>)}
            </div>
          </section>}

          {document.appearance && <section id="wiki-appearance">
            <h2><span>{numberFor('appearance')}.</span> 외형</h2>
            <p>{document.appearance}</p>
          </section>}

          {roleSection && <section id="wiki-role">
            <h2><span>{numberFor('role')}.</span> 생존기에서의 역할</h2>
            {roleSection.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {!!roleSection.bullets?.length && <ul className="wiki-bullet-list">{roleSection.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>}

          {(document.history.length > 0 || historySections.length > 0 || document.timeline.length > 0) && <section id="wiki-history">
            <h2><span>{numberFor('history')}.</span> 주요 기록</h2>
            {!!document.history.length && <div className="wiki-state-history">
              <h3>공개 상태의 변화</h3>
              <div className="wiki-timeline">
                {document.history.map((item, index) => <article key={item.date + index}>
                  <time>{item.date}</time>
                  <div>
                    <strong>{item.current ? '현재 확인된 내용' : '이전 상태'}{item.title ? ' · ' + item.title : ''}</strong>
                    {item.subtitle && <p>{item.subtitle}</p>}
                    <p>{item.summary ?? '이전 상태의 세부 내용은 저장되지 않았습니다.'}</p>
                    {!!item.metaRows.length && <dl className="wiki-history-facts">{item.metaRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
                    <SourceLinks sources={item.sources} chronicleId={document.chronicleId} />
                  </div>
                </article>)}
              </div>
            </div>}
            {!!document.history.length && (historySections.length > 0 || document.timeline.length > 0) && <h3>이전 이야기와 해설</h3>}
            {historySections.map((section, sectionIndex) => <div className="wiki-subsection" key={section.id}>
              <h3>{numberFor('history')}.{sectionIndex + 1}. {section.title}</h3>
              {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {!!section.bullets?.length && <ul className="wiki-bullet-list">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
            </div>)}
            {!!document.timeline.length && <div className="wiki-timeline">
              {document.timeline.map((item) => <article key={item.date + item.title}>
                <time>{item.date}</time>
                <div><strong>{item.title}</strong><p>{item.text}</p></div>
              </article>)}
            </div>}
          </section>}

          {!!document.relations.length && <section id="wiki-relations">
            <h2><span>{numberFor('relations')}.</span> 관계</h2>
            <div className="wiki-relation-list">
              {document.relations.map((relation) => <a key={relation.nodeId + relation.label} href={hrefForRelation(relation)}>
                <strong>{relation.title}</strong>
                <span>{relation.label}</span>
                <small>{relation.type === 'character' ? '인물' : relation.type === 'location' ? '장소' : relation.type === 'event' ? '사건' : '자료'} · {relation.subtitle}</small>
              </a>)}
            </div>
          </section>}

          {document.visual && <section id="wiki-visuals">
            <h2><span>{numberFor('visuals')}.</span> 삽화</h2>
            <figure className="wiki-main-visual">
              <img src={document.visual.public_path} width={document.visual.width} height={document.visual.height} alt={document.title + ' 공개 삽화'} />
              <figcaption>{document.visual.caption ?? document.title + ' · 공개 삽화'}</figcaption>
            </figure>
          </section>}

          <section id="wiki-sources">
            <h2><span>{numberFor('sources')}.</span> 관련 이야기 · 기록 근거</h2>
            <div className="wiki-source-box">
              <strong>관련 이야기</strong>
              <span>{document.sources.length ? document.sources.map((source) => <span className="wiki-inline-source" key={source.chapterId + source.partId}>
                <a href={'/?view=story&chronicle=' + encodeURIComponent(document.chronicleId) + '&chapter=' + encodeURIComponent(source.chapterId)}>{source.chapterTitle}</a>
              </span>) : document.relatedChapter
                ? <a href={'/?view=story&chronicle=' + encodeURIComponent(document.chronicleId) + '&chapter=' + encodeURIComponent(document.relatedChapter.id)}>{document.relatedChapter.title}</a>
                : '직접 연결된 공개 장 없음'}</span>
              <strong>현재 상태</strong>
              <span>공개 Graph · {document.anchor.gameTime} · save {document.anchor.saveVersion}</span>
              <strong>원문 기록</strong>
              <span>{document.transcriptPartIds.length
                ? document.transcriptPartIds.map((partId, index) => <span className="wiki-inline-source" key={partId}><a href={'/?view=raw&chronicle=' + encodeURIComponent(document.chronicleId) + '&part=' + encodeURIComponent(partId)}>{document.sources.find((source) => source.partId === partId)?.partTitle ?? partId}</a>{index < document.transcriptPartIds.length - 1 ? ' · ' : ''}</span>)
                : '연결된 공개 원문 없음'}</span>
            </div>
          </section>
        </div>

        <footer className="wiki-document-footer" id="wiki-bottom">
          <strong>관련 문서</strong>
          <nav>{document.relations.slice(0, 8).map((relation) => <a key={relation.nodeId} href={hrefForRelation(relation)}>{relation.title}</a>)}</nav>
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
