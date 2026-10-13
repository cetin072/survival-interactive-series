import { groupKnowledge } from './knowledgeCategories'
import { knowledgeHref, knowledgeRiskLabel, publishedKnowledgeGuides, type KnowledgeGuide } from './knowledgeGuide'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

export function KnowledgeGuideLibraryPreview({ notice, showTopbar = true, guides = publishedKnowledgeGuides }: { notice?: string; showTopbar?: boolean; guides?: readonly KnowledgeGuide[] }) {
  const groups = groupKnowledge(guides)
  return <main className="wiki-shell knowledge-library-shell">
    {showTopbar && <WikiTopbar />}

    <div className="knowledge-guide-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span><strong>생존 지식</strong>
      </nav>

      <header className="knowledge-library-header">
        <p className="wiki-document-kicker">SURVIVAL DIARY · PRACTICAL KNOWLEDGE</p>
        <h1>생존 지식</h1>
        <p>생활 대비부터 연락·이동·공동 대응까지, 공개된 지식을 주제별로 찾아보세요.</p>
      </header>

      <nav className="wiki-home-actions knowledge-category-nav" aria-label="생존 지식 주제">
        {groups.map((group) => <a key={group.id} data-knowledge-category={group.id} href={'#knowledge-' + group.id}>{group.label} {group.guides.length}</a>)}
      </nav>

      {notice && <p className="knowledge-library-notice" role="status">{notice}</p>}

      {groups.map((group) => <section key={group.id} id={"knowledge-" + group.id} data-knowledge-category={group.id} className="knowledge-library-list" aria-label={group.label}>
        <div className="wiki-section-heading">
          <h2>{group.label}</h2>
          <span>{group.guides.length}개</span>
        </div>
        <div>
          {group.guides.map((guide) => <article key={guide.id}>
            <div className="knowledge-library-meta">
              <span>생존 지식</span>
              <small>{knowledgeRiskLabel(guide.riskLevel)} · {guide.publishedAt}</small>
            </div>
            <h3><a href={knowledgeHref(guide)}>{guide.label}</a></h3>
            <p className="knowledge-guide-question">{guide.title}</p>
            <p>{guide.summary}</p>
            <div className="knowledge-library-footer">
              <span>{guide.scope}</span>
              <a href={knowledgeHref(guide)}>가이드 보기 →</a>
            </div>
          </article>)}
        </div>
      </section>)}
    </div>
  </main>
}
