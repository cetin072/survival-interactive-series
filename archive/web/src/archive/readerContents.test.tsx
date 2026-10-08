import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildReaderContents } from './readerContents'
import { chaptersForChronicle, readerContentsForChronicle, type ReaderChapter } from './storyData'
import { ArchiveApp } from './ArchiveApp'
import { parseArchiveRoute, storyProgressKey } from './readerNavigation'
import { StoryBookReader } from './StoryBookReader'
import * as storyData from './storyData'

const chapter = (id: string, seasonId = 'S01'): ReaderChapter => ({ ...chaptersForChronicle('C03-AFTERFALL')[0], id, seasonId })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('approved Reader contents', () => {
  it('numbers all opening and recovery chapters consecutively within each season', () => {
    const contents = readerContentsForChronicle('C03-AFTERFALL')
    const seasons = [...new Set(chaptersForChronicle('C03-AFTERFALL').map((item) => item.seasonId))]
    expect(contents.groups.map((group) => group.id)).toEqual(seasons.map((seasonId) => `season:${seasonId}`))
    expect(contents.groups.slice(0, 3).map((group) => group.label)).toEqual(['시즌 1', '시즌 2', '시즌 3'])
    expect(contents.groups.slice(3).map((group) => group.label)).toEqual(seasons.slice(3).map((seasonId) => `시즌 ${Number(seasonId?.slice(1))}`))
    for (const group of contents.groups) expect(group.entries.map((entry) => entry.displayNumber)).toEqual(group.entries.map((_, index) => index + 1))
    expect(contents.entries[0].label).toBe('제1장')
    expect(contents.entries[1].label).toBe('제2장')
    expect(contents.entries.find((entry) => entry.chapter.id === 'c03-afterfall-chapter-06')?.label).toBe('제15장')
    expect(contents.entries.map((entry) => entry.chapter.id)).toEqual(chaptersForChronicle('C03-AFTERFALL').map((item) => item.id))
  })
  it('automatically extends an existing season and starts a new public season at one', () => {
    const first = chapter('arbitrary-z')
    const second = { ...chapter('arbitrary-a'), chapterNumber: 900, dateLabel: 'incomplete date' }
    const contents = buildReaderContents([first, second, chapter('future', 'S04')])
    expect(contents.entries.map((entry) => [entry.chapter.id, entry.label])).toEqual([['arbitrary-z', '제1장'], ['arbitrary-a', '제2장'], ['future', '제1장']])
    expect(contents.groups.map((group) => group.label)).toEqual(['시즌 1', '시즌 4'])
  })
  it('renumbers only the affected season when approved input includes a recovered position', () => {
    const first = chapter('first'), last = chapter('last'), other = chapter('other', 'S02')
    const before = buildReaderContents([first, last, other])
    const after = buildReaderContents([first, chapter('recovered'), last, other])
    expect(after.entries.map((entry) => [entry.chapter.id, entry.label])).toEqual([['first', '제1장'], ['recovered', '제2장'], ['last', '제3장'], ['other', '제1장']])
    expect(after.entries.at(-1)).toEqual(before.entries.at(-1))
    expect(after.entries[0].chapter).toBe(first)
    // This accepts an already approved order; it does not guess recovery placement.
  })
  it('preserves other Chronicles and their part boundaries', () => {
    expect(readerContentsForChronicle('C01-HAN-JUNHO').groups[1].entries[0].label).toBe('제1장')
    const contents = readerContentsForChronicle('C02-STRONGHOLD')
    expect(contents.groups.map((group) => group.label)).toEqual(['PART I', 'PART II', 'PART III', 'PART IV'])
    expect(contents.entries.map((entry) => entry.chapter)).toEqual(chaptersForChronicle('C02-STRONGHOLD'))
    expect(contents.groups.every((group) => group.entries[0].displayNumber === 1)).toBe(true)
  })
  it('does not infer a season name from a title or recovery/automatic arc label', () => {
    for (const arcLabel of ['복구된 시작 장면', '공개 플레이 기록', 'arbitrary arc']) {
      expect(buildReaderContents([{ ...chapter('one'), arcLabel, title: 'new title' }]).groups[0].label).toBe('시즌 1')
    }
  })
  it('detects duplicate/missing IDs and retains distinct ranges sharing a source', () => {
    expect(() => buildReaderContents([chapter('same'), chapter('same')])).toThrow(/duplicate/)
    expect(() => buildReaderContents([chapter('')])).toThrow(/Invalid/)
    const chapters = [chapter('a'), chapter('b')]
    expect(chapters[0].sourceRefs).toEqual(chapters[1].sourceRefs)
    expect(buildReaderContents(chapters).entries).toHaveLength(2)
  })
  it('never mutates the source array or chapter objects and retains every ID once', () => {
    const chapters = Object.freeze([Object.freeze(chapter('z')), Object.freeze(chapter('a', 'S02'))])
    const snapshot = JSON.stringify(chapters)
    const contents = buildReaderContents(chapters)
    expect(JSON.stringify(chapters)).toBe(snapshot)
    expect(contents.entries.map((entry) => entry.chapter)).toEqual(chapters)
    expect(contents.entries[0].chapter).toBe(chapters[0])
    expect(contents.groups.flatMap((group) => group.entries).map((entry) => entry.chapter.id)).toEqual(['z', 'a'])
  })
})

describe('shared public Reader shell', () => {
  it('uses one Wiki header and consistent breadcrumb, TOC, heading and pager labels on an existing URL', () => {
    vi.stubGlobal('window', { location: new URL('https://archive.example/?view=story&chronicle=C03-AFTERFALL&chapter=c03-afterfall-chapter-06'), localStorage: { getItem: () => null } })
    const markup = renderToStaticMarkup(createElement(ArchiveApp))
    expect(markup.match(/class="wiki-topbar"/g)).toHaveLength(1)
    expect(markup).not.toContain('archive-header')
    expect(markup).toContain('시즌 1 · 제15장')
    expect(markup).toContain('제14장 산림교육원')
    expect(markup).toContain('제16장 교환지의 사람들')
    expect(markup).toContain('aria-current="page" data-chapter-id="c03-afterfall-chapter-06"')
    expect(markup).toContain('생존기 소개')
    expect(markup).toContain('이야기 목록')
    expect(markup).toContain('class="book-toc-group" open=""')
    expect(markup).not.toContain('초기 기록 1')
    expect(markup).not.toContain('복구된 시작 장면')
  })
  it('preserves ID-based bookmarks and explicit URL priority', () => {
    const storage = { getItem: (key: string) => key === storyProgressKey('C03-AFTERFALL') ? 'c03-afterfall-chapter-06' : null }
    expect(parseArchiveRoute('?view=story&chronicle=C03-AFTERFALL', storage)).toMatchObject({ chapterId: 'c03-afterfall-chapter-06' })
    expect(parseArchiveRoute('?view=story&chronicle=C03-AFTERFALL&chapter=c03-afterfall-opening-01', storage)).toMatchObject({ chapterId: 'c03-afterfall-opening-01' })
  })
  it('shows a normal empty public edition with the shared shell', () => {
    vi.spyOn(storyData, 'readerContentsForChronicle').mockReturnValue(buildReaderContents([]))
    const markup = renderToStaticMarkup(createElement(StoryBookReader, { chronicleId: 'C03-AFTERFALL', onChapterChange: vi.fn(), onOpenNode: vi.fn(), onBack: vi.fn(), onOpenChronicle: vi.fn() }))
    expect(markup).toContain('role="status">아직 공개된 장이 없습니다.')
    expect(markup).toContain('wiki-topbar')
  })
})
