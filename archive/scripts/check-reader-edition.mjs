import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { makeBooks } from './build-reader-edition.mjs'
import { validateAfterfallS02Publication } from './check-afterfall-s02-publication.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const normalizeEol = (text) => text.replace(/\r\n/g, '\n')
const archiveNodeSource = await readFile(resolve(root, 'archive', 'web', 'src', 'archive', 'archiveData.ts'), 'utf8')
const archiveNodeIds = new Set([...archiveNodeSource.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]))
await validateAfterfallS02Publication({ sourceRef: process.env.ARCHIVE_AFTERFALL_SOURCE_REF })
for (const book of await makeBooks()) {
  if (book.chronicleId === 'C03-AFTERFALL') {
    const [opening, ...existing] = book.chapters
    if (opening?.id !== 'c03-afterfall-opening-01' || opening.chapterNumber !== 0 || !opening.body.startsWith('# S1 — 균열\n\n2026년 9월 18일 13:42')) throw new Error('Recovered C03 opening is not first')
    if (existing.length < 24 || createHash('sha256').update(JSON.stringify(existing.slice(0, 24))).digest('hex') !== 'b23374ad37254bd1484df9a7de91dd56b3f0cbf7c5cef8417864fb00b622cbf8') throw new Error('Existing C03 Reader chapters changed')
    if (/캐릭터 생성|부모의 채무|연애 중|(?:^|\n)## (?:선택|다음 행동)|(?:^|\n)\d+\. 자유행동/m.test(opening.body) || opening.relatedNodeIds.length) throw new Error('Opening choice/setup leaked or historical facts were linked to current graph')
    if (!opening.body.includes('“7번 베드 코드블루!”') || !opening.body.includes('그리고 자동문 너머로 또 구급차 한 대가 들어온다.')) throw new Error('Opening GM prose was lost')
    if (book.beginningStatus !== 'PARTIAL_BEGINNING_RECOVERED' || book.beginningGap?.after !== '2026-09-18 14:12' || book.beginningGap?.before !== '2026-10-23 20:10') throw new Error('Recovered C03 interval is not explicit')
  }
  const file = resolve(root, 'archive', 'content', 'stories', book.chronicleId, 'BOOK.json')
  const saved = await readFile(file, 'utf8')
  const expected = JSON.stringify(book, null, 2) + '\n'
  if (normalizeEol(saved) !== expected) throw new Error(`Generated Reader manifest is stale: ${book.chronicleId}. Run npm run reader:build.`)
  if (book.coverage.included + book.coverage.omitted.length !== book.coverage.verifiedRawParts) throw new Error(`Incomplete Reader coverage accounting: ${book.chronicleId}`)
  for (const chapter of book.chapters) {
    if (!chapter.body.trim() || !chapter.sourceRefs.length || !chapter.archiveSourceRefs.length) throw new Error(`Invalid verified chapter: ${chapter.id}`)
    if (/^(?:두 거점의 기록|화재선과 겨울|첫해의 기록|장기 재편)$/.test(chapter.title)) throw new Error(`Generic editorial chapter title: ${chapter.id}`)
    if (/(?:^|\n)#{2,3}\s*(?:USER|GM|ASSISTANT(?:_PUBLIC_META)?)/m.test(chapter.body)) throw new Error(`Role marker leaked into Reader: ${chapter.id}`)
    if (book.chronicleId === 'C03-AFTERFALL' && chapter.relatedNodeIds.some((id) => !archiveNodeIds.has(id))) throw new Error(`Unresolved Story to Wiki node: ${chapter.id}`)
    if (/(?:filecite|VERBATIM PUSH BLOCKED BY TOOL SAFETY|CURRENT_STATE\.json)/.test(chapter.body)) console.warn(`Reader editorial warning: obvious archive marker in ${chapter.id}`)
  }
}
