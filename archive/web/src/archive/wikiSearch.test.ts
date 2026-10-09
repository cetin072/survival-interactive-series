import { describe, expect, it } from 'vitest'
import { publicSearchIndex, searchPublicArchive, searchResultGroups } from './wikiSearch'

describe('unified public Wiki search', () => {
  it('searches current Wiki documents from the Graph index', () => {
    const results = searchPublicArchive('서진우')
    expect(results[0]).toMatchObject({ kind: 'wiki', title: '서진우' })
    expect(results.some((entry) => entry.kind === 'wiki' && entry.kindLabel === '작품 삽화' && entry.title.includes('서진우'))).toBe(true)
  })

  it('searches only published Knowledge briefs', () => {
    const results = searchPublicArchive('비상용품')
    expect(results.some((entry) => entry.kind === 'knowledge' && entry.id === 'knowledge:K-002')).toBe(true)
    expect(publicSearchIndex.some((entry) => entry.id === 'knowledge:K-004')).toBe(false)
    expect(publicSearchIndex.some((entry) => entry.id === 'knowledge:K-005')).toBe(false)
  })

  it('shows the short Knowledge label first while keeping the original question searchable', () => {
    const entry = publicSearchIndex.find((item) => item.id === 'knowledge:K-012')
    expect(entry?.title).toBe('재난 지도 정보공개 범위')
    expect(entry?.subtitle).toContain('재난 대응 지도')
    expect(searchPublicArchive('재난 대응 지도').some((item) => item.id === entry?.id)).toBe(true)
  })

  it('finds world events and groups mixed result types', () => {
    const results = searchPublicArchive('화재')
    expect(results.some((entry) => entry.kind === 'wiki' && entry.title === '서쪽 대형화재 방어선')).toBe(true)

    const groups = searchResultGroups(searchPublicArchive('서진우'))
    expect(groups.wiki.length).toBeGreaterThan(0)
    expect(groups.wiki.length).toBeGreaterThan(0)
  })

  it('searches existing practical resources and links to the same public tools page', () => {
    const results = searchPublicArchive('재고 관리표')
    expect(results.some((entry) =>
      entry.kind === 'resource' && entry.title.includes('비상용품·재고 관리표') && entry.href === '/?view=tools')).toBe(true)
    expect(publicSearchIndex.filter((item) => item.kind === 'resource').every((item) => item.kindLabel === '실용 자료')).toBe(true)
  })

  it('returns no fake result for empty queries', () => {
    expect(searchPublicArchive('   ')).toEqual([])
  })
})


it('scopes actual same-node names, work labels and all Wiki result destinations', () => {
  const same = publicSearchIndex.filter(entry => entry.kind==='wiki' && entry.id.endsWith(':char-minseok'));
  expect(same.map(entry => entry.chronicleId).sort()).toEqual(['C01-HAN-JUNHO','C02-STRONGHOLD']);
  expect(new Set(same.map(entry => entry.id)).size).toBe(2);
  expect(same.every(entry => entry.href.includes('chronicle='+entry.chronicleId) && entry.workTitle?.includes('생존기'))).toBe(true);
  expect(searchPublicArchive('박도현').filter(entry=>entry.title.includes('박도현')).map(entry=>entry.title)).toContain('다른 박도현');
  for (const id of ['C01-HAN-JUNHO','C02-STRONGHOLD','C03-AFTERFALL']) {
    expect(publicSearchIndex.some(entry=>entry.chronicleId===id)).toBe(true);
  }
  expect(publicSearchIndex.filter(entry=>entry.kind==='wiki').every(entry=>entry.chronicleId && entry.href.includes('chronicle='+entry.chronicleId))).toBe(true);
  expect(publicSearchIndex.filter(entry=>entry.kindLabel==='작품 삽화').every(entry=>entry.chronicleId==='C03-AFTERFALL')).toBe(true);
  expect(publicSearchIndex.some(entry=>entry.chronicleId?.startsWith('C04') || entry.chronicleId?.startsWith('C05'))).toBe(false);
});
