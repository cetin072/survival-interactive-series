import { chronicleRegistry, type Chronicle } from './chronicleRegistry'
import { chronicleBooks, chaptersForChronicle } from './storyData'
import { publishedWorldWikiIndex } from './worldWikiIndexData'
import { worldWikiHref } from './wikiLinks'
import { WikiTopbar } from './WikiTopbar'
import './wikiShell.css'
import './survivalDesignLanguage.css'
import './worldWikiLobby.css'
const status = { COMPLETE: '완결', LIVE: '진행 중', PLANNED: '예정' }

export function WikiWorldLobby({ registry = chronicleRegistry, notice }: { registry?: readonly Chronicle[]; notice?: string }) {
  return <main className="wiki-shell"><WikiTopbar />
    <div className="wiki-home-frame">
      <header className="wiki-home-intro"><h1>세계관 위키</h1><p>생존기를 골라 인물·장소·사건과 근거가 된 이야기를 살펴보세요.</p></header>
      {notice && <p role="status">{notice}</p>}
      <div className="world-wiki-cards">
        {registry.map((chronicle) => {
          const wiki = publishedWorldWikiIndex(chronicle.id)
          const book = chronicleBooks.find((b) => b.chronicleId === chronicle.id)
          const readable = chronicle.readerAvailable && chaptersForChronicle(chronicle.id).length > 0
          return <article className="wiki-home-section world-wiki-card" key={chronicle.id}>
            <p className="wiki-document-kicker">생존기 {String(chronicle.number).padStart(2,'0')} · {status[chronicle.status]}</p>
            <h2>{chronicle.title}</h2><p>{book?.subtitle ?? chronicle.availabilityNote}</p>
            <p>{wiki ? wiki.categories.map((group) => group.label + ' ' + group.items.length).join(' · ') : '세계관 문서 준비 중'}</p>
            <small>{wiki?.notice ? '공개 Reader 기반 기본 문서 · 사람 검토 대기' : wiki ? '공개 세계관 기록' : '검증된 자료가 준비되면 위키를 연결합니다.'}</small>
            <div className="wiki-home-actions">
              {wiki && <a className="primary" href={worldWikiHref(chronicle.id)}>세계관 위키 보기</a>}
              {readable && <a href={'/?view=story&chronicle=' + encodeURIComponent(chronicle.id)}>이야기 읽기</a>}
            </div>
          </article>
        })}
      </div>
    </div>
  </main>
}
