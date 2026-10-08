import { groupKnowledge } from './knowledgeCategories'
import { publishedKnowledgeGuides } from './knowledgeGuide'
import { chronicleRegistry, type Chronicle } from './chronicleRegistry'
import { chaptersForChronicle } from './storyData'
import { knowledgeHref, type KnowledgeGuide } from './knowledgeGuide'
import { selectHomeKnowledge } from './knowledgeHome'
import { availableKnowledgeTools } from './knowledgeResources'
import { archiveRouteUrl } from './readerNavigation'
import { publicNavigation } from './publicNavigation'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

const storyHref = (id: string) => {
  const url = archiveRouteUrl({ view: 'book', chronicleId: id }, 'https://archive.invalid/')
  return url.pathname + url.search
}
const storyStatus = { LIVE: '진행 중', COMPLETE: '완결', PLANNED: '예정' } as const

function KnowledgeCard({ guide, dated = false }: { guide: KnowledgeGuide; dated?: boolean }) {
  return <a className="wiki-home-knowledge-card" href={knowledgeHref(guide)}>
    <h3>{guide.label?.trim() || guide.title}</h3>
    <p>{guide.summary}</p>
    <div className="wiki-home-card-meta">
      {guide.riskLevel === 'HIGH' && <span>공식 안내 우선</span>}
      {guide.riskLevel === 'MEDIUM' && <span>주의 필요</span>}
      {availableKnowledgeTools(guide).length > 0 && <span>자료 포함</span>}
      {dated && <time dateTime={guide.publishedAt}>{guide.publishedAt} 공개</time>}
    </div>
  </a>
}

export function WikiHomePreview({ knowledge = selectHomeKnowledge(), chronicles = chronicleRegistry }: { knowledge?: ReturnType<typeof selectHomeKnowledge>; chronicles?: readonly Chronicle[] }) {
  return <main className="wiki-shell wiki-home-shell wiki-knowledge-home">
    <WikiTopbar />
    <div className="wiki-home-frame">
      <header className="wiki-home-intro">
        <h1>일상과 비상상황에 필요한 생존 지식</h1>
        <p>생활과 이야기에서 생긴 질문을 자료로 확인하고, 다시 찾아볼 지식과 직접 사용할 자료로 정리합니다.</p>
      </header>

      <section className="wiki-home-section" aria-labelledby="wiki-featured-title">
        <div className="wiki-section-heading"><h2 id="wiki-featured-title">먼저 읽어볼 지식</h2></div>
        {knowledge.featured.length ? <div className="wiki-home-knowledge-grid">
          {knowledge.featured.map((guide) => <KnowledgeCard key={guide.id} guide={guide} />)}
        </div> : <p>공개된 지식을 정리하고 있습니다.</p>}
      </section>

      <section className="wiki-home-section" aria-labelledby="wiki-home-topics-title">
        <div className="wiki-section-heading"><h2 id="wiki-home-topics-title">주제로 찾아보기</h2><a href="/knowledge/">전체 지식 →</a></div>
        <nav className="wiki-home-actions" aria-label="주제별 생존 지식">
          {groupKnowledge(publishedKnowledgeGuides).map((category) =>
            <a key={category.id} href={'/knowledge/#knowledge-' + category.id}>
              {category.label} · {category.guides.length}개
            </a>)}
        </nav>
      </section>

      <section className="wiki-home-section" aria-labelledby="wiki-recent-knowledge-title">
        <div className="wiki-section-heading"><h2 id="wiki-recent-knowledge-title">최근 공개한 지식</h2><a href="/knowledge/">전체 보기 →</a></div>
        {knowledge.recent.length ? <div className="wiki-home-knowledge-grid wiki-home-recent-grid">
          {knowledge.recent.map((guide) => <KnowledgeCard key={guide.id} guide={guide} dated />)}
        </div> : <p>새로 공개한 지식이 생기면 이곳에 표시합니다.</p>}
      </section>

      {knowledge.resource && <section className="wiki-home-section" aria-labelledby="wiki-resource-title">
        <div className="wiki-section-heading"><h2 id="wiki-resource-title">바로 쓰는 자료</h2><a href="/?view=tools">자료실 전체 보기 →</a></div>
        <h3>{knowledge.resource.tool.title}</h3>
        <p>{knowledge.resource.tool.description}</p>
        <div className="wiki-home-actions">
          <a href={knowledgeHref(knowledge.resource.guide)}>사용 설명 읽기</a>
          <a className="primary" href={knowledge.resource.tool.path} download>다운로드</a>
        </div>
      </section>}

      <section className="wiki-home-section" aria-labelledby="wiki-home-stories-title">
        <div className="wiki-section-heading"><h2 id="wiki-home-stories-title">생존 이야기</h2><a href="/?view=story">전체 생존기 →</a></div>
        <div className="wiki-chronicle-list">
          {chronicles.map((chronicle) => <article key={chronicle.id}>
            <div><strong>{chronicle.title}</strong><small>{storyStatus[chronicle.status]}</small></div>
            {chronicle.status !== 'PLANNED' && chronicle.readerAvailable && chaptersForChronicle(chronicle.id).length > 0 &&
              <a href={storyHref(chronicle.id)}>이야기 읽기</a>}
          </article>)}
        </div>
        <div className="wiki-home-actions"><a href={publicNavigation.find((item) => item.id === 'world')!.href}>세계관 위키 탐색</a></div>
      </section>

      <footer className="wiki-home-section wiki-home-policy">
        <p>현실 정보와 작품 속 설정을 구분합니다. 각 지식 글에 출처와 확인 범위를 표시하며, 실시간 재난 안내나 개인별 안전 판단을 대신하지 않습니다.</p>
      </footer>
    </div>
  </main>
}
