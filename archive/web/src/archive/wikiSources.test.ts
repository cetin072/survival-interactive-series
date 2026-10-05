import { describe, expect, it } from 'vitest'
import publicGraph from '../../../content/graphs/C03-AFTERFALL/GRAPH.json'
import { buildWikiDocument } from './wikiDocument'
import { wikiSourcesForRecord } from './wikiSources'

const record = publicGraph.nodes.find((item) => item.id === 'event-wiki-df3c90d6f885fdb269cd38d3')!
describe('published Wiki source links', () => {
  it('connects every published SESSION_007/008 fact node to the matching Reader chapter and public RAW', () => {
    const records = publicGraph.nodes.filter((item) => /AWIKI_SESSION_00[78]_/.test(item.evidence.source_ref))
    expect(records).toHaveLength(15)
    for (const record of records) {
      const session = record.evidence.source_ref.includes('AWIKI_SESSION_007_') ? '007' : '008'
      const sources = wikiSourcesForRecord(record)
      expect(sources.length, record.id).toBeGreaterThan(0)
      expect(sources.every((source) => source.partId === `c03-s03-session-${session}-001`)).toBe(true)
      expect(sources.every((source) => source.archiveSourceRef === `archive/content/transcripts/C03-AFTERFALL/S03/SESSION_${session}/PART_001.md`)).toBe(true)
      const document = buildWikiDocument(record.id)
      expect(document.relatedChapter?.id).toBe(sources[0].chapterId)
      expect(document.transcriptPartIds).toContain(sources[0].partId)
    }
  })

  it('does not accept a fact hash or pointer that points to a different node', () => {
    expect(wikiSourcesForRecord({ ...record, evidence: { ...record.evidence, source_sha256: '0'.repeat(64) } })).toEqual([])
    expect(wikiSourcesForRecord({ ...record, evidence: { ...record.evidence, pointer: '/nodes/1' } })).toEqual([])
    expect(wikiSourcesForRecord({ ...record, evidence: { ...record.evidence, source_ref: 'S03 SESSION_007 GM 공개 블록 001' } })).toEqual([])
  })

  it('links the five amended current profiles to their exact public source while preserving their prior state', () => {
    for (const id of ['char-jinwoo', 'char-eunchae', 'char-hayoung', 'char-mingyu', 'char-taehoon']) {
      const document = buildWikiDocument(id)
      expect(document.history.length, id).toBeGreaterThan(1)
      expect(document.history[0].current).toBe(true)
      expect(document.history[0].summary).toBe(document.summary)
      expect(document.history.some((item) => !item.current && item.summary)).toBe(true)
      expect(document.history[0].sources[0]?.partId, id).toBe('c03-s03-session-008-001')
    }
  })
})
