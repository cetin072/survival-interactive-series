import { readdir, readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'
import { splitRoleBlocks } from './reader-transform.mjs'
import { byteHash, graphHash } from './publication-graph.mjs'

const namespace = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const demand = (condition, code) => { if (!condition) throw new Error(code) }
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n')

/**
 * V1 deliberately supports the latest verified S03 source only. The A-Core
 * catalog performs the public visibility, pairing, path and hash checks; the
 * semantic input below is assembled from GM blocks only.
 */
export async function discoverWikiSource(root) {
  const manifestRef = 'archive/content/transcripts/C03-AFTERFALL/S03/MANIFEST.json'
  const manifestBytes = await readFile(resolve(root, manifestRef))
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  demand(manifest.chronicle_id === namespace.chronicle_id && manifest.worldline_id === namespace.worldline_id, 'WIKI_SOURCE_NAMESPACE_INVALID')
  demand(manifest.season_id === 'S03' && manifest.archive_class === 'COLD_RAW' && manifest.visibility === namespace.visibility, 'WIKI_SOURCE_NOT_PUBLIC_ARCHIVE')
  const io = {
    read: (ref) => readFile(resolve(root, ref)),
    listParts: async (prefix) => (await readdir(resolve(root, prefix))).filter((name) => /^PART_\d{3}\.md$/.test(name)),
  }
  const approved = await approvedSeasonCatalog(manifest, 'S03', io)
  const session = manifest.sessions.at(-1)
  if (session?.session_id !== 'SESSION_005') {
    const error = new Error('WIKI_V1_LATEST_SOURCE_UNSUPPORTED')
    error.source_session = session?.session_id ?? 'UNKNOWN'
    throw error
  }
  const sourceManifestRef = `archive/content/transcripts/C03-AFTERFALL/S03/${session.source_manifest}`
  const sourceManifestBytes = await readFile(resolve(root, sourceManifestRef))
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'))
  const part = approved.find((entry) => entry.autoPublication.sessionId === session.session_id)
  demand(part, 'WIKI_LATEST_SOURCE_NOT_APPROVED')
  const rawPath = resolve(root, part.archivePath)
  demand((await lstat(rawPath)).isFile(), 'WIKI_SOURCE_PART_NOT_REGULAR_FILE')
  const rawBytes = await readFile(rawPath)
  const blocks = splitRoleBlocks(rawBytes.toString('utf8'))
  const gmBlocks = blocks.filter((block) => block.header.role === 'GM')
  demand(gmBlocks.length === session.gm_public_blocks && gmBlocks.length === session.user_messages, 'WIKI_GM_PAIR_COUNT_MISMATCH')
  demand(gmBlocks.every((block) => block.header.messageLabel !== undefined), 'WIKI_GM_BLOCK_ORDER_MISSING')
  const lastPublicMessage = sourceManifest.content_sha256.at(-1)
  demand(lastPublicMessage?.role === 'GM' && lastPublicMessage.state_link?.outcome === 'APPLIED', 'WIKI_PUBLIC_ANCHOR_NOT_APPLIED')
  const anchor = { save_version: lastPublicMessage.state_link.linked_save_version, game_time: sourceManifest.captured_message_range.end }
  demand(anchor.save_version === 274 && anchor.game_time === '2027-07-12 17:30', 'WIKI_V1_ANCHOR_REVIEW_REQUIRED')
  return {
    manifestRef,
    sourceManifestRef,
    sourceManifestSha256: byteHash(sourceManifestBytes),
    sourceDigest: byteHash(sourceManifestBytes),
    sourceSession: session,
    anchor,
    rawRef: part.archivePath,
    rawSha256: byteHash(rawBytes),
    gmBlocks: gmBlocks.map((block) => ({ messageLabel: block.header.messageLabel, body: block.body })),
  }
}

function semanticFacts(source) {
  const gmText = source.gmBlocks.map((block) => block.body).join('\n\n').replace(/\*+/g, '')
  demand(/장부를 맡는\s+조한수라는 남자/.test(gmText), 'WIKI_NAMED_ENTITY_EVIDENCE_MISSING')
  demand(/장마철 전\s+6주 시험협정/.test(gmText), 'WIKI_AGREEMENT_EVIDENCE_MISSING')
  demand(/첫 공동 장마계획/.test(gmText), 'WIKI_RAIN_PLAN_EVIDENCE_MISSING')
  const gmLabels = source.gmBlocks.map((block) => block.messageLabel).join(', ')
  return {
    version: 'public-graph-facts-v1', ...namespace, season_id: 'S03', anchor: source.anchor,
    nodes: [
      {
        id: 'char-jo-hansu', label: '조한수', type: 'character', subtitle: '서쪽길 관리조 장부 담당',
        summary: '서쪽길 관리조에서 장부를 맡는다. 2027년 7월 긴급보강 예상표와 비용 항목을 설명하고 실제 투입분과 예비분을 구분하는 논의에 참여했다.',
        tags: ['S03', '인물', '서쪽길 관리조'], source: `S03 SESSION_005 GM 공개 블록 ${gmLabels}`,
        meta: { 역할: '관리조 장부 담당' },
      },
      {
        id: 'event-west-road-trial-agreement', label: '서쪽길 6주 시험협정', type: 'event', subtitle: '2027년 6월 22일',
        summary: '장마철 전 6주 시험협정을 맺었다. 길드 부담은 실제 통행부담을 기준으로 정하고 관리조 노동을 비용에 포함했으며, 도로 관리권과 통행 통제권은 길드로 넘기지 않았다.',
        tags: ['S03', '서쪽길', '시험협정'], source: `S03 SESSION_005 GM 공개 블록 ${gmLabels}`, meta: { 기준시각: '2027-06-22 11:00' },
      },
      {
        id: 'event-west-road-rain-response', label: '서쪽길 긴급복구와 공동 장마계획', type: 'event', subtitle: '2027년 7월 5일',
        summary: '도로 침하 대응에서 임시 흙 보강만으로는 반복을 막기 어렵다고 판단했다. 양측은 위험구간 공동 표시, 큰 차량의 우회·대기, 가용 자재 등록, 긴급공사 비용의 사건별 계산을 포함한 장마철 공동계획을 세웠다.',
        tags: ['S03', '서쪽길', '긴급복구', '장마계획'], source: `S03 SESSION_005 GM 공개 블록 ${gmLabels}`, meta: { 기준시각: '2027-07-05 09:00' },
      },
    ],
    relations: [
      { from: 'event-west-road-trial-agreement', to: 'loc-west-road', kind: 'occurred_at', label: '서쪽길 관리구간' },
      { from: 'char-jo-hansu', to: 'event-west-road-rain-response', kind: 'participated_in', label: '긴급보강 장부와 비용 설명' },
      { from: 'event-west-road-rain-response', to: 'loc-west-road', kind: 'occurred_at', label: '서쪽길 침하 구간' },
    ],
  }
}

export function validateWikiFacts(facts, source, graph) {
  demand(facts.version === 'public-graph-facts-v1' && facts.chronicle_id === namespace.chronicle_id && facts.worldline_id === namespace.worldline_id && facts.visibility === namespace.visibility, 'WIKI_FACT_NAMESPACE_INVALID')
  demand(facts.season_id === 'S03' && facts.anchor.save_version === source.anchor.save_version && facts.anchor.game_time === source.anchor.game_time, 'WIKI_FACT_ANCHOR_MISMATCH')
  demand(facts.nodes.length >= 2 && facts.nodes.length <= 5 && facts.nodes[0].id === 'char-jo-hansu', 'WIKI_FACT_SLICE_SIZE_INVALID')
  const gmText = source.gmBlocks.map((block) => block.body).join('\n\n').replace(/\*+/g, '')
  const existing = new Map(graph.nodes.map((node) => [node.id, node.data]))
  const labels = new Map(graph.nodes.map((node) => [node.data.label, node.id]))
  demand(/조한수/.test(gmText) && (!labels.has('조한수') || labels.get('조한수') === 'char-jo-hansu'), 'WIKI_ENTITY_COLLISION_OR_NO_GM_EVIDENCE')
  for (const node of facts.nodes) {
    demand(node.source.includes('GM 공개 블록'), 'WIKI_NODE_SOURCE_INVALID')
    demand(!labels.has(node.label) || labels.get(node.label) === node.id, 'WIKI_NODE_LABEL_COLLISION')
    demand(!existing.has(node.id) || graphHash(existing.get(node.id)) === graphHash(node), 'WIKI_NODE_IDENTITY_COLLISION')
  }
  demand(facts.nodes.filter((node) => node.type === 'character').every((node) => node.label === '조한수' && /장부를 맡는\s+조한수/.test(gmText)), 'WIKI_NEW_CHARACTER_EVIDENCE_INVALID')
  demand(facts.nodes.filter((node) => node.id === 'event-west-road-trial-agreement').every((node) => /6주 시험협정/.test(gmText)), 'WIKI_AGREEMENT_EVIDENCE_MISSING')
  demand(facts.nodes.filter((node) => node.id === 'event-west-road-rain-response').every((node) => /첫 공동 장마계획/.test(gmText)), 'WIKI_RAIN_PLAN_EVIDENCE_MISSING')
  for (const relation of facts.relations) demand(['participated_in', 'occurred_at'].includes(relation.kind), 'WIKI_RELATION_KIND_REVIEW_REQUIRED')
  demand(!/USER/.test(facts.nodes.map((node) => node.source).join(' ')), 'WIKI_USER_TEXT_AS_FACT_SOURCE')
  return facts
}

export function prepareWikiFacts(source, graph) {
  const facts = semanticFacts(source)
  validateWikiFacts(facts, source, graph)
  const path = `archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_SESSION_005_${source.sourceDigest}.json`
  return { facts, path, bytes: jsonBytes(facts), source: { source_ref: path, source_sha256: byteHash(jsonBytes(facts)) } }
}
