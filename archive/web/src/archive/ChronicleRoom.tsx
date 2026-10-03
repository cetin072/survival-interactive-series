import { chronicleBooks, chaptersForChronicle } from './storyData'
import { getChronicle } from './chronicleRegistry'
import { siteVisualsFor } from './siteVisual'
import { chronicleHasGraph } from './chronicleGraphRegistry'
import type { ArchiveNodeType } from './archiveData'
import publicGraph from '../../../content/graphs/C03-AFTERFALL/GRAPH.json'
import { graphWorldTime, sortGraphEvents } from './graphWorldTime'

export type ChronicleSection = 'overview' | 'reader' | 'explorer' | 'characters' | 'locations' | 'events' | 'timeline' | 'graph' | 'map' | 'visuals' | 'raw'
export type ChronicleMenuGroup = 'home' | 'story' | 'world' | 'record'

const sectionLabels: Record<ChronicleSection, string> = {
  overview: '홈',
  reader: '이야기',
  explorer: '전체',
  characters: '인물',
  locations: '장소',
  events: '사건',
  timeline: '시간순 기록',
  graph: '관계도',
  map: '지도',
  visuals: '삽화',
  raw: '원문',
}

const worldSections: ChronicleSection[] = ['explorer', 'characters', 'locations', 'events', 'graph', 'map', 'visuals']
const recordSections: ChronicleSection[] = ['timeline', 'raw']
const graphFilters: Partial<Record<ChronicleSection, ArchiveNodeType>> = { characters: 'character', locations: 'location', events: 'event' }

export const chroniclePrimaryMenuLabels = ['홈', '이야기', '세계관', '기록'] as const

export function chronicleMenuGroup(section: ChronicleSection): ChronicleMenuGroup {
  if (section === 'overview') return 'home'
  if (section === 'reader') return 'story'
  if (recordSections.includes(section)) return 'record'
  return 'world'
}

export function ChronicleRoom({ chronicleId, section, onSection, onRead, onExplore, onRaw, onOpenHub }: {
  chronicleId: string; section: ChronicleSection; onSection: (section: ChronicleSection) => void
  onRead: () => void; onExplore: () => void; onRaw: () => void; onOpenHub: () => void
}) {
  const chronicle = getChronicle(chronicleId)
  const book = chronicleBooks.find((item) => item.chronicleId === chronicleId)
  const chapters = chaptersForChronicle(chronicleId)
  const visuals = siteVisualsFor(chronicleId)
  const hasGraph = chronicleHasGraph(chronicleId)
  const activeGroup = chronicleMenuGroup(section)
  const recordTarget: ChronicleSection = hasGraph ? 'timeline' : 'raw'

  return <section className="chronicle-room">
    <header className="chronicle-room-heading">
      <button className="text-button" onClick={onOpenHub}>← 모든 생존기</button>
      <p className="archive-eyebrow">생존기 {String(chronicle.number).padStart(2, '0')} · {chronicle.id}</p>
      <h1>{chronicle.title}</h1>
      <p>{chronicle.protagonist} 생존기 · {chronicle.status === 'LIVE' ? '현재 진행 중' : '완결 기록'}</p>
    </header>

    <nav className="chronicle-tabs chronicle-primary-tabs" aria-label="생존기 주요 메뉴">
      <button className={activeGroup === 'home' ? 'active' : ''} aria-current={activeGroup === 'home' ? 'page' : undefined} onClick={() => onSection('overview')}>홈</button>
      <button className={activeGroup === 'story' ? 'active' : ''} aria-current={activeGroup === 'story' ? 'page' : undefined} onClick={() => onSection('reader')}>이야기</button>
      <button className={activeGroup === 'world' ? 'active' : ''} aria-current={activeGroup === 'world' ? 'page' : undefined} onClick={() => onSection('explorer')}>세계관</button>
      <button className={activeGroup === 'record' ? 'active' : ''} aria-current={activeGroup === 'record' ? 'page' : undefined} onClick={() => onSection(recordTarget)}>기록</button>
    </nav>

    {activeGroup === 'world' && <nav className="chronicle-subtabs" aria-label="세계관 세부 메뉴">
      {worldSections.map((item) => <button key={item} className={section === item ? 'active' : ''} onClick={() => onSection(item)}>{sectionLabels[item]}</button>)}
    </nav>}

    {activeGroup === 'record' && <nav className="chronicle-subtabs" aria-label="기록 세부 메뉴">
      {recordSections.map((item) => <button key={item} className={section === item ? 'active' : ''} onClick={() => onSection(item)}>{sectionLabels[item]}</button>)}
    </nav>}

    {section === 'overview' && <section className="chronicle-overview">
      <div className="archive-panel chronicle-summary"><p className="archive-eyebrow">생존기 소개</p><h2>{book?.subtitle ?? '이야기 기록'}</h2><p>{book?.description ?? chronicle.availabilityNote}</p><div className="hub-actions">
        {book && <button className="primary" onClick={onRead}>이야기 읽기 · {chapters.length}장</button>}
        {hasGraph && <button onClick={onExplore}>세계관 보기</button>}
        <button onClick={onRaw}>원문 보기</button>
      </div></div>
      <div className="archive-panel chronicle-sections"><p className="archive-eyebrow">이 생존기에서 보기</p><ul>
        <li><button onClick={() => onSection('reader')}>이야기<span>{book ? `${chapters.length}장 공개` : '아직 기록 없음'}</span></button></li>
        <li><button onClick={() => onSection('explorer')}>세계관<span>{hasGraph ? '인물 · 장소 · 사건 · 관계도 · 삽화' : visuals.length ? `삽화 ${visuals.length}개` : '아직 기록 없음'}</span></button></li>
        <li><button onClick={() => onSection(recordTarget)}>기록<span>{hasGraph ? '시간순 기록 · 원문' : '원문 기록'}</span></button></li>
      </ul></div>
    </section>}

    {section === 'reader' && <section className="archive-panel chronicle-empty"><p className="archive-eyebrow">STORY</p><h2>{book ? '검증된 이야기 기록' : '아직 기록 없음'}</h2><p>{book ? chapters.length + '개의 공개 장을 읽을 수 있습니다.' : chronicle.availabilityNote}</p>{book && <button className="primary" onClick={onRead}>이야기 읽기</button>}</section>}

    {section === 'timeline' && hasGraph && <section className="chronicle-timeline"><div className="chronicle-feature-heading"><p className="archive-eyebrow">{chronicle.label} · 기록</p><h2>최신 사건부터</h2></div><ol>{sortGraphEvents(publicGraph.nodes.filter((record) => record.data.type === 'event')).map((record) => <li key={record.id}><div><time dateTime={graphWorldTime(record).replace(' ', 'T')}>{record.data.subtitle}</time><small>기록 시각 · {record.anchor.game_time}</small></div><article className="archive-panel"><h3>{record.data.label}</h3><p>{record.data.summary}</p></article></li>)}</ol></section>}

    {['explorer','characters','locations','events','graph'].includes(section) && (hasGraph
      ? <section className="chronicle-feature"><div className="chronicle-feature-heading"><p className="archive-eyebrow">{chronicle.label} · 세계관</p><h2>{sectionLabels[section]}</h2></div><button className="primary" onClick={onExplore}>{section === 'graph' ? '관계도 열기' : '세계관 탐색 열기'}</button></section>
      : <section className="archive-panel chronicle-empty"><p className="archive-eyebrow">{sectionLabels[section]}</p><h2>아직 기록 없음</h2><p>이 생존기에는 공개된 세계관 기록이 아직 없습니다. 다른 생존기의 기록은 섞이지 않습니다.</p></section>)}

    {section === 'map' && <section className="archive-panel chronicle-empty"><p className="archive-eyebrow">지도</p><h2>아직 기록 없음</h2><p>공개 지도가 준비되면 이 생존기 안에서 표시합니다.</p></section>}

    {section === 'visuals' && <section className="chronicle-visuals"><div className="chronicle-feature-heading"><p className="archive-eyebrow">{chronicle.label} · 삽화</p><h2>공개 삽화</h2></div>{visuals.length ? <div className="visual-grid">{visuals.map((asset) => <figure className="archive-panel" key={asset.subject_id}><img src={asset.public_path} alt={asset.caption ?? asset.subject_id} loading="lazy" /><figcaption>{asset.caption ?? asset.subject_id}</figcaption></figure>)}</div> : <div className="archive-panel chronicle-empty"><h2>아직 기록 없음</h2><p>공개 허용된 삽화가 등록되면 표시합니다.</p></div>}</section>}

    {section === 'raw' && <section className="archive-panel chronicle-empty"><p className="archive-eyebrow">원문 기록</p><h2>공개 원문 보관소</h2><p>확인 가능한 실제 플레이 원문을 그대로 보관합니다.</p><button className="primary" onClick={onRaw}>원문 열기</button></section>}
  </section>
}

export function chronicleFilterFor(section: ChronicleSection): ArchiveNodeType | undefined { return graphFilters[section] }
