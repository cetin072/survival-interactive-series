import { useMemo, useState } from 'react'
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
import './archive.css'

const typeLabel: Record<ArchiveNodeType, string> = {
  character: '인물',
  location: '지역',
  event: '사건',
  reference: '자료',
}

const nodeById = new Map(archiveNodes.map((node) => [node.id, node]))

type Neighbor = {
  node: ArchiveNode
  edge: ArchiveEdge
}

function getNeighbors(id: string): Neighbor[] {
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

function GraphExplorer({
  selected,
  onSelect,
}: {
  selected: ArchiveNode
  onSelect: (id: string) => void
}) {
  const neighbors = getNeighbors(selected.id)
  const visible = neighbors.slice(0, 14)
  const centerX = 360
  const centerY = 210
  const radius = visible.length > 9 ? 158 : 148

  return (
    <section className="archive-panel graph-panel" aria-label="연결 그래프">
      <div className="panel-heading">
        <div>
          <p className="archive-eyebrow">NODE EXPLORER</p>
          <h2>연결 따라가기</h2>
        </div>
        <p className="graph-count">{neighbors.length} connections</p>
      </div>

      <div className="graph-canvas">
        <svg viewBox="0 0 720 420" role="img" aria-label={selected.label + ' 연결 관계'}>
          {visible.map(({ node, edge }, index) => {
            const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1) - Math.PI / 2
            const x = centerX + Math.cos(angle) * radius
            const y = centerY + Math.sin(angle) * radius
            const lineX = (centerX + x) / 2
            const lineY = (centerY + y) / 2
            return (
              <g key={edge.from + edge.to + edge.label + index}>
                <line className="graph-edge" x1={centerX} y1={centerY} x2={x} y2={y} />
                <text className="graph-edge-label" x={lineX} y={lineY - 5} textAnchor="middle">
                  {edge.label.length > 9 ? edge.label.slice(0, 9) + '…' : edge.label}
                </text>
              </g>
            )
          })}

          {visible.map(({ node }, index) => {
            const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1) - Math.PI / 2
            const x = centerX + Math.cos(angle) * radius
            const y = centerY + Math.sin(angle) * radius
            const shortLabel = node.label.length > 10 ? node.label.slice(0, 10) + '…' : node.label
            return (
              <g
                key={node.id}
                className={'graph-node graph-node-' + node.type}
                transform={'translate(' + x + ' ' + y + ')'}
                role="button"
                tabIndex={0}
                aria-label={node.label + ' 열기'}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelect(node.id)
                }}
              >
                <circle r="31" />
                <text y="4" textAnchor="middle">{shortLabel}</text>
              </g>
            )
          })}

          <g className={'graph-node graph-node-selected graph-node-' + selected.type} transform={'translate(' + centerX + ' ' + centerY + ')'}>
            <circle r="46" />
            <text y="-3" textAnchor="middle">{selected.label.length > 10 ? selected.label.slice(0, 10) + '…' : selected.label}</text>
            <text className="graph-node-type" y="15" textAnchor="middle">{typeLabel[selected.type]}</text>
          </g>
        </svg>
      </div>

      {neighbors.length > visible.length && (
        <p className="graph-note">연결이 많아 가까운 {visible.length}개만 표시 중입니다. 상세 연결 목록에서는 모두 볼 수 있습니다.</p>
      )}
    </section>
  )
}

function DetailPanel({
  selected,
  onSelect,
}: {
  selected: ArchiveNode
  onSelect: (id: string) => void
}) {
  const neighbors = getNeighbors(selected.id)

  return (
    <article className="archive-panel detail-panel">
      <div className="detail-type">{typeLabel[selected.type]}</div>
      <h1>{selected.label}</h1>
      <p className="detail-subtitle">{selected.subtitle}</p>
      <p className="detail-summary">{selected.summary}</p>

      {selected.meta && (
        <dl className="detail-meta">
          {Object.entries(selected.meta).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="tag-row">
        {selected.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>

      <section className="detail-section">
        <h2>연결</h2>
        <div className="connection-list">
          {neighbors.length === 0 && <p className="archive-muted">아직 공개된 연결이 없습니다.</p>}
          {neighbors.map(({ node, edge }, index) => (
            <button key={node.id + edge.label + index} onClick={() => onSelect(node.id)}>
              <span>{node.label}</span>
              <small>{edge.label}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="detail-section source-section">
        <h2>출처</h2>
        <p>{selected.source}</p>
        <small>PLAYER_SAFE snapshot · GM-only / hidden state 제외</small>
      </section>
    </article>
  )
}

export function ArchiveApp() {
  const [selectedId, setSelectedId] = useState('char-jinwoo')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | ArchiveNodeType>('all')

  const selected = nodeById.get(selectedId) ?? archiveNodes[0]

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

  return (
    <main className="archive-shell">
      <header className="archive-header">
        <div>
          <p className="archive-kicker">SURVIVAL DIARY · {archiveMeta.worldline}</p>
          <h1>{archiveMeta.title}</h1>
          <p className="archive-header-copy">플레이하면서 발견한 세계를 읽고, 연결을 따라 들어가는 기록 열람기.</p>
        </div>
        <div className="archive-header-actions">
          <span className="archive-exit archive-exit-static">READ ONLY</span>
          <div className="archive-runtime">
            <span>{archiveMeta.season}</span>
            <strong>{archiveMeta.gameTime}</strong>
            <small>save v{archiveMeta.saveVersion}</small>
          </div>
        </div>
      </header>

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
                onClick={() => setSelectedId(node.id)}
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

        <div className="archive-main-column">
          <GraphExplorer selected={selected} onSelect={setSelectedId} />
          <DetailPanel selected={selected} onSelect={setSelectedId} />
        </div>
      </section>

      <section className="archive-section-grid">
        <section className="archive-panel timeline-panel">
          <div className="panel-heading">
            <div>
              <p className="archive-eyebrow">TIMELINE</p>
              <h2>최근 주요 사건</h2>
            </div>
          </div>
          <div className="timeline-list">
            {timeline.map((event) => (
              <button key={event.id} onClick={() => setSelectedId(event.id)}>
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

      <footer className="archive-footer">
        <p>Archive policy: {archiveMeta.visibility} · {archiveMeta.syncPolicy}</p>
        <p>읽기 전용 V1 · 숨은 플롯과 GM 전용 상태는 표시하지 않습니다.</p>
      </footer>
    </main>
  )
}
