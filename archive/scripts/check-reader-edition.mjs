import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { makeBooks } from './build-reader-edition.mjs'

const root = resolve(import.meta.dirname, '..', '..')
for (const book of await makeBooks()) {
  const file = resolve(root, 'archive', 'content', 'stories', book.chronicleId, 'BOOK.json')
  const saved = await readFile(file, 'utf8')
  const expected = JSON.stringify(book, null, 2) + '\n'
  if (saved !== expected) throw new Error(`Generated Reader manifest is stale: ${book.chronicleId}. Run npm run reader:build.`)
  for (const chapter of book.chapters) {
    if (!chapter.body.trim() || !chapter.sourceRefs.length || !chapter.archiveSourceRefs.length) throw new Error(`Invalid verified chapter: ${chapter.id}`)
  }
}
