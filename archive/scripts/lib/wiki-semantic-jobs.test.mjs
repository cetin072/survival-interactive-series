import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, readdir, mkdtemp, cp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import publicGraph from '../../content/graphs/C03-AFTERFALL/GRAPH.json' with { type: 'json' }
import book from '../../content/stories/C03-AFTERFALL/BOOK.json' with { type: 'json' }
import { byteHash, reconcilePublicGraph } from './publication-graph.mjs'
import {
  discoverWikiSource,
  discoverWikiSources,
  expectedWikiFactPath,
  expectedWikiReceiptPath,
  prepareWikiFacts,
  validateWikiFacts,
} from './wiki-semantic-jobs.mjs'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const transcriptRoot = 'archive/content/transcripts/C03-AFTERFALL/S03'
const factsRoot = 'archive/content/public-facts/C03-AFTERFALL/S03'
let fixtureRoot
let backlogRoot

async function copyManifestWithSessions(targetRoot, sessionIds) {
  const manifest = JSON.parse(await readFile(resolve(root, transcriptRoot, 'MANIFEST.json')))
  manifest.sessions = manifest.sessions.filter((session) => sessionIds.includes(session.session_id))
  await writeFile(resolve(targetRoot, transcriptRoot, 'MANIFEST.json'), JSON.stringify(manifest))
}

before(async () => {
  fixtureRoot = await mkdtemp(resolve(tmpdir(), 'wiki-session-005-'))
  await mkdir(resolve(fixtureRoot, transcriptRoot), { recursive: true })
  await cp(resolve(root, transcriptRoot, 'SESSION_005'), resolve(fixtureRoot, transcriptRoot, 'SESSION_005'), { recursive: true })
  await copyManifestWithSessions(fixtureRoot, ['SESSION_005'])

  backlogRoot = await mkdtemp(resolve(tmpdir(), 'wiki-backlog-'))
  await mkdir(resolve(backlogRoot, transcriptRoot), { recursive: true })
  await mkdir(resolve(backlogRoot, factsRoot), { recursive: true })
  const backlogSessions = ['SESSION_001', 'SESSION_002', 'SESSION_003', 'SESSION_004', 'SESSION_005', 'SESSION_006', 'SESSION_007']
  for (const sessionId of backlogSessions) {
    await cp(resolve(root, transcriptRoot, sessionId), resolve(backlogRoot, transcriptRoot, sessionId), { recursive: true })
  }
  await copyManifestWithSessions(backlogRoot, backlogSessions)
  const applied005 = (await readdir(resolve(root, factsRoot))).find((name) => /^AWIKI_SESSION_005_[a-f0-9]{64}\.json$/.test(name))
  assert.ok(applied005)
  await cp(resolve(root, factsRoot, applied005), resolve(backlogRoot, factsRoot, applied005))
})

after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
  await rm(backlogRoot, { recursive: true, force: true })
})

test('discovers only verified PUBLIC_ARCHIVE GM blocks from a selected S03 source', async () => {
  const source = await discoverWikiSource(fixtureRoot)
  assert.equal(source.sourceSession.session_id, 'SESSION_005')
  assert.equal(source.anchor.save_version, 274)
  assert.equal(source.anchor.game_time, '2027-07-12 17:30')
  assert.deepEqual(source.gmBlocks.map((block) => block.messageLabel), ['001', '003', '005'])
  assert.equal(source.gmBlocks.some((block) => block.body.includes('너 이거 얼마 쓰는지')), false)
})

test('walks manifest order and selects SESSION_006 after exact SESSION_005 facts exist', async () => {
  const sources = await discoverWikiSources(backlogRoot)
  assert.deepEqual(sources.map((source) => source.sourceSession.session_id), ['SESSION_005', 'SESSION_006', 'SESSION_007'])

  const source = await discoverWikiSource(backlogRoot)
  assert.equal(source.sourceSession.session_id, 'SESSION_006')
  assert.equal(source.anchor.save_version, 280)
  assert.equal(source.anchor.game_time, '2027-09-22 16:10')
  assert.deepEqual(source.gmBlocks.map((block) => block.messageLabel), ['001', '003', '005', '007', '009', '011', '013'])
  assert.match(expectedWikiFactPath(source), /AWIKI_SESSION_006_[a-f0-9]{64}\.json$/)
})


test('fact file alone does not advance; receipt advances exactly one source', async () => {
  const source006 = await discoverWikiSource(backlogRoot)
  assert.equal(source006.sourceSession.session_id, 'SESSION_006')

  const factRef = expectedWikiFactPath(source006)
  await writeFile(resolve(backlogRoot, factRef), '{}\n')
  assert.equal((await discoverWikiSource(backlogRoot)).sourceSession.session_id, 'SESSION_006')

  const { expectedWikiReceiptPath } = await import('./wiki-semantic-jobs.mjs')
  const receiptRef = expectedWikiReceiptPath(source006)
  await mkdir(resolve(backlogRoot, receiptRef, '..'), { recursive: true })
  await writeFile(resolve(backlogRoot, receiptRef), '{}\n')
  assert.equal((await discoverWikiSource(backlogRoot)).sourceSession.session_id, 'SESSION_007')
  await rm(resolve(backlogRoot, factRef), { force: true })
  await rm(resolve(backlogRoot, receiptRef), { force: true })
})

test('emits the legacy SESSION_005 GM-grounded facts with stable source identity', async () => {
  const source = await discoverWikiSource(fixtureRoot)
  const first = prepareWikiFacts(source, publicGraph)
  const second = prepareWikiFacts(source, publicGraph)
  assert.deepEqual(first, second)
  assert.equal(first.facts.nodes.length, 3)
  assert.equal(first.facts.relations.length, 3)
  assert.equal(first.facts.nodes.find((node) => node.id === 'event-west-road-trial-agreement').meta['기준시각'], '2027-06-22 11:00')
  assert.equal(first.facts.nodes.find((node) => node.id === 'event-west-road-rain-response').meta['기준시각'], '2027-07-05 09:00')
  assert.equal(first.facts.nodes[0].label, '조한수')
  assert.equal(first.facts.nodes.every((node) => node.source.includes('GM 공개 블록')), true)
  assert.match(first.path, /AWIKI_SESSION_005_[a-f0-9]{64}\.json$/)
  assert.equal(first.source.source_sha256, byteHash(first.bytes))
})

test('next generic source is visible as semantic work instead of being rejected by session number', async () => {
  const { runCli } = await import('../run-wiki-automation.mjs')
  const graphPath = resolve(root, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json')
  const before = await readFile(graphPath)
  const output = await runCli(['--apply'], { discover: () => discoverWikiSource(backlogRoot) })
  const result = JSON.parse(output)
  assert.equal(result.status, 'HUMAN_REVIEW')
  assert.equal(result.source_session, 'SESSION_006')
  assert.equal(result.reason, 'WIKI_SEMANTIC_EXTRACTOR_REQUIRED')
  assert.equal(result.graph_changed, false)
  assert.deepEqual(await readFile(graphPath), before)
})

test('applied SESSION_005 remains a deterministic NOOP', async () => {
  const { runCli } = await import('../run-wiki-automation.mjs')
  const graphPath = resolve(root, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json')
  const before = await readFile(graphPath)
  for (const mode of ['--apply', '--apply', '--check']) {
    const result = JSON.parse(await runCli([mode], { discover: () => discoverWikiSource(fixtureRoot) }))
    assert.equal(result.status, 'NOOP')
    assert.equal(result.fact_file, 'EXISTS')
    assert.equal(result.nodes_added, 0)
    assert.equal(result.relations_added, 0)
    assert.deepEqual(await readFile(graphPath), before)
  }
  const graph = JSON.parse(before)
  for (const id of ['char-jo-hansu', 'event-west-road-trial-agreement', 'event-west-road-rain-response']) {
    assert.ok(graph.nodes.some((node) => node.id === id))
  }
})

test('a previously applied source compiles to NOOP through the existing graph reconciler', async () => {
  const source = await discoverWikiSource(fixtureRoot)
  const prepared = prepareWikiFacts(source, publicGraph)
  const batch = { batch_id: `batch-${source.sourceDigest}`, snapshot: { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE', season_id: 'S03', source_save_version: source.anchor.save_version, source_game_time: source.anchor.game_time } }
  const args = { batch, facts: prepared.facts, source: { source_ref: prepared.path, source_sha256: byteHash(prepared.bytes) }, book, bookSource: { source_ref: 'archive/content/stories/C03-AFTERFALL/BOOK.json', source_sha256: 'a'.repeat(64) } }
  const first = reconcilePublicGraph({ ...args, previous: publicGraph })
  const second = reconcilePublicGraph({ ...args, previous: first.graph })
  assert.equal(first.report.nodes_added, 0)
  assert.equal(first.report.relations_added, 0)
  assert.equal(second.report.status, 'NOOP')
  assert.equal(second.report.nodes_added, 0)
  assert.equal(second.report.relations_added, 0)
})

test('rejects a new entity whose name does not occur in the GM source', async () => {
  const source = await discoverWikiSource(fixtureRoot)
  const candidate = prepareWikiFacts(source, publicGraph)
  candidate.facts.nodes[0] = { ...candidate.facts.nodes[0], label: '가공 인물' }
  const beforeApply = { ...publicGraph, nodes: publicGraph.nodes.filter((record) => !candidate.facts.nodes.some((node) => node.id === record.id)) }
  assert.throws(() => validateWikiFacts(candidate.facts, source, beforeApply), /WIKI_NEW_CHARACTER_EVIDENCE_INVALID/)
})

// Synthetic public-archive fixtures only. These are never written to the real
// AFTERFALL archive and do not represent played S04 events.
async function writeSyntheticSeason(targetRoot, seasonId, sessionId = 'SESSION_005', partCount = 1) {
  const seasonRef = `archive/content/transcripts/C03-AFTERFALL/${seasonId}`
  const prefix = `${seasonRef}/${sessionId}`
  const range = { start: '2099-01-01 10:00', end: '2099-01-01 10:00' }
  const session = { session_id: sessionId, visibility: 'PUBLIC_ARCHIVE', capture_quality: 'VERIFIED_CONTIGUOUS_TURN_PAIRS', atomic_pairing_complete: true,
    source_manifest: `${sessionId}/SOURCE_MANIFEST.json`, coverage_basis: 'captured_message_range', captured_message_range: range,
    user_messages: partCount, gm_public_blocks: partCount }
  const manifest = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', season_id: seasonId,
    archive_class: 'COLD_RAW', visibility: 'PUBLIC_ARCHIVE', sessions: [session] }
  const parts = {}, messages = []
  await mkdir(resolve(targetRoot, prefix), { recursive: true })
  for (let index = 0; index < partCount; index++) {
    const user = `SYNTHETIC_INPUT_${index}`, gm = `SYNTHETIC_PUBLIC_${seasonId}_${index}`
    const name = `PART_${String(index + 1).padStart(3, '0')}.md`
    const raw = Buffer.from(`## USER ${String(index * 2).padStart(3, '0')}\n\n${user}\n\n## GM ${String(index * 2 + 1).padStart(3, '0')}\n\n${gm}\n`)
    parts[name] = byteHash(raw)
    messages.push({ message_order: index * 2, role: 'USER', sha256: byteHash(user) },
      { message_order: index * 2 + 1, role: 'GM', sha256: byteHash(gm), state_link: { outcome: 'APPLIED', linked_save_version: 400 } })
    await writeFile(resolve(targetRoot, prefix, name), raw)
  }
  const source = { ...manifest, sessions: undefined, ...session, public_safe_only: true, closed_at: '2099-01-01T10:00:00Z',
    counts: { user: partCount, gm: partCount, total: partCount * 2 },
    message_order: { min: 0, max: partCount * 2 - 1, contiguous: true }, content_sha256: messages,
    parts: Object.keys(parts), parts_sha256: parts }
  await writeFile(resolve(targetRoot, prefix, 'SOURCE_MANIFEST.json'), JSON.stringify(source))
  await writeFile(resolve(targetRoot, seasonRef, 'MANIFEST.json'), JSON.stringify(manifest))
  return { seasonRef, manifest }
}

test('real S04 SESSION_002 remains eligible without dropping later same-save GM blocks', async () => {
  const sources = await discoverWikiSources(root)
  const source = sources.find((item) => item.seasonId === 'S04'
    && item.sourceSession.session_id === 'SESSION_002')
  assert.ok(source, 'verified published S04 SESSION_002 must enter the A-Wiki source inventory')
  assert.deepEqual(source.anchor, { save_version: 291, game_time: '2027-11-23 16:17' })
  assert.deepEqual(source.gmBlocks.map((block) => block.messageLabel), ['001', '003', '005'])
  const { buildWikiFactJob } = await import('./wiki-fact-extractor.mjs')
  const job = buildWikiFactJob(source, publicGraph)
  assert.equal(job.season_id, 'S04')
  assert.deepEqual(job.source.gm_blocks.map((block) => block.block_id), ['001', '003', '005'])
  assert.equal(job.source.manifest_ref, source.sourceManifestRef)
  assert.equal(job.source.manifest_sha256, source.sourceDigest)
})

test('same-save unlinked tail is allowed; changed, unknown or conflicting save is rejected', async () => {
  const testRoot = await mkdtemp(resolve(tmpdir(), 'wiki-applied-anchor-'))
  try {
    const season = 'S04', session = 'SESSION_123'
    const { seasonRef } = await writeSyntheticSeason(testRoot, season, session, 3)
    const manifestRef = resolve(testRoot, seasonRef, session, 'SOURCE_MANIFEST.json')
    const original = JSON.parse(await readFile(manifestRef, 'utf8'))
    const messages = original.content_sha256.map((message) => {
      const updated = { ...message, save_version: 400 }
      if (message.message_order > 1) delete updated.state_link
      return updated
    })
    const runCase = async (update) => {
      await writeFile(manifestRef, JSON.stringify({ ...original, content_sha256: update }))
      return discoverWikiSources(testRoot)
    }
    const accepted = await runCase(messages)
    assert.equal(accepted.length, 1)
    assert.deepEqual(accepted[0].anchor, { save_version: 400, game_time: '2099-01-01 10:00' })
    assert.deepEqual(accepted[0].gmBlocks.map((b) => b.messageLabel), ['001', '003', '005'])

    const withoutEvidence = messages.map(({ state_link, ...rest }) => rest)
    await assert.rejects(runCase(withoutEvidence), /WIKI_PUBLIC_ANCHOR_NOT_APPLIED/)

    const newerUnapplied = structuredClone(messages)
    newerUnapplied[5].save_version = 401
    await assert.rejects(runCase(newerUnapplied), /WIKI_PUBLIC_ANCHOR_NOT_APPLIED/)

    const unknownTail = structuredClone(messages)
    delete unknownTail[5].save_version
    await assert.rejects(runCase(unknownTail), /WIKI_PUBLIC_ANCHOR_NOT_APPLIED/)

    const conflictingLink = structuredClone(messages)
    conflictingLink[5].state_link = { outcome: 'REJECTED', linked_save_version: 400 }
    await assert.rejects(runCase(conflictingLink), /WIKI_PUBLIC_ANCHOR_NOT_APPLIED/)

    const invalidAppliedVersion = structuredClone(messages)
    invalidAppliedVersion[1].state_link.linked_save_version = 399
    await assert.rejects(runCase(invalidAppliedVersion), /WIKI_PUBLIC_ANCHOR_NOT_APPLIED/)

    // A manifest/source job may use the verified save, but cannot assert that
    // an unlinked late narrative block itself was committed to Runtime.
    const sameVersionButUserAdvance = structuredClone(messages)
    sameVersionButUserAdvance[4].save_version = 401
    await assert.rejects(runCase(sameVersionButUserAdvance), /WIKI_PUBLIC_ANCHOR_NOT_APPLIED/)
  } finally {
    await rm(testRoot, { recursive: true, force: true })
  }
})

test('S03 and S04 with the same session number have separate completion identities', async () => {
  const testRoot = await mkdtemp(resolve(tmpdir(), 'wiki-seasons-'))
  try {
    await writeSyntheticSeason(testRoot, 'S03')
    await writeSyntheticSeason(testRoot, 'S04')
    const sources = await discoverWikiSources(testRoot)
    assert.deepEqual(sources.map((source) => `${source.seasonId}/${source.sourceSession.session_id}`), ['S03/SESSION_005', 'S04/SESSION_005'])
    assert.notEqual(expectedWikiFactPath(sources[0]), expectedWikiFactPath(sources[1]))
    assert.notEqual(expectedWikiReceiptPath(sources[0]), expectedWikiReceiptPath(sources[1]))
    const receiptRef = expectedWikiReceiptPath(sources[0])
    await mkdir(resolve(testRoot, receiptRef, '..'), { recursive: true })
    await writeFile(resolve(testRoot, receiptRef), '{}\n')
    assert.equal((await discoverWikiSource(testRoot)).seasonId, 'S04')
    // The old SESSION_005 special case must never classify S04 as a legacy apply.
    const factRef = expectedWikiFactPath(sources[1])
    await mkdir(resolve(testRoot, factRef, '..'), { recursive: true })
    await writeFile(resolve(testRoot, factRef), '{}\n')
    assert.equal((await discoverWikiSource(testRoot)).seasonId, 'S04')
    assert.throws(() => prepareWikiFacts(sources[1], publicGraph), /WIKI_SEMANTIC_EXTRACTOR_REQUIRED/)
  } finally { await rm(testRoot, { recursive: true, force: true }) }
})

test('all approved parts reach the S04 job without dropping later GM blocks', async () => {
  const testRoot = await mkdtemp(resolve(tmpdir(), 'wiki-multipart-'))
  try {
    await writeSyntheticSeason(testRoot, 'S04', 'SESSION_001', 2)
    const source = await discoverWikiSource(testRoot)
    const { buildWikiFactJob } = await import('./wiki-fact-extractor.mjs')
    const job = buildWikiFactJob(source, publicGraph)
    assert.equal(job.season_id, 'S04')
    assert.deepEqual(job.source.gm_blocks.map((block) => block.block_id), ['001', '003'])
    assert.match(job.source.gm_blocks[1].text, /SYNTHETIC_PUBLIC_S04_1/)
    assert.equal(job.source.raw_parts.length, 2)
    assert.equal(job.source.raw_parts[1].ref, 'archive/content/transcripts/C03-AFTERFALL/S04/SESSION_001/PART_002.md')
  } finally { await rm(testRoot, { recursive: true, force: true }) }
})

test('private or incomplete S04 capture never becomes a pending semantic source', async () => {
  const testRoot = await mkdtemp(resolve(tmpdir(), 'wiki-private-season-'))
  try {
    const { seasonRef, manifest } = await writeSyntheticSeason(testRoot, 'S04')
    await rm(resolve(testRoot, seasonRef, 'SESSION_005'), { recursive: true, force: true })
    for (const visibility of ['PLAYER_ARCHIVE', 'CORE_PRIVATE']) {
      await writeFile(resolve(testRoot, seasonRef, 'MANIFEST.json'), JSON.stringify({ ...manifest, visibility }))
      assert.deepEqual(await discoverWikiSources(testRoot), [])
    }
    manifest.sessions[0].capture_quality = 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING'
    manifest.sessions[0].atomic_pairing_complete = false
    await writeFile(resolve(testRoot, seasonRef, 'MANIFEST.json'), JSON.stringify(manifest))
    assert.deepEqual(await discoverWikiSources(testRoot), [])
    await assert.rejects(discoverWikiSource(testRoot), /WIKI_NO_PENDING_SOURCE/)
  } finally { await rm(testRoot, { recursive: true, force: true }) }
})

test('approved S04 source with a mismatched season fails closed', async () => {
  const testRoot = await mkdtemp(resolve(tmpdir(), 'wiki-season-mismatch-'))
  try {
    const { seasonRef } = await writeSyntheticSeason(testRoot, 'S04')
    const ref = resolve(testRoot, seasonRef, 'SESSION_005/SOURCE_MANIFEST.json')
    const source = JSON.parse(await readFile(ref, 'utf8'))
    source.season_id = 'S03'
    await writeFile(ref, JSON.stringify(source))
    await assert.rejects(discoverWikiSources(testRoot), /INVALID_APPROVED_READER_SOURCE/)
  } finally { await rm(testRoot, { recursive: true, force: true }) }
})
