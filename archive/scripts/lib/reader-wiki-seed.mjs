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

const approvedReaderWikiNotice = (seed) =>
  '사람이 공개를 승인한 세계관 위키입니다. 현재 확보된 공개 Reader ' +
  seed.chapters.filter((row) => row.status === 'REVIEWED').length +
  '장에 근거하며, 누락된 과거 기록이나 미확인 사항을 추정해 채우지 않았습니다.'

/** Approval record binds the original verified candidate bytes + exact Reader bytes.
 *  The candidate remains PREVIEW_ONLY on disk so changing its content never
 *  silently inherits approval. A separate approved digest is required.
 */
export async function loadReaderWikiApprovals(base = root) {
  let bytes
  try { bytes = await readFile(resolve(base, 'archive/content/wiki/PUBLIC_APPROVALS.json')) }
  catch (error) {
    if (error.code === 'ENOENT') return new Map()
    throw error
  }
  const record = JSON.parse(bytes.toString('utf8'))
  insist(fields(record, ['version', 'scope', 'approvalReference', 'approvedOnKst', 'sourceMainSha', 'items'])
    && record.version === 'reader-wiki-public-approvals-v1'
    && record.scope === 'INITIAL_PUBLIC_READER_WORLD_WIKI'
    && /^USER_CHAT_EXPLICIT_APPROVAL_[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(record.approvalReference)
    && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(record.approvedOnKst)
    && /^[a-f0-9]{40}$/.test(record.sourceMainSha)
    && Array.isArray(record.items), 'APPROVAL_MANIFEST')
  const approvals = new Map()
  for (const item of record.items) {
    insist(fields(item, ['chronicleId', 'decision', 'seedSha256', 'bookSha256'])
      && /^C[0-9]{2,}-[A-Z0-9-]+$/.test(item.chronicleId)
      && item.chronicleId !== 'C03-AFTERFALL' && item.decision === 'APPROVE'
      && /^[a-f0-9]{64}$/.test(item.seedSha256) && /^[a-f0-9]{64}$/.test(item.bookSha256)
      && !approvals.has(item.chronicleId), 'APPROVAL_ENTRY')
    approvals.set(item.chronicleId, item)
  }
  return approvals
}

export async function loadReaderWikiSeeds(base = root, { allowPreview = process.env.CONTEXT !== 'production', catalog = rawCatalog } = {}) {
  const folder = resolve(base, 'archive/content/wiki')
  const approvals = await loadReaderWikiApprovals(base)
  const approvedIdsFound = new Set()
  const entries = await readdir(folder, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return []; throw error
  })
  const output = []
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^C\d{2,}-[A-Z0-9-]+$/.test(entry.name)) continue
    const seedBytes = await readFile(resolve(folder, entry.name, 'SEED.json'))
    const seed = JSON.parse(seedBytes.toString('utf8'))
    const bookBytes = await readFile(resolve(base, 'archive/content/stories', entry.name, 'BOOK.json'))
    const book = JSON.parse(bookBytes)
    insist(seed.chronicleId === entry.name, 'FOLDER_SCOPE')
    validateReaderWikiSeed(seed, book, bookBytes)
    const approval = approvals.get(entry.name)
    if (approval) {
      // Even one changed subtitle or citation revokes the matched approval.
      insist(approval.seedSha256 === byteHash(seedBytes)
        && approval.bookSha256 === byteHash(bookBytes), 'APPROVAL_SOURCE_CHANGED')
      approvedIdsFound.add(entry.name)
    }
    const publicParts = catalog[entry.name] ?? []
    const publicPaths = new Set(publicParts.map((part) => part.archivePath))
    for (const row of seed.chapters) {
      const chapter = book.chapters.find((item) => item.id === row.chapterId)
      insist(Array.isArray(chapter.archiveSourceRefs) && chapter.archiveSourceRefs.length === chapter.sourceHashes.length
        && chapter.sourceHashes.length > 0 && Array.isArray(chapter.sourceRefs)
        && chapter.sourceRefs.length === chapter.archiveSourceRefs.length, 'RAW_REFS')
      for (const [index, ref] of chapter.archiveSourceRefs.entries()) {
        insist(publicPaths.has(ref), 'RAW_SCOPE')
        insist(publicParts.some((part) => part.archivePath === ref
          && (part.canonicalRef ?? part.archivePath) === chapter.sourceRefs[index]), 'RAW_REFS')
        insist(byteHash(await readFile(resolve(base, ref))) === chapter.sourceHashes[index], 'RAW_CHANGED')
      }
    }
    if (approval) output.push({ ...seed, publication: 'HUMAN_APPROVED', notice: approvedReaderWikiNotice(seed) })
    else if (allowPreview) output.push(seed)
  }
  insist([...approvals.keys()].every((id) => approvedIdsFound.has(id)), 'APPROVAL_ORPHAN')
  return output
}

// Validation ledger and hashes stay build-only; no second copy of Reader prose.
export function readerWikiProjection(seeds) {
  return seeds.map(({ chronicleId, notice, publication, nodes, relations }) => ({
    chronicleId, notice, publication,
    nodes: nodes.map((node) => ({ ...node, facts: node.facts.map(({ text, kind, evidence }) => ({
      text, kind, evidence: { chapterId: evidence.chapterId, quote: evidence.quote },
    })) })),
    relations: relations.map(({ from, to, label, evidence }) => ({
      from, to, label, evidence: { chapterId: evidence.chapterId, quote: evidence.quote },
    })),
  }))
}
