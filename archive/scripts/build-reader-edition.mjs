import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const out = (...parts) => resolve(root, 'archive', 'content', 'stories', ...parts)

/** Selection only: preserve GM text, discard only trailing play UI. */
export function removeTrailingChoiceGate(gm) {
  const lines = gm.split('\n')
  const cue = /^(?:#{1,4}\s*)?(?:선택|행동|다음 선택|다음 행동|어떻게 할까\??|무엇을 할까\??|결정)\s*$/
  let start = lines.findIndex((line, i) => i >= Math.floor(lines.length * .55) && cue.test(line.trim()))
  if (start < 0) {
    const optionPattern = /^(?:#{1,4}\s*)?(?:\*\*)?(?:\d+\.|[A-D][.)]|[①-⑳])\s+/
    const option = lines.findIndex((line, i) => i >= Math.floor(lines.length * .55) && optionPattern.test(line.trim()))
    if (option >= 0 && lines.slice(option).filter(line => optionPattern.test(line.trim())).length >= 2) {
      start = option
      if (/(?:문제다|선택|어디|어떻게)/.test(lines[option - 1]?.trim() ?? '')) start--
    } else return gm.trim()
  }
  for (let i = start - 1; i >= Math.max(0, start - 24); i--) {
    const line = lines[i].trim()
    if (/^#{1,4}\s*(?:현재|현재 상태)\s*$/.test(line)) { start = i; break }
    if (/^(?:\d+\.|[A-D][.)]|[①-⑳])\s+/.test(line) || line === '') { start = i; continue }
    break
  }
  return lines.slice(0, start).join('\n').replace(/\s+$/, '')
}

export function extractReaderNarrativeFromGm(raw) {
  const speaker = /^(#{2,3})\s*(USER|GM|ASSISTANT(?:_PUBLIC_META)?)(?:\s*[—-].*)?\s*$/gmi
  const marks = [...raw.matchAll(speaker)]
  return marks.flatMap((mark, index) => {
    if (mark[2].toUpperCase() !== 'GM') return []
    const end = marks[index + 1]?.index ?? raw.length
    const block = raw.slice(mark.index + mark[0].length, end).replace(/^\s+|\s+$/g, '')
    return /(?:게임|버그|시스템 수정 모드|참고하되)/.test(block) ? [] : [removeTrailingChoiceGate(block)]
  }).filter(Boolean).join('\n\n')
}

const books = [
  { chronicleId: 'C01-HAN-JUNHO', title: '한준호의 생존기', subtitle: '흩어진 가족이 살아남는 길', description: '산불과 정전이 겹친 첫날의 공개 GM 기록.', protagonist: '한준호', worldlineId: 'CANON-V2', sourceRoot: 'seasons_v2', groups: [
    { id: 'c01-first-night', seasonId: 'S01', title: '붉은 하늘', subtitle: '가족이 흩어진 첫날', dateLabel: '2026년 9월 3일', files: ['seasons_v2/S01/raw_transcript/PART_001.md', 'seasons_v2/S01/raw_transcript/PART_002.md'] },
    { id: 'c01-shelter', seasonId: 'S01', title: '첫날 밤', subtitle: '피난과 합류', dateLabel: '시즌 1', files: ['seasons_v2/S01/raw_transcript/PART_003.md', 'seasons_v2/S01/raw_transcript/PART_004.md'] },
  ] },
  { chronicleId: 'C02-STRONGHOLD', title: '박도현의 생존기', subtitle: '거점을 지키며 이어진 기록', description: '연속된 시간대의 공개 GM 기록.', protagonist: '박도현', worldlineId: 'STRONGHOLD', sourceRoot: 'worldlines/STRONGHOLD', groups: [
    { id: 'c02-outskirts', partId: 'PART I', arcLabel: '외곽의 집', title: '첫 외곽집', subtitle: '2031년의 첫 방', dateLabel: '2031년 2월~3월', files: ['archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_2031_02_TO_2031_03_ROOM_20260925/PART_001.md', 'archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_2031_02_TO_2031_03_ROOM_20260925/PART_002.md'], sourceRefs: ['worldlines/STRONGHOLD/ROOM_ARCHIVE_2031_02_TO_2031_03.md'] },
    { id: 'c02-spring', partId: 'PART II', arcLabel: '두 거점', title: '다음 방어선', subtitle: '2032년 봄과 여름', dateLabel: '2032년', files: ['archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_C02_2032_SPRING_SUMMER_ROOM_20260925/PART_001.md', 'archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_C02_2032_SPRING_SUMMER_ROOM_20260925/PART_002.md'], sourceRefs: ['worldlines/STRONGHOLD/ROOM_ARCHIVE_2031_03_TO_2032_01.md'] },
  ] },
  { chronicleId: 'C03-AFTERFALL', title: '서진우의 생존기', subtitle: '두 거점과 겨울의 기록', description: 'AFTERFALL 공개 플레이의 GM 장면.', protagonist: '서진우', worldlineId: 'AFTERFALL', sourceRoot: 'worldlines/AFTERFALL', groups: [
    { id: 'c03-fireline', seasonId: 'S02', title: '서쪽 화재권', subtitle: '무너지지 않기 위한 철수선', dateLabel: '2026년 11월 22일', files: ['archive/content/transcripts/C03-AFTERFALL/S02/SESSION_001/PART_001.md'], sourceRefs: ['archive/content/transcripts/C03-AFTERFALL/S02/SESSION_001/PART_001.md'] },
    { id: 'c03-winter', seasonId: 'S02', title: '겨울의 첫 대화', subtitle: '남아 있는 길을 확인하다', dateLabel: '2027년 1월', files: ['archive/content/transcripts/C03-AFTERFALL/S02/SESSION_002/PART_001.md', 'archive/content/transcripts/C03-AFTERFALL/S02/SESSION_002/PART_002.md'], sourceRefs: ['archive/content/transcripts/C03-AFTERFALL/S02/SESSION_002/PART_001.md', 'archive/content/transcripts/C03-AFTERFALL/S02/SESSION_002/PART_002.md'] },
  ] },
]

for (const book of books) {
  const chapters = []
  for (const [index, group] of book.groups.entries()) {
    const raw = await Promise.all(group.files.map(file => readFile(resolve(root, file), 'utf8')))
    chapters.push({ id: group.id, chapterNumber: index + 1, title: group.title, subtitle: group.subtitle, dateLabel: group.dateLabel, seasonId: group.seasonId, partId: group.partId, arcLabel: group.arcLabel, sourceKind: 'VERIFIED_GM_NARRATIVE', sourceRefs: group.sourceRefs ?? group.files, transformVersion: 'reader-selection-v1.1', relatedNodeIds: [], body: extractReaderNarrativeFromGm(raw.join('\n\n')) })
  }
  const file = out(book.chronicleId, 'BOOK.json')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ ...book, groups: undefined, transformVersion: 'reader-selection-v1.1', chapters }, null, 2) + '\n')
}
