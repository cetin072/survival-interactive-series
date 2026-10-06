/** A-Wiki semantic proposals. Adapted from C's job/result binding pattern;
 * no runtime dependency on Automation C, model provider, database or filesystem.
 * Exact quotes prove provenance, NOT semantic entailment: review remains required.
 */
import { byteHash, graphHash } from './publication-graph.mjs'

export const WIKI_JOB_VERSION = 'wiki-fact-job-v1'
export const WIKI_RESULT_VERSION = 'wiki-fact-result-v1'
export const WIKI_REVIEW_JOB_VERSION = 'wiki-fact-review-job-v1'
export const WIKI_REVIEW_VERSION = 'wiki-fact-review-v1'
const NS = { chronicle_id: 'C03-AFTERFALL', worldline_id: 'AFTERFALL', visibility: 'PUBLIC_ARCHIVE' }
const TYPES = { character: 'char', location: 'loc', event: 'event' }
const KINDS = ['related_to', 'participated_in', 'occurred_at', 'lives_at', 'works_at']
const FORBIDDEN_META = ['__proto__', 'constructor', 'prototype', 'gm_state', 'hidden_state', 'coordinates', 'private_routes']
const insist = (ok, code) => { if (!ok) throw new Error(code) }
const hashOK = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
function object(value, allowed, required = allowed) {
  insist(plain(value) && Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => Object.hasOwn(value, key)), 'WIKI_RESULT_FIELDS_INVALID')
}
function text(value, max = 4000) {
  insist(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), 'WIKI_TEXT_INVALID')
  return value
}
const normalize = (value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
const newId = (type, label) => `${TYPES[type]}-wiki-${graphHash({ ...NS, type, label: normalize(label) }).slice(0, 24)}`
function validAnchor(value) {
  object(value, ['save_version', 'game_time'])
  insist(Number.isSafeInteger(value.save_version) && value.save_version > 0, 'WIKI_ANCHOR_INVALID')
  insist(typeof value.game_time === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value.game_time), 'WIKI_ANCHOR_INVALID')
  const date = new Date(value.game_time.replace(' ', 'T') + ':00Z')
  insist(Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 16).replace('T', ' ') === value.game_time, 'WIKI_ANCHOR_INVALID')
}

/** Input must come from the existing verified-public source loader, not a model. */
export function buildWikiFactJob(source, graph) {
  for (const [key, value] of Object.entries(NS)) insist(graph?.[key] === value, 'WIKI_GRAPH_SCOPE_INVALID')
  const { content_sha256, ...graphBody } = graph
  insist(hashOK(content_sha256) && graphHash(graphBody) === content_sha256, 'WIKI_GRAPH_HASH_INVALID')
  validAnchor(graph.anchor)
  validAnchor(source.anchor)
  const session = source.sourceSession?.session_id
  insist(/^SESSION_\d{3}$/.test(session ?? ''), 'WIKI_SESSION_INVALID')
  const season = source.sourceManifestRef?.match(/^archive\/content\/transcripts\/C03-AFTERFALL\/(S\d{2,3})\//)?.[1]
  insist(season && Number(season.slice(1)) >= 3 && (!source.seasonId || source.seasonId === season), 'WIKI_SOURCE_SEASON_INVALID')
  const prefix = `archive/content/transcripts/C03-AFTERFALL/${season}/${session}/`
  insist(source.sourceManifestRef === prefix + 'SOURCE_MANIFEST.json' && source.rawRef.startsWith(prefix)
    && /^PART_\d{3}\.md$/.test(source.rawRef.slice(prefix.length)), 'WIKI_SOURCE_PATH_INVALID')
  insist(hashOK(source.sourceDigest) && hashOK(source.rawSha256), 'WIKI_SOURCE_HASH_INVALID')
  if (source.rawParts) {
    insist(Array.isArray(source.rawParts) && source.rawParts.length > 1
      && source.rawParts.every((part) => part.ref.startsWith(prefix) && /^PART_\d{3}\.md$/.test(part.ref.slice(prefix.length)) && hashOK(part.sha256))
      && new Set(source.rawParts.map((part) => part.ref)).size === source.rawParts.length
      && source.rawParts[0].ref === source.rawRef && source.rawParts[0].sha256 === source.rawSha256, 'WIKI_SOURCE_PARTS_INVALID')
  }
  insist(Array.isArray(source.gmBlocks) && source.gmBlocks.length > 0, 'WIKI_GM_BLOCKS_REQUIRED')
  const seen = new Set()
  const blocks = source.gmBlocks.map(({ messageLabel, body }) => {
    insist(/^\d{3,}$/.test(messageLabel) && !seen.has(messageLabel), 'WIKI_GM_ID_INVALID')
    seen.add(messageLabel)
    text(body, 200000)
    return { block_id: messageLabel, text: body, sha256: byteHash(body) }
  })
  // Never silently truncate later GM turns; split a too-large source explicitly.
  insist(blocks.length <= 1000 && blocks.reduce((sum, block) => sum + block.text.length, 0) <= 200000, 'WIKI_SOURCE_SPLIT_REQUIRED')
  const body = {
    version: WIKI_JOB_VERSION, ...NS, season_id: season,
    instructions_ref: 'docs/automation/A_WIKI_FACT_WORKER_V1.md',
    source: { session_id: session, manifest_ref: source.sourceManifestRef, manifest_sha256: source.sourceDigest,
      raw_ref: source.rawRef, raw_sha256: source.rawSha256,
      ...(source.rawParts ? { raw_parts: source.rawParts } : {}), anchor: source.anchor, gm_blocks: blocks },
    graph_sha256: content_sha256, graph_anchor: graph.anchor,
    existing_nodes: graph.nodes.map(({ id, data, anchor }) => ({ id, data, anchor })),
    existing_relations: graph.relations.map(({ id, data, anchor }) => ({ id, data, anchor })),
    relation_kinds: KINDS,
  }
  return { ...structuredClone(body), job_id: `wiki-job-${graphHash(body)}` }
}

function verifyJob(job) {
  insist(plain(job), 'WIKI_JOB_INVALID')
  const { job_id, ...body } = job
  insist(job.version === WIKI_JOB_VERSION && job_id === `wiki-job-${graphHash(body)}`, 'WIKI_JOB_BINDING_INVALID')
  insist(/^S\d{2,3}$/.test(job.season_id ?? '') && Number(job.season_id.slice(1)) >= 3
    && job.source?.manifest_ref === `archive/content/transcripts/C03-AFTERFALL/${job.season_id}/${job.source?.session_id}/SOURCE_MANIFEST.json`, 'WIKI_JOB_SEASON_MISMATCH')
}
function quoteEvidence(job, proof) {
  insist(Array.isArray(proof) && proof.length > 0 && proof.length <= 16, 'WIKI_EVIDENCE_REQUIRED')
  return proof.map((entry) => {
    object(entry, ['block_id', 'quote'])
    text(entry.quote, 12000)
    const block = job.source.gm_blocks.find((item) => item.block_id === entry.block_id)
    insist(block, 'WIKI_EVIDENCE_NOT_GM')
    const start = block.text.indexOf(entry.quote)
    insist(start >= 0, 'WIKI_QUOTE_NOT_FOUND')
    insist(block.text.indexOf(entry.quote, start + 1) < 0, 'WIKI_QUOTE_AMBIGUOUS')
    // A future option is not an already-played fact. Other ambiguity is reviewed.
    const menu = /^#{1,6}\s+(?:다음 큰 판단|선택지|다음 선택)\s*$/m.exec(block.text)
    insist(!menu || start + entry.quote.length <= menu.index, 'WIKI_QUOTE_IN_CHOICE_MENU')
    return { block_id: block.block_id, block_sha256: block.sha256, start, end: start + entry.quote.length, quote: entry.quote }
  })
}
function fieldEvidence(proofs, fields, resolveProof) {
  object(proofs, fields)
  return Object.fromEntries(fields.map((field) => [field, resolveProof(proofs[field])]))
}
function namesFor(node) {
  return [node.label, ...(typeof node.meta?.별칭 === 'string' ? node.meta.별칭.split(/[,·/]/) : [])].filter(Boolean).map(normalize)
}

/** Compile a model result into a reviewable proposal, never authoritative Graph. */
export function compileWikiFactProposal(job, result) {
  verifyJob(job)
  object(result, ['version', 'job_id', 'decision', 'coverage', 'nodes', 'relations', 'citations', 'deferred', 'note'])
  insist(result.version === WIKI_RESULT_VERSION && result.job_id === job.job_id, 'WIKI_RESULT_JOB_MISMATCH')
  insist(['FACTS_READY', 'NO_FACTS', 'HUMAN_REVIEW'].includes(result.decision), 'WIKI_DECISION_INVALID')
  text(result.note)
  object(result.coverage, ['status', 'reviewed_blocks'])
  insist(['PARTIAL', 'COMPLETE'].includes(result.coverage.status) && Array.isArray(result.coverage.reviewed_blocks), 'WIKI_COVERAGE_INVALID')
  const reviewed = new Set(result.coverage.reviewed_blocks)
  const allBlocks = job.source.gm_blocks.map((block) => block.block_id)
  insist(reviewed.size === result.coverage.reviewed_blocks.length && [...reviewed].every((id) => allBlocks.includes(id)), 'WIKI_COVERAGE_INVALID')
  if (result.coverage.status === 'COMPLETE') insist(reviewed.size === allBlocks.length, 'WIKI_COVERAGE_INCOMPLETE')
  insist(Array.isArray(result.nodes) && result.nodes.length <= 100 && Array.isArray(result.relations) && result.relations.length <= 200
    && Array.isArray(result.deferred) && result.deferred.length <= 100, 'WIKI_CANDIDATE_LIMIT_INVALID')
  if (result.decision !== 'FACTS_READY') insist(result.nodes.length === 0 && result.relations.length === 0, 'WIKI_NONREADY_FACTS_FORBIDDEN')
  if (result.decision === 'FACTS_READY') insist(result.nodes.length + result.relations.length > 0, 'WIKI_EMPTY_FACTS')

  insist(Array.isArray(result.citations) && result.citations.length <= 1000, 'WIKI_CITATIONS_INVALID')
  const citations = new Map()
  for (const item of result.citations) {
    object(item, ['id', 'block_id', 'quote'])
    insist(/^[a-z][a-z0-9-]{0,60}$/.test(item.id) && !citations.has(item.id), 'WIKI_CITATION_ID_INVALID')
    citations.set(item.id, quoteEvidence(job, [{ block_id: item.block_id, quote: item.quote }])[0])
  }
  const resolveProof = (references) => {
    insist(Array.isArray(references) && references.length > 0 && references.length <= 16
      && new Set(references).size === references.length && references.every((id) => citations.has(id)), 'WIKI_EVIDENCE_REQUIRED')
    return references.map((id) => structuredClone(citations.get(id)))
  }
  const existing = new Map(job.existing_nodes.map(({ id, data }) => [id, data]))
  const names = new Map()
  for (const [id, data] of existing) for (const name of namesFor(data)) {
    if (!names.has(name)) names.set(name, new Set())
    names.get(name).add(id)
  }
  const resolved = new Map(existing), keys = new Set(), ids = new Set(), evidence = []
  const nodes = result.nodes.map((candidate, index) => {
    object(candidate, ['key', 'existing_id', 'type', 'label', 'changes', 'evidence'])
    insist(/^new:[a-z][a-z0-9-]{0,60}$/.test(candidate.key) || candidate.key === candidate.existing_id, 'WIKI_KEY_INVALID')
    insist(!keys.has(candidate.key) && Object.hasOwn(TYPES, candidate.type), 'WIKI_ENTITY_INVALID')
    keys.add(candidate.key)
    text(candidate.label, 120)
    const old = candidate.existing_id === null ? null : existing.get(candidate.existing_id)
    const owners = names.get(normalize(candidate.label)) ?? new Set()
    if (candidate.existing_id !== null) {
      insist(old && candidate.key === candidate.existing_id, 'WIKI_EXISTING_ID_MISSING')
      insist(old.label === candidate.label && old.type === candidate.type, 'WIKI_IDENTITY_CHANGE_REVIEW_REQUIRED')
    } else {
      insist(candidate.key.startsWith('new:') && owners.size === 0, 'WIKI_EXISTING_NAME_REUSE_REQUIRED')
    }
    const id = old?.id ?? newId(candidate.type, candidate.label)
    insist(!ids.has(id) && (old || !existing.has(id)), 'WIKI_ENTITY_COLLISION')
    ids.add(id)
    object(candidate.changes, ['subtitle', 'summary', 'tags', 'meta'], old ? [] : ['subtitle', 'summary'])
    insist(Object.keys(candidate.changes).length > 0, 'WIKI_EMPTY_UPDATE')
    const fields = ['type', 'label']
    for (const [key, value] of Object.entries(candidate.changes)) {
      if (key === 'meta') {
        insist(plain(value) && Object.keys(value).length > 0 && Object.keys(value).length <= 50, 'WIKI_META_INVALID')
        for (const [name, item] of Object.entries(value)) {
          text(name, 80); text(item)
          insist(!FORBIDDEN_META.includes(name), 'WIKI_PRIVATE_FIELD_REJECTED')
          fields.push(`meta.${name}`)
        }
      } else {
        if (key === 'tags') insist(Array.isArray(value) && value.length <= 50 && value.every((tag) => typeof tag === 'string' && tag.trim() && tag.length <= 120), 'WIKI_TAGS_INVALID')
        else text(value)
        fields.push(key)
      }
    }
    const proofs = fieldEvidence(candidate.evidence, fields, resolveProof)
    if (!old && candidate.type !== 'event') insist(proofs.label.some(({ quote }) => quote.includes(candidate.label)), 'WIKI_NEW_NAME_NOT_IN_EVIDENCE')
    const labels = [...new Set(Object.values(proofs).flat().map((proof) => proof.block_id))].sort()
    const data = {
      ...(old ? structuredClone(old) : { id, type: candidate.type, label: candidate.label, tags: [] }),
      ...structuredClone(candidate.changes),
      tags: [...new Set([...(old?.tags ?? []), ...(candidate.changes.tags ?? [])])],
      source: `${job.season_id} ${job.source.session_id} GM 공개 블록 ${labels.join(', ')}`,
    }
    if (old?.meta || candidate.changes.meta) data.meta = { ...(old?.meta ?? {}), ...(candidate.changes.meta ?? {}) }
    resolved.set(candidate.key, data); resolved.set(id, data)
    names.set(normalize(candidate.label), new Set([id]))
    evidence.push({ pointer: `/nodes/${index}`, operation: old ? 'UPDATE' : 'CREATE', fields: proofs })
    return data
  })
  const relationKeys = new Set()
  const relations = result.relations.map((candidate, index) => {
    object(candidate, ['from', 'to', 'kind', 'label', 'evidence'])
    const from = resolved.get(candidate.from), to = resolved.get(candidate.to)
    insist(from && to && from.id !== to.id && KINDS.includes(candidate.kind), 'WIKI_RELATION_INVALID')
    const pair = { participated_in: ['character', 'event'], occurred_at: ['event', 'location'], lives_at: ['character', 'location'], works_at: ['character', 'location'] }[candidate.kind]
    insist(!pair || from.type === pair[0] && to.type === pair[1], 'WIKI_RELATION_TYPE_INVALID')
    text(candidate.label, 200)
    const key = `${from.id}:${to.id}:${candidate.kind}`
    insist(!relationKeys.has(key), 'WIKI_RELATION_DUPLICATE'); relationKeys.add(key)
    evidence.push({ pointer: `/relations/${index}`, fields: { relation: resolveProof(candidate.evidence) } })
    return { from: from.id, to: to.id, kind: candidate.kind, label: candidate.label }
  })
  const deferred = result.deferred.map((item) => {
    object(item, ['reason', 'evidence']); text(item.reason)
    return { reason: item.reason, evidence: resolveProof(item.evidence) }
  })
  for (const entry of evidence) for (const proof of Object.values(entry.fields).flat()) insist(reviewed.has(proof.block_id), 'WIKI_UNREVIEWED_BLOCK')
  for (const entry of deferred) for (const proof of entry.evidence) insist(reviewed.has(proof.block_id), 'WIKI_UNREVIEWED_BLOCK')
  const facts = { version: 'public-graph-facts-v1', ...NS, season_id: job.season_id, anchor: structuredClone(job.source.anchor), nodes, relations }
  const backfill = job.source.anchor.save_version < job.graph_anchor.save_version || job.source.anchor.game_time < job.graph_anchor.game_time
  const body = { version: 'wiki-fact-proposal-v1', job_id: job.job_id, source: {
    session_id: job.source.session_id, manifest_ref: job.source.manifest_ref, manifest_sha256: job.source.manifest_sha256,
    raw_ref: job.source.raw_ref, raw_sha256: job.source.raw_sha256,
  }, expected_graph_sha256: job.graph_sha256, result_sha256: graphHash(result),
    status: result.decision === 'FACTS_READY' ? 'FACTS_PROPOSED' : result.decision,
    review_required: true, application_status: backfill ? 'BACKFILL_REVIEW_REQUIRED' : 'SEMANTIC_REVIEW_REQUIRED',
    coverage: structuredClone(result.coverage), facts, evidence, deferred, note: result.note,
    raw_changed: false, book_changed: false, graph_changed: false, source_marked_processed: false,
  }
  return { ...body, proposal_sha256: graphHash(body) }
}

export function buildWikiFactReviewJob(job, proposal) {
  verifyJob(job)
  object(proposal, ['version', 'job_id', 'source', 'expected_graph_sha256', 'result_sha256', 'status', 'review_required', 'application_status', 'coverage', 'facts', 'evidence', 'deferred', 'note', 'raw_changed', 'book_changed', 'graph_changed', 'source_marked_processed', 'proposal_sha256'])
  const { proposal_sha256, ...proposalBody } = proposal
  insist(proposal.version === 'wiki-fact-proposal-v1' && proposal.job_id === job.job_id, 'WIKI_REVIEW_PROPOSAL_INVALID')
  insist(proposal_sha256 === graphHash(proposalBody), 'WIKI_REVIEW_PROPOSAL_HASH_INVALID')
  insist(proposal.expected_graph_sha256 === job.graph_sha256, 'WIKI_REVIEW_GRAPH_BINDING_INVALID')
  const body = {
    version: WIKI_REVIEW_JOB_VERSION,
    instructions_ref: 'docs/automation/A_WIKI_FACT_WORKER_V1.md',
    prepared_job: structuredClone(job),
    proposal: structuredClone(proposal),
  }
  return { ...body, review_job_id: `wiki-review-job-${graphHash(body)}` }
}

function verifyReviewJob(reviewJob) {
  insist(plain(reviewJob), 'WIKI_REVIEW_JOB_INVALID')
  const { review_job_id, ...body } = reviewJob
  insist(reviewJob.version === WIKI_REVIEW_JOB_VERSION
    && review_job_id === `wiki-review-job-${graphHash(body)}`, 'WIKI_REVIEW_JOB_BINDING_INVALID')
  verifyJob(reviewJob.prepared_job)
  const { proposal_sha256, ...proposalBody } = reviewJob.proposal
  insist(proposal_sha256 === graphHash(proposalBody)
    && reviewJob.proposal.job_id === reviewJob.prepared_job.job_id, 'WIKI_REVIEW_PROPOSAL_HASH_INVALID')
}

export function validateWikiFactReview(reviewJob, result) {
  verifyReviewJob(reviewJob)
  object(result, ['version', 'proposal_sha256', 'decision', 'note'])
  insist(result.version === WIKI_REVIEW_VERSION, 'WIKI_REVIEW_VERSION_INVALID')
  insist(result.proposal_sha256 === reviewJob.proposal.proposal_sha256, 'WIKI_REVIEW_PROPOSAL_MISMATCH')
  insist(['APPROVE', 'HUMAN_REVIEW', 'REJECT'].includes(result.decision), 'WIKI_REVIEW_DECISION_INVALID')
  text(result.note)
  if (result.decision === 'APPROVE') {
    insist(reviewJob.proposal.coverage.status === 'COMPLETE', 'WIKI_REVIEW_PARTIAL_APPROVAL_FORBIDDEN')
    insist(['FACTS_PROPOSED', 'NO_FACTS'].includes(reviewJob.proposal.status), 'WIKI_REVIEW_NONFINAL_PROPOSAL')
    const allBlocks = reviewJob.prepared_job.source.gm_blocks.map((block) => block.block_id)
    const reviewed = reviewJob.proposal.coverage.reviewed_blocks
    insist(Array.isArray(reviewed) && reviewed.length === allBlocks.length
      && reviewed.every((id, index) => id === allBlocks[index]), 'WIKI_REVIEW_COMPLETE_COVERAGE_REQUIRED')
  }
  return { ...structuredClone(result), review_sha256: graphHash(result) }
}

/** Provider-independent first semantic pass. */
export async function extractWikiFacts(job, generate) {
  verifyJob(job)
  insist(typeof generate === 'function', 'WIKI_MODEL_ADAPTER_REQUIRED')
  const result = await generate(structuredClone(job))
  return compileWikiFactProposal(job, result)
}

/** Independent second pass. The reviewer receives the complete prepared job and fixed proposal. */
export async function reviewWikiFactProposal(reviewJob, generate) {
  verifyReviewJob(reviewJob)
  insist(typeof generate === 'function', 'WIKI_REVIEW_MODEL_ADAPTER_REQUIRED')
  const result = await generate(structuredClone(reviewJob))
  return validateWikiFactReview(reviewJob, result)
}
