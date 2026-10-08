/** Partial Reader -> Wiki backfill. Reuses exact-source binding, not the C03 job queue.
 * Exact quotes prove provenance, not independent semantic approval. */
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { byteHash } from './publication-graph.mjs'
import { rawCatalog } from '../reader-source-catalog.mjs'
const root = resolve(import.meta.dirname, '../../..')
const insist = (ok, code) => { if (!ok) throw new Error('READER_WIKI_' + code) }
const text = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 5000
const fields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => Object.hasOwn(value, key))

export function validateReaderWikiSeed(seed, book) {
  insist(fields(seed, ['version','chronicleId','worldlineId','publication','coverage','notice','nodes','relations']), 'FIELDS')
  insist(seed.version === 'reader-wiki-seed-v1' && seed.chronicleId === book.chronicleId
    && seed.worldlineId === book.worldlineId && seed.chronicleId !== 'C03-AFTERFALL', 'SCOPE')
  insist(['PREVIEW_ONLY','HUMAN_APPROVED'].includes(seed.publication) && seed.coverage === 'PARTIAL' && text(seed.notice), 'REVIEW')
  insist(Array.isArray(seed.nodes) && seed.nodes.length > 0 && Array.isArray(seed.relations), 'NODES')
  const chapters = new Map(book.chapters.map((chapter) => [chapter.id, chapter]))
  const evidence = (value) => {
    insist(fields(value, ['chapterId','bodySha256','quote']), 'EVIDENCE_FIELDS')
    const chapter = chapters.get(value.chapterId)
    insist(chapter?.sourceKind === 'VERIFIED_GM_NARRATIVE', 'UNVERIFIED_CHAPTER')
    insist(value.bodySha256 === byteHash(chapter.body), 'SOURCE_CHANGED')
    insist(text(value.quote) && value.quote.length >= 12 && chapter.body.includes(value.quote), 'QUOTE')
  }
  const ids = new Set()
  for (const node of seed.nodes) {
    insist(fields(node, ['id','type','title','subtitle','facts']), 'NODE_FIELDS')
    insist(/^(char|loc|event)-[a-z0-9-]+$/.test(node.id) && !ids.has(node.id), 'NODE_ID')
    ids.add(node.id)
    insist(['character','location','event'].includes(node.type) && text(node.title) && text(node.subtitle), 'NODE_TYPE')
    insist(Array.isArray(node.facts) && node.facts.length > 0, 'FACTS')
    for (const fact of node.facts) {
      insist(fields(fact, ['text','kind','evidence']) && text(fact.text) && ['RECORDED','REPORTED'].includes(fact.kind), 'FACT')
      evidence(fact.evidence)
    }
  }
  for (const relation of seed.relations) {
    insist(fields(relation, ['from','to','label','evidence']) && ids.has(relation.from) && ids.has(relation.to)
      && relation.from !== relation.to && text(relation.label), 'RELATION')
    evidence(relation.evidence)
  }
  return seed
}

export async function loadReaderWikiSeeds(base = root, { allowPreview = process.env.CONTEXT !== 'production' } = {}) {
  const folder = resolve(base, 'archive/content/wiki')
  const entries = await readdir(folder, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return []; throw error
  })
  const output = []
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^C\d{2,}-[A-Z0-9-]+$/.test(entry.name)) continue
    const seed = JSON.parse(await readFile(resolve(folder, entry.name, 'SEED.json'), 'utf8'))
    const book = JSON.parse(await readFile(resolve(base, 'archive/content/stories', entry.name, 'BOOK.json'), 'utf8'))
    insist(seed.chronicleId === entry.name, 'FOLDER_SCOPE')
    validateReaderWikiSeed(seed, book)
    const used = new Set([...seed.nodes.flatMap((node) => node.facts.map((fact) => fact.evidence.chapterId)), ...seed.relations.map((r) => r.evidence.chapterId)])
    const publicPaths = new Set((rawCatalog[entry.name] ?? []).map((part) => part.archivePath))
    for (const chapter of book.chapters.filter((item) => used.has(item.id))) {
      insist(chapter.archiveSourceRefs.length === chapter.sourceHashes.length && chapter.sourceHashes.length > 0, 'RAW_REFS')
      for (const [index, ref] of chapter.archiveSourceRefs.entries()) {
        insist(publicPaths.has(ref), 'RAW_SCOPE')
        insist(byteHash(await readFile(resolve(base, ref))) === chapter.sourceHashes[index], 'RAW_CHANGED')
      }
    }
    if (seed.publication === 'HUMAN_APPROVED' || allowPreview) output.push(seed)
  }
  return output
}
