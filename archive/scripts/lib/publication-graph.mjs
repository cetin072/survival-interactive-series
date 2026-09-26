/** Public graph projection. No runtime/GM queries, network, filesystem, or model inference. */
import { createHash } from 'node:crypto'

const ns = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const types = ['character', 'location', 'event', 'faction', 'reference']
const kinds = ['published_relation', 'related_to', 'participated_in', 'occurred_at', 'lives_at', 'works_at', 'belongs_to']
const seedRef = 'archive/web/src/archive/archiveData.ts'
const bookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const idOK = (v) => typeof v === 'string' && /^[a-z][a-z0-9-]{1,100}$/.test(v)
const hashOK = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype
const demand = (v, code) => { if (!v) throw new Error(code) }
const keys = (v, allowed) => demand(obj(v) && Object.keys(v).every((k) => allowed.includes(k)), 'UNEXPECTED_GRAPH_FIELD')
const text = (v, max = 4000) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
function ordered(v) {
  if (Array.isArray(v)) return v.map(ordered)
  if (obj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordered(v[k])]))
  demand(v === null || ['string', 'boolean'].includes(typeof v) || (typeof v === 'number' && Number.isFinite(v)), 'NON_JSON_GRAPH')
  return v
}
export const graphHash = (v) => createHash('sha256').update(JSON.stringify(ordered(v))).digest('hex')
export const graphBytes = (v) => JSON.stringify(ordered(v), null, 2) + '\n'
export const byteHash = (v) => createHash('sha256').update(v).digest('hex')
function time(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return false
  const d = new Date(v.replace(' ', 'T') + ':00Z')
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 16).replace('T', ' ') === v
}
function namespace(v) { for (const [key, value] of Object.entries(ns)) demand(v[key] === value, 'NON_PUBLIC_OR_CROSS_CHRONICLE') }
function anchor(v) {
  keys(v, ['save_version', 'game_time'])
  demand(Number.isSafeInteger(v.save_version) && v.save_version > 0 && time(v.game_time), 'INVALID_GRAPH_ANCHOR')
}
function compare(a, b) {
  // Save progression and in-world time must agree; never silently rewrite a same-save fact.
  const x = Math.sign(a.save_version - b.save_version), y = Math.sign(a.game_time.localeCompare(b.game_time))
  demand(x === 0 ? y === 0 : y === 0 || x === y, 'ANCHOR_ORDER_CONFLICT')
  return x
}
function dataNode(v) {
  keys(v, ['id', 'label', 'type', 'subtitle', 'summary', 'tags', 'source', 'meta'])
  demand(idOK(v.id) && types.includes(v.type) && text(v.label, 120) && text(v.subtitle) && text(v.summary) && text(v.source), 'INVALID_PUBLIC_NODE')
  demand(Array.isArray(v.tags) && v.tags.length <= 50 && v.tags.every((s) => text(s, 120)) && new Set(v.tags).size === v.tags.length, 'INVALID_NODE_TAGS')
  if (v.meta !== undefined) demand(obj(v.meta) && Object.keys(v.meta).length <= 50 && Object.entries(v.meta).every(([k, val]) => text(k, 80) && !['__proto__', 'constructor', 'prototype', 'gm_state', 'hidden_state', 'coordinates', 'private_routes'].includes(k) && text(val)), 'INVALID_PUBLIC_META')
}
function dataRelation(v, nodes) {
  keys(v, ['from', 'to', 'kind', 'label'])
  demand(idOK(v.from) && idOK(v.to) && v.from !== v.to && kinds.includes(v.kind) && text(v.label, 200), 'INVALID_RELATION')
  demand(nodes.has(v.from) && nodes.has(v.to), 'DANGLING_RELATION')
  const a = nodes.get(v.from).data.type, b = nodes.get(v.to).data.type
  const pair = { participated_in: ['character', 'event'], occurred_at: ['event', 'location'], lives_at: ['character', 'location'], works_at: ['character', 'location'], belongs_to: ['character', 'faction'] }[v.kind]
  if (pair) demand(a === pair[0] && b === pair[1], 'RELATION_TYPE_MISMATCH')
}
export const relationId = (v) => `rel-${graphHash({ from: v.from, to: v.to, kind: v.kind, ...(v.kind === 'published_relation' ? { label: v.label } : {}) })}`
function evidence(v) {
  keys(v, ['source_ref', 'source_sha256', 'pointer'])
  demand(v.source_ref === seedRef || /^archive\/content\/public-facts\/C03-AFTERFALL\/S\d{2,3}\/[A-Za-z0-9_-]+\.json$/.test(v.source_ref), 'INVALID_GRAPH_SOURCE_REFERENCE')
  demand(hashOK(v.source_sha256) && /^\/(?:nodes|relations)\/\d+$/.test(v.pointer), 'INVALID_GRAPH_EVIDENCE')
}
function record(v, isNode, nodes) {
  keys(v, ['id', 'data', 'anchor', 'evidence', 'history'])
  anchor(v.anchor); evidence(v.evidence)
  if (isNode) { dataNode(v.data); demand(v.id === v.data.id, 'NODE_ID_CONFLICT') }
  else { dataRelation(v.data, nodes); demand(v.id === relationId(v.data), 'RELATION_ID_CONFLICT') }
  demand(Array.isArray(v.history) && v.history.length <= 10000, 'INVALID_GRAPH_HISTORY')
  let prior = null
  for (const h of v.history) {
    keys(h, ['anchor', 'data_sha256', 'evidence']); anchor(h.anchor); evidence(h.evidence)
    demand(hashOK(h.data_sha256) && compare(h.anchor, v.anchor) < 0, 'INVALID_HISTORY_ANCHOR')
    if (prior) demand(compare(prior, h.anchor) < 0, 'UNORDERED_HISTORY')
    prior = h.anchor
  }
}
function validatePrevious(previous) {
  keys(previous, ['version', 'chronicle_id', 'worldline_id', 'visibility', 'anchor', 'nodes', 'relations', 'story_links', 'articles', 'content_sha256'])
  namespace(previous); anchor(previous.anchor)
  demand(previous.version === 'archive-graph-v1' && Array.isArray(previous.nodes) && Array.isArray(previous.relations), 'INVALID_PRIOR_GRAPH')
  const { content_sha256, ...body } = previous
  demand(hashOK(content_sha256) && graphHash(body) === content_sha256, 'GRAPH_INTEGRITY_MISMATCH')
  const nodes = new Map()
  for (const r of previous.nodes) { record(r, true); demand(!nodes.has(r.id) && compare(r.anchor, previous.anchor) <= 0, 'INVALID_PRIOR_NODE'); nodes.set(r.id, r) }
  const edges = new Set()
  for (const r of previous.relations) { record(r, false, nodes); demand(!edges.has(r.id) && compare(r.anchor, previous.anchor) <= 0, 'INVALID_PRIOR_RELATION'); edges.add(r.id) }
  // Derived views are rebuilt below, not trusted or spread into the next graph.
}
function aliases(nodes) {
  const result = new Map()
  for (const { data } of nodes) {
    const names = [data.label]
    if (typeof data.meta?.별칭 === 'string') names.push(...data.meta.별칭.split(/[,·/]/).map((s) => s.trim()))
    for (const name of new Set(names.filter((s) => /^[\p{L}\p{N} _-]{2,120}$/u.test(s)))) {
      if (!result.has(name)) result.set(name, new Set())
      result.get(name).add(data.id)
    }
  }
  return result
}
function mentionOffsets(body, name) {
  const found = []
  let offset = body.indexOf(name)
  while (offset >= 0 && found.length < 32) {
    const before = body.slice(0, offset), after = body.slice(offset + name.length)
    const left = !/[\p{L}\p{N}_]$/u.test(before)
    const right = !/^[\p{L}\p{N}_]/u.test(after) || /^(?:에게서|으로부터|에게|에서|으로|하고|처럼|까지|부터|이라|와|과|은|는|이|가|을|를|의|에|로|도|만)(?=$|[^\p{L}\p{N}_])/u.test(after)
    if (left && right) found.push(offset)
    offset = body.indexOf(name, offset + name.length)
  }
  return found
}
function views(nodes, relations, book, bookSource, currentAnchor) {
  demand(book?.chronicleId === ns.chronicle_id && book.worldlineId === ns.worldline_id && Array.isArray(book.chapters), 'BOOK_NAMESPACE_MISMATCH')
  keys(bookSource, ['source_ref', 'source_sha256'])
  demand(bookSource.source_ref === bookRef && hashOK(bookSource.source_sha256), 'INVALID_BOOK_EVIDENCE')
  const ids = new Set(nodes.map((r) => r.id)), names = aliases(nodes), links = [], seen = new Set()
  for (const chapter of book.chapters) {
    demand(typeof chapter.id === 'string' && chapter.id.startsWith('c03-afterfall-') && !seen.has(chapter.id), 'INVALID_CHAPTER_ID')
    seen.add(chapter.id)
    demand(chapter.sourceKind === 'VERIFIED_GM_NARRATIVE' && typeof chapter.body === 'string' && text(chapter.title, 200), 'INVALID_PUBLIC_CHAPTER')
    if (chapter.publicationProvenance) {
      demand(chapter.publicationProvenance.visibility === 'PUBLIC_ARCHIVE' && time(chapter.publicationProvenance.capturedRange?.end), 'NON_PUBLIC_CHAPTER')
      if (chapter.publicationProvenance.capturedRange.end > currentAnchor.game_time) continue
    } else demand(/^c03-afterfall-chapter-\d+$/.test(chapter.id), 'UNKNOWN_LEGACY_CHAPTER')
    const reasons = new Map(), add = (id, why) => { if (!reasons.has(id)) reasons.set(id, []); reasons.get(id).push(why) }
    demand(Array.isArray(chapter.relatedNodeIds), 'INVALID_EDITORIAL_LINKS')
    for (const id of new Set(chapter.relatedNodeIds)) { demand(ids.has(id), 'UNKNOWN_EDITORIAL_NODE'); add(id, { kind: 'EDITORIAL_REFERENCE' }) }
    for (const [name, owners] of names) {
      if (owners.size !== 1) continue // An ambiguous alias never guesses an identity.
      const offsets = mentionOffsets(chapter.body, name)
      if (offsets.length) add([...owners][0], { kind: 'EXACT_TEXT_MENTION', alias: name, offsets })
    }
    for (const [node_id, why] of reasons) links.push({
      id: `mention-${graphHash({ node_id, chapter_id: chapter.id })}`, node_id, chapter_id: chapter.id,
      chapter_title: chapter.title, body_sha256: byteHash(chapter.body), evidence: structuredClone(bookSource), reasons: why,
    })
  }
  links.sort((a, b) => a.id.localeCompare(b.id))
  const articles = nodes.map(({ id, data }) => ({
    id, type: data.type, label: data.label, subtitle: data.subtitle, overview: data.summary, tags: data.tags, facts: data.meta ?? {},
    relations: relations.filter((r) => r.data.from === id || r.data.to === id).map((r) => ({ relation_id: r.id, other_id: r.data.from === id ? r.data.to : r.data.from, direction: r.data.from === id ? 'outgoing' : 'incoming', label: r.data.label, kind: r.data.kind })),
    story_link_ids: links.filter((l) => l.node_id === id).map((l) => l.id),
  }))
  return { story_links: links, articles, ambiguous_aliases: [...names.values()].filter((s) => s.size > 1).length }
}

/** Facts must already be public and evidence-bound by the caller's pinned-file loader. */
export function reconcilePublicGraph({ batch, previous = null, facts, source, book, bookSource }) {
  demand(/^batch-[a-f0-9]{64}$/.test(batch?.batch_id), 'INVALID_BATCH_ID')
  namespace(batch.snapshot)
  const boundary = { save_version: batch.snapshot.source_save_version, game_time: batch.snapshot.source_game_time }; anchor(boundary)
  keys(facts, ['version', 'chronicle_id', 'worldline_id', 'season_id', 'visibility', 'anchor', 'nodes', 'relations'])
  namespace(facts); anchor(facts.anchor)
  demand(facts.version === 'public-graph-facts-v1' && facts.season_id === batch.snapshot.season_id, 'GRAPH_FACT_SCOPE_MISMATCH')
  demand(compare(facts.anchor, boundary) === 0, 'FACTS_OUTSIDE_BATCH')
  keys(source, ['source_ref', 'source_sha256'])
  if (source.source_ref !== seedRef) demand(source.source_ref.startsWith(`archive/content/public-facts/C03-AFTERFALL/${facts.season_id}/`), 'GRAPH_SOURCE_SEASON_MISMATCH')
  evidence({ ...source, pointer: '/nodes/0' })
  demand(Array.isArray(facts.nodes) && facts.nodes.length <= 5000 && Array.isArray(facts.relations) && facts.relations.length <= 20000, 'INVALID_GRAPH_INVENTORY')
  if (previous) validatePrevious(previous)
  const nodes = new Map((previous?.nodes ?? []).map((r) => [r.id, structuredClone(r)]))
  const relations = new Map((previous?.relations ?? []).map((r) => [r.id, structuredClone(r)]))
  const report = { batch_id: batch.batch_id, nodes_added: 0, nodes_updated: 0, relations_added: 0, relations_updated: 0, stale_records_ignored: 0, unchanged_records: 0, database_writes: 0, external_calls: 0, site_publications: 0 }
  const seen = new Set(), edgeSeen = new Set()
  const stale = previous && compare(boundary, previous.anchor) < 0
  const upsert = (store, id, data, pointer, kind) => {
    const old = store.get(id)
    if (stale) { report.stale_records_ignored++; return }
    if (old && graphHash(old.data) === graphHash(data)) { report.unchanged_records++; return }
    if (old) {
      demand(compare(boundary, old.anchor) > 0, 'SAME_REVISION_FACT_CONFLICT')
      if (kind === 'nodes') demand(old.data.type === data.type, 'ENTITY_TYPE_CHANGED')
    }
    store.set(id, { id, data: structuredClone(data), anchor: { ...boundary }, evidence: { ...source, pointer }, history: old ? [...old.history, { anchor: old.anchor, data_sha256: graphHash(old.data), evidence: old.evidence }] : [] })
    report[`${kind}_${old ? 'updated' : 'added'}`]++
  }
  for (const [index, data] of facts.nodes.entries()) { dataNode(data); demand(!seen.has(data.id), 'DUPLICATE_NODE'); seen.add(data.id); upsert(nodes, data.id, data, `/nodes/${index}`, 'nodes') }
  for (const [index, data] of facts.relations.entries()) {
    // A stale new endpoint must not enter current public state.
    if (stale && (!nodes.has(data.from) || !nodes.has(data.to))) { report.stale_records_ignored++; continue }
    dataRelation(data, nodes); const id = relationId(data); demand(!edgeSeen.has(id), 'DUPLICATE_RELATION'); edgeSeen.add(id); upsert(relations, id, data, `/relations/${index}`, 'relations')
  }
  const sortedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), sortedRelations = [...relations.values()].sort((a, b) => a.id.localeCompare(b.id))
  for (const r of sortedRelations) dataRelation(r.data, nodes)
  const currentAnchor = stale ? previous.anchor : boundary
  const derived = views(sortedNodes, sortedRelations, book, bookSource, currentAnchor)
  const body = { version: 'archive-graph-v1', ...ns, anchor: { ...currentAnchor }, nodes: sortedNodes, relations: sortedRelations, story_links: derived.story_links, articles: derived.articles }
  const graph = { ...body, content_sha256: graphHash(body) }
  return { graph, report: { ...report, status: previous?.content_sha256 === graph.content_sha256 ? 'NOOP' : 'GRAPH_COMPILED', node_count: sortedNodes.length, relation_count: sortedRelations.length, story_links: graph.story_links.length, ambiguous_aliases: derived.ambiguous_aliases, inferred_relationships: 0 } }
}

/** The one legacy adapter is limited to the graph already deployed from main, not live DB data. */
export function legacyPublicFacts({ archiveMeta, archiveNodes, archiveEdges }) {
  demand(archiveMeta?.worldline === 'AFTERFALL' && archiveMeta.season === 'S02 COMPLETE' && archiveMeta.saveVersion === '253' && archiveMeta.gameTime === '2027-03-23 17:50', 'LEGACY_BASELINE_CHANGED_REVIEW_REQUIRED')
  return { version: 'public-graph-facts-v1', ...ns, season_id: 'S02', anchor: { save_version: 253, game_time: archiveMeta.gameTime }, nodes: structuredClone(archiveNodes), relations: archiveEdges.map((e) => ({ ...structuredClone(e), kind: 'published_relation' })) }
}
