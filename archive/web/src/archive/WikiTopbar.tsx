import { WikiSearchBox } from './WikiSearchBox'

export function WikiTopbar() {
  return <header className="wiki-topbar">
    <a className="wiki-brand" href="/?view=wiki-preview" aria-label="생존일기 Wiki 홈">
      <strong>생존일기</strong>
      <span>WIKI PREVIEW</span>
    </a>
    <WikiSearchBox />
    <nav aria-label="공용 메뉴">
      <a href="/?view=wiki-preview">이야기</a>
      <a href="/knowledge/">생존 지식</a>
      <a href="/?view=tools">자료실</a>
    </nav>
  </header>
}
