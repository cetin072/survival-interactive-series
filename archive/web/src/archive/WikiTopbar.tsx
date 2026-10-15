import { WikiSearchBox } from './WikiSearchBox'
import { currentPublicMenu, publicNavigation } from './publicNavigation'

export function WikiTopbar({ staticSearch = false, activeMenu }: { staticSearch?: boolean; activeMenu?: (typeof publicNavigation)[number]['id'] } = {}) {
  const current = activeMenu ?? (typeof window === 'undefined' ? undefined : currentPublicMenu(window.location.pathname, window.location.search))
  return <header className="wiki-topbar">
    <a className="wiki-brand" href="/" aria-label="생존일기 홈">
      <strong>생존일기</strong>
      <span>생존 지식과 이야기</span>
    </a>
    {staticSearch
      ? <div className="wiki-search-area"><a className="wiki-search-static" href="/#site-search">생존 지식·자료·작품 검색 →</a></div>
      : <WikiSearchBox />}
    <nav aria-label="공용 메뉴">
      {publicNavigation.map((item) => <a key={item.id} href={item.href} aria-current={current === item.id ? 'page' : undefined} className={item.id === 'bag' ? 'nav-bag-cta' : undefined}>{item.label}</a>)}
    </nav>
  </header>
}
