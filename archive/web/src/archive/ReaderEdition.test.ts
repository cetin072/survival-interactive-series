import { describe, expect, it } from 'vitest'
import { primaryNavigationLabels } from './ArchiveApp'
import { chronicleBooks, chaptersForChronicle, cleanReaderProse, readerChapters } from './storyData'

describe('Reader Edition information architecture', () => {
  it('keeps only World Explorer and Story Reader in primary navigation', () => {
    expect(primaryNavigationLabels).toEqual(['세계 탐색', '이야기 읽기'])
    expect(primaryNavigationLabels).not.toContain('원문 읽기')
    expect(primaryNavigationLabels).not.toContain('지난 생존기')
  })

  it('publishes C01, C02, and C03 as three independent books with one active chronicle', () => {
    expect(chronicleBooks.map((book) => book.chronicleId)).toEqual(['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL'])
    expect(chronicleBooks.filter((book) => book.active)).toHaveLength(1)
    expect(chronicleBooks.find((book) => book.active)?.chronicleId).toBe('C03-AFTERFALL')
  })

  it('uses isolated source namespaces and never makes a reader chapter from RAW UI text', () => {
    expect(chaptersForChronicle('C01-HAN-JUNHO').every((chapter) => chapter.sourceRefs.every((source) => source.startsWith('seasons/')))).toBe(true)
    expect(chaptersForChronicle('C02-STRONGHOLD').every((chapter) => chapter.sourceRefs.every((source) => source.startsWith('worldlines/STRONGHOLD/')))).toBe(true)
    expect(chaptersForChronicle('C03-AFTERFALL').every((chapter) => !chapter.sourceRefs.some((source) => source.includes('STRONGHOLD') || source.startsWith('seasons/')))).toBe(true)
    expect(readerChapters.flatMap((chapter) => chapter.paragraphs).join('\n')).not.toMatch(/(?:USER|GM|ASSISTANT_PUBLIC_META|PART_\d+|SESSION_)/)
  })

  it('removes game choice gates from publication prose', () => {
    expect(cleanReaderProse('밤이 깊어졌다.\n1. 문을 연다\n2. 기다린다\n어떻게 할까?')).toBe('밤이 깊어졌다.')
  })
})
