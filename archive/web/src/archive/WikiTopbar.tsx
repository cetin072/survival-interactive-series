import { WikiSearchBox } from './WikiSearchBox'
import { currentPublicMenu, publicNavigation } from './publicNavigation'

export function WikiTopbar() {
  const current = typeof window === 'undefined' ? undefined : currentPublicMenu(window.location.pathname, window.location.search)
  return <header className="wiki-topbar">
    <a className="wiki-brand" href="/" aria-label="생존일기 홈">
      <strong>생존일기</strong>
      <span>생존 지식과 이야기</span>
    </a>
    <WikiSearchBox />
    <nav aria-label="공용 메뉴">
      {publicNavigation.map((item) => <a key={item.id} href={item.href} aria-current={current === item.id ? 'page' : undefined}>{item.label}</a>)}
    </nav>
  </header>
}
