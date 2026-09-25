import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { extractReaderNarrative } from './lib/reader-transform.mjs'
import { bookMetadata, rawCatalog } from './reader-source-catalog.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const transformVersion = 'reader-selection-v1.1.0'
const hash = (text) => createHash('sha256').update(text).digest('hex')
const output = (...parts) => resolve(root, 'archive', 'content', 'stories', ...parts)
const related = (id, index, group) => id !== 'C03-AFTERFALL' ? [] : ['char-jinwoo', group === 'S02' ? 'char-taehoon' : 'loc-nw-center', group === 'S02' && index < 12 ? 'event-fireline' : 'event-winter-council']

function makeChapters(chronicleId, parts) {
  const groups = []
  for (const part of parts) {
    let group = groups.at(-1)
    if (!group || group.id !== part.group || (group.size > 18000 && group.parts.length)) { group = { id: part.group, title: part.title, size: 0, parts: [] }; groups.push(group) }
    group.parts.push(part); group.size += part.selected.body.length
  }
  return groups.map((group, index) => {
    const body = group.parts.map((part) => part.selected.body).join('\n\n').trim()
    if (!body || !group.parts.every((part) => part.selected.gmBlocks > 0)) throw new Error(`${chronicleId} chapter ${index + 1} is not a non-empty VERIFIED_GM_NARRATIVE chapter`)
    return { id: `${chronicleId.toLowerCase()}-${group.id.toLowerCase().replace(/\s+/g, '-')}-chapter-${String(index + 1).padStart(2, '0')}`, chapterNumber: index + 1, title: group.title, subtitle: `공개 기록 ${group.parts.length}건`, dateLabel: group.id, ...(chronicleId === 'C02-STRONGHOLD' ? { partId: group.id, arcLabel: group.title } : { seasonId: group.id }), sourceKind: 'VERIFIED_GM_NARRATIVE', sourceRefs: group.parts.map((part) => part.canonicalRef), archiveSourceRefs: group.parts.map((part) => part.archivePath), sourceHashes: group.parts.map((part) => part.sourceHash), supportingRefs: [], transformVersion, relatedNodeIds: related(chronicleId, index, group.id), body }
  })
}

export async function makeBooks() {
  const books = []
  for (const [chronicleId, catalog] of Object.entries(rawCatalog)) {
    const included = [], omitted = []
    for (const item of catalog) {
      const raw = await readFile(resolve(root, item.archivePath), 'utf8')
      const selected = extractReaderNarrative(raw, { details: true })
      const part = { ...item, selected, sourceHash: hash(raw) }
      if (selected.body && selected.gmBlocks > 0) included.push(part)
      else omitted.push({ sourceRef: item.canonicalRef, archiveSourceRef: item.archivePath, reason: selected.classifications.some((x) => x.classification === 'design_meta') ? 'design_meta_only' : 'operational_meta_or_no_eligible_gm_prose' })
    }
    const chapters = makeChapters(chronicleId, included)
    if (chapters.some((chapter) => !chapter.sourceRefs.length || !chapter.body.trim())) throw new Error(`${chronicleId} emitted a zero-length chapter`)
    books.push({ chronicleId, ...bookMetadata[chronicleId], transformVersion, coverage: { verifiedRawParts: catalog.length, scanned: catalog.length, eligibleGmProse: included.length, included: included.length, omitted }, chapters })
  }
  return books
}

export async function writeBooks() { for (const book of await makeBooks()) { const file = output(book.chronicleId, 'BOOK.json'); await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(book, null, 2) + '\n') } }
if (process.argv[1]?.endsWith('build-reader-edition.mjs')) await writeBooks()
