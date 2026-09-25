import { describe, expect, it } from 'vitest'
import { archiveNodes } from './archiveData'
import { archiveArticleByNodeId, featuredArchiveArticleIds } from './archiveArticleData'
import { transcriptParts } from './transcriptData'

describe('Archive V7 rich article content', () => {
  it('covers every featured C03 node with substantial readable content', () => {
    const nodeIds = new Set(archiveNodes.map((node) => node.id))
    for (const id of featuredArchiveArticleIds) {
      expect(nodeIds.has(id)).toBe(true)
      const article = archiveArticleByNodeId[id]
      expect(article).toBeTruthy()
      expect(article.lead.length).toBeGreaterThanOrEqual(2)
      expect(article.lead.join(' ').length).toBeGreaterThan(120)
      expect(article.sections.length).toBeGreaterThanOrEqual(1)
      expect(article.timeline.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('points article transcript links only at verified C03 transcript records', () => {
    const byId = new Map(transcriptParts.map((part) => [part.id, part]))
    for (const id of featuredArchiveArticleIds) {
      const article = archiveArticleByNodeId[id]
      for (const transcriptId of article.transcriptPartIds) {
        const part = byId.get(transcriptId)
        expect(part, transcriptId).toBeTruthy()
        expect(part?.chronicleId).toBe('C03-AFTERFALL')
        expect(part?.worldlineId).toBe('AFTERFALL')
        expect(part?.status).not.toBe('missing_transcript')
      }
    }
  })

  it('keeps every article id within the public Archive graph namespace', () => {
    const nodeIds = new Set(archiveNodes.map((node) => node.id))
    expect(Object.keys(archiveArticleByNodeId).every((id) => nodeIds.has(id))).toBe(true)
  })
})
