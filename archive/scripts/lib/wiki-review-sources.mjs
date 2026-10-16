/** Build/program-only adapters. Never import into the public browser projection. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { byteHash, graphHash } from './publication-graph.mjs'
import { loadReaderWikiSeeds } from './reader-wiki-seed.mjs'
import { rawCatalog } from '../reader-source-catalog.mjs'
import { discoverWikiSource } from './wiki-semantic-jobs.mjs'

const root = resolve(import.meta.dirname, '../../..')
const insist = (ok, code) => { if (!ok) throw new Error(code) }

/** Actual public Reader bytes + approved RAW catalog, without fabricated Runtime anchors.
 * Legacy GM fragments outside VERIFIED_GM_NARRATIVE Reader coverage stay excluded.
 * Adding a seed/approval registers a Reader world; C03 keeps its Graph adapter.
 */
export async function loadWikiReviewSources(base = root) {
  const seeds = await loadReaderWikiSeeds(base, { allowPreview: false })
  const worlds = seeds.map(seed => ({ id: seed.chronicleId, seed }))
  worlds.push({ id: 'C03-AFTERFALL' })
  const scopes = [], inventory = [], exclusions = []
  const approvals = await readFile(resolve(base, 'archive/content/wiki/PUBLIC_APPROVALS.json'))
  for (const { id, seed } of worlds) {
    const bookRef = `archive/content/stories/${id}/BOOK.json`
    const bookBytes = await readFile(resolve(base, bookRef))
    const book = JSON.parse(bookBytes)
    insist(book.chronicleId === id, 'WIKI_REVIEW_BOOK_SCOPE')
    const wikiRef = seed ? `archive/content/wiki/${id}/SEED.json`
      : `archive/content/graphs/${id}/GRAPH.json`
    const wikiBytes = await readFile(resolve(base, wikiRef))
    const wiki = JSON.parse(wikiBytes)
    if (!seed) {
      const { content_sha256, ...body } = wiki
      insist(wiki.chronicle_id === id && wiki.worldline_id === book.worldlineId
        && wiki.visibility === 'PUBLIC_ARCHIVE' && graphHash(body) === content_sha256,
      'WIKI_REVIEW_GRAPH_INVALID')
    }
    const wikiSha = byteHash(wikiBytes)
    inventory.push({ chronicle_id: id, worldline_id: book.worldlineId, wiki_ref: wikiRef,
      wiki_sha256: wikiSha, book_sha256: byteHash(bookBytes),
      nodes: wiki.nodes.length, relations: wiki.relations.length,
      publication_policy: seed ? 'NEW_EXACT_HUMAN_APPROVAL_REQUIRED' : 'EXISTING_C03_FINALIZER_ONLY' })
    const allowed = new Set((rawCatalog[id] ?? []).map(p => p.archivePath))
    for (const chapter of book.chapters) {
      if (chapter.sourceKind !== 'VERIFIED_GM_NARRATIVE') {
        exclusions.push({ chronicle_id: id, source_id: chapter.id, reason: 'UNVERIFIED_READER_SOURCE' })
        continue
      }
      insist(typeof chapter.body === 'string' && chapter.body.trim(), 'WIKI_REVIEW_EMPTY_SOURCE')
      insist(chapter.archiveSourceRefs?.length > 0
        && chapter.archiveSourceRefs.length === chapter.sourceHashes?.length, 'WIKI_REVIEW_RAW_BINDING')
      const raw = []
      for (const [i, ref] of chapter.archiveSourceRefs.entries()) {
        insist(allowed.has(ref), 'WIKI_REVIEW_RAW_SCOPE')
        const hash = byteHash(await readFile(resolve(base, ref)))
        insist(hash === chapter.sourceHashes[i], 'WIKI_REVIEW_RAW_CHANGED')
        raw.push({ ref, sha256: hash })
      }
      const existing = seed ? {
        nodes: seed.nodes, relations: seed.relations,
      } : { nodes: wiki.nodes, relations: wiki.relations }
      const binding = { chronicle_id: id, worldline_id: book.worldlineId, source_id: chapter.id,
        source_sha256: byteHash(chapter.body), raw, wiki_sha256: wikiSha,
        // Whole BOOK/approval changes invalidate any old semantic review as well.
        book_sha256: byteHash(bookBytes), approval_sha256: byteHash(approvals) }
      scopes.push({ ...binding, scope_sha256: graphHash(binding), source_ref: bookRef,
        season_id: chapter.seasonId, chapter_number: chapter.chapterNumber,
        source: { text: chapter.body, raw }, existing,
        publication_policy: inventory.at(-1).publication_policy })
    }
  }
  // Only the existing C03 discovery decides which live source is NEW_SOURCE.
  // A historic Reader without a receipt is NOT automatically a new source.
  let newSource = null
  try { newSource = await discoverWikiSource(base) }
  catch (error) { if (error.message !== 'WIKI_NO_PENDING_SOURCE') throw error }
  return { version: 'wiki-review-discovery-v1', inventory, scopes, exclusions,
    new_source: newSource, semantic_review_performed: false }
}
