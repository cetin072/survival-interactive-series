/** Build-only public source projection. No fact/receipt/manifest bodies are
 * shipped to the client. Reuse A-Core's approved RAW catalog and byte checks. */
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'
import { byteHash, graphHash } from './publication-graph.mjs'

const defaultBase = resolve(import.meta.dirname, '../../..')
const transcriptRoot = 'archive/content/transcripts/C03-AFTERFALL'
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const bookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const insist = (condition, code) => { if (!condition) throw new Error(code) }
const factPattern = /^archive\/content\/public-facts\/C03-AFTERFALL\/(S\d{2,3})\/[A-Za-z0-9_-]+\.json$/

export async function loadPublicWikiData(base = defaultBase, { read = (ref) => readFile(resolve(base, ref)) } = {}) {
  const bytes = new Map()
  const readBytes = async (ref) => {
    if (!bytes.has(ref)) bytes.set(ref, await read(ref))
    return bytes.get(ref)
  }
  const readJson = async (ref) => JSON.parse((await readBytes(ref)).toString('utf8'))
  const seasonIds = (await readdir(resolve(base, transcriptRoot), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^S\d{2,3}$/.test(entry.name) && Number(entry.name.slice(1)) >= 3)
    .map((entry) => entry.name).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  const approved = []
  for (const seasonId of seasonIds) {
    const manifest = await readJson(`${transcriptRoot}/${seasonId}/MANIFEST.json`).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!manifest) continue
    approved.push(...await approvedSeasonCatalog(manifest, seasonId, {
      read: readBytes,
      listParts: async (prefix) => (await readdir(resolve(base, prefix))).filter((name) => /^PART_\d{3}\.md$/.test(name)),
    }))
  }

  const transcripts = []
  for (const part of approved) {
    const provenance = part.autoPublication
    const manifest = await readJson(provenance.sourceManifestRef)
    const order = manifest.source_message_order
    insist(order?.contiguous === true && Number.isSafeInteger(order.min) && Number.isSafeInteger(order.max), 'WIKI_PUBLIC_SOURCE_ORDER_INVALID')
    const partNumber = provenance.part.match(/^PART_(\d{3})\.md$/)[1]
    transcripts.push({
      id: `c03-${part.group.toLowerCase()}-${provenance.sessionId.toLowerCase().replace(/_/g, '-')}-${partNumber}`,
      seasonId: part.group, sessionId: provenance.sessionId, number: Number(partNumber),
      title: `${provenance.sessionId} · PART ${partNumber}`,
      range: `${provenance.capturedRange.start} → ${provenance.capturedRange.end} · 원본 순서 ${order.min}–${order.max}`,
      status: 'verified_transcript', source: part.archivePath, sourceVerified: true,
      content: (await readBytes(part.archivePath)).toString('utf8'),
    })
  }
  const transcriptBySource = new Map(transcripts.map((part) => [part.source, part]))
  const graph = await readJson(graphRef)
  const { content_sha256, ...graphBody } = graph
  insist(graph.visibility === 'PUBLIC_ARCHIVE' && graph.chronicle_id === 'C03-AFTERFALL'
    && graph.worldline_id === 'AFTERFALL' && graphHash(graphBody) === content_sha256, 'WIKI_PUBLIC_GRAPH_INVALID')
  const book = await readJson(bookRef)
  insist(book.chronicleId === 'C03-AFTERFALL' && Array.isArray(book.chapters), 'WIKI_PUBLIC_BOOK_INVALID')
  const sources = new Map()
  for (const node of graph.nodes) {
    for (const revision of [node, ...(node.history ?? [])]) {
      const evidence = revision.evidence
      if (!factPattern.test(evidence.source_ref)) continue
      const key = JSON.stringify([node.id, evidence.source_ref, evidence.source_sha256, evidence.pointer])
      if (sources.has(key)) continue
      const fact = await readJson(evidence.source_ref)
      if (fact.visibility !== 'PUBLIC_ARCHIVE') continue
      const receiptRef = evidence.source_ref.replace(/\/([^/]+\.json)$/, '/receipts/$1')
      const receipt = await readJson(receiptRef).catch((error) => {
        if (error.code === 'ENOENT') return null // Legacy / unapproved facts have no new source-link authority.
        throw error
      })
      if (!receipt) {
        // The original mutable FACTS baseline and SESSION_005 predate receipts.
        // They retain existing article links, never gain new source authority.
        const legacy = /\/S03\/(?:FACTS|AWIKI_SESSION_005_[a-f0-9]{64})\.json$/.test(evidence.source_ref)
        insist(legacy, 'WIKI_PUBLIC_RECEIPT_MISSING')
        continue
      }
      if (receipt.outcome !== 'APPLIED') continue
      insist(['a-wiki-receipt-v1', 'a-wiki-amendment-receipt-v1'].includes(receipt.version), 'WIKI_PUBLIC_RECEIPT_INVALID')
      const factSha = byteHash(await readBytes(evidence.source_ref))
      insist(factSha === evidence.source_sha256, 'WIKI_PUBLIC_FACT_BYTES_MISMATCH')
      insist(fact.version === 'public-graph-facts-v1' && fact.chronicle_id === 'C03-AFTERFALL'
        && fact.worldline_id === 'AFTERFALL' && fact.season_id === factPattern.exec(evidence.source_ref)[1]
        && Array.isArray(fact.nodes), 'WIKI_PUBLIC_FACT_SCOPE_INVALID')
      const index = evidence.pointer.match(/^\/nodes\/(\d+)$/)?.[1]
      const factNode = index === undefined ? null : fact.nodes[Number(index)]
      insist(factNode?.id === node.id && (!revision.data || graphHash(revision.data) === graphHash(factNode)), 'WIKI_PUBLIC_FACT_POINTER_MISMATCH')
      insist(factSha === receipt.fact_sha256, 'WIKI_PUBLIC_FACT_BYTES_MISMATCH')
      const sourceParts = approved.filter((part) => part.group === fact.season_id && part.autoPublication.sessionId === receipt.session_id)
      if (!sourceParts.length) continue // A nonpublic / unapproved session never contributes client bytes.
      const links = []
      for (const part of sourceParts) {
        const provenance = part.autoPublication
        insist(provenance.sourceManifestSha256 === receipt.source_sha256
          && byteHash(await readBytes(provenance.sourceManifestRef)) === receipt.source_sha256
          && (receipt.source_ref === undefined || receipt.source_ref === provenance.sourceManifestRef), 'WIKI_PUBLIC_MANIFEST_BYTES_MISMATCH')
        const chapters = book.chapters.filter((chapter) => chapter.archiveSourceRefs?.includes(part.archivePath))
        for (const chapter of chapters) {
          const source = chapter.publicationProvenance
          insist(chapter.sourceKind === 'VERIFIED_GM_NARRATIVE' && chapter.seasonId === part.group
            && source?.visibility === 'PUBLIC_ARCHIVE' && source.sessionId === provenance.sessionId
            && source.sourceManifestRef === provenance.sourceManifestRef
            && source.sourceManifestSha256 === receipt.source_sha256 && source.part === provenance.part
            && source.rawSha256 === provenance.rawSha256 && chapter.sourceHashes?.includes(provenance.rawSha256), 'WIKI_PUBLIC_READER_BINDING_INVALID')
          const raw = transcriptBySource.get(part.archivePath)
          links.push({ chapterId: chapter.id, chapterTitle: chapter.title, partId: raw.id, partTitle: raw.title, archiveSourceRef: part.archivePath })
        }
      }
      insist(links.length > 0, 'WIKI_PUBLIC_READER_SOURCE_MISSING')
      sources.set(key, { nodeId: node.id, evidence, links })
    }
  }
  return { sources: [...sources.values()], transcripts, files: [...bytes.keys()].map((ref) => resolve(base, ref)) }
}
