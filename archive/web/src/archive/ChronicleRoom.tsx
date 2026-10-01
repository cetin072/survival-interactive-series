import { chronicleBooks, chaptersForChronicle } from './storyData'
import { getChronicle } from './chronicleRegistry'
import { siteVisualsFor } from './siteVisual'
import { chronicleHasGraph } from './chronicleGraphRegistry'
import type { ArchiveNodeType } from './archiveData'
import publicGraph from '../../../content/graphs/C03-AFTERFALL/GRAPH.json'

export type ChronicleSection = 'overview' | 'reader' | 'explorer' | 'characters' | 'locations' | 'events' | 'timeline' | 'graph' | 'map' | 'visuals' | 'raw'
const sections: { id: ChronicleSection; label: string }[] = [
  { id: 'overview', label: '개요' }, { id: 'reader', label: 'Reader' }, { id: 'explorer', label: '세계 탐색' },
  { id: 'characters', label: '인물' }, { id: 'locations', label: '장소' }, { id: 'events', label: '사건' },
  { id: 'timeline', label: 'Timeline' }, { id: 'graph', label: 'Graph' }, { id: 'map', label: '지도' },
  { id: 'visuals', label: 'Visuals' }, { id: 'raw', label: 'RAW' },
]
const graphFilters: Partial<Record<ChronicleSection, ArchiveNodeType>> = { characters: 'character', locations: 'location', events: 'event' }

export function ChronicleRoom({ chronicleId, section, onSection, onRead, onExplore, onRaw, onOpenHub }: {
  chronicleId: string; section: ChronicleSection; onSection: (section: ChronicleSection) => void
  onRead: () => void; onExplore: () => void; onRaw: () => void; onOpenHub: () => void
}) {
  const chronicle = getChronicle(chronicleId)
  const book = chronicleBooks.find((item) => item.chronicleId === chronicleId)
  const chapters = chaptersForChronicle(chronicleId)
  const visuals = siteVisualsFor(chronicleId)
  const hasGraph = chronicleHasGraph(chronicleId)
  return <section className="chronicle-room">
    <header className="chronicle-room-heading">
      <button className="text-button" onClick={onOpenHub}>← 모든 Chronicles</button>
      <p className="archive-eyebrow">CHRONICLE {String(chronicle.number).padStart(2, '0')} · {chronicle.id}</p>
      <h1>{chronicle.title}</h1>
      <p>{chronicle.protagonist} 생존기 · {chronicle.status === 'LIVE' ? '현재 진행 중' : '완결 기록'}</p>
    </header>
    <nav className="chronicle-tabs" aria-label="Chronicle 탐색">
      {sections.map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => onSection(item.id)}>{item.label}</button>)}
    </nav>
    {section === 'overview' && <section className="chronicle-overview">
      <div className="archive-panel chronicle-summary"><p className="archive-eyebrow">OVERVIEW</p><h2>{book?.subtitle ?? '이야기 기록'}</h2><p>{book?.description ?? chronicle.availabilityNote}</p><div className="hub-actions">
        {book && <button className="primary" onClick={onRead}>이야기 읽기 · {chapters.length}장</button>}
        {hasGraph && <button onClick={onExplore}>세계 탐색</button>}
        <button onClick={onRaw}>공개 RAW 기록</button>
      </div></div>
      <div className="archive-panel chronicle-sections"><p className="archive-eyebrow">IN THIS CHRONICLE</p><ul>{sections.slice(1).map((item) => <li key={item.id}><button onClick={() => onSection(item.id)}>{item.label}<span>{item.id === 'reader' && book ? '공개 Reader' : item.id === 'visuals' && visuals.length ? visuals.length + '개 공개 자산' : item.id === 'timeline' && hasGraph ? '최신 사건순' : hasGraph && ['explorer','characters','locations','events','graph'].includes(item.id) ? '세계 기록 탐색' : '아직 기록 없음'}</span></button></li>)}</ul></div>
    </section>}
    {section === 'reader' && <section className="archive-panel chronicle-empty"><p className="archive-eyebrow">READER</p><h2>{book ? '검증된 이야기 기록' : '아직 기록 없음'}</h2><p>{book ? chapters.length + '개의 공개 장을 기존 Reader에서 읽을 수 있습니다.' : chronicle.availabilityNote}</p>{book && <button className="primary" onClick={onRead}>Reader 열기</button>}</section>}
    {section === 'timeline' && hasGraph && <section className="chronicle-timeline"><div className="chronicle-feature-heading"><p className="archive-eyebrow">{chronicle.label} · 공개 Graph</p><h2>최신 사건부터</h2></div><ol>{publicGraph.nodes.filter((record) => record.data.type === 'event').sort((a, b) => b.anchor.game_time.localeCompare(a.anchor.game_time) || b.anchor.save_version - a.anchor.save_version).map((record) => <li key={record.id}><div><time dateTime={record.anchor.game_time.replace(' ', 'T')}>{record.data.subtitle}</time><small>공개 source anchor · {record.anchor.game_time}</small></div><article className="archive-panel"><h3>{record.data.label}</h3><p>{record.data.summary}</p></article></li>)}</ol></section>}
    {['explorer','characters','locations','events','graph'].includes(section) && (hasGraph
      ? <section className="chronicle-feature"><div className="chronicle-feature-heading"><p className="archive-eyebrow">{chronicle.label} · 세계 기록</p><h2>{sections.find((item) => item.id === section)?.label}</h2></div><button className="primary" onClick={onExplore}>Graph Explorer 열기</button></section>
      : <section className="archive-panel chronicle-empty"><p className="archive-eyebrow">{sections.find((item) => item.id === section)?.label.toUpperCase()}</p><h2>아직 기록 없음</h2><p>이 Chronicle에는 공개된 Graph 자료가 없습니다. 다른 Chronicle의 기록은 여기에 섞이지 않습니다.</p></section>)}
    {section === 'map' && <section className="archive-panel chronicle-empty"><p className="archive-eyebrow">MAP</p><h2>아직 기록 없음</h2><p>공개 지도 projection이 준비되면 이 Chronicle 안에서 표시합니다.</p></section>}
    {section === 'visuals' && <section className="chronicle-visuals"><div className="chronicle-feature-heading"><p className="archive-eyebrow">PUBLIC VISUAL ARCHIVE · {chronicle.label}</p><h2>공개 Visual 자료</h2></div>{visuals.length ? <div className="visual-grid">{visuals.map((asset) => <figure className="archive-panel" key={asset.subject_id}><img src={asset.public_path} alt={asset.subject_id} loading="lazy" /><figcaption>{asset.subject_id}</figcaption></figure>)}</div> : <div className="archive-panel chronicle-empty"><h2>아직 기록 없음</h2><p>공개 허용된 이미지가 등록되면 표시합니다.</p></div>}</section>}
    {section === 'raw' && <section className="archive-panel chronicle-empty"><p className="archive-eyebrow">RAW TRANSCRIPT</p><h2>공개 원문 보관소</h2><p>확인 가능한 원문을 기존 RAW Reader에서 엽니다.</p><button className="primary" onClick={onRaw}>RAW Reader 열기</button></section>}
  </section>
}

export function chronicleFilterFor(section: ChronicleSection): ArchiveNodeType | undefined { return graphFilters[section] }
