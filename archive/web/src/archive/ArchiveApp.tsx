import { useEffect, useMemo, useState } from 'react'
import {
  archiveEdges,
  archiveMeta,
  archiveNodes,
  eventOrder,
  pressureSnapshot,
  type ArchiveEdge,
  type ArchiveNode,
  type ArchiveNodeType,
} from './archiveData'
import { StoryReader } from './StoryReader'
import { activeChronicle, getChronicle, pastChronicles, transcriptPartsFor, type ChronicleId } from './transcriptData'
import './archive.css'

const typeLabel: Record<ArchiveNodeType, string> = {
  character: '인물',
  location: '지역',
  event: '사건',
  reference: '자료',
}

const typeOrder: ArchiveNodeType[] = ['character', 'location', 'event', 'reference']
export const nodeById = new Map(archiveNodes.map((node) => [node.id, node]))
const RECENT_KEY = 'survival-diary-archive:recent'
const MAX_GRAPH_NODES = 28
const MAX_GRAPH_DEPTH = 3
const GRAPH_WIDTH = 1200
const GRAPH_HEIGHT = 720

type ArchiveView = 'story' | 'archive' | 'past'

function readRoute() {
  const params = new URLSearchParams(window.location.search)
  const chronicleId = params.get('chronicle')
  const chronicle = chronicleId ? (() => {
    try { return getChronicle(chronicleId) } catch { return activeChronicle }
  })() : activeChronicle
  return {
    view: params.get('view') === 'past' ? 'past' : params.get('view') === 'reader' || chronicleId ? 'story' : 'archive' as ArchiveView,
    chronicleId: chronicle.id,
    partId: params.get('part') ?? undefined,
  }
}

function writeRoute(view: ArchiveView, chronicleId = activeChronicle.id, partId?: string, replace = false) {
  const url = new URL(window.location.href)
  url.search = ''
  if (view === 'story') {
    url.searchParams.set('view', 'reader')
    url.searchParams.set('chronicle', chronicleId)
    if (partId) url.searchParams.set('part', partId)
  } else if (view === 'past') {
    url.searchParams.set('view', 'past')
  }
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url)
}

type Neighbor = {
  node: ArchiveNode
  edge: ArchiveEdge
}

export type GraphTypeVisibility = Record<ArchiveNodeType, boolean>

export function getNeighbors(id: string): Neighbor[] {
  return archiveEdges.flatMap((edge) => {
    if (edge.from === id) {
      const node = nodeById.get(edge.to)
      return node ? [{ node, edge }] : []
    }
    if (edge.to === id) {
      const node = nodeById.get(edge.from)
      return node ? [{ node, edge }] : []
    }
    return []
  })
}

function shorten(label: string, limit = 9) {
  return label.length > limit ? label.slice(0, limit) + '…' : label
}

export function buildVisibleGraph(
  rootId: string,
  expandedIds: string[],
  typeVisibility: GraphTypeVisibility,
) {
  const expanded = new Set(expandedIds)
  expanded.add(rootId)

  const visibleIds = new Set<string>([rootId])
  const depths = new Map<string, number>([[rootId, 0]])
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }]

  while (queue.length > 0 && visibleIds.size < MAX_GRAPH_NODES) {
    const current = queue.shift()
    if (!current || current.depth >= MAX_GRAPH_DEPTH || !expanded.has(current.id)) continue

    for (const { node } of getNeighbors(current.id)) {
      if (!typeVisibility[node.type] && node.id !== rootId) continue
      if (!visibleIds.has(node.id)) {
        visibleIds.add(node.id)
        depths.set(node.id, current.depth + 1)
        if (visibleIds.size >= MAX_GRAPH_NODES) break
      }
      if (expanded.has(node.id) && current.depth + 1 < MAX_GRAPH_DEPTH) {
        queue.push({ id: node.id, depth: current.depth + 1 })
      }
    }
  }

  const visibleEdges = archiveEdges.filter(
    (edge) =>
      visibleIds.has(edge.from) &&
      visibleIds.has(edge.to) &&
      (expanded.has(edge.from) || expanded.has(edge.to)),
  )

  return { visibleIds: Array.from(visibleIds), depths, visibleEdges }
}

export function buildPositions(visibleIds: string[], depths: Map<string, number>) {
  const centerX = 600
  const centerY = 360
  const positions = new Map<string, { x: number; y: number }>()
  const byDepth = new Map<number, string[]>()

  visibleIds.forEach((id) => {
    const depth = depths.get(id) ?? 0
    const bucket = byDepth.get(depth) ?? []
    bucket.push(id)
    byDepth.set(depth, bucket)
  })

  positions.set(visibleIds[0], { x: centerX, y: centerY })

  for (const [depth, ids] of byDepth.entries()) {
    if (depth === 0) continue
    const radius = depth === 1 ? 255 : depth === 2 ? 400 : 505
    const offset = -Math.PI / 2 + depth * 0.22
    ids.forEach((id, index) => {
      const angle = offset + (Math.PI * 2 * index) / Math.max(ids.length, 1)
      positions.set(id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      })
    })
  }

  return positions
}

function GraphExplorer({
  root,
  selected,
  onSelect,
  onFocusRoot,
  onGoToDetail,
}: {
  root: ArchiveNode
  selected: ArchiveNode
  onSelect: (id: string) => void
  onFocusRoot: (id: string) => void
  onGoToDetail: () => void
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>([root.id])
  const [zoom, setZoom] = useState(1)
  const [isExpanded, setIsExpanded] = useState(false)
  const [typeVisibility, setTypeVisibility] = useState<GraphTypeVisibility>({
    character: true,
    location: true,
    event: true,
    reference: true,
  })

  useEffect(() => {
    setExpandedIds([root.id])
    setZoom(1)
  }, [root.id])

  const graph = useMemo(
    () => buildVisibleGraph(root.id, expandedIds, typeVisibility),
    [root.id, expandedIds, typeVisibility],
  )
  const positions = useMemo(
    () => buildPositions(graph.visibleIds, graph.depths),
    [graph.visibleIds, graph.depths],
  )
  const expanded = new Set(expandedIds)

  function toggleNode(id: string) {
    onSelect(id)
    if (id === root.id) return

    const hasVisibleNeighbor = getNeighbors(id).some(({ node }) => typeVisibility[node.type])
    if (!hasVisibleNeighbor) return

    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  function toggleType(type: ArchiveNodeType) {
    setTypeVisibility((current) => ({ ...current, [type]: !current[type] }))
  }

  const viewportWidth = GRAPH_WIDTH / zoom
  const viewportHeight = GRAPH_HEIGHT / zoom
  const viewBox = [
    (GRAPH_WIDTH - viewportWidth) / 2,
    (GRAPH_HEIGHT - viewportHeight) / 2,
    viewportWidth,
    viewportHeight,
  ].join(' ')

  return (
    <section className={'archive-panel graph-panel' + (isExpanded ? ' graph-expanded' : '')} aria-label="연결 그래프">
      <div className="panel-heading graph-heading">
        <div>
          <p className="archive-eyebrow">NODE EXPLORER · EXPANDABLE</p>
          <h2>연결 따라가기</h2>
        </div>
        <div className="graph-heading-meta">
          <span>{graph.visibleIds.length} nodes</span>
          <button onClick={() => setExpandedIds([root.id])}>초기화</button>
          <button onClick={() => setZoom((current) => Math.max(0.8, Number((current - 0.2).toFixed(1))))} aria-label="그래프 축소">−</button>
          <button onClick={() => setZoom((current) => Math.min(1.8, Number((current + 0.2).toFixed(1))))} aria-label="그래프 확대">+</button>
          <button className="graph-expand-button" onClick={() => setIsExpanded((current) => !current)} aria-pressed={isExpanded}>
            {isExpanded ? '기본 보기' : '넓게 보기'}
          </button>
        </div>
      </div>

      <div className="graph-toolbar" aria-label="그래프 노드 종류">
        {typeOrder.map((type) => (
          <button
            key={type}
            className={typeVisibility[type] ? 'active' : ''}
            onClick={() => toggleType(type)}
          >
            <span className={'type-dot type-dot-' + type} />
            {typeLabel[type]}
          </button>
        ))}
          <p>클릭: 펼치기/접기 · 더블클릭: 중심 이동 · 화면 크기에 맞춰 넓게 탐색</p>
      </div>

      <div className="graph-canvas">
        <svg viewBox={viewBox} role="img" aria-label={root.label + ' 중심 연결 관계, 확대율 ' + Math.round(zoom * 100) + '%'}>
          {graph.visibleEdges.map((edge, index) => {
            const from = positions.get(edge.from)
            const to = positions.get(edge.to)
            if (!from || !to) return null
            const selectedEdge = edge.from === selected.id || edge.to === selected.id
            const rootEdge = edge.from === root.id || edge.to === root.id
            // The initial root has many connections. Keeping all their labels visible
            // turns the small viewport into a text cloud, so label only the focused
            // branch after the reader selects a non-root node.
            const showLabel = selected.id !== root.id && rootEdge && selectedEdge
            const lineX = (from.x + to.x) / 2
            const lineY = (from.y + to.y) / 2

            return (
              <g key={edge.from + edge.to + edge.label + index}>
                <line
                  className={'graph-edge' + (rootEdge ? ' root-edge' : '') + (selectedEdge ? ' selected-edge' : '')}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  vectorEffect="non-scaling-stroke"
                />
                <title>{edge.label}</title>
                {showLabel && (
                  <text className="graph-edge-label" x={lineX} y={lineY - 14} textAnchor="middle">
                    {shorten(edge.label, 11)}
                  </text>
                )}
              </g>
            )
          })}

          {graph.visibleIds.map((id) => {
            const node = nodeById.get(id)
            const position = positions.get(id)
            if (!node || !position) return null
            const isRoot = node.id === root.id
            const isSelected = node.id === selected.id
            const isExpanded = expanded.has(node.id) || isRoot
            const radius = isRoot ? 58 : isSelected ? 44 : 36
            const expandable = getNeighbors(node.id).some(({ node: neighbor }) => typeVisibility[neighbor.type])

            return (
              <g
                key={node.id}
                className={
                  'graph-node graph-node-' +
                  node.type +
                  (isRoot ? ' graph-node-root' : '') +
                  (isSelected ? ' graph-node-selected' : '')
                }
                transform={'translate(' + position.x + ' ' + position.y + ')'}
                role="button"
                tabIndex={0}
                aria-label={node.label + ' 열기'}
                onClick={() => toggleNode(node.id)}
                onDoubleClick={() => onFocusRoot(node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') toggleNode(node.id)
                }}
              >
                <title>{node.label + ' · ' + node.subtitle}</title>
                <circle r={radius} vectorEffect="non-scaling-stroke" />
                <text y={isRoot ? -4 : 3} textAnchor="middle">{shorten(node.label, isRoot ? 11 : 8)}</text>
                {isRoot && <text className="graph-node-type" y="15" textAnchor="middle">{typeLabel[node.type]}</text>}
                {!isRoot && expandable && (
                  <text className="graph-expand-mark" y="20" textAnchor="middle">
                    {isExpanded ? '−' : '+'}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="graph-selection-banner">
        <div>
          <span>{typeLabel[selected.type]}</span>
          <strong>{selected.label}</strong>
        </div>
        <p>{selected.subtitle}</p>
        {selected.id !== root.id && (
          <button onClick={() => onFocusRoot(selected.id)}>이 노드를 중심으로 보기</button>
        )}
        <button className="graph-read-button" onClick={onGoToDetail}>본문으로 이동 ↓</button>
      </div>
    </section>
  )
}

function statusFor(node: ArchiveNode) {
  return node.meta?.상태 ?? (node.type === 'event' ? '기록 완료' : 'PUBLIC RECORD')
}

function affiliationFor(node: ArchiveNode) {
  return node.meta?.소속 ?? node.meta?.거점 ?? node.meta?.겨울역할 ?? node.meta?.관계 ?? '공개 기록 기준 미분류'
}

function hasFinalConsonant(value: string) {
  const code = value.charCodeAt(value.length - 1)
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0
}

function relatedEventsFor(node: ArchiveNode) {
  const direct = getNeighbors(node.id).filter(({ node: neighbor }) => neighbor.type === 'event').map(({ node: neighbor }) => neighbor)
  const nearby = getNeighbors(node.id).flatMap(({ node: neighbor }) => getNeighbors(neighbor.id))
    .filter(({ node: neighbor }) => neighbor.type === 'event').map(({ node: neighbor }) => neighbor)
  return Array.from(new Map([...direct, ...nearby].map((event) => [event.id, event])).values())
    .sort((a, b) => eventOrder.indexOf(a.id) - eventOrder.indexOf(b.id))
}

function relatedLocationsFor(node: ArchiveNode) {
  return Array.from(new Map(
    getNeighbors(node.id).filter(({ node: neighbor }) => neighbor.type === 'location')
      .map(({ node: neighbor }) => [neighbor.id, neighbor]),
  ).values())
}

function DetailArticle({
  selected,
  graphRootId,
  onSelect,
  onFocusRoot,
  onOpenReader,
}: {
  selected: ArchiveNode
  graphRootId: string
  onSelect: (id: string) => void
  onFocusRoot: (id: string) => void
  onOpenReader: (chronicleId: ChronicleId, partId?: string) => void
}) {
  const neighbors = getNeighbors(selected.id)
  const events = relatedEventsFor(selected)
  const locations = relatedLocationsFor(selected)
  const transcriptParts = transcriptPartsFor(activeChronicle.id)
    .filter((part) => part.status !== 'missing_transcript')
    .filter((part) => part.relatedNodeIds.length === 0 || part.relatedNodeIds.includes(selected.id))
    .slice(0, 4)

  return (
    <article className="archive-detail" id="archive-detail" aria-labelledby="archive-detail-title">
      <header className="archive-detail-header">
        <div><p className="archive-eyebrow">ARCHIVE ENTRY · {typeLabel[selected.type]} · {activeChronicle.worldlineId}</p><h1 id="archive-detail-title">{selected.label}</h1><p>{selected.subtitle}</p></div>
        <div className="detail-header-actions">
          {selected.id !== graphRootId && <button className="detail-focus-button" onClick={() => onFocusRoot(selected.id)}>그래프 중심으로</button>}
          <button className="detail-reader-button" onClick={() => onOpenReader(activeChronicle.id, transcriptParts[0]?.id)}>원문 보기 →</button>
        </div>
      </header>
      <nav className="detail-toc" aria-label={selected.label + ' 본문 목차'}><a href="#detail-basics">기본 정보</a><a href="#detail-overview">개요</a><a href="#detail-relations">핵심 관계</a><a href="#detail-events">주요 사건</a><a href="#detail-locations">관련 장소</a><a href="#detail-sources">원문·출처</a><a href="#detail-timeline">연표</a><a href="#detail-canon">정본 요약</a></nav>
      <section className="detail-section" id="detail-basics"><h2>기본 정보</h2><dl className="detail-meta detail-meta-wide"><div><dt>이름</dt><dd>{selected.label}</dd></div><div><dt>타입</dt><dd>{typeLabel[selected.type]}</dd></div><div><dt>상태</dt><dd>{statusFor(selected)}</dd></div><div><dt>소속 / 위치</dt><dd>{affiliationFor(selected)}</dd></div><div><dt>Chronicle</dt><dd>{activeChronicle.label}</dd></div><div><dt>Season</dt><dd>{archiveMeta.season}</dd></div></dl><div className="tag-row">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
      <section className="detail-section detail-prose" id="detail-overview"><h2>개요</h2><p>{selected.label}{hasFinalConsonant(selected.label) ? '은' : '는'} {selected.subtitle}로 기록된 {typeLabel[selected.type]} 항목이다. {selected.summary}</p><p>이 문서는 그래프에서 보인 연결을 읽을 수 있는 공개 아카이브로 풀어 쓴 것이다. 현재 상태와 관계는 PLAYER_SAFE 범위에서만 정리하며, 원문에 없는 대사나 미래 전개는 보태지 않는다.</p></section>
      <section className="detail-section" id="detail-relations"><h2>핵심 관계 <span>{neighbors.length}</span></h2><div className="relationship-list">{neighbors.length === 0 && <p className="archive-muted">현재 공개된 직접 연결이 없습니다.</p>}{neighbors.map(({ node, edge }, index) => <article key={node.id + edge.label + index}><div><span className={'type-dot type-dot-' + node.type} /><strong>{node.label}</strong><small>{typeLabel[node.type]} · {node.subtitle}</small></div><p><b>{edge.label}</b> · 현재 {statusFor(node)}</p><button onClick={() => onSelect(node.id)}>{node.label} 선택</button></article>)}</div></section>
      <section className="detail-section" id="detail-events"><h2>주요 사건</h2><div className="archive-entry-list">{events.length === 0 && <p className="archive-muted">직접 연결된 공개 사건이 아직 없습니다.</p>}{events.map((event) => <button key={event.id} onClick={() => onSelect(event.id)}><span>{event.subtitle}</span><strong>{event.label}</strong><p>{event.summary}</p></button>)}</div></section>
      <section className="detail-section" id="detail-locations"><h2>관련 장소</h2><div className="archive-entry-list compact">{locations.length === 0 && <p className="archive-muted">공개된 직접 장소 연결이 없습니다.</p>}{locations.map((location) => <button key={location.id} onClick={() => onSelect(location.id)}><strong>{location.label}</strong><p>{location.subtitle} · {location.summary}</p></button>)}</div></section>
      <section className="detail-section" id="detail-sources"><h2>원문 등장 기록 · 출처</h2><div className="source-records">{transcriptParts.map((part) => <article key={part.id}><div><strong>{part.seasonId}{part.sessionId ? ' · ' + part.sessionId : ''} · {part.title}</strong><span>{part.range}</span></div><button onClick={() => onOpenReader(activeChronicle.id, part.id)}>원문 바로가기 →</button></article>)}</div><p className="detail-source-note">정본 출처: {selected.source} · PLAYER_SAFE snapshot만 표시하며 GM-only / hidden state는 제외합니다.</p></section>
      <section className="detail-section" id="detail-timeline"><h2>연표</h2><ol className="detail-timeline"><li><time>기록 등록</time><div><strong>{activeChronicle.label} · {archiveMeta.season}</strong><p>{selected.label}{hasFinalConsonant(selected.label) ? '이' : '가'} 공개 아카이브 항목으로 정리됐다.</p></div></li>{events.slice(0, 4).map((event) => <li key={event.id}><time>{event.subtitle}</time><div><strong>{event.label}</strong><p>{event.summary}</p></div></li>)}<li><time>최근 상태</time><div><strong>{statusFor(selected)}</strong><p>{selected.summary}</p></div></li></ol></section>
      <section className="detail-section canon-summary" id="detail-canon"><p className="archive-eyebrow">CANON SUMMARY · NOT RAW TRANSCRIPT</p><h2>정본 요약</h2><p>{selected.summary}</p><p>이 요약은 공개 정본을 읽기 좋게 정리한 것이다. 실제 대화 원문과 같은 기록으로 취급하지 않으며, 원문에 없는 구간을 추정으로 채우지 않는다.</p></section>
    </article>
  )
}

function transcriptCoverage(chronicleId: ChronicleId) {
  const parts = transcriptPartsFor(chronicleId)
  const readable = parts.filter((part) => part.status !== 'missing_transcript').length
  return { readable, total: parts.length }
}

function PastChronicles({ onOpenReader }: { onOpenReader: (id: ChronicleId) => void }) {
  return <section className="past-chronicles" aria-label="지난 생존기">
    <div className="archive-intro">
      <p className="archive-eyebrow">SURVIVAL DIARY IP · VERIFIED RECORDS</p>
      <h2>지난 생존기</h2>
      <p>확인된 공개 기록만 각 Chronicle의 경계를 지켜 보관합니다. 현재 생존기의 정본과 인물·사건을 섞지 않습니다.</p>
    </div>
    <div className="past-chronicle-grid">
      {pastChronicles.map((chronicle) => {
        const readable = chronicle.transcriptStatus !== 'backfill_required'
        const coverage = transcriptCoverage(chronicle.id)
        return <article key={chronicle.id} className="archive-panel past-chronicle-card">
          <p className="archive-eyebrow">SURVIVAL DIARY · ARCHIVE EDITION {chronicle.id.slice(1, 3)}</p>
          <h2>{chronicle.worldlineId}</h2>
          <strong className="past-chronicle-protagonist">{chronicle.protagonist}의 생존기</strong>
          <p>{chronicle.availabilityNote}</p>
          <dl className="detail-meta"><div><dt>원문 상태</dt><dd>{chronicle.transcriptStatus === 'partial' ? '일부 검증됨' : 'BACKFILL REQUIRED'}</dd></div><div><dt>확인 범위</dt><dd>{coverage.readable}/{coverage.total || 0} records</dd></div></dl>
          {readable ? <button className="primary" onClick={() => onOpenReader(chronicle.id)}>검증 원문 읽기</button> : <p className="archive-muted">원문이 확보되면 이 카드에서 공개합니다.</p>}
        </article>
      })}
    </div>
  </section>
}

function CurrentExplorerUnavailable({ chronicle }: { chronicle: typeof activeChronicle }) {
  return <section className="archive-intro">
    <p className="archive-eyebrow">현재 생존기 · {chronicle.worldlineId} · 공개 기록</p>
    <h2>현재 생존기의 세계 탐색을 준비하고 있습니다.</h2>
    <p>검증된 인물·사건·장소 데이터가 등록되기 전에는 다른 생존기의 세계 탐색 데이터를 현재 기록으로 표시하지 않습니다.</p>
  </section>
}

export function ArchiveApp() {
  const initialRoute = readRoute()
  const [selectedId, setSelectedId] = useState('char-jinwoo')
  const [graphRootId, setGraphRootId] = useState('char-jinwoo')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | ArchiveNodeType>('all')
  const [recentIds, setRecentIds] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ArchiveView>(initialRoute.view)
  const [readerChronicleId, setReaderChronicleId] = useState<ChronicleId>(initialRoute.chronicleId)
  const [readerPartId, setReaderPartId] = useState<string | undefined>(initialRoute.partId)

  const selected = nodeById.get(selectedId) ?? archiveNodes[0]
  const graphRoot = nodeById.get(graphRootId) ?? selected

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]')
      if (Array.isArray(saved)) {
        setRecentIds(saved.filter((id): id is string => typeof id === 'string' && nodeById.has(id)).slice(0, 7))
      }
    } catch {
      setRecentIds([])
    }
  }, [])

  useEffect(() => {
    const restoreRoute = () => {
      const route = readRoute()
      setViewMode(route.view)
      setReaderChronicleId(route.chronicleId)
      setReaderPartId(route.partId)
    }
    window.addEventListener('popstate', restoreRoute)
    return () => window.removeEventListener('popstate', restoreRoute)
  }, [])

  function rememberNode(id: string) {
    setRecentIds((current) => {
      const next = [id, ...current.filter((item) => item !== id)].slice(0, 7)
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        // localStorage가 막혀도 탐색 자체는 계속 동작한다.
      }
      return next
    })
  }

  function selectNode(id: string, reroot = false) {
    if (!nodeById.has(id)) return
    setSelectedId(id)
    if (reroot) setGraphRootId(id)
    rememberNode(id)
  }

  function focusRoot(id: string) {
    if (!nodeById.has(id)) return
    setSelectedId(id)
    setGraphRootId(id)
    rememberNode(id)
  }

  function openStoryNode(id: string) {
    if (!nodeById.has(id)) return
    setSelectedId(id)
    setGraphRootId(id)
    rememberNode(id)
    setViewMode('archive')
    writeRoute('archive')
  }

  function openReader(chronicleId: ChronicleId, partId?: string) {
    setReaderChronicleId(chronicleId)
    setReaderPartId(partId)
    setViewMode('story')
    writeRoute('story', chronicleId, partId)
  }

  function openView(view: Exclude<ArchiveView, 'story'>) {
    setViewMode(view)
    writeRoute(view)
  }

  function updateReaderPart(partId: string) {
    setReaderPartId(partId)
    writeRoute('story', readerChronicleId, partId, true)
  }

  const filteredNodes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return archiveNodes.filter((node) => {
      if (filter !== 'all' && node.type !== filter) return false
      if (!needle) return true
      const haystack = [
        node.label,
        node.subtitle,
        node.summary,
        node.tags.join(' '),
        Object.values(node.meta ?? {}).join(' '),
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [query, filter])

  const timeline = eventOrder
    .map((id) => nodeById.get(id))
    .filter((node): node is ArchiveNode => Boolean(node))

  const recentNodes = recentIds
    .map((id) => nodeById.get(id))
    .filter((node): node is ArchiveNode => Boolean(node))

  return (
    <main className="archive-shell">
      <header className="archive-header">
        <div className="archive-brand">
          <p className="archive-kicker">SURVIVAL DIARY IP · {activeChronicle.label}</p>
          <h1>생존일기 <span>ARCHIVE</span></h1>
        </div>
        <nav className="archive-primary-nav" aria-label="주요 탐색">
          <button className={viewMode === 'archive' ? 'active' : ''} onClick={() => openView('archive')}>세계 탐색</button>
          <button className="primary" onClick={() => openReader(activeChronicle.id)}>원문 읽기</button>
          <button className={viewMode === 'past' ? 'active' : ''} onClick={() => openView('past')}>지난 생존기</button>
        </nav>
      </header>

      {viewMode === 'story' ? (
        <StoryReader chronicleId={readerChronicleId} initialPartId={readerPartId} onPartChange={updateReaderPart} onOpenNode={openStoryNode} onOpenExplorer={() => openView('archive')} />
      ) : viewMode === 'past' ? (
        <PastChronicles onOpenReader={openReader} />
      ) : activeChronicle.worldlineId === archiveMeta.worldline ? (
        <>
      <section className="archive-intro">
        <p className="archive-eyebrow">현재 생존기 · {activeChronicle.worldlineId} · 공개 기록</p>
        <h2>{activeChronicle.worldlineId}<br />{activeChronicle.protagonist}의 생존기</h2>
        <p>인물, 장소, 사건과 관계를 따라가고, 현재 생존기의 공개 기록 상태를 확인할 수 있습니다.</p>
        <div className="current-record-meta" aria-label="현재 아카이브 정보">
          <span>Worldline · {activeChronicle.worldlineId}</span><span>Season · {archiveMeta.season}</span><span>Revision · {archiveMeta.saveVersion}</span><span>원문 · {transcriptCoverage(activeChronicle.id).readable}/{transcriptCoverage(activeChronicle.id).total || 0} records</span>
        </div>
        <button onClick={() => openReader(activeChronicle.id)}>원문 읽기 →</button>
      </section>
      <section className="archive-toolbar">
        <label className="archive-search">
          <span>통합검색</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="인물, 지역, 사건, 자료 검색"
          />
        </label>
        <nav className="archive-filters" aria-label="아카이브 분류">
          {([
            ['all', '전체'],
            ['character', '인물'],
            ['location', '지역'],
            ['event', '사건'],
            ['reference', '자료'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </nav>
      </section>

      {recentNodes.length > 0 && (
        <section className="recent-strip" aria-label="최근 본 항목">
          <span>최근 본 항목</span>
          <div>
            {recentNodes.map((node) => (
              <button key={node.id} onClick={() => selectNode(node.id, true)}>
                <span className={'type-dot type-dot-' + node.type} />
                {node.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="archive-layout">
        <aside className="archive-panel result-panel">
          <div className="panel-heading">
            <div>
              <p className="archive-eyebrow">INDEX</p>
              <h2>{query ? '검색 결과' : '기록 목록'}</h2>
            </div>
            <p className="result-count">{filteredNodes.length}</p>
          </div>
          <div className="result-list">
            {filteredNodes.map((node) => (
              <button
                key={node.id}
                className={selected.id === node.id ? 'selected' : ''}
                onClick={() => selectNode(node.id, true)}
              >
                <span className={'type-dot type-dot-' + node.type} />
                <span>
                  <strong>{node.label}</strong>
                  <small>{typeLabel[node.type]} · {node.subtitle}</small>
                </span>
              </button>
            ))}
            {filteredNodes.length === 0 && <p className="archive-empty">검색 결과가 없습니다.</p>}
          </div>
        </aside>

        <GraphExplorer
          root={graphRoot}
          selected={selected}
          onSelect={(id) => selectNode(id)}
          onFocusRoot={focusRoot}
          onGoToDetail={() => document.getElementById('archive-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      </section>

      <DetailArticle selected={selected} graphRootId={graphRoot.id} onSelect={(id) => selectNode(id)} onFocusRoot={focusRoot} onOpenReader={openReader} />

      <section className="archive-section-grid">
        <section className="archive-panel timeline-panel">
          <div className="panel-heading">
            <div>
              <p className="archive-eyebrow">TIMELINE · NEWEST FIRST</p>
              <h2>최근 주요 사건</h2>
            </div>
            <span className="timeline-order">최신순</span>
          </div>
          <div className="timeline-list">
            {timeline.map((event) => (
              <button key={event.id} onClick={() => selectNode(event.id, true)}>
                <span>{event.subtitle}</span>
                <strong>{event.label}</strong>
                <p>{event.summary}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="archive-panel pressure-panel">
          <div className="panel-heading">
            <div>
              <p className="archive-eyebrow">WORLD PRESSURE</p>
              <h2>현재 압력</h2>
            </div>
          </div>
          <div className="pressure-list">
            {pressureSnapshot.map((pressure) => (
              <article key={pressure.code}>
                <div>
                  <strong>{pressure.label}</strong>
                  <span className={'pressure-level level-' + pressure.level}>{pressure.level}/4</span>
                </div>
                <p>{pressure.summary}</p>
                <small>{pressure.trend === 'UP' ? '↑ 악화 추세' : '→ 현재 안정'}</small>
              </article>
            ))}
          </div>
        </section>
      </section>

        </>
      ) : (
        <CurrentExplorerUnavailable chronicle={activeChronicle} />
      )}

      <footer className="archive-footer">
        <p>Archive policy: {archiveMeta.visibility} · {archiveMeta.syncPolicy} · 기록 시점 {archiveMeta.gameTime}</p>
        <p>읽기 전용 V5 · 현재 {activeChronicle.worldlineId} · Archive revision {archiveMeta.saveVersion} · 숨은 플롯과 GM 전용 상태는 표시하지 않습니다.</p>
      </footer>
    </main>
  )
}
