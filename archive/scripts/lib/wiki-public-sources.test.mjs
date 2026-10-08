import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { loadPublicWikiData } from './wiki-public-sources.mjs'
import { byteHash, graphHash } from './publication-graph.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const bookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const transcriptsRef = 'archive/content/transcripts/C03-AFTERFALL'
const factsRef = 'archive/content/public-facts/C03-AFTERFALL'
const seasonRef = `${transcriptsRef}/S03/MANIFEST.json`
const sourceRef = `${transcriptsRef}/S03/SESSION_007/SOURCE_MANIFEST.json`
const factRef = `${factsRef}/S03/AWIKI_SESSION_007_747424d3b8d0ff30a328fc95a8ba818b4d5a7e0694e6bedb05e4d88f31675015.json`
const receiptRef = factRef.replace(/\/([^/]+)$/, '/receipts/$1')
const amendmentRef = `${factsRef}/S03/AWIKI_AMENDMENT_SESSION_008_20261005.json`

const jsonAt = async (base, path) => JSON.parse(await readFile(join(base, path), 'utf8'))
async function writeJson(base, path, data) {
  await mkdir(dirname(join(base, path)), { recursive: true })
  await writeFile(join(base, path), JSON.stringify(data, null, 2) + '\n')
}

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'wiki-public-sources-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  // Exact copies retain the real graph/fact/receipt/manifest/RAW hash bindings.
  // Mutations below affect only these temporary copies.
  await Promise.all([graphRef, bookRef, transcriptsRef, factsRef].map(async (path) => {
    await mkdir(dirname(join(base, path)), { recursive: true })
    await cp(join(repoRoot, path), join(base, path), { recursive: true })
  }))
  return base
}

test('real SESSION_007/008 facts and five amended profiles resolve to approved Reader and RAW sources', async () => {
  const [data, graph] = await Promise.all([loadPublicWikiData(repoRoot), jsonAt(repoRoot, graphRef)])
  const recentFacts = graph.nodes.flatMap((node) =>
    [node, ...(node.history ?? [])]
      .filter((revision) => /AWIKI_SESSION_00[78]_/.test(revision.evidence.source_ref))
      .map((revision) => ({ nodeId: node.id, evidence: revision.evidence })))
  const amended = graph.nodes.filter((node) => node.evidence.source_ref === amendmentRef)
  const amendedBindings = amended.map((node) => ({ nodeId: node.id, evidence: node.evidence }))
  assert.equal(recentFacts.length, 15)
  assert.equal(amended.length, 5)
  assert.ok(data.sources.every((source) => JSON.stringify(Object.keys(source).sort()) === JSON.stringify(['evidence', 'links', 'nodeId'])))
  assert.ok(data.sources.flatMap((source) => source.links).every((link) =>
    JSON.stringify(Object.keys(link).sort()) === JSON.stringify(['archiveSourceRef', 'chapterId', 'chapterTitle', 'partId', 'partTitle'])))
  assert.ok(amended.every((node) => node.history.length > 0), 'the five previous profiles remain in history')
  for (const binding of [...recentFacts, ...amendedBindings]) {
    const source = data.sources.find((item) => item.nodeId === binding.nodeId
      && item.evidence.source_ref === binding.evidence.source_ref
      && item.evidence.source_sha256 === binding.evidence.source_sha256
      && item.evidence.pointer === binding.evidence.pointer)
    assert.ok(source, `missing exact source binding: ${binding.nodeId}`)
    assert.ok(source.links.length > 0, `missing source link: ${binding.nodeId}`)
    const session = binding.evidence.source_ref === amendmentRef || binding.evidence.source_ref.includes('SESSION_008') ? '008' : '007'
    for (const link of source.links) {
      assert.equal(link.partId, `c03-s03-session-${session}-001`)
      assert.equal(link.archiveSourceRef, `${transcriptsRef}/S03/SESSION_${session}/PART_001.md`)
      assert.ok(link.chapterId && link.chapterTitle && link.partTitle)
      const transcript = data.transcripts.find((part) => part.id === link.partId)
      assert.ok(transcript, `missing approved RAW: ${link.partId}`)
      assert.equal(transcript.status, 'verified_transcript')
      assert.equal(transcript.sourceVerified, true)
      assert.equal(transcript.content, await readFile(join(repoRoot, link.archiveSourceRef), 'utf8'))
    }
  }
})

test('changed fact bytes fail even when their parsed JSON and Graph/receipt digest claims are unchanged', async (t) => {
  const base = await fixture(t)
  const [factBefore, receiptBefore, graphBefore] = await Promise.all(
    [factRef, receiptRef, graphRef].map((path) => readFile(join(base, path))),
  )
  await writeFile(join(base, factRef), Buffer.concat([factBefore, Buffer.from(' \n')]))
  assert.deepEqual(await jsonAt(base, factRef), JSON.parse(factBefore))
  await assert.rejects(loadPublicWikiData(base), /WIKI_PUBLIC_FACT_BYTES_MISMATCH/)
  assert.deepEqual(await readFile(join(base, receiptRef)), receiptBefore)
  assert.deepEqual(await readFile(join(base, graphRef)), graphBefore)
})

test('a missing receipt for an already referenced modern fact is a build failure', async (t) => {
  const base = await fixture(t)
  await rm(join(base, receiptRef))
  await assert.rejects(loadPublicWikiData(base), /WIKI_PUBLIC_RECEIPT_MISSING/)
})

test('changed source manifest bytes fail while parsed fields and the published source hash claim are unchanged', async (t) => {
  const base = await fixture(t)
  const [sourceBefore, bookBefore, receiptBefore] = await Promise.all(
    [sourceRef, bookRef, receiptRef].map((path) => readFile(join(base, path))),
  )
  await writeFile(join(base, sourceRef), Buffer.concat([sourceBefore, Buffer.from(' \n')]))
  assert.deepEqual(await jsonAt(base, sourceRef), JSON.parse(sourceBefore))
  await assert.rejects(loadPublicWikiData(base), /WIKI_PUBLIC_MANIFEST_BYTES_MISMATCH/)
  assert.deepEqual(await readFile(join(base, bookRef)), bookBefore)
  assert.deepEqual(await readFile(join(base, receiptRef)), receiptBefore)
})

test('changed actual RAW bytes fail before unverified content can enter the client payload', async (t) => {
  const base = await fixture(t)
  const rawRef = `${transcriptsRef}/S03/SESSION_007/PART_001.md`
  await writeFile(join(base, rawRef), (await readFile(join(base, rawRef), 'utf8')) + '\nUNVERIFIED_RAW_SENTINEL\n')
  await assert.rejects(loadPublicWikiData(base), /INVALID_APPROVED_READER_SOURCE/)
})

test('private session entries are skipped without serializing their source or RAW sentinels', async (t) => {
  const base = await fixture(t)
  const sentinel = 'PRIVATE_SESSION_MUST_NOT_REACH_CLIENT'
  const manifest = await jsonAt(base, seasonRef)
  manifest.sessions.push({
    session_id: 'SESSION_999', visibility: 'CORE_PRIVATE',
    source_manifest: 'SESSION_999/SOURCE_MANIFEST.json', title: sentinel,
  })
  await writeJson(base, seasonRef, manifest)
  const privateDir = join(base, transcriptsRef, 'S03/SESSION_999')
  await mkdir(privateDir, { recursive: true })
  // Invalid JSON also detects accidental parsing of a withheld source.
  await writeFile(join(privateDir, 'SOURCE_MANIFEST.json'), sentinel)
  await writeFile(join(privateDir, 'PART_001.md'), sentinel)
  const { sources, transcripts } = await loadPublicWikiData(base)
  const serialized = JSON.stringify({ sources, transcripts })
  assert.equal(serialized.includes(sentinel), false)
  assert.equal(serialized.includes('/S03/SESSION_999/'), false)
})

test('a nonapproved season never contributes its source or RAW bytes to the client payload', async (t) => {
  const base = await fixture(t)
  const sentinel = 'PRIVATE_SEASON_MUST_NOT_REACH_CLIENT'
  await writeJson(base, `${transcriptsRef}/S99/MANIFEST.json`, {
    visibility: 'CORE_PRIVATE', season_id: 'S99', title: sentinel,
    sessions: [{ session_id: 'SESSION_001', visibility: 'PUBLIC_ARCHIVE', source_manifest: 'SESSION_001/SOURCE_MANIFEST.json' }],
  })
  const privateDir = join(base, transcriptsRef, 'S99/SESSION_001')
  await mkdir(privateDir, { recursive: true })
  await writeFile(join(privateDir, 'SOURCE_MANIFEST.json'), sentinel)
  await writeFile(join(privateDir, 'PART_001.md'), sentinel)
  const { sources, transcripts } = await loadPublicWikiData(base)
  const serialized = JSON.stringify({ sources, transcripts })
  assert.equal(serialized.includes(sentinel), false)
  assert.equal(serialized.includes('/S99/'), false)
})

test('withholding a previously referenced public session removes its links and RAW from the client projection', async (t) => {
  const base = await fixture(t)
  const sentinel = 'WITHHELD_PREVIOUSLY_PUBLIC_RAW_MUST_NOT_REACH_CLIENT'
  const manifest = await jsonAt(base, seasonRef)
  manifest.sessions.find((session) => session.session_id === 'SESSION_007').visibility = 'CORE_PRIVATE'
  await writeJson(base, seasonRef, manifest)
  await writeFile(join(base, sourceRef), sentinel)
  await writeFile(join(base, transcriptsRef, 'S03/SESSION_007/PART_001.md'), sentinel)
  const { sources, transcripts } = await loadPublicWikiData(base)
  assert.equal(sources.some((source) => source.evidence.source_ref === factRef), false)
  assert.equal(transcripts.some((part) => part.sessionId === 'SESSION_007'), false)
  assert.ok(transcripts.some((part) => part.sessionId === 'SESSION_008'), 'other approved sessions remain available')
  assert.equal(JSON.stringify({ sources, transcripts }).includes(sentinel), false)
})

test('a fact explicitly marked private contributes no client source mapping', async (t) => {
  const base = await fixture(t)
  const sentinel = 'PRIVATE_FACT_MUST_NOT_REACH_CLIENT'
  const fact = await jsonAt(base, factRef)
  fact.visibility = 'CORE_PRIVATE'
  fact.nodes[0].summary = sentinel
  await writeJson(base, factRef, fact)
  const { sources, transcripts } = await loadPublicWikiData(base)
  assert.equal(sources.some((source) => source.evidence.source_ref === factRef), false)
  assert.equal(JSON.stringify({ sources, transcripts }).includes(sentinel), false)
})

test('a malformed public fact fails even when its byte digests are consistently bound', async (t) => {
  const base = await fixture(t)
  const fact = await jsonAt(base, factRef)
  fact.version = 'unknown-public-fact-format'
  await writeJson(base, factRef, fact)
  const digest = byteHash(await readFile(join(base, factRef)))
  const receipt = await jsonAt(base, receiptRef)
  receipt.fact_sha256 = digest
  await writeJson(base, receiptRef, receipt)
  const graph = await jsonAt(base, graphRef)
  for (const node of graph.nodes) {
    for (const revision of [node, ...(node.history ?? [])]) {
      if (revision.evidence.source_ref === factRef) revision.evidence.source_sha256 = digest
    }
  }
  const { content_sha256, ...body } = graph
  graph.content_sha256 = graphHash(body)
  await writeJson(base, graphRef, graph)
  await assert.rejects(loadPublicWikiData(base), /WIKI_PUBLIC_FACT_SCOPE_INVALID/)
})

test('a source listed as approved fails closed if its public safety metadata is malformed', async (t) => {
  const base = await fixture(t)
  const source = await jsonAt(base, sourceRef)
  source.public_safe_only = false
  await writeJson(base, sourceRef, source)
  await assert.rejects(loadPublicWikiData(base), /INVALID_APPROVED_READER_SOURCE/)
})
