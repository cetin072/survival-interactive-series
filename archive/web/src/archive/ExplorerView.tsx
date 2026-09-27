import { useMemo, useState } from 'react'
import { archiveEdges, archiveMeta, archiveNodes, type ArchiveEdge, type ArchiveNode, type ArchiveNodeType } from './archiveData'
import { publicVisualStatus } from './visualStatus'
import { archiveArticleByNodeId } from './archiveArticleData'
import { confirmedAppearanceFor } from './characterAppearance'
import { chapterForNode } from './storyData'

const typeLabel: Record<ArchiveNodeType, string> = { character: '인물', location: '지역', event: '사건', reference: '자료' }
const typeOrder: ArchiveNodeType[] = ['character', 'location', 'event', 'reference']
export const nodeById = new Map(archiveNodes.map((node) => [node.id, node]))
const MAX_GRAPH_NODES = 28
const GRAPH_WIDTH = 1200
const GRAPH_HEIGHT = 720
type Neighbor = { node: ArchiveNode; edge: ArchiveEdge }
export type GraphTypeVisibility = Record<ArchiveNodeType, boolean>

export function getNeighbors(id: string): Neighbor[] {
  return archiveEdges.flatMap((edge) => {
    const node = edge.from === id ? nodeById.get(edge.to) : edge.to === id ? nodeById.get(edge.from) : undefined
    return node ? [{ node, edge }] : []
  })
}

export function basicInfoRows(node: ArchiveNode) {
  const appearance = confirmedAppearanceFor(node)
  return [
    { label: '이름', value: node.label },
    { label: '타입', value: typeLabel[node.type] },
    { label: '역할', value: node.subtitle },
    { label: '현재 공개 상태', value: node.meta?.상태 ?? '공개 기록' },
    ...(appearance ? [{ label: '외형', value: appearance.publicDescription!, appearance: true }] : []),
  ]
}

export function buildVisibleGraph(rootId: string, expandedIds: string[], typeVisibility: GraphTypeVisibility) {
  const expanded = new Set(expandedIds); expanded.add(rootId)
  const visibleIds = new Set<string>([rootId]); const depths = new Map<string, number>([[rootId, 0]])
  const queue = [{ id: rootId, depth: 0 }]
  while (queue.length && visibleIds.size < MAX_GRAPH_NODES) {
    const current = queue.shift()!
    if (current.depth >= 3 || !expanded.has(current.id)) continue
    for (const { node } of getNeighbors(current.id)) {
      if (!typeVisibility[node.type] && node.id !== rootId) continue
      if (!visibleIds.has(node.id)) { visibleIds.add(node.id); depths.set(node.id, current.depth + 1) }
      if (expanded.has(node.id)) queue.push({ id: node.id, depth: current.depth + 1 })
      if (visibleIds.size >= MAX_GRAPH_NODES) break
    }
  }
  return { visibleIds: [...visibleIds], depths, visibleEdges: archiveEdges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)) }
}

export function buildPositions(visibleIds: string[], depths: Map<string, number>) {
  const positions = new Map<string, { x: number; y: number }>(); const groups = new Map<number, string[]>()
  visibleIds.forEach((id) => { const depth = depths.get(id) ?? 0; groups.set(depth, [...(groups.get(depth) ?? []), id]) })
  positions.set(visibleIds[0], { x: 600, y: 360 })
  groups.forEach((ids, depth) => { if (!depth) return; const radius = depth === 1 ? 255 : depth === 2 ? 400 : 505; ids.forEach((id, index) => { const angle = -Math.PI / 2 + depth * .22 + Math.PI * 2 * index / ids.length; positions.set(id, { x: 600 + Math.cos(angle) * radius, y: 360 + Math.sin(angle) * radius }) }) })
  return positions
}

function GraphExplorer({ root, selected, onSelect, onFocus }: { root: ArchiveNode; selected: ArchiveNode; onSelect: (id: string) => void; onFocus: (id: string) => void }) {
  const [expandedIds, setExpandedIds] = useState<string[]>([root.id]); const [zoom, setZoom] = useState(1)
  const [visibility, setVisibility] = useState<GraphTypeVisibility>({ character: true, location: true, event: true, reference: true })
  const graph = useMemo(() => buildVisibleGraph(root.id, expandedIds, visibility), [root.id, expandedIds, visibility])
  const positions = useMemo(() => buildPositions(graph.visibleIds, graph.depths), [graph.visibleIds, graph.depths])
  const viewBox = [(GRAPH_WIDTH - GRAPH_WIDTH / zoom) / 2, (GRAPH_HEIGHT - GRAPH_HEIGHT / zoom) / 2, GRAPH_WIDTH / zoom, GRAPH_HEIGHT / zoom].join(' ')
  return <section className="archive-panel graph-panel" aria-label="연결 그래프"><div className="panel-heading graph-heading"><div><p className="archive-eyebrow">GRAPH</p><h2>연결 따라가기</h2></div><div className="graph-heading-meta"><button onClick={() => setExpandedIds([root.id])}>초기화</button><button onClick={() => setZoom((value) => Math.max(.8, value - .2))}>−</button><button onClick={() => setZoom((value) => Math.min(1.8, value + .2))}>+</button></div></div>
    <div className="graph-toolbar">{typeOrder.map((type) => <button key={type} className={visibility[type] ? 'active' : ''} onClick={() => setVisibility((current) => ({ ...current, [type]: !current[type] }))}><span className={'type-dot type-dot-' + type} />{typeLabel[type]}</button>)}</div>
    <div className="graph-canvas"><svg viewBox={viewBox} role="img" aria-label={root.label + ' 중심 연결 관계'}>{graph.visibleEdges.map((edge) => { const from = positions.get(edge.from); const to = positions.get(edge.to); return from && to ? <line key={edge.from + edge.to + edge.label} className="graph-edge" x1={from.x} y1={from.y} x2={to.x} y2={to.y} /> : null })}{graph.visibleIds.map((id) => { const node = nodeById.get(id); const point = positions.get(id); if (!node || !point) return null; const selectedNode = node.id === selected.id; return <g key={id} className={'graph-node graph-node-' + node.type + (selectedNode ? ' graph-node-selected' : '')} transform={'translate(' + point.x + ' ' + point.y + ')'} role="button" tabIndex={0} aria-label={node.label + ' 열기'} onClick={() => { onSelect(node.id); setExpandedIds((items) => items.includes(node.id) ? items : [...items, node.id]) }} onDoubleClick={() => onFocus(node.id)}><circle r={node.id === root.id ? 58 : selectedNode ? 44 : 36} /><text y="4" textAnchor="middle">{node.label.length > 8 ? node.label.slice(0, 8) + '…' : node.label}</text></g> })}</svg></div></section>
}

function DetailArticle({ selected, onSelect, onOpenStory }: { selected: ArchiveNode; onSelect: (id: string) => void; onOpenStory: (chapterId: string) => void }) {
  const article = archiveArticleByNodeId[selected.id]; const neighbors = getNeighbors(selected.id); const chapter = chapterForNode(selected.id); const basics = basicInfoRows(selected); const visual = publicVisualStatus(selected.id)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  return <article className="archive-detail" id="archive-detail"><header className="archive-detail-header"><div><p className="archive-eyebrow">선택된 기록 · {typeLabel[selected.type]}</p><h1>{selected.label}</h1><p>{selected.subtitle}</p></div></header>
    <nav className="detail-toc" aria-label={selected.label + ' 목차'}><a href="#detail-basics">기본 정보</a><a href="#detail-overview">개요</a><a href="#detail-history">주요 행적 · 기록</a><a href="#detail-relations">핵심 관계</a><a href="#detail-stories">관련 이야기 · 참조</a></nav>
    <section className="detail-section" id="detail-basics"><h2>기본 정보</h2><dl className="detail-meta detail-meta-wide">{basics.map((item) => <div className={item.appearance ? 'detail-appearance' : undefined} key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
    {visual && <section className="detail-section" aria-label="그림 상태"><h2>그림</h2><div className="visual-pending" data-visual-state={visual.state}>{visual.image && failedImage !== visual.image.src && <img className="archive-visual-image" src={visual.image.src} width={visual.image.width} height={visual.image.height} loading="lazy" alt={selected.label + ' 공개 그림'} onError={() => setFailedImage(visual.image!.src)} />}<strong>{failedImage === visual.image?.src ? '그림을 불러오지 못했습니다' : visual.label}</strong><p>{failedImage === visual.image?.src ? '이미지 연결을 확인한 뒤 다시 시도해 주세요.' : visual.detail}</p>{failedImage === visual.image?.src && <button type="button" onClick={() => setFailedImage(null)}>다시 시도</button>}</div></section>}
    <section className="detail-section detail-prose" id="detail-overview"><h2>개요</h2>{(article?.lead ?? [selected.summary]).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>
    <section className="detail-section" id="detail-history"><h2>주요 행적 · 기록</h2>{article?.sections?.length ? <div className="article-section-list">{article.sections.map((section) => <section className="article-section-block" key={section.id}><h3>{section.title}</h3>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>)}</div> : <p className="archive-muted">현재 공개 기록에서 이 항목의 장문 행적을 정리하고 있습니다.</p>}</section>
    <section className="detail-section" id="detail-relations"><h2>핵심 관계</h2><div className="relationship-list">{neighbors.map(({ node, edge }) => <article key={node.id + edge.label}><div><span className={'type-dot type-dot-' + node.type} /><strong>{node.label}</strong><small>{typeLabel[node.type]} · {node.subtitle}</small></div><p>{edge.label}</p><button onClick={() => onSelect(node.id)}>열기</button></article>)}</div></section>
    <section className="detail-section" id="detail-stories"><h2>관련 이야기 · 참조</h2>{chapter ? <div className="archive-entry-list"><button onClick={() => onOpenStory(chapter.id)}><span>서진우의 생존기 · 제{chapter.chapterNumber}장</span><strong>{chapter.title}</strong><p>{chapter.subtitle}</p></button></div> : <p className="archive-muted">이 기록과 직접 연결된 공개 장을 정리 중입니다.</p>}<p className="detail-source-note">기록 근거 · {archiveMeta.worldline} {archiveMeta.season}</p></section>
  </article>
}

export function ExplorerView({ initialNodeId, onOpenStory }: { initialNodeId?: string; onOpenStory: (chapterId: string) => void }) {
  const firstNodeId = initialNodeId && nodeById.has(initialNodeId) ? initialNodeId : 'char-jinwoo'
  const [selectedId, setSelectedId] = useState(firstNodeId); const [rootId, setRootId] = useState(firstNodeId); const [query, setQuery] = useState(''); const [filter, setFilter] = useState<'all' | ArchiveNodeType>('all')
  const selected = nodeById.get(selectedId) ?? archiveNodes[0]; const root = nodeById.get(rootId) ?? selected
  const results = archiveNodes.filter((node) => (filter === 'all' || node.type === filter) && [node.label, node.subtitle, node.summary, ...node.tags].join(' ').toLowerCase().includes(query.toLowerCase()))
  const select = (id: string, focus = false) => { setSelectedId(id); if (focus) setRootId(id) }
  return <><section className="archive-intro"><p className="archive-eyebrow">현재 생존기 · AFTERFALL</p><h1>세계 탐색</h1><p>인물과 장소, 사건 사이의 연결을 따라가고 아래에서 긴 기록을 읽습니다.</p></section><section className="archive-toolbar"><label className="archive-search"><span>검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="인물, 지역, 사건, 자료 검색" /></label><nav className="archive-filters" aria-label="기록 분류">{([['all','전체'], ['character','인물'], ['location','지역'], ['event','사건'], ['reference','자료']] as const).map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</nav></section><section className="archive-layout"><aside className="archive-panel result-panel"><div className="panel-heading"><div><p className="archive-eyebrow">INDEX</p><h2>기록 목록</h2></div><p className="result-count">{results.length}</p></div><div className="result-list">{results.map((node) => <button key={node.id} className={node.id === selected.id ? 'selected' : ''} onClick={() => select(node.id, true)}><span className={'type-dot type-dot-' + node.type} /><span><strong>{node.label}</strong><small>{typeLabel[node.type]} · {node.subtitle}</small></span></button>)}</div></aside><GraphExplorer root={root} selected={selected} onSelect={(id) => select(id)} onFocus={(id) => select(id, true)} /></section><DetailArticle selected={selected} onSelect={(id) => select(id, true)} onOpenStory={onOpenStory} /></>
}
