import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import publicGraph from '../../content/graphs/C03-AFTERFALL/GRAPH.json' with { type: 'json' }
import book from '../../content/stories/C03-AFTERFALL/BOOK.json' with { type: 'json' }
import { byteHash, reconcilePublicGraph } from './publication-graph.mjs'
import { discoverWikiSource, prepareWikiFacts, validateWikiFacts } from './wiki-semantic-jobs.mjs'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

test('discovers only verified PUBLIC_ARCHIVE GM blocks from the latest S03 session', async () => {
  const source = await discoverWikiSource(root)
  assert.equal(source.sourceSession.session_id, 'SESSION_005')
  assert.equal(source.anchor.save_version, 274)
  assert.equal(source.anchor.game_time, '2027-07-12 17:30')
  assert.deepEqual(source.gmBlocks.map((block) => block.messageLabel), ['001', '003', '005'])
  assert.equal(source.gmBlocks.some((block) => block.body.includes('너 이거 얼마 쓰는지')), false)
})

test('emits three GM-grounded nodes and explicit relations with stable source identity', async () => {
  const source = await discoverWikiSource(root)
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

test('unsupported latest source yields visible HUMAN_REVIEW without changing Graph', async () => {
  const { runCli } = await import('../run-wiki-automation.mjs')
  const graphPath = resolve(root, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json')
  const before = await readFile(graphPath)
  const output = await runCli(['--apply'], { discover: async () => {
    const error = new Error('WIKI_V1_LATEST_SOURCE_UNSUPPORTED')
    error.source_session = 'SESSION_006'
    throw error
  } })
  const result = JSON.parse(output)
  assert.equal(result.status, 'HUMAN_REVIEW')
  assert.equal(result.source_session, 'SESSION_006')
  assert.equal(result.reason, 'WIKI_V1_LATEST_SOURCE_UNSUPPORTED')
  assert.equal(result.graph_changed, false)
  assert.deepEqual(await readFile(graphPath), before)
})

test('a previously applied source compiles to NOOP through the existing graph reconciler', async () => {
  const source = await discoverWikiSource(root)
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
  const source = await discoverWikiSource(root)
  const candidate = prepareWikiFacts(source, publicGraph)
  candidate.facts.nodes[0] = { ...candidate.facts.nodes[0], label: '가공 인물' }
  const beforeApply = { ...publicGraph, nodes: publicGraph.nodes.filter((record) => !candidate.facts.nodes.some((node) => node.id === record.id)) }
  assert.throws(() => validateWikiFacts(candidate.facts, source, beforeApply), /WIKI_NEW_CHARACTER_EVIDENCE_INVALID/)
})
