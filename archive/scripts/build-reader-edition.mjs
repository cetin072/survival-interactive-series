import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { extractReaderNarrative } from './lib/reader-transform.mjs'
import { bookMetadata, rawCatalog } from './reader-source-catalog.mjs'
import { editorialOverrides, editorialPlan } from './reader-editorial-map.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const transformVersion = 'reader-selection-v1.2.0'
const hash = (text) => createHash('sha256').update(text).digest('hex')
const normalizeEol = (text) => text.replace(/\r\n/g, '\n')
const output = (...parts) => resolve(root, 'archive', 'content', 'stories', ...parts)
function anchor(text, marker, path) { const index = text.indexOf(marker); if (index < 0) throw new Error(`Editorial anchor missing in ${path}: ${marker}`); return index }
function editedBody(part) { let body = part.selected.body; const before = editorialOverrides.trimBefore[part.archivePath]; if (before) body = body.slice(anchor(body, before, part.archivePath)); const after = editorialOverrides.trimAfter[part.archivePath]; return after ? body.slice(0, anchor(body, after, part.archivePath)).trim() : body.trim() }
function selectRange(part, selector) { const start = selector.from ? anchor(part.readerBody, selector.from, part.archivePath) : 0; const end = selector.before ? anchor(part.readerBody, selector.before, part.archivePath) : part.readerBody.length; if (end <= start) throw new Error(`Invalid editorial range in ${part.archivePath}`); return { start, end, body: part.readerBody.slice(start, end).trim() } }

function makeChapters(chronicleId, parts) {
  const byPath = new Map(parts.map((part) => [part.archivePath, part])), ranges = new Map()
  const chapters = editorialPlan[chronicleId].map((plan, index) => {
    const selected = plan.sources.map((selector) => { const part = byPath.get(selector.path); if (!part) throw new Error(`Editorial chapter references unavailable source: ${selector.path}`); const range = selectRange(part, selector); ranges.set(part.archivePath, [...(ranges.get(part.archivePath) ?? []), range]); return { part, range } })
    const body = selected.map(({ range }) => range.body).join('\n\n').trim()
    if (!body) throw new Error(`${chronicleId} chapter ${index + 1} is not a non-empty VERIFIED_GM_NARRATIVE chapter`)
    return { id: `${chronicleId.toLowerCase()}-chapter-${String(index + 1).padStart(2, '0')}`, chapterNumber: index + 1, title: plan.title, subtitle: `공개 기록 ${new Set(selected.map(({ part }) => part.archivePath)).size}건`, dateLabel: plan.dateLabel, ...(plan.seasonId ? { seasonId: plan.seasonId } : { partId: plan.partId }), arcLabel: plan.arcLabel, sourceKind: 'VERIFIED_GM_NARRATIVE', sourceRefs: selected.map(({ part }) => part.canonicalRef), archiveSourceRefs: selected.map(({ part }) => part.archivePath), sourceHashes: selected.map(({ part }) => part.sourceHash), supportingRefs: [], transformVersion, relatedNodeIds: plan.relatedNodeIds, body }
  })
  for (const part of parts) { const covered = (ranges.get(part.archivePath) ?? []).sort((a, b) => a.start - b.start); if (!covered.length || covered[0].start !== 0 || covered.at(-1).end !== part.readerBody.length || covered.some((range, index) => index > 0 && range.start !== covered[index - 1].end)) throw new Error(`Editorial coverage gap in ${part.archivePath}`) }
  return chapters
}

export async function makeBooks() {
  const books = []
  for (const [chronicleId, catalog] of Object.entries(rawCatalog)) {
    const included = [], omitted = [], editorialExclusions = []
    for (const item of catalog) {
      const raw = normalizeEol(await readFile(resolve(root, item.archivePath), 'utf8'))
      const selected = extractReaderNarrative(raw, { details: true })
      const overrideReason = editorialOverrides.exclude[item.archivePath]
      if (overrideReason) { omitted.push({ sourceRef: item.canonicalRef, archiveSourceRef: item.archivePath, reason: overrideReason }); editorialExclusions.push({ sourceRef: item.canonicalRef, archiveSourceRef: item.archivePath, reason: overrideReason }); continue }
      if (!selected.body || !selected.gmBlocks) { omitted.push({ sourceRef: item.canonicalRef, archiveSourceRef: item.archivePath, reason: selected.classifications.some((x) => x.classification === 'design_meta') ? 'design_meta_only' : 'operational_meta_or_no_eligible_gm_prose' }); continue }
      const part = { ...item, selected, sourceHash: hash(raw) }
      part.readerBody = editedBody(part)
      if (!part.readerBody) throw new Error(`Editorial override emptied verified source: ${item.archivePath}`)
      if (part.readerBody !== selected.body) editorialExclusions.push({ sourceRef: item.canonicalRef, archiveSourceRef: item.archivePath, reason: 'trailing_operational_meta' })
      included.push(part)
    }
    const chapters = makeChapters(chronicleId, included)
    if (chapters.some((chapter) => !chapter.sourceRefs.length || !chapter.body.trim())) throw new Error(`${chronicleId} emitted a zero-length chapter`)
    books.push({ chronicleId, ...bookMetadata[chronicleId], transformVersion, coverage: { verifiedRawParts: catalog.length, scanned: catalog.length, eligibleGmProse: included.length, included: included.length, omitted }, editorialExclusions, chapters })
  }
  return books
}

export async function writeBooks() { for (const book of await makeBooks()) { const file = output(book.chronicleId, 'BOOK.json'); await mkdir(dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(book, null, 2) + '\n') } }
if (process.argv[1]?.endsWith('build-reader-edition.mjs')) await writeBooks()
