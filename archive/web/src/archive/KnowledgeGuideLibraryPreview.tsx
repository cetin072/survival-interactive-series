import { knowledgeRiskLabel, publishedKnowledgeGuides } from './knowledgeGuide'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'

const guideHref = (id: string) => '/?view=knowledge-preview&brief=' + encodeURIComponent(id)

export function KnowledgeGuideLibraryPreview({ notice }: { notice?: string }) {
  return <main className="wiki-shell knowledge-library-shell">
    <WikiTopbar />

    <div className="knowledge-guide-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/?view=wiki-preview">생존일기</a><span>›</span><strong>생존 지식</strong>
      </nav>

      <header className="knowledge-library-header">
        <p className="wiki-document-kicker">SURVIVAL DIARY · PRACTICAL KNOWLEDGE</p>
        <h1>생존 지식</h1>
        <p>현실에서 참고할 수 있도록 행동 방법, 주의사항, 도구와 근거를 함께 정리한 실전 가이드입니다.</p>
      </header>

      {notice && <p className="knowledge-library-notice" role="status">{notice}</p>}

      <section className="knowledge-library-list" aria-label="공개 생존 지식">
        <div className="wiki-section-heading">
          <h2>공개 가이드</h2>
          <span>{publishedKnowledgeGuides.length}개</span>
        </div>
        <div>
          {publishedKnowledgeGuides.map((guide) => <article key={guide.id}>
            <div className="knowledge-library-meta">
              <span>{guide.label}</span>
              <small>{knowledgeRiskLabel(guide.riskLevel)} · {guide.publishedAt}</small>
            </div>
            <h3><a href={guideHref(guide.id)}>{guide.title}</a></h3>
            <p>{guide.summary}</p>
            <div className="knowledge-library-footer">
              <span>{guide.scope}</span>
              <a href={guideHref(guide.id)}>가이드 보기 →</a>
            </div>
          </article>)}
        </div>
      </section>
    </div>
  </main>
}
