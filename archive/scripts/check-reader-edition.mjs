import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { makeBooks } from './build-reader-edition.mjs'
import { validateAfterfallS02Publication } from './check-afterfall-s02-publication.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const normalizeEol = (text) => text.replace(/\r\n/g, '\n')
const archiveNodeSource = await readFile(resolve(root, 'archive', 'web', 'src', 'archive', 'archiveData.ts'), 'utf8')
const archiveNodeIds = new Set([...archiveNodeSource.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]))
const recoveryRoot = resolve(root, 'archive', 'content', 'transcripts', 'C03-AFTERFALL', 'S01', 'SHARED_CHAT_RECOVERY')
const recoveryManifest = JSON.parse(await readFile(resolve(recoveryRoot, 'SOURCE_MANIFEST.json'), 'utf8'))
const recoverySnapshotBytes = await readFile(resolve(recoveryRoot, 'SOURCE_PUBLIC_MESSAGES.json'))
const recoverySnapshot = JSON.parse(recoverySnapshotBytes.toString('utf8'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
if (sha256(normalizeEol(recoverySnapshotBytes.toString('utf8'))) !== recoveryManifest.snapshotSha256 || recoverySnapshot.messages.length !== recoveryManifest.publicMessageCount || recoveryManifest.storySceneCount !== 56) throw new Error('Shared-chat source snapshot changed')
for (const part of recoveryManifest.parts) {
  const bytes = await readFile(resolve(recoveryRoot, part.file))
  if (sha256(normalizeEol(bytes.toString('utf8'))) !== part.sha256) throw new Error(`Shared-chat RAW changed: ${part.file}`)
  const content = normalizeEol(bytes.toString('utf8'))
  for (const message of recoverySnapshot.messages.filter((item) => item.linearIndex >= part.firstLinearIndex && item.linearIndex <= part.lastLinearIndex)) {
    if (!content.includes(message.content)) throw new Error(`Shared-chat message ${message.linearIndex} lost from ${part.file}`)
  }
}
const docxRoot = resolve(root, 'archive', 'content', 'transcripts', 'C03-AFTERFALL', 'S01', 'LATE_DOCX_RECOVERY')
const docxManifest = JSON.parse(await readFile(resolve(docxRoot, 'SOURCE_MANIFEST.json'), 'utf8'))
if (sha256(await readFile(resolve(docxRoot, docxManifest.source.archive_path))) !== docxManifest.source.sha256 || sha256(normalizeEol(await readFile(resolve(docxRoot, docxManifest.recovery.raw_file), 'utf8'))) !== docxManifest.recovery.raw_sha256) throw new Error('Late S01 DOCX recovery changed')
await validateAfterfallS02Publication({ sourceRef: process.env.ARCHIVE_AFTERFALL_SOURCE_REF })
for (const book of await makeBooks()) {
  if (book.chronicleId === 'C03-AFTERFALL') {
    const [opening, ...following] = book.chapters
    const preludes = following.slice(0, 8)
    const existing = following.slice(8)
    if (opening?.id !== 'c03-afterfall-opening-01' || opening.chapterNumber !== 0 || !opening.body.startsWith('# S1 — 균열\n\n2026년 9월 18일 13:42')) throw new Error('Recovered C03 opening is not first')
    if (existing.length < 24 || createHash('sha256').update(JSON.stringify(existing.slice(0, 24))).digest('hex') !== 'b23374ad37254bd1484df9a7de91dd56b3f0cbf7c5cef8417864fb00b622cbf8') throw new Error('Existing C03 Reader chapters changed')
    if (/캐릭터 생성|부모의 채무|연애 중|(?:^|\n)## (?:선택|다음 행동)|(?:^|\n)\d+\. 자유행동/m.test(opening.body) || opening.relatedNodeIds.length) throw new Error('Opening choice/setup leaked or historical facts were linked to current graph')
    if (!opening.body.includes('“7번 베드 코드블루!”') || !opening.body.includes('그리고 자동문 너머로 또 구급차 한 대가 들어온다.')) throw new Error('Opening GM prose was lost')
    if (preludes.length !== 8 || preludes.some((chapter, index) => chapter.id !== `c03-afterfall-prelude-${String(index + 1).padStart(2, '0')}` || chapter.relatedNodeIds.length || /(?:^|\n)#{1,4}\s*(?:다음 선택|다음 판단|현재 선택지|\d+[.)])|자유행동|(?:^|\n)## USER/m.test(chapter.body))) throw new Error('Shared-chat Reader backfill contains a choice gate or unstable id')
    if (!preludes[0].body.startsWith('## 14:14 — 병원 밖') || !preludes.at(-1).body.startsWith('## 10월 23일 17:36')) throw new Error('Shared-chat Reader interval is incomplete')
    if (book.beginningStatus !== 'OPENING_PLAY_RECOVERED' || book.beginningGap) throw new Error('Recovered C03 interval still marked missing')
  }
  const file = resolve(root, 'archive', 'content', 'stories', book.chronicleId, 'BOOK.json')
  const saved = await readFile(file, 'utf8')
  const expected = JSON.stringify(book, null, 2) + '\n'
  if (normalizeEol(saved) !== expected) throw new Error(`Generated Reader manifest is stale: ${book.chronicleId}. Run npm run reader:build.`)
  const indexFile = resolve(root, 'archive', 'content', 'stories', book.chronicleId, 'BOOK.index.json')
  const indexSaved = await readFile(indexFile, 'utf8')
  const indexExpected = JSON.stringify({ ...book, chapters: book.chapters.map(({ body, ...chapter }) => chapter) }, null, 2) + '\n'
  if (normalizeEol(indexSaved) !== indexExpected) throw new Error(`Generated Reader index is stale: ${book.chronicleId}. Run npm run reader:build.`)
  if (book.coverage.included + book.coverage.omitted.length !== book.coverage.verifiedRawParts) throw new Error(`Incomplete Reader coverage accounting: ${book.chronicleId}`)
  for (const chapter of book.chapters) {
    if (!chapter.body.trim() || !chapter.sourceRefs.length || !chapter.archiveSourceRefs.length) throw new Error(`Invalid verified chapter: ${chapter.id}`)
    if (/^(?:두 거점의 기록|화재선과 겨울|첫해의 기록|장기 재편)$/.test(chapter.title)) throw new Error(`Generic editorial chapter title: ${chapter.id}`)
    if (/(?:^|\n)#{2,3}\s*(?:USER|GM|ASSISTANT(?:_PUBLIC_META)?)/m.test(chapter.body)) throw new Error(`Role marker leaked into Reader: ${chapter.id}`)
    if (book.chronicleId === 'C03-AFTERFALL' && chapter.relatedNodeIds.some((id) => !archiveNodeIds.has(id))) throw new Error(`Unresolved Story to Wiki node: ${chapter.id}`)
    if (/(?:filecite|VERBATIM PUSH BLOCKED BY TOOL SAFETY|CURRENT_STATE\.json)/.test(chapter.body)) console.warn(`Reader editorial warning: obvious archive marker in ${chapter.id}`)
  }
}
