import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildPositions, buildVisibleGraph } from './ArchiveApp'
import { ExplorerView, nodeById } from './ExplorerView'
import publicGraph from '../../../content/graphs/C03-AFTERFALL/GRAPH.json'

const allTypes = {
  character: true,
  location: true,
  event: true,
  reference: true,
}

describe('AFTERFALL graph exploration', () => {
  it('renders current C before historical B and A using explicit change times', () => {
    const record = publicGraph.nodes.find((item) => item.id === 'char-jo-hansu')!
    const fixture = record as unknown as {
      data: { summary: string; meta?: Record<string, string> }
      history: Array<{ anchor: { game_time: string; save_version: number }; data: unknown; data_sha256: string }>
    }
    const originalData = structuredClone(fixture.data)
    const originalHistory = fixture.history
    try {
      fixture.data.summary = 'SYNTHETIC_STATE_C'
      fixture.data.meta = { 기준시각: '2027-07-05 09:00' }
      fixture.history = [
        { anchor: { game_time: '2027-06-22 11:00', save_version: 2 }, data: { ...originalData, summary: 'SYNTHETIC_STATE_B', meta: { 기준시각: '2027-06-22 11:00' } }, data_sha256: 'b'.repeat(64) },
        { anchor: { game_time: '2027-06-21 17:30', save_version: 1 }, data: { ...originalData, summary: 'SYNTHETIC_STATE_A', meta: { 기준시각: '2027-06-01 09:00' } }, data_sha256: 'a'.repeat(64) },
      ]
      const markup = renderToStaticMarkup(createElement(ExplorerView, { initialNodeId: record.id, onOpenStory: () => {} }))
      const history = markup.slice(markup.indexOf('id="detail-history"'), markup.indexOf('id="detail-relations"'))
      expect(history).toContain('현재 · 2027-07-05 09:00')
      expect(history).toContain('2027-06-01 09:00 · save 1')
      expect(history.indexOf('SYNTHETIC_STATE_C')).toBeLessThan(history.indexOf('SYNTHETIC_STATE_B'))
      expect(history.indexOf('SYNTHETIC_STATE_B')).toBeLessThan(history.indexOf('SYNTHETIC_STATE_A'))
    } finally {
      Object.assign(fixture.data, originalData)
      fixture.history = originalHistory
    }
  })

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
