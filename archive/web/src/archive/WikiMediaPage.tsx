import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'

export function WikiMediaPage() {
  return <main className="wiki-shell wiki-home-shell">
    <WikiTopbar />
    <div className="wiki-home-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span><strong>미디어 Archive</strong>
      </nav>
      <header className="wiki-home-intro">
        <p className="wiki-document-kicker">SURVIVAL DIARY · MEDIA</p>
        <h1>미디어 Archive</h1>
        <p>공개 허용된 시각 자료와 향후 미디어 진입점을 모읍니다.</p>
      </header>
      <section className="wiki-home-section" aria-labelledby="wiki-media-title">
        <div className="wiki-section-heading"><h2 id="wiki-media-title">미디어</h2><span>공개 현황</span></div>
        <div className="wiki-category-grid">
          <section><strong>삽화</strong><div>Chronicle 안의 공개 Visual 자료</div></section>
          <section><strong>영상</strong><div>아직 기록 없음</div></section>
          <section><strong>웹툰 · 교육</strong><div>아직 기록 없음</div></section>
        </div>
      </section>
    </div>
  </main>
}