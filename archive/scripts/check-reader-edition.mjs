import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { makeBooks } from './build-reader-edition.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const archiveNodeSource = await readFile(resolve(root, 'archive', 'web', 'src', 'archive', 'archiveData.ts'), 'utf8')
const archiveNodeIds = new Set([...archiveNodeSource.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]))
for (const book of await makeBooks()) {
  const file = resolve(root, 'archive', 'content', 'stories', book.chronicleId, 'BOOK.json')
  const saved = await readFile(file, 'utf8')
  const expected = JSON.stringify(book, null, 2) + '\n'
  if (saved !== expected) throw new Error(`Generated Reader manifest is stale: ${book.chronicleId}. Run npm run reader:build.`)
  if (book.coverage.included + book.coverage.omitted.length !== book.coverage.verifiedRawParts) throw new Error(`Incomplete Reader coverage accounting: ${book.chronicleId}`)
  for (const chapter of book.chapters) {
    if (!chapter.body.trim() || !chapter.sourceRefs.length || !chapter.archiveSourceRefs.length) throw new Error(`Invalid verified chapter: ${chapter.id}`)
    if (/^(?:두 거점의 기록|화재선과 겨울|첫해의 기록|장기 재편)$/.test(chapter.title)) throw new Error(`Generic editorial chapter title: ${chapter.id}`)
    if (/(?:^|\n)#{2,3}\s*(?:USER|GM|ASSISTANT(?:_PUBLIC_META)?)/m.test(chapter.body)) throw new Error(`Role marker leaked into Reader: ${chapter.id}`)
    if (book.chronicleId === 'C03-AFTERFALL' && chapter.relatedNodeIds.some((id) => !archiveNodeIds.has(id))) throw new Error(`Unresolved Story to Wiki node: ${chapter.id}`)
    if (/(?:filecite|VERBATIM PUSH BLOCKED BY TOOL SAFETY|CURRENT_STATE\.json)/.test(chapter.body)) console.warn(`Reader editorial warning: obvious archive marker in ${chapter.id}`)
  }
}
