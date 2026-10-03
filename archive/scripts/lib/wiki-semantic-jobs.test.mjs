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
