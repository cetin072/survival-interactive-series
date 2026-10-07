import { knowledgeHref } from './knowledgeGuide'
import { selectKnowledgeResources } from './knowledgeResources'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

export function WikiToolsPage({ resources = selectKnowledgeResources() }: { resources?: ReturnType<typeof selectKnowledgeResources> }) {
  return <main className="wiki-shell wiki-home-shell">
    <WikiTopbar />
    <div className="wiki-home-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span><strong>자료실</strong>
      </nav>
      <header className="wiki-home-intro">
        <p className="wiki-document-kicker">SURVIVAL DIARY · TOOLS</p>
        <h1>자료실</h1>
        <p>공개 생존 지식에 연결된 자료를 찾아보고 직접 사용하세요.</p>
      </header>
      <section className="knowledge-library-list" aria-labelledby="wiki-tools-title">
        <div className="wiki-section-heading"><h2 id="wiki-tools-title">공개 실용 자료</h2><span>{resources.length}개</span></div>
        {resources.length ? <div>
          {resources.map(({ guide, tool }) => <article key={tool.path}>
            <div className="knowledge-library-meta"><span>{tool.type}</span></div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <p>연결된 생존 지식 · {guide.label?.trim() || guide.title}</p>
            <div className="wiki-home-actions">
              <a href={knowledgeHref(guide)}>사용 설명 보기</a>
              <a className="primary" href={tool.path} download>다운로드</a>
            </div>
          </article>)}
        </div> : <p>아직 공개된 실용 자료가 없습니다.</p>}
      </section>
    </div>
  </main>
}
