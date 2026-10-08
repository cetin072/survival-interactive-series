/** Curated Reader snapshots; exact binding proves provenance, not semantic approval. */
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { byteHash } from './publication-graph.mjs'
import { rawCatalog } from '../reader-source-catalog.mjs'
const root = resolve(import.meta.dirname, '../../..')
const insist = (ok, code) => { if (!ok) throw new Error('READER_WIKI_' + code) }
const text = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 5000
const fields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => Object.hasOwn(value, key))

export function validateReaderWikiSeed(seed, book, bookBytes) {
  insist(fields(seed, ['version','chronicleId','worldlineId','publication','coverage','notice','bookSha256','chapters','nodes','relations']), 'FIELDS')
  insist(seed.version === 'reader-wiki-seed-v1' && /^C\d{2,}-[A-Z0-9-]+$/.test(seed.chronicleId)
    && seed.chronicleId === book.chronicleId && seed.worldlineId === book.worldlineId
    && seed.chronicleId !== 'C03-AFTERFALL', 'SCOPE')
  // Candidates have no approval receipt. A label alone must never promote them.
  insist(seed.publication === 'PREVIEW_ONLY' && ['PARTIAL','ALL_AVAILABLE_CHAPTERS'].includes(seed.coverage) && text(seed.notice), 'REVIEW')
  insist(/^[a-f0-9]{64}$/.test(seed.bookSha256) && bookBytes && seed.bookSha256 === byteHash(bookBytes), 'BOOK_CHANGED')
  insist(Array.isArray(seed.nodes) && seed.nodes.length > 0 && Array.isArray(seed.relations) && Array.isArray(seed.chapters), 'NODES')
  const chapters = new Map(book.chapters.map((chapter) => [chapter.id, chapter]))
  const reviewed = new Set()
  const ledger = new Set()
  for (const row of seed.chapters) {
    insist(fields(row, ['chapterId','bodySha256','status','note']) && !ledger.has(row.chapterId), 'LEDGER')
    const chapter = chapters.get(row.chapterId)
    insist(chapter?.sourceKind === 'VERIFIED_GM_NARRATIVE' && row.bodySha256 === byteHash(chapter.body), 'SOURCE_CHANGED')
    insist(['REVIEWED','HELD','EXCLUDED'].includes(row.status) && text(row.note), 'LEDGER_STATUS')
    ledger.add(row.chapterId)
    if (row.status === 'REVIEWED') reviewed.add(row.chapterId)
  }
  if (seed.coverage === 'ALL_AVAILABLE_CHAPTERS') insist(book.chapters.every((chapter) => ledger.has(chapter.id)), 'COVERAGE')
  const evidence = (value) => {
    insist(fields(value, ['chapterId','bodySha256','quote']), 'EVIDENCE_FIELDS')
    const chapter = chapters.get(value.chapterId)
    insist(chapter?.sourceKind === 'VERIFIED_GM_NARRATIVE' && reviewed.has(value.chapterId), 'UNVERIFIED_CHAPTER')
    insist(value.bodySha256 === byteHash(chapter.body), 'SOURCE_CHANGED')
    insist(text(value.quote) && value.quote.length >= 12 && chapter.body.includes(value.quote), 'QUOTE')
  }
  const ids = new Set()
  for (const node of seed.nodes) {
    insist(fields(node, ['id','type','title','subtitle','facts']), 'NODE_FIELDS')
    insist(/^(char|loc|event)-[a-z0-9-]+$/.test(node.id) && !ids.has(node.id), 'NODE_ID')
    ids.add(node.id)
    insist(['character','location','event'].includes(node.type) && node.id.startsWith({ character:'char-', location:'loc-', event:'event-' }[node.type])
      && text(node.title) && text(node.subtitle), 'NODE_TYPE')
    insist(Array.isArray(node.facts) && node.facts.length > 0, 'FACTS')
    for (const fact of node.facts) {
      insist(fields(fact, ['text','kind','evidence']) && text(fact.text) && ['RECORDED','REPORTED'].includes(fact.kind), 'FACT')
      evidence(fact.evidence)
    }
  }
  const relations = new Set()
  for (const relation of seed.relations) {
    const key = JSON.stringify([relation.from,relation.to,relation.label,relation.evidence?.chapterId])
    insist(fields(relation, ['from','to','label','evidence']) && ids.has(relation.from) && ids.has(relation.to)
      && relation.from !== relation.to && text(relation.label) && !relations.has(key), 'RELATION')
    relations.add(key)
    evidence(relation.evidence)
  }
  return seed
}

export async function loadReaderWikiSeeds(base = root, { allowPreview = process.env.CONTEXT !== 'production', catalog = rawCatalog } = {}) {
  const folder = resolve(base, 'archive/content/wiki')
  const entries = await readdir(folder, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return []; throw error
  })
  const output = []
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^C\d{2,}-[A-Z0-9-]+$/.test(entry.name)) continue
    const seed = JSON.parse(await readFile(resolve(folder, entry.name, 'SEED.json'), 'utf8'))
    const bookBytes = await readFile(resolve(base, 'archive/content/stories', entry.name, 'BOOK.json'))
    const book = JSON.parse(bookBytes)
    insist(seed.chronicleId === entry.name, 'FOLDER_SCOPE')
    validateReaderWikiSeed(seed, book, bookBytes)
    const publicPaths = new Set((catalog[entry.name] ?? []).map((part) => part.archivePath))
    for (const row of seed.chapters) {
      const chapter = book.chapters.find((item) => item.id === row.chapterId)
      insist(Array.isArray(chapter.archiveSourceRefs) && chapter.archiveSourceRefs.length === chapter.sourceHashes.length
        && chapter.sourceHashes.length > 0 && chapter.sourceRefs.every((ref) => chapter.archiveSourceRefs.includes(ref)), 'RAW_REFS')
      for (const [index, ref] of chapter.archiveSourceRefs.entries()) {
        insist(publicPaths.has(ref), 'RAW_SCOPE')
        insist(byteHash(await readFile(resolve(base, ref))) === chapter.sourceHashes[index], 'RAW_CHANGED')
      }
    }
    if (allowPreview) output.push(seed)
  }
  return output
}

// Validation ledger and hashes stay build-only; no second copy of Reader prose.
export function readerWikiProjection(seeds) {
  return seeds.map(({ chronicleId, notice, nodes, relations }) => ({
    chronicleId, notice,
    nodes: nodes.map((node) => ({ ...node, facts: node.facts.map(({ text, kind, evidence }) => ({
      text, kind, evidence: { chapterId: evidence.chapterId, quote: evidence.quote },
    })) })),
    relations: relations.map(({ from, to, label, evidence }) => ({
      from, to, label, evidence: { chapterId: evidence.chapterId, quote: evidence.quote },
    })),
  }))
}
