import type { KnowledgeGuide, KnowledgeGuideBlock } from './knowledgeGuide'
import { knowledgeRiskLabel, knowledgeReviewState, knowledgeHref } from './knowledgeGuide'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

function youtubeId(value: string) {
  const url = new URL(value)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'youtu.be') return url.pathname.slice(1)
  return url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean)[1]
}

function GuideBlock({ block, guide }: { block: KnowledgeGuideBlock; guide: KnowledgeGuide }) {
  if (block.type === 'prose') return <p>{block.text}</p>
  if (block.type === 'note') return <aside className="knowledge-guide-note"><strong>주의</strong><p>{block.text}</p></aside>
  if (block.type === 'ordered_list') return <ol className="knowledge-guide-steps">{block.items.map((item) => <li key={item}>{item}</li>)}</ol>
  if (block.type === 'unordered_list') return <ul className="knowledge-guide-list">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
  if (block.type === 'table') return <div className="knowledge-guide-table-wrap"><table><thead><tr>{block.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
  if (block.type === 'image') return <figure className="knowledge-guide-media"><img src={block.src} alt={block.alt} loading="lazy" decoding="async" />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>
  if (block.type === 'youtube') return <figure className="knowledge-guide-media"><div className="knowledge-guide-video"><iframe src={'https://www.youtube-nocookie.com/embed/' + youtubeId(block.url)} title={block.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div></figure>
  if (block.type === 'download/tool') {
    const tool = guide.tools.find((item) => item.path === block.tool_path)
    return <a className="knowledge-guide-tool" href={block.tool_path} download>
      <strong>{tool?.title ?? '실전 자료'}</strong>
      <span>{tool?.description ?? '다운로드 가능한 자료'}</span>
      <b>{tool?.label ?? '자료 다운로드'}</b>
    </a>
  }
  return null
}

export function KnowledgeGuidePage({ guide, showTopbar = true }: { guide: KnowledgeGuide; showTopbar?: boolean }) {
  const review = knowledgeReviewState(guide.detail)
  return <main className="wiki-shell knowledge-guide-shell">
    {showTopbar && <WikiTopbar />}

    <div className="knowledge-guide-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span>
        <a href="/knowledge/">생존 지식</a><span>›</span>
        <strong>{guide.label}</strong>
      </nav>

      <article className="knowledge-guide">
        <header className="knowledge-guide-header">
          <p className="wiki-document-kicker">생존 지식 · {guide.id}</p>
          <h1>{guide.label}</h1>
          <p className="knowledge-guide-question">{guide.title}</p>
          <p className="knowledge-guide-lead">{guide.lead}</p>
          <div className="knowledge-guide-meta">
            <span>위험도 · {knowledgeRiskLabel(guide.riskLevel)}</span>
            <span>사람 편집 검토 · {review.required ? '대상' : '필수 아님'}</span>
            <span>검토 상태 · {review.completed ? '편집 검토 완료' : review.required ? '편집 검토 대기' : '자동 게시 기준 충족'}</span>
            <span>공개 상태 · {review.approved ? '공개 승인 완료' : '공개 승인 전'}</span>
            <span>범위 · {guide.scope}</span>
            <span>자료 확인 · {guide.sourceCheckedAt}</span>
            <span>게시 · <time dateTime={guide.publishedAt}>{guide.publishedAt}</time></span>
            {guide.detail.updated_at !== guide.publishedAt && <span>수정 · <time dateTime={guide.detail.updated_at}>{guide.detail.updated_at}</time></span>}
          </div>
        </header>

        <section className="knowledge-guide-summary" aria-labelledby="guide-summary-title">
          <div><p className="wiki-document-kicker">한눈에 보기</p><h2 id="guide-summary-title">핵심 요약</h2></div>
          <p>{guide.summary}</p>
          <dl>
            <div><dt>적용 범위</dt><dd>{guide.scope}</dd></div>
            <div><dt>근거</dt><dd>{guide.basis}</dd></div>
          </dl>
        </section>

        <nav className="knowledge-guide-toc" aria-label="글 목차">
          <strong>목차</strong>
          <ol>{guide.sections.map((section, index) => <li key={section.heading}><a href={'#guide-section-' + (index + 1)}>{section.heading}</a></li>)}</ol>
        </nav>

        <div className="knowledge-guide-body">
          {guide.sections.map((section, sectionIndex) => <section id={'guide-section-' + (sectionIndex + 1)} key={section.heading}>
            <h2><span>{sectionIndex + 1}.</span> {section.heading}</h2>
            {section.blocks.map((block, blockIndex) => <GuideBlock key={blockIndex} block={block} guide={guide} />)}
          </section>)}
        </div>

        <section className="knowledge-guide-sources" aria-labelledby="guide-sources-title">
          <div className="wiki-section-heading"><h2 id="guide-sources-title">근거와 출처</h2><span>{guide.sources.length}개</span></div>
          <div>
            {guide.sources.map((source) => <article key={source.id}>
              <div><strong>{source.title}</strong><small>확인일 · {source.checked_at}</small></div>
              <p>{source.note}</p>
              <a href={source.url} target="_blank" rel="noreferrer">원문 출처 보기 ↗</a>
            </article>)}
          </div>
        </section>

        {!!guide.detail.related_briefs.length && <section className="knowledge-guide-related"><h2>관련 글</h2>{guide.detail.related_briefs.map((item) => <p key={item.id}><a href={knowledgeHref(item)}><strong>{item.label} →</strong><small className="related-question">{item.title}</small></a></p>)}</section>}
        {guide.detail.related_guide && <section className="knowledge-guide-related"><h2>더 깊게 알아보기</h2><p><a href={'/knowledge/guides/' + guide.detail.related_guide.slug + '/'}>전문 가이드 보기 →</a></p></section>}
        {!!guide.detail.related_stories.length && <section className="knowledge-guide-related"><h2>관련 이야기</h2>{guide.detail.related_stories.map((item) => <p key={item.id}><a href={item.path}>{item.title} →</a></p>)}</section>}
        <footer className="knowledge-guide-footer">
          <p>{guide.footer}</p>
          <p>{review.completed ? '사람의 편집 검토와 공개 승인을 거친 글입니다.' : 'AI 보조 작성 · 자동 게시 기준을 충족한 글입니다.'}</p>
        </footer>
      </article>
    </div>
  </main>
}
