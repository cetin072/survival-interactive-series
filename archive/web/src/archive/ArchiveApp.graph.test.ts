import { describe, expect, it } from 'vitest'
import { buildPositions, buildVisibleGraph } from './ArchiveApp'
import { nodeById } from './ExplorerView'

const allTypes = {
  character: true,
  location: true,
  event: true,
  reference: true,
}

describe('AFTERFALL graph exploration', () => {
  it('renders the root and its connected public graph without dangling edges', () => {
    const graph = buildVisibleGraph('char-jinwoo', ['char-jinwoo'], allTypes)
    const visible = new Set(graph.visibleIds)

    expect(visible.has('char-jinwoo')).toBe(true)
    expect(graph.visibleIds.length).toBeGreaterThanOrEqual(5)
    expect(graph.visibleIds.every((id) => nodeById.has(id))).toBe(true)
    expect(nodeById.get('loc-guild-rear-warehouse')?.label).toBe('길드 뒤편 창고')
    expect(graph.visibleEdges.length).toBeGreaterThan(0)
    expect(graph.visibleEdges.every((edge) => visible.has(edge.from) && visible.has(edge.to))).toBe(true)
  })

  it('places every visible node, including the root, inside a usable graph viewport', () => {
    const graph = buildVisibleGraph('char-jinwoo', ['char-jinwoo'], allTypes)
    const positions = buildPositions(graph.visibleIds, graph.depths)

    expect(positions.size).toBe(graph.visibleIds.length)
    expect(positions.get('char-jinwoo')).toEqual({ x: 600, y: 360 })
    for (const position of positions.values()) {
      expect(position.x).toBeGreaterThan(0)
      expect(position.x).toBeLessThan(1200)
      expect(position.y).toBeGreaterThan(0)
      expect(position.y).toBeLessThan(720)
    }
  })
})
