import { describe, expect, it } from 'vitest'
import { archiveRouteUrl, parseArchiveRoute, rawProgressKey, resolveReaderRoute, savedReaderId, selectReaderItem, storyProgressKey, type ArchiveRoute, type ReaderStorage } from './readerNavigation'
import { chaptersForChronicle } from './storyData'
import { transcriptPartsFor } from './transcriptData'
import { messagesFromRaw } from './RawTranscriptReader'

const memory = (values: Record<string, string>): ReaderStorage => ({ getItem: (key) => values[key] ?? null })
const ids = ['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL'] as const
const bookRoute = (route: ArchiveRoute) => { if (route.view !== 'book') throw new Error('Expected book route'); return route }
const rawRoute = (route: ArchiveRoute) => { if (route.view !== 'raw') throw new Error('Expected RAW route'); return route }

describe('one-source Reader navigation', () => {
  it('gives an explicit item priority over an older bookmark', () => {
    expect(selectReaderItem([{ id: 'old' }, { id: 'clicked' }], 'clicked', 'old')?.id).toBe('clicked')
  })
  it('uses only valid same-list fallbacks and handles empty input', () => {
    expect(selectReaderItem([{ id: 'first' }, { id: 'saved' }], 'foreign', 'saved')?.id).toBe('saved')
    expect(selectReaderItem([{ id: 'first' }], 'foreign', 'stale')?.id).toBe('first')
    expect(selectReaderItem([], 'stale', 'stale')).toBeUndefined()
  })
  for (const id of ids) {
    it(`${id}: explicit chapter wins; plain book URL resumes its own bookmark`, () => {
      const chapters = chaptersForChronicle(id)
      const selected = chapters[1].id
      const stored = chapters.at(-1)!.id
      const storage = memory({ [storyProgressKey(id)]: stored })
      expect(bookRoute(parseArchiveRoute(`?view=story&chronicle=${id}&chapter=${selected}`, storage)).chapterId).toBe(selected)
      expect(bookRoute(parseArchiveRoute(`?view=story&chronicle=${id}`, storage)).chapterId).toBe(stored)
      expect(bookRoute(resolveReaderRoute({ view: 'book', chronicleId: id, chapterId: selected }, storage)).chapterId).toBe(selected)
    })
    it(`${id}: explicit PART wins and legacy reader links stay compatible`, () => {
      const parts = transcriptPartsFor(id)
      const requested = parts[1].id
      const storage = memory({ [rawProgressKey(id)]: JSON.stringify({ partId: parts.at(-1)!.id, scrollY: 400 }) })
      expect(rawRoute(parseArchiveRoute(`?view=raw&chronicle=${id}&part=${requested}`, storage)).partId).toBe(requested)
      expect(parseArchiveRoute(`?view=reader&chronicle=${id}&part=${requested}`, storage)).toMatchObject({ view: 'raw', chronicleId: id, partId: requested })
      expect(rawRoute(parseArchiveRoute(`?view=raw&chronicle=${id}`, storage)).partId).toBe(parts.at(-1)!.id)
    })
  }
  it('does not treat corrupt, null or non-string RAW bookmark data as an ID', () => {
    for (const value of ['{broken', 'null', '7', '"text"', '{"partId":42}']) {
      expect(savedReaderId(memory({ key: value }), 'key', true)).toBeUndefined()
    }
  })
  it('keeps navigation usable when storage access is denied', () => {
    const blocked: ReaderStorage = { getItem: () => { throw new Error('SecurityError') } }
    expect(bookRoute(parseArchiveRoute('?view=story&chronicle=C01-HAN-JUNHO', blocked)).chapterId).toBe(chaptersForChronicle('C01-HAN-JUNHO')[0].id)
    expect(rawRoute(parseArchiveRoute('?view=raw&chronicle=C03-AFTERFALL', blocked)).partId).toBe(transcriptPartsFor('C03-AFTERFALL')[0].id)
  })
  it('does not borrow another Chronicle bookmark', () => {
    const storage = memory({ [storyProgressKey('C01-HAN-JUNHO')]: chaptersForChronicle('C01-HAN-JUNHO')[2].id })
    expect(bookRoute(parseArchiveRoute('?view=story&chronicle=C02-STRONGHOLD', storage)).chapterId).toBe(chaptersForChronicle('C02-STRONGHOLD')[0].id)
  })
  it('canonicalizes invalid links safely and preserves the legacy bookshelf', () => {
    expect(parseArchiveRoute('?view=past').view).toBe('story')
    expect(parseArchiveRoute('?view=story').view).toBe('story')
    const parsed = parseArchiveRoute('?view=story&chronicle=INVALID&chapter=missing')
    expect(parsed.chronicleId).toBe('C03-AFTERFALL')
    expect(bookRoute(parsed).chapterId).toBe(chaptersForChronicle('C03-AFTERFALL')[0].id)
  })
  it('routes the root to the Chronicle hub and keeps shared and operator routes distinct', () => {
    expect(parseArchiveRoute('').view).toBe('home')
    expect(parseArchiveRoute('?view=story').view).toBe('story')
    expect(parseArchiveRoute('?view=tools').view).toBe('tools')
    expect(parseArchiveRoute('?view=media').view).toBe('media')
    expect(parseArchiveRoute('', undefined, '/operator/')).toMatchObject({ view: 'operator' })
    expect(parseArchiveRoute('', undefined, '/operator/visuals/')).toMatchObject({ view: 'operator-visuals' })
    expect(archiveRouteUrl({ view: 'operator-visuals', chronicleId: 'C03-AFTERFALL' }, 'https://archive.example/operator/').pathname).toBe('/operator/visuals/')
    expect(parseArchiveRoute('?view=chronicle&chronicle=C01-HAN-JUNHO').view).toBe('chronicle')
    expect(parseArchiveRoute('?view=chronicle&chronicle=C03-AFTERFALL&section=not-a-section')).toMatchObject({ view: 'chronicle', section: 'overview' })
  })
  it('preserves old graph links and writes Chronicle room routes without replacing Reader URLs', () => {
    const explorer = parseArchiveRoute('?view=archive&node=char-jinwoo')
    expect(explorer).toMatchObject({ view: 'archive', chronicleId: 'C03-AFTERFALL', nodeId: 'char-jinwoo' })
    const room = parseArchiveRoute('?view=chronicle&chronicle=C02-STRONGHOLD&section=reader')
    const url = archiveRouteUrl(room, 'https://archive.example/old?view=story#section')
    expect(url.pathname).toBe('/')
    expect(url.search).toBe('?view=chronicle&chronicle=C02-STRONGHOLD&section=reader')
    const oldReader = archiveRouteUrl(parseArchiveRoute('?view=story&chronicle=C01-HAN-JUNHO'), 'https://archive.example/')
    expect(oldReader.search).toContain('view=story')
    expect(oldReader.search).toContain('chronicle=C01-HAN-JUNHO')
  })
  it('roundtrips a chapter/PART without retaining a stale article hash', () => {
    for (const query of ['?view=story&chronicle=C02-STRONGHOLD', '?view=raw&chronicle=C03-AFTERFALL']) {
      const route = parseArchiveRoute(query)
      const url = archiveRouteUrl(route, 'https://archive.example/?old=1#detail-history')
      expect(url.hash).toBe('')
      expect(parseArchiveRoute(url.search)).toEqual(route)
    }
  })
})

describe('RAW presentation supports the real preserved header formats', () => {
  it('renders bare, numbered, suffixed and public-meta blocks in order', () => {
    const raw = '# Archive header\n\n## USER 001\n선택\n\n## GM 001-B\n장면\n\n### ASSISTANT_PUBLIC_META 002\n공개 설명\n\n### USER\n2\n\n### GM\n다음 장면'
    expect(messagesFromRaw(raw).map((message) => message.role)).toEqual(['player', 'gm', 'system_public', 'player', 'gm'])
    expect(messagesFromRaw(raw).map((message) => message.content)).toEqual(['선택', '장면', '공개 설명', '2', '다음 장면'])
  })
  it('retains public GM operation blocks in RAW without putting them in Reader', () => {
    const messages = messagesFromRaw('## GM 001-A — 공개 진행 알림\n저장 안내\n\n## GM 001-B\n## 2월 24일\n이사했다.')
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('저장 안내')
    expect(messages[1].content).toContain('이사했다.')
  })
  it('renders the actual C03 numbered S01 and S02 finale source instead of a blank body', () => {
    for (const id of ['c03-s01-001', 'c03-s02-session-009-001', 'c03-s02-session-009-002']) {
      const part = [...transcriptPartsFor('C03-AFTERFALL')].find((item) => item.id === id)
      expect(part?.status).toBe('verified_transcript')
      const original = part!.content!
      expect(messagesFromRaw(original).some((message) => message.role === 'gm' && message.content.length > 50)).toBe(true)
      expect(part!.content).toBe(original)
    }
  })
})
