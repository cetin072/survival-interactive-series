import { WikiSearchBox } from './WikiSearchBox'

export function WikiTopbar() {
  return <header className="wiki-topbar">
    <a className="wiki-brand" href="/" aria-label="생존일기 Wiki 홈">
      <strong>생존일기</strong>
      <span>생존 기록 보관소</span>
    </a>
    <WikiSearchBox />
    <nav aria-label="공용 메뉴">
      <a href="/?view=story">이야기</a>
      <a href="/?view=knowledge-preview">생존 지식</a>
      <a href="/?view=tools">자료실</a>
    </nav>
  </header>
}
