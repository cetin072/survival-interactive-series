import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadKnowledge, validateKnowledge } from './knowledge-content.mjs'
import { recordBackfillResult, validateRuntimeState } from './knowledge-worker-runtime.mjs'
import { recordKnowledgeDisposition, validateKnowledgeState } from './knowledge-scan.mjs'

export const SEMANTIC_RESULT_VERSION = 'knowledge-semantic-result-v1'
export const SEMANTIC_DECISIONS = Object.freeze(['BRIEF_READY', 'HOLD', 'HUMAN_REVIEW'])
export const READER_BOOK_REF = 'archive/content/stories/C03-AFTERFALL/BOOK.json'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const canonicalChapterSha = (chapter) => sha(Buffer.from(JSON.stringify(chapter), 'utf8'))
const fail = (condition, code) => { if (!condition) throw new Error(code) }
const plainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function nextBriefId(briefs) {
  const max = briefs.reduce((current, brief) => Math.max(current, Number(/^K-(\d+)$/.exec(brief.id)?.[1] ?? 0)), 0)
  return `K-${String(max + 1).padStart(3, '0')}`
}

export function makeWorkKey({ sourceKind, sourceRef, sourceSha256 }) {
  fail(['PUBLIC_ARCHIVE', 'PUBLIC_READER'].includes(sourceKind), 'SEMANTIC_SOURCE_KIND_INVALID')
  fail(typeof sourceRef === 'string' && sourceRef.length > 0, 'SEMANTIC_SOURCE_REF_REQUIRED')
  fail(/^[a-f0-9]{64}$/.test(sourceSha256 ?? ''), 'SEMANTIC_SOURCE_SHA_INVALID')
  return `${sourceKind}:${sourceRef}:${sourceSha256}`
}

export function reservedCandidateId(workKey) {
  const readable = workKey.split(':').slice(1, 2)[0].split(/[\\/#]/).filter(Boolean).at(-1) ?? 'work'
  const slug = readable.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 38) || 'work'
  return `KC-${slug}-${sha(Buffer.from(workKey)).slice(0, 10)}`
}

export function selectBackfillChapter({ book, candidates, reviewedWorkKeys = [] }) {
  const reviewed = new Set(reviewedWorkKeys)
  const existingByChapter = new Map(candidates
    .filter((candidate) => candidate.source_kind === 'PUBLIC_READER' && candidate.reader_chapter_id)
    .map((candidate) => [candidate.reader_chapter_id, candidate]))
  const chapters = [...(book.chapters ?? [])]
    .filter((chapter) => chapter.sourceKind === 'VERIFIED_GM_NARRATIVE' && chapter.body?.trim())
    .sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0) || a.id.localeCompare(b.id))
  for (const chapter of chapters) {
    const chapterSha = canonicalChapterSha(chapter)
    const sourceRef = `${READER_BOOK_REF}#${chapter.id}`
    const workKey = makeWorkKey({ sourceKind: 'PUBLIC_READER', sourceRef, sourceSha256: chapterSha })
    const existing = existingByChapter.get(chapter.id)
    if (reviewed.has(workKey) || (existing && (existing.brief_id || existing.status !== 'DISCOVERED'))) continue
    return { chapter, chapterSha, sourceRef, workKey, existingCandidate: existing ?? null }
  }
  return null
}

export function extractPublicGmText(markdown, maxChars = 4500) {
  fail(typeof markdown === 'string', 'SEMANTIC_ARCHIVE_PART_INVALID')
  const blocks = markdown.split(/(?=^## (?:USER|GM)\s+\d+\b)/m)
    .filter((block) => /^## GM\s+\d+\b/m.test(block))
    .map((block) => block.replace(/^## GM\s+\d+[^\n]*\n?/m, '').trim())
    .filter(Boolean)
  fail(blocks.length > 0, 'SEMANTIC_PUBLIC_GM_TEXT_MISSING')
  return blocks.join('\n\n').slice(0, maxChars)
}

export function buildSemanticContext({ jobType, source, target, existingKnowledge, policy, excerpt }) {
  fail(['FRESH_BRIEF', 'BACKFILL_BRIEF'].includes(jobType), 'SEMANTIC_JOB_TYPE_INVALID')
  const questions = existingKnowledge.candidates.map((item) => ({
    id: item.id, question: item.question, topic_id: item.topic_id, brief_id: item.brief_id ?? null,
  }))
  const briefs = existingKnowledge.briefs.map((item) => ({
    id: item.id, title: item.title, summary: item.summary, topic_id: item.topic_id,
  }))
  return {
    target,
    source: {
      kind: source.kind,
      ref: source.ref,
      sha256: source.sha256,
      ...(source.chapter_id ? { chapter_id: source.chapter_id, chapter_sha256: source.chapter_sha256 } : {}),
      refs: source.refs ?? [],
      hashes: source.hashes ?? [],
      excerpt: excerpt.slice(0, 5000),
    },
    existing_knowledge: { questions, briefs },
    topics: existingKnowledge.topics.map(({ id, title }) => ({ id, title })),
    policy: {
      worker_policy_version: policy.version,
      editorial_spec_ref: policy.editorial_spec_ref,
      minimum_authoritative_sources: policy.research_policy.minimum_authoritative_sources_per_brief,
      story_source_is_narrative_only: true,
      risk_domains_allowed_for_auto: policy.candidate_policy.allowed_auto_risk_domains,
      high_risk_domains: policy.candidate_policy.high_risk_domains,
      never_downgrade_risk_to_auto: true,
      publication_mode: existingKnowledge.config.publication_mode,
      auto_publish_enabled: existingKnowledge.config.auto_publish_enabled,
    },
  }
}

export function validateSemanticResult(job, result) {
  fail(plainObject(job) && plainObject(result), 'SEMANTIC_RESULT_OBJECT_REQUIRED')
  fail(result.version === SEMANTIC_RESULT_VERSION, 'SEMANTIC_RESULT_VERSION_INVALID')
  fail(result.job_id === job.job_id, 'SEMANTIC_RESULT_JOB_BINDING_MISMATCH')
  fail(SEMANTIC_DECISIONS.includes(result.decision), 'SEMANTIC_RESULT_DECISION_INVALID')
  const allowedKeys = new Set(['version', 'job_id', 'decision', 'candidate', 'evidence', 'brief', 'topic', 'code', 'note'])
  fail(Object.keys(result).every((key) => allowedKeys.has(key)), 'SEMANTIC_RESULT_PROPERTY_UNKNOWN')
  if (result.decision === 'HOLD') {
    fail(!['candidate', 'evidence', 'brief', 'topic'].some((key) => Object.hasOwn(result, key)), 'SEMANTIC_HOLD_PACKAGE_FORBIDDEN')
    fail(result.code.length <= 100 && result.note.length <= 4000, 'SEMANTIC_HOLD_DISPOSITION_TOO_LONG')
    fail(typeof result.code === 'string' && result.code.trim().length > 0, 'SEMANTIC_HOLD_CODE_REQUIRED')
    fail(typeof result.note === 'string' && result.note.trim().length > 0, 'SEMANTIC_HOLD_NOTE_REQUIRED')
    return { decision: 'HOLD' }
  }
  if (result.decision === 'HUMAN_REVIEW') {
    fail(result.code.length <= 100 && result.note.length <= 4000, 'SEMANTIC_REVIEW_DISPOSITION_TOO_LONG')
    fail(typeof result.code === 'string' && result.code.trim().length > 0, 'SEMANTIC_REVIEW_CODE_REQUIRED')
    fail(typeof result.note === 'string' && result.note.trim().length > 0, 'SEMANTIC_REVIEW_NOTE_REQUIRED')
  }

  const { candidate, evidence, brief, topic = null } = result
  fail(plainObject(candidate) && plainObject(evidence) && plainObject(brief), 'SEMANTIC_BRIEF_PACKAGE_REQUIRED')
  const target = job.semantic_context?.target ?? job.context?.target
  const source = job.semantic_context?.source ?? job.context?.source
  fail(target && source, 'SEMANTIC_JOB_CONTEXT_REQUIRED')
  fail(candidate.id === target.candidate_id && brief.id === target.brief_id, 'SEMANTIC_RESERVED_ID_MISMATCH')
  fail(candidate.brief_id === brief.id && evidence.brief_id === brief.id, 'SEMANTIC_PACKAGE_RELATION_MISMATCH')
  fail(candidate.topic_id === brief.topic_id && (topic === null || topic.id === brief.topic_id), 'SEMANTIC_TOPIC_RELATION_MISMATCH')
  // The existing Worker Gate requires a resolved BRIEF_PROPOSED candidate. It
  // deterministically routes high risk, conflicts, unknowns, or weak support
  // to the existing Operator Inbox after this package opens as a Draft PR.
  fail(candidate.status === 'BRIEF_PROPOSED', 'SEMANTIC_CANDIDATE_STATUS_INVALID')
  fail(brief.content_type === 'BRIEF' && brief.status === 'READY', 'SEMANTIC_BRIEF_STATUS_INVALID')
  if (result.decision === 'BRIEF_READY') {
    fail(!Object.hasOwn(result, 'code') && !Object.hasOwn(result, 'note'), 'SEMANTIC_AUTO_DISPOSITION_FORBIDDEN')
    fail(brief.risk_level === 'LOW' && brief.publication_policy === 'AUTO_LOW_RISK', 'SEMANTIC_AUTO_POLICY_INVALID')
    fail(brief.semantic_qa_status === 'PASS', 'SEMANTIC_QA_NOT_PASS')
  } else {
    fail(brief.publication_policy === 'HUMAN_APPROVED', 'SEMANTIC_REVIEW_POLICY_INVALID')
  }
  fail(candidate.source_kind === job.source_kind && candidate.source_kind === source.kind, 'SEMANTIC_SOURCE_KIND_BINDING_MISMATCH')
  if (source.kind === 'PUBLIC_ARCHIVE') {
    fail(candidate.source_manifest_ref === job.source_ref && candidate.source_manifest_sha256 === job.source_sha256, 'SEMANTIC_ARCHIVE_SOURCE_BINDING_MISMATCH')
  } else {
    fail(candidate.reader_book_ref === READER_BOOK_REF
      && candidate.reader_book_sha256 === source.reader_book_sha256
      && candidate.reader_chapter_id === source.chapter_id
      && candidate.reader_chapter_sha256 === source.chapter_sha256
      && JSON.stringify(candidate.source_refs) === JSON.stringify(source.refs)
      && JSON.stringify(candidate.source_hashes) === JSON.stringify(source.hashes), 'SEMANTIC_READER_SOURCE_BINDING_MISMATCH')
  }
  fail(Array.isArray(evidence.claims) && evidence.claims.length > 0, 'SEMANTIC_EVIDENCE_CLAIMS_REQUIRED')
  return { decision: result.decision, briefId: brief.id, candidateId: candidate.id, topicId: brief.topic_id }
}

export async function applySemanticPackage({ root, job, result, now = new Date().toISOString() }) {
  validateSemanticResult(job, result)
  fail(['BRIEF_READY', 'HUMAN_REVIEW'].includes(result.decision), 'SEMANTIC_PACKAGE_DECISION_REQUIRED')
  const data = await loadKnowledge(root)
  const { candidate, evidence, brief, topic } = result
  fail(!data.briefs.some((item) => item.id === brief.id), 'SEMANTIC_BRIEF_ID_ALREADY_EXISTS')
  const priorCandidate = data.candidates.find((item) => item.id === candidate.id)
  if (priorCandidate) {
    fail(priorCandidate.status === 'DISCOVERED' && !priorCandidate.brief_id
      && priorCandidate.source_kind === candidate.source_kind
      && priorCandidate.reader_chapter_id === candidate.reader_chapter_id
      && priorCandidate.source_manifest_ref === candidate.source_manifest_ref
      && priorCandidate.source_manifest_sha256 === candidate.source_manifest_sha256,
    'SEMANTIC_CANDIDATE_ID_ALREADY_EXISTS')
  }
  fail(!data.evidence.has(brief.id), 'SEMANTIC_EVIDENCE_ID_ALREADY_EXISTS')

  const topics = data.topics
  let targetTopic = topics.find((item) => item.id === brief.topic_id)
  if (!targetTopic) {
    fail(plainObject(topic) && topic.id === brief.topic_id && typeof topic.title === 'string' && topic.title.trim(), 'SEMANTIC_TOPIC_PROPOSAL_REQUIRED')
    targetTopic = { id: topic.id, title: topic.title.trim(), brief_ids: [], guide_id: null, tools: [], story_refs: [] }
    topics.push(targetTopic)
  }
  if (!targetTopic.brief_ids.includes(brief.id)) targetTopic.brief_ids.push(brief.id)
  const nowDate = now.slice(0, 10)
  const stagedBrief = { ...brief, source_checked_at: brief.source_checked_at ?? nowDate, updated_at: nowDate }
  const stagedCandidate = { ...candidate }
  const stagedEvidence = { ...evidence }

  await writeFile(join(root, 'knowledge/content/topics.json'), `${JSON.stringify(topics, null, 2)}\n`)
  await writeFile(join(root, 'knowledge/content/candidates', `${candidate.id}.json`), `${JSON.stringify(stagedCandidate, null, 2)}\n`)
  await writeFile(join(root, 'knowledge/content/evidence', `${brief.id}.json`), `${JSON.stringify(stagedEvidence, null, 2)}\n`)
  await writeFile(join(root, 'knowledge/content/briefs', `${brief.id}.json`), `${JSON.stringify(stagedBrief, null, 2)}\n`)

  if (job.source_kind === 'PUBLIC_ARCHIVE') {
    const statePath = join(root, 'knowledge/automation/state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    validateKnowledgeState(state)
    recordKnowledgeDisposition(state, {
      sourceManifestRef: job.source_ref,
      sourceManifestSha256: job.source_sha256,
      status: result.decision === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : 'PROCESSED',
      processedAt: now,
      candidateIds: [candidate.id], briefIds: [brief.id],
      ...(result.decision === 'HUMAN_REVIEW' ? { dispositionCode: result.code, dispositionNote: result.note } : {}),
    })
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)
  } else {
    const runtimePath = join(root, 'knowledge/automation/runtime-state.json')
    const runtime = JSON.parse(await readFile(runtimePath, 'utf8'))
    validateRuntimeState(runtime)
    recordBackfillResult(runtime, {
      workKey: job.work_key,
      status: result.decision === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : 'PR_CREATED',
      now,
    })
    await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`)
  }

  const completed = await loadKnowledge(root)
  await validateKnowledge(completed)
  return { brief_id: brief.id, candidate_id: candidate.id, changed_files: [
    `knowledge/content/topics.json`, `knowledge/content/candidates/${candidate.id}.json`,
    `knowledge/content/evidence/${brief.id}.json`, `knowledge/content/briefs/${brief.id}.json`,
    job.source_kind === 'PUBLIC_ARCHIVE' ? 'knowledge/automation/state.json' : 'knowledge/automation/runtime-state.json',
  ] }
}

export async function postSupabaseRpc({ projectUrl, serviceRoleKey, name, args = {}, fetchImpl = fetch }) {
  if (!projectUrl || !serviceRoleKey) throw new Error('KNOWLEDGE_SEMANTIC_SUPABASE_SECRETS_MISSING')
  const response = await fetchImpl(`${projectUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!response.ok) throw new Error(`KNOWLEDGE_SEMANTIC_RPC_${name.toUpperCase()}_HTTP_${response.status}`)
  return response.json()
}

export function hashPolicyBytes(policyBytes, configBytes, editorialBytes = Buffer.alloc(0)) {
  return sha(Buffer.concat([Buffer.from('knowledge-semantic-policy-v1\0'), policyBytes, Buffer.from('\0'), configBytes, Buffer.from('\0'), editorialBytes]))
}

export function chapterHash(chapter) { return canonicalChapterSha(chapter) }
