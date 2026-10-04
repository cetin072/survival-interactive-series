import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

export function WikiToolsPage() {
  return <main className="wiki-shell wiki-home-shell">
    <WikiTopbar />
    <div className="wiki-home-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span><strong>자료실</strong>
      </nav>
      <header className="wiki-home-intro">
        <p className="wiki-document-kicker">SURVIVAL DIARY · TOOLS</p>
        <h1>생존 도구</h1>
        <p>체크리스트와 자료 도구를 연결할 자리입니다.</p>
      </header>
      <section className="wiki-home-section" aria-labelledby="wiki-tools-title">
        <div className="wiki-section-heading"><h2 id="wiki-tools-title">자료실</h2><span>준비 현황</span></div>
        <div className="wiki-category-grid">
          <section><strong>PDF 자료</strong><div>아직 기록 없음</div></section>
          <section><strong>XLSX 관리표</strong><div>준비 중</div></section>
          <section><strong>체크리스트</strong><div>준비 중</div></section>
        </div>
      </section>
    </div>
  </main>
}