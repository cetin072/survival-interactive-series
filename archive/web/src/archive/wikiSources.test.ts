import { describe, expect, it } from 'vitest'
import publicGraph from '../../../content/graphs/C03-AFTERFALL/GRAPH.json'
import { buildWikiDocument, wikiHistoryForRecord, type WikiGraphRecord } from './wikiDocument'
import { wikiSourcesForRecord } from './wikiSources'

const amendmentRef = 'archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_AMENDMENT_SESSION_008_20261005.json'
const record = publicGraph.nodes.find((item) => item.id === 'event-wiki-df3c90d6f885fdb269cd38d3')!
describe('published Wiki source links', () => {
  it('connects every published SESSION_007/008 fact revision to the matching Reader chapter and public RAW', () => {
    const records = publicGraph.nodes.flatMap((item) =>
      [item, ...(item.history ?? [])]
        .filter((revision) => /AWIKI_SESSION_00[78]_/.test(revision.evidence.source_ref))
        .map((revision) => ({ id: item.id, evidence: revision.evidence, current: revision === item })))
    expect(records).toHaveLength(15)
    for (const record of records) {
      const session = record.evidence.source_ref.includes('AWIKI_SESSION_007_') ? '007' : '008'
      const sources = wikiSourcesForRecord(record)
      expect(sources.length, record.id).toBeGreaterThan(0)
      expect(sources.every((source) => source.partId === `c03-s03-session-${session}-001`)).toBe(true)
      expect(sources.every((source) => source.archiveSourceRef === `archive/content/transcripts/C03-AFTERFALL/S03/SESSION_${session}/PART_001.md`)).toBe(true)
      if (record.current) {
        const document = buildWikiDocument(record.id)
        expect(document.relatedChapter?.id).toBe(sources[0].chapterId)
        expect(document.transcriptPartIds).toContain(sources[0].partId)
      }
    }
  })

  it('does not accept a fact hash or pointer that points to a different node', () => {
    expect(wikiSourcesForRecord({ ...record, evidence: { ...record.evidence, source_sha256: '0'.repeat(64) } })).toEqual([])
    expect(wikiSourcesForRecord({ ...record, evidence: { ...record.evidence, pointer: '/nodes/1' } })).toEqual([])
    expect(wikiSourcesForRecord({ ...record, evidence: { ...record.evidence, source_ref: 'S03 SESSION_007 GM 공개 블록 001' } })).toEqual([])
  })

  it('links the five amended profile revisions to their exact public source while preserving current documents', () => {
    for (const id of ['char-jinwoo', 'char-eunchae', 'char-hayoung', 'char-mingyu', 'char-taehoon']) {
      const document = buildWikiDocument(id)
      expect(document.history.length, id).toBeGreaterThan(1)
      expect(document.history[0].current).toBe(true)
      expect(document.history[0].summary).toBe(document.summary)
      expect(document.history.some((item) => !item.current && item.summary)).toBe(true)
      const node = publicGraph.nodes.find((item) => item.id === id)!
      const revisions = [node, ...node.history].filter((revision) => revision.evidence.source_ref === amendmentRef)
      expect(revisions, id).toHaveLength(1)
      const sources = wikiSourcesForRecord({ id, evidence: revisions[0].evidence })
      expect(sources.length, id).toBeGreaterThan(0)
      expect(sources.every((source) => source.partId === 'c03-s03-session-008-001')).toBe(true)
      expect(document.history.some((item) => item.summary === revisions[0].data?.summary
        && JSON.stringify(item.sources) === JSON.stringify(sources)), id).toBe(true)
      expect(document.history[0].sources).toEqual(wikiSourcesForRecord(node))
    }
  })
  it('keeps amended source links on the historical row after a later character update', () => {
    const node = publicGraph.nodes.find((item) => item.id === 'char-jinwoo')! as WikiGraphRecord
    const updated: WikiGraphRecord = {
      ...node, data: { ...node.data, summary: 'SYNTHETIC_TEST_ONLY future character update' },
      anchor: { ...node.anchor, save_version: node.anchor.save_version + 1 },
      evidence: { source_ref: 'SYNTHETIC_TEST_ONLY', source_sha256: 'f'.repeat(64), pointer: '/nodes/0' },
      history: [...node.history, { data: node.data, anchor: node.anchor, evidence: node.evidence }],
    }
    const history = wikiHistoryForRecord(updated)
    expect(history[0].current).toBe(true)
    expect(history[0].sources).toEqual([])
    const sources = wikiSourcesForRecord(node)
    expect(sources.length).toBeGreaterThan(0)
    expect(history.some((item) => !item.current && item.summary === node.data.summary
      && JSON.stringify(item.sources) === JSON.stringify(sources))).toBe(true)
  })
})
