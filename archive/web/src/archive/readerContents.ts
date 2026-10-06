import type { ReaderChapter } from './storyData'

export type ReaderEntry = {
  chapter: ReaderChapter
  groupId: string
  groupLabel: string
  displayNumber: number
  label: string
}
export type ReaderGroup = { id: string; label: string; entries: ReaderEntry[] }

/** BOOK order is the approved editorial order. Numbers are presentation only. */
export function buildReaderContents(chapters: readonly ReaderChapter[]) {
  const groups: ReaderGroup[] = []
  const entries: ReaderEntry[] = []
  const ids = new Set<string>()
  let seasonCount = 0
  for (const chapter of chapters) {
    if (!chapter.id || ids.has(chapter.id)) throw new Error('Invalid or duplicate Reader chapter ID: ' + chapter.id)
    ids.add(chapter.id)
    const groupId = chapter.seasonId ? 'season:' + chapter.seasonId : chapter.partId ? 'part:' + chapter.partId : 'record'
    let group = groups.find((item) => item.id === groupId)
    if (!group) {
      if (chapter.seasonId) seasonCount++
      const seasonNumber = chapter.seasonId ? Number(/^S(\d+)$/.exec(chapter.seasonId)?.[1]) || seasonCount : undefined
      const label = chapter.seasonId ? `시즌 ${seasonNumber}` : chapter.partId ?? '기록'
      group = { id: groupId, label, entries: [] }
      groups.push(group)
    }
    const displayNumber = group.entries.length + 1
    const entry = { chapter, groupId, groupLabel: group.label, displayNumber, label: `제${displayNumber}장` }
    group.entries.push(entry)
    entries.push(entry)
  }
  return { groups, entries }
}
