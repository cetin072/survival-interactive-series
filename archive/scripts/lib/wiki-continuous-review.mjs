/** Deterministic review queue. Semantic calls and publication are separate owners. */
import { graphHash, byteHash } from './publication-graph.mjs'

export const workTypes = ['NEW_SOURCE', 'MISSING_FACT', 'MISSING_RELATION', 'FACT_CORRECTION',
  'FACT_ENRICHMENT', 'SOURCE_REVIEW', 'NO_CHANGE']
const priority = { NEW_SOURCE: 1, MISSING_FACT: 2, MISSING_RELATION: 3,
  FACT_CORRECTION: 4, FACT_ENRICHMENT: 4, SOURCE_REVIEW: 5 }
const insist = (ok, code) => { if (!ok) throw new Error(code) }
const nonempty = v => typeof v === 'string' && v.trim().length > 0
const normalize = v => v.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
const hashOK = v => /^[a-f0-9]{64}$/.test(v ?? '')
export const emptyReviewLedger = () => ({ version: 'wiki-review-ledger-v1', events: [] })

export function validateReviewLedger(ledger) {
  insist(ledger?.version === 'wiki-review-ledger-v1' && Array.isArray(ledger.events), 'WIKI_REVIEW_LEDGER_INVALID')
  let previous = null
  for (const event of ledger.events) {
    const { event_sha256, ...body } = event
    insist(body.previous_sha256 === previous && graphHash(body) === event_sha256
      && nonempty(body.at) && Number.isFinite(Date.parse(body.at)), 'WIKI_REVIEW_LEDGER_CHANGED')
    previous = event_sha256
  }
  return ledger
}
const append = (ledger, data, at) => {
  validateReviewLedger(ledger)
  const body = { ...data, at, previous_sha256: ledger.events.at(-1)?.event_sha256 ?? null }
  const next = { ...ledger, events: [...ledger.events, { ...body, event_sha256: graphHash(body) }] }
  return validateReviewLedger(next)
}
export function verifyReviewScope(scope) {
  const binding = Object.fromEntries(['chronicle_id', 'worldline_id', 'source_id', 'source_sha256',
    'raw', 'wiki_sha256', 'book_sha256', 'approval_sha256'].map(k => [k, scope[k]]))
  insist(/^C\d{2,}-[A-Z0-9-]+$/.test(scope.chronicle_id) && nonempty(scope.worldline_id)
    && nonempty(scope.source_id) && nonempty(scope.source?.text)
    && byteHash(scope.source.text) === scope.source_sha256
    && ['source_sha256', 'wiki_sha256', 'book_sha256', 'approval_sha256'].every(k => hashOK(scope[k]))
    && Array.isArray(scope.raw) && scope.raw.length > 0
    && scope.raw.every(p => nonempty(p.ref) && hashOK(p.sha256))
    && scope.scope_sha256 === graphHash(binding), 'WIKI_REVIEW_SCOPE_INVALID')
  insist(Array.isArray(scope.existing?.nodes) && Array.isArray(scope.existing?.relations), 'WIKI_REVIEW_INVENTORY_INVALID')
}

/** Baseline is pending until a complete independent review records a result.
 * Exact scope binding includes wiki, source, RAW, BOOK and approval versions.
 * No timestamp expiry by itself schedules another semantic read.
 */
export function discoverReviewWork(discovery, ledger = emptyReviewLedger()) {
  validateReviewLedger(ledger)
  discovery.scopes.forEach(verifyReviewScope)
  if (discovery.new_source) return { status: 'LEGACY_NEW_SOURCE', work_type: 'NEW_SOURCE',
    chronicle_id: 'C03-AFTERFALL', route: 'EXISTING_C03_NATIVE', source: discovery.new_source }
  const latest = new Map()
  for (const event of ledger.events) if (event.job_id) latest.set(event.job_id, event)
  const active = [...latest.values()].find(e => ['QUEUED', 'EXTRACTOR_SUBMITTED', 'REVIEW_READY'].includes(e.status))
  if (active) {
    const scope = discovery.scopes.find(s => s.chronicle_id === active.job.chronicle_id
      && s.source_id === active.job.scope.source_id)
    return { status: scope?.scope_sha256 === active.job.scope_sha256 ? 'EXISTING_JOB' : 'STALE_JOB', job: active.job }
  }
  const seen = new Set(ledger.events.filter(e => e.kind === 'QUEUED').map(e => e.job.scope_sha256))
  const last = new Map()
  const load = new Map()
  for (const e of ledger.events.filter(e => e.kind === 'QUEUED')) {
    last.set(e.job.chronicle_id, e.at)
    load.set(e.job.chronicle_id, (load.get(e.job.chronicle_id) ?? 0) + 1)
  }
  const candidates = discovery.scopes.filter(s => !seen.has(s.scope_sha256)).map(scope => ({
    version: 'wiki-continuous-job-v1', work_type: 'SOURCE_REVIEW',
    chronicle_id: scope.chronicle_id, worldline_id: scope.worldline_id,
    scope_sha256: scope.scope_sha256, scope,
    job_id: `wiki-review-${scope.scope_sha256}`,
  }))
  candidates.sort((a, b) => priority[a.work_type] - priority[b.work_type]
    || (last.get(a.chronicle_id) ?? '').localeCompare(last.get(b.chronicle_id) ?? '')
    || (load.get(a.chronicle_id) ?? 0) - (load.get(b.chronicle_id) ?? 0)
    || a.chronicle_id.localeCompare(b.chronicle_id)
    || a.scope.source_id.localeCompare(b.scope.source_id))
  return candidates.length ? { status: 'JOB_AVAILABLE', job: candidates[0] }
    : { status: 'NO_JOB', reason: '정상 대기 — 현재 새로 반영할 사실 없음', schedule_action: 'KEEP_UNCHANGED' }
}
export function enqueueReviewWork(discovery, ledger, at) {
  const found = discoverReviewWork(discovery, ledger)
  if (found.status === 'STALE_JOB') {
    const retained = append(ledger, { kind: 'STALE', status: 'SUPERSEDED', job_id: found.job.job_id,
      job: found.job, reason: 'SOURCE_OR_WIKI_CHANGED_FRESH_REVIEW_REQUIRED' }, at)
    return enqueueReviewWork(discovery, retained, at)
  }
  if (found.status !== 'JOB_AVAILABLE') return { ...found, ledger }
  return { status: 'QUEUED', job: found.job, ledger: append(ledger, {
    kind: 'QUEUED', status: 'QUEUED', job_id: found.job.job_id, job: found.job,
  }, at) }
}
function current(ledger, jobId, expected) {
  validateReviewLedger(ledger)
  const event = ledger.events.findLast(e => e.job_id === jobId)
  insist(event?.status === expected, 'WIKI_REVIEW_PHASE_MISMATCH')
  return event
}
function fresh(job, scope) {
  verifyReviewScope(scope)
  insist(job.scope_sha256 === scope.scope_sha256
    && graphHash(job.scope) === graphHash(scope), 'WIKI_REVIEW_STALE_SCOPE')
}
const factTexts = scope => scope.existing.nodes.flatMap(n => n.facts?.map(f => f.text)
  ?? [n.data?.summary ?? '']).concat(scope.existing.relations.map(r => r.label ?? r.data?.label ?? ''))

/** Quotes establish provenance only. Reviewer must check entailment and meaningfulness.
 * Exact text duplicates can be excluded deterministically; paraphrases need review.
 */
export function submitReviewExtraction(ledger, jobId, scope, result, executionId, at) {
  const event = current(ledger, jobId, 'QUEUED'), job = event.job
  fresh(job, scope)
  insist(nonempty(executionId) && result?.version === 'wiki-continuous-result-v1'
    && result.job_id === jobId && result.scope_sha256 === scope.scope_sha256
    && result.coverage === 'COMPLETE' && Number.isSafeInteger(result.checked_fact_count)
    && result.checked_fact_count >= 0 && Array.isArray(result.candidates)
    && result.candidates.length <= 100 && Array.isArray(result.insufficient_evidence)
    && nonempty(result.next_review_condition), 'WIKI_REVIEW_RESULT_INVALID')
  const knownIds = new Set(scope.existing.nodes.map(n => n.id))
  const existingText = new Set(factTexts(scope).map(normalize))
  const candidates = [], duplicates = []
  // A rejected/stale extraction is not an applied fact. Never let an old
  // source/RAW/BOOK/approval binding suppress review against a changed scope.
  const keys = new Set(ledger.events.filter(e => e.kind === 'REVIEW'
    && e.status === 'HUMAN_APPROVAL_REQUIRED' && e.job.chronicle_id === scope.chronicle_id
    && e.job.scope_sha256 === scope.scope_sha256)
    .flatMap(e => e.proposal.candidates.map(c => c.semantic_key)))
  for (const candidate of result.candidates) {
    insist(['MISSING_FACT', 'MISSING_RELATION', 'FACT_CORRECTION', 'FACT_ENRICHMENT'].includes(candidate.work_type)
      && candidate.chronicle_id === scope.chronicle_id && nonempty(candidate.text)
      && nonempty(candidate.meaningful_change) && ['RECORDED', 'REPORTED'].includes(candidate.assertion_kind),
    'WIKI_REVIEW_CANDIDATE_INVALID')
    insist(Array.isArray(candidate.evidence) && candidate.evidence.length > 0
      && candidate.evidence.every(e => e.source_sha256 === scope.source_sha256
        && typeof e.quote === 'string' && e.quote.length >= 12 && scope.source.text.includes(e.quote)),
    'WIKI_REVIEW_EVIDENCE_REQUIRED')
    insist(Array.isArray(candidate.entity_ids) && candidate.entity_ids.length > 0
      && candidate.entity_ids.every(id => knownIds.has(id)), 'WIKI_REVIEW_IDENTITY_INVALID')
    // New entity identity allocation remains publisher-owned; this V1 seam handles existing identities.
    if (['FACT_CORRECTION', 'FACT_ENRICHMENT'].includes(candidate.work_type)) {
      insist(hashOK(candidate.previous_record_sha256)
        && scope.existing.nodes.some(n => candidate.entity_ids.includes(n.id)
          && graphHash(n) === candidate.previous_record_sha256), 'WIKI_REVIEW_PREVIOUS_RECORD_REQUIRED')
    }
    for (const evidence of candidate.evidence) {
      const menu = /^#{1,6}\s+(?:다음 큰 판단|선택지|다음 선택)\s*$/m.exec(scope.source.text)
      insist(!menu || scope.source.text.indexOf(evidence.quote) + evidence.quote.length <= menu.index,
        'WIKI_REVIEW_FUTURE_CHOICE')
    }
    const key = graphHash({ chronicle_id: scope.chronicle_id, entity_ids: [...candidate.entity_ids].sort(),
      text: normalize(candidate.text), assertion_kind: candidate.assertion_kind, work_type: candidate.work_type })
    if (existingText.has(normalize(candidate.text)) || keys.has(key)) duplicates.push(key)
    else { keys.add(key); candidates.push({ ...candidate, candidate_sha256: graphHash(candidate), semantic_key: key }) }
  }
  const proposal = { version: 'wiki-continuous-proposal-v1', job_id: jobId,
    scope_sha256: scope.scope_sha256, result_sha256: graphHash(result), candidates, duplicates,
    insufficient_evidence: result.insufficient_evidence, checked_fact_count: result.checked_fact_count,
    next_review_condition: result.next_review_condition }
  return append(ledger, { kind: 'EXTRACTION', status: 'REVIEW_READY', job_id: jobId, job,
    extractor_execution_id: executionId, result: structuredClone(result),
    proposal, proposal_sha256: graphHash(proposal) }, at)
}
export function submitIndependentReview(ledger, jobId, scope, review, executionId, at) {
  const e = current(ledger, jobId, 'REVIEW_READY')
  fresh(e.job, scope)
  insist(nonempty(executionId) && executionId !== e.extractor_execution_id, 'WIKI_REVIEW_INDEPENDENT_EXECUTION_REQUIRED')
  insist(review?.version === 'wiki-continuous-review-v1' && review.job_id === jobId
    && review.proposal_sha256 === e.proposal_sha256
    && ['APPROVE', 'HUMAN_REVIEW', 'REJECT'].includes(review.decision)
    && nonempty(review.note), 'WIKI_REVIEW_DECISION_INVALID')
  const status = review.decision !== 'APPROVE' ? review.decision
    : e.proposal.candidates.length ? 'HUMAN_APPROVAL_REQUIRED' : 'NO_CHANGE'
  // No publisher exists for this new contract yet. Approval never implies publication.
  return append(ledger, { kind: 'REVIEW', status, work_type: status === 'NO_CHANGE' ? 'NO_CHANGE' : e.job.work_type,
    job_id: jobId, job: e.job, extractor_execution_id: e.extractor_execution_id,
    reviewer_execution_id: executionId, result: e.result, proposal: e.proposal,
    proposal_sha256: e.proposal_sha256, review: structuredClone(review),
    publication_policy: scope.publication_policy }, at)
}

export function reviewQueueSummary(discovery, ledger) {
  validateReviewLedger(ledger)
  const last = new Map(ledger.events.filter(e => e.job_id).map(e => [e.job_id, e]))
  const jobs = [...last.values()]
  return { schedule_status: 'UNKNOWN', schedule_label: '예약 상태 별도 확인 필요',
    worker_connection: 'NOT_CONNECTED', semantic_review_performed: jobs.some(e => e.kind === 'REVIEW'),
    scopes: discovery.scopes.length, worlds: discovery.inventory,
    review_count: jobs.filter(e => e.kind === 'REVIEW').length,
    no_change_count: jobs.filter(e => e.status === 'NO_CHANGE').length,
    human_review_count: jobs.filter(e => ['HUMAN_REVIEW', 'HUMAN_APPROVAL_REQUIRED'].includes(e.status)).length,
    candidate_count: jobs.reduce((n, e) => n + (e.proposal?.candidates.length ?? 0), 0),
    duplicate_count: jobs.reduce((n, e) => n + (e.proposal?.duplicates.length ?? 0), 0),
    published_count: 0, next: discoverReviewWork(discovery, ledger).status }
}
