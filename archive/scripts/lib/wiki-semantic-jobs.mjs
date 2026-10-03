import { readdir, readFile, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { approvedSeasonCatalog } from './approved-reader-sources.mjs'
import { splitRoleBlocks } from './reader-transform.mjs'
import { byteHash, graphHash } from './publication-graph.mjs'

const namespace = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const seasonRoot = 'archive/content/transcripts/C03-AFTERFALL/S03'
const factsRoot = 'archive/content/public-facts/C03-AFTERFALL/S03'
const receiptsRoot = `${factsRoot}/receipts`
const demand = (condition, code) => { if (!condition) throw new Error(code) }
const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n')

export function expectedWikiFactPath(source) {
  return `${factsRoot}/AWIKI_${source.sourceSession.session_id}_${source.sourceDigest}.json`
}

export function expectedWikiReceiptPath(source) {
  return `${receiptsRoot}/AWIKI_${source.sourceSession.session_id}_${source.sourceDigest}.json`
}

async function existingWikiFactNames(root) {
  try {
    return new Set((await readdir(resolve(root, factsRoot)))
      .filter((name) => /^AWIKI_SESSION_\d{3}_[a-f0-9]{64}\.json$/.test(name)))
  } catch (error) {
    if (error.code === 'ENOENT') return new Set()
    throw error
  }
}

async function existingWikiReceiptNames(root) {
  try {
    return new Set((await readdir(resolve(root, receiptsRoot)))
      .filter((name) => /^AWIKI_SESSION_\d{3}_[a-f0-9]{64}\.json$/.test(name)))
  } catch (error) {
    if (error.code === 'ENOENT') return new Set()
    throw error
  }
}

async function materializeWikiSource(root, approved, session) {
  demand(/^SESSION_\d{3}$/.test(session?.session_id ?? ''), 'WIKI_SOURCE_SESSION_ID_INVALID')
  const sourceManifestRef = `${seasonRoot}/${session.source_manifest}`
  const sourceManifestBytes = await readFile(resolve(root, sourceManifestRef))
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'))
  demand(sourceManifest.session_id === session.session_id
    && sourceManifest.chronicle_id === namespace.chronicle_id
    && sourceManifest.worldline_id === namespace.worldline_id
    && sourceManifest.season_id === 'S03'
    && sourceManifest.visibility === namespace.visibility,
  'WIKI_SOURCE_MANIFEST_SCOPE_INVALID')

  const part = approved.find((entry) => entry.autoPublication.sessionId === session.session_id)
  demand(part, 'WIKI_SOURCE_NOT_APPROVED')
  const rawPath = resolve(root, part.archivePath)
  demand((await lstat(rawPath)).isFile(), 'WIKI_SOURCE_PART_NOT_REGULAR_FILE')
  const rawBytes = await readFile(rawPath)
  const blocks = splitRoleBlocks(rawBytes.toString('utf8'))
  const gmBlocks = blocks.filter((block) => block.header.role === 'GM')
  demand(gmBlocks.length === session.gm_public_blocks && gmBlocks.length === session.user_messages, 'WIKI_GM_PAIR_COUNT_MISMATCH')
  demand(gmBlocks.every((block) => block.header.messageLabel !== undefined), 'WIKI_GM_BLOCK_ORDER_MISSING')

  const lastPublicMessage = sourceManifest.content_sha256.at(-1)
  demand(lastPublicMessage?.role === 'GM' && lastPublicMessage.state_link?.outcome === 'APPLIED', 'WIKI_PUBLIC_ANCHOR_NOT_APPLIED')
  const anchor = {
    save_version: lastPublicMessage.state_link.linked_save_version,
    game_time: sourceManifest.captured_message_range.end,
  }
  demand(Number.isSafeInteger(anchor.save_version) && anchor.save_version > 0
    && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(anchor.game_time),
  'WIKI_SOURCE_ANCHOR_INVALID')

  return {
    manifestRef: `${seasonRoot}/MANIFEST.json`,
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

/**
 * A-Core owns source visibility/pairing/hash validation. A-Wiki walks the
 * verified S03 sessions in manifest order and selects the first source whose
 * exact immutable AWIKI fact file does not yet exist.
 */
export async function discoverWikiSources(root) {
  const manifestRef = `${seasonRoot}/MANIFEST.json`
  const manifestBytes = await readFile(resolve(root, manifestRef))
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  demand(manifest.chronicle_id === namespace.chronicle_id && manifest.worldline_id === namespace.worldline_id, 'WIKI_SOURCE_NAMESPACE_INVALID')
  demand(manifest.season_id === 'S03' && manifest.archive_class === 'COLD_RAW' && manifest.visibility === namespace.visibility, 'WIKI_SOURCE_NOT_PUBLIC_ARCHIVE')
  demand(Array.isArray(manifest.sessions) && manifest.sessions.length > 0, 'WIKI_SOURCE_MANIFEST_EMPTY')

  const existingNames = await existingWikiFactNames(root)
  const trackedSessionIds = new Set([...existingNames]
    .map((name) => name.match(/^AWIKI_(SESSION_\d{3})_[a-f0-9]{64}\.json$/)?.[1])
    .filter(Boolean))
  const firstTrackedIndex = manifest.sessions.findIndex((session) => trackedSessionIds.has(session.session_id))
  const trackedSessions = firstTrackedIndex >= 0 ? manifest.sessions.slice(firstTrackedIndex) : manifest.sessions

  const io = {
    read: (ref) => readFile(resolve(root, ref)),
    listParts: async (prefix) => (await readdir(resolve(root, prefix))).filter((name) => /^PART_\d{3}\.md$/.test(name)),
  }
  const approved = await approvedSeasonCatalog(manifest, 'S03', io)
  const sources = []
  for (const session of trackedSessions) sources.push(await materializeWikiSource(root, approved, session))
  return sources
}

export async function discoverWikiSource(root) {
  const [sources, existingNames, receiptNames] = await Promise.all([
    discoverWikiSources(root),
    existingWikiFactNames(root),
    existingWikiReceiptNames(root),
  ])
  const source = sources.find((candidate) => {
    const factName = expectedWikiFactPath(candidate).split('/').at(-1)
    const receiptName = expectedWikiReceiptPath(candidate).split('/').at(-1)
    const legacyApplied = candidate.sourceSession.session_id === 'SESSION_005' && existingNames.has(factName)
    return !legacyApplied && !receiptNames.has(receiptName)
  })

  if (!source) {
    const error = new Error('WIKI_NO_PENDING_SOURCE')
    error.source_session = sources.at(-1)?.sourceSession.session_id ?? null
    throw error
  }
  return source
}

function semanticFacts(source) {
  if (source.sourceSession.session_id !== 'SESSION_005') {
    const error = new Error('WIKI_SEMANTIC_EXTRACTOR_REQUIRED')
    error.source_session = source.sourceSession.session_id
    throw error
  }

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
  const path = expectedWikiFactPath(source)
  return { facts, path, bytes: jsonBytes(facts), source: { source_ref: path, source_sha256: byteHash(jsonBytes(facts)) } }
}
