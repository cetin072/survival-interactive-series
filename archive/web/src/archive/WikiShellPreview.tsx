import './wikiShell.css'

const toc = [
  ['wiki-overview', '1. 개요'],
  ['wiki-history', '2. 주요 행적'],
  ['wiki-relations', '3. 관계'],
  ['wiki-visuals', '4. 삽화'],
  ['wiki-sources', '5. 기록 근거'],
] as const

export function WikiShellPreview() {
  return <main className="wiki-shell" id="wiki-top">
    <header className="wiki-topbar">
      <a className="wiki-brand" href="/" aria-label="생존일기 홈">
        <strong>생존일기</strong>
        <span>WIKI PREVIEW</span>
      </a>
      <form className="wiki-search" onSubmit={(event) => event.preventDefault()} role="search">
        <input aria-label="문서 검색" placeholder="인물, 장소, 사건, 생존 지식 검색" />
        <button type="submit">검색</button>
      </form>
      <nav aria-label="공용 메뉴">
        <a href="/">이야기</a>
        <a href="/knowledge/">생존 지식</a>
        <a href="/?view=tools">자료실</a>
      </nav>
    </header>

    <div className="wiki-frame">
      <nav className="wiki-breadcrumb" aria-label="현재 위치">
        <a href="/">생존일기</a><span>›</span><a href="/?view=chronicle&chronicle=C03-AFTERFALL">AFTERFALL</a><span>›</span><strong>문서 미리보기</strong>
      </nav>

      <article className="wiki-document">
        <header className="wiki-document-header">
          <p className="wiki-document-kicker">구조 미리보기 · 실제 데이터 연결 전</p>
          <h1>Wiki 문서 골격</h1>
          <p>세계관 문서를 읽고 문서 사이를 이동하는 방식의 기본 화면입니다.</p>
        </header>

        <aside className="wiki-infobox" aria-label="문서 정보표">
          <div className="wiki-infobox-cover">
            <span>대표 이미지 자리</span>
          </div>
          <h2>문서 정보</h2>
          <dl>
            <div><dt>문서 유형</dt><dd>인물 · 장소 · 사건 공통</dd></div>
            <div><dt>소속 생존기</dt><dd>C03 AFTERFALL</dd></div>
            <div><dt>공개 상태</dt><dd>구조 미리보기</dd></div>
            <div><dt>데이터 출처</dt><dd>다음 단계에서 기존 Graph / Reader / Visual 연결</dd></div>
          </dl>
        </aside>

        <details className="wiki-toc" id="wiki-toc" open>
          <summary>목차</summary>
          <ol>{toc.map(([id, label]) => <li key={id}><a href={'#' + id}>{label}</a></li>)}</ol>
        </details>

        <div className="wiki-article-body">
          <section id="wiki-overview">
            <h2><span>1.</span> 개요</h2>
            <p>문서의 핵심 설명이 들어가는 자리입니다. 긴 세계관 정보는 카드 여러 개가 아니라 하나의 문서 흐름 안에서 읽습니다.</p>
            <p>인물, 장소, 사건 이름은 내부 링크가 되어 다른 문서로 이어집니다. 다음 단계에서 실제 데이터를 연결합니다.</p>
          </section>

          <section id="wiki-history">
            <h2><span>2.</span> 주요 행적</h2>
            <p>시간의 흐름에 따라 중요한 변화와 사건을 정리합니다. 기존 Graph의 변경 이력과 Reader 연결을 재사용할 자리입니다.</p>
            <h3>2.1. 최근 기록</h3>
            <p>세부 항목은 문서가 길어질 때만 사용합니다. 목차에는 자동으로 계층이 보이도록 확장할 수 있습니다.</p>
          </section>

          <section id="wiki-relations">
            <h2><span>3.</span> 관계</h2>
            <p>관련 인물, 장소, 사건을 텍스트 내부 링크와 간단한 목록으로 연결합니다. Graph 자체는 뒤에서 관계 데이터를 공급합니다.</p>
            <div className="wiki-related-links">
              <a href="#wiki-relations">관련 인물 예시</a>
              <a href="#wiki-relations">관련 장소 예시</a>
              <a href="#wiki-relations">관련 사건 예시</a>
            </div>
          </section>

          <section id="wiki-visuals">
            <h2><span>4.</span> 삽화</h2>
            <p>Automation B의 공개 삽화가 있는 경우 문서 중간이나 정보표에 자연스럽게 배치합니다. 이미지가 없다고 빈 카드로 공간을 낭비하지 않습니다.</p>
          </section>

          <section id="wiki-sources">
            <h2><span>5.</span> 기록 근거</h2>
            <p>Reader와 공개 원문은 메인 메뉴가 아니라 문서의 근거와 관련 이야기로 연결합니다.</p>
            <div className="wiki-source-box">
              <strong>관련 이야기</strong>
              <span>Reader 연결 자리</span>
              <strong>원문 기록</strong>
              <span>RAW 근거 연결 자리</span>
            </div>
          </section>
        </div>

        <footer className="wiki-document-footer" id="wiki-bottom">
          <strong>관련 문서</strong>
          <nav><a href="#wiki-top">생존기</a><a href="#wiki-top">인물</a><a href="#wiki-top">장소</a><a href="#wiki-top">사건</a></nav>
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
