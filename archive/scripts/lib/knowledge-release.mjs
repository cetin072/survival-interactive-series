import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { publicationConfigIssue, publicationEligibility } from './knowledge-content.mjs'

export const PUBLICATION_MODES = Object.freeze(['PR_ONLY', 'AUTO_LOW_RISK_SHADOW', 'AUTO_LOW_RISK'])
export const AUTO_PUBLICATION_PATHS = Object.freeze([
  'knowledge/content/briefs/',
  'knowledge/content/candidates/',
  'knowledge/content/evidence/',
  'knowledge/content/topics.json',
  'knowledge/content/stories.json',
  'knowledge/automation/state.json',
  'knowledge/automation/runtime-state.json',
  'archive/web/public/knowledge/',
  'archive/web/public/sitemap.xml',
])

const review = (decision, reasons, briefIds = [], requiresHuman = decision === 'HUMAN_REVIEW_REQUIRED') => ({ decision, brief_ids: briefIds, requires_human: requiresHuman, reasons })
const normalizePath = (path) => path.replaceAll('\\', '/').replace(/^\.\//, '')

function targetBindingIssues(changedFiles, briefIds, candidates, briefs) {
  const targets = new Set(briefIds)
  const changedBriefIds = new Set()
  const reasons = []
  for (const file of changedFiles.map(normalizePath)) {
    if (file.startsWith('knowledge/content/briefs/')) {
      const match = /^knowledge\/content\/briefs\/(K-\d+)\.json$/.exec(file)
      if (!match) reasons.push(`INVALID_CHANGED_BRIEF_PATH:${file}`)
      else changedBriefIds.add(match[1])
    }
    const evidence = /^knowledge\/content\/evidence\/(K-\d+)\.json$/.exec(file)
    if (evidence && !targets.has(evidence[1])) reasons.push(`EVIDENCE_OUTSIDE_RELEASE_TARGETS:${evidence[1]}`)
    if (file.startsWith('knowledge/content/candidates/')) {
      const match = /^knowledge\/content\/candidates\/([A-Za-z0-9-]+)\.json$/.exec(file)
      const candidate = match && candidates.find((item) => item.id === match[1])
      if (!candidate || !targets.has(candidate.brief_id)) reasons.push(`CANDIDATE_OUTSIDE_RELEASE_TARGETS:${match?.[1] ?? file}`)
    }
    const generated = /^archive\/web\/public\/knowledge\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.html$/.exec(file)
    if (generated) {
      const brief = briefs.find((item) => item.slug === generated[1])
      if (!brief || !targets.has(brief.id)) reasons.push(`GENERATED_PAGE_OUTSIDE_RELEASE_TARGETS:${generated[1]}`)
    }
  }
  if (changedBriefIds.size === 0) reasons.push('NO_CHANGED_BRIEF_TARGET')
  for (const id of changedBriefIds) if (!targets.has(id)) reasons.push(`CHANGED_BRIEF_NOT_TARGETED:${id}`)
  for (const id of targets) if (!changedBriefIds.has(id)) reasons.push(`RELEASE_TARGET_NOT_CHANGED:${id}`)
  return [...new Set(reasons)].sort()
}

export function checkContentOnly(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return { allowed: false, rejected: [], reasons: ['CHANGED_FILES_REQUIRED'] }
  const rejected = [...new Set(changedFiles.map(normalizePath).filter((path) =>
    !AUTO_PUBLICATION_PATHS.some((allowed) => {
      if (allowed === 'knowledge/content/briefs/' || allowed === 'knowledge/content/candidates/' || allowed === 'knowledge/content/evidence/') {
        const names = {
          'knowledge/content/briefs/': /^knowledge\/content\/briefs\/K-\d+\.json$/,
          'knowledge/content/candidates/': /^knowledge\/content\/candidates\/KC-[A-Za-z0-9-]+\.json$/,
          'knowledge/content/evidence/': /^knowledge\/content\/evidence\/K-\d+\.json$/,
        }
        return names[allowed].test(path)
      }
      if (allowed === 'archive/web/public/knowledge/') {
        return path === `${allowed}index.html` || /^archive\/web\/public\/knowledge\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(path)
      }
      return path === allowed
    })))].sort()
  return { allowed: rejected.length === 0, rejected, reasons: rejected.length ? ['AUTO_MERGE_REJECTED'] : [] }
}

function hasAuthoritativeClaimSupport(brief, pack, siteOrigin) {
  const byId = new Map(brief.sources.map((source) => [source.id, source]))
  const siteHost = new URL(siteOrigin).hostname
  return pack.claims.every((claim) => {
    const cited = claim.source_ids.map((id) => byId.get(id)).filter(Boolean)
    if (!cited.length || cited.length !== claim.source_ids.length) return false
    const authoritative = cited.some((source) => {
      const hostname = new URL(source.url).hostname.toLowerCase()
      return hostname.endsWith('.gov') || hostname.endsWith('.gov.kr') || hostname.endsWith('.go.kr') || hostname === 'who.int' || hostname.endsWith('.who.int')
    })
    // Reader-only citations pass only when both evidence fields explicitly identify fictional story context.
    const readerOnly = cited.every((source) => new URL(source.url).hostname.toLowerCase() === siteHost)
    const narrativeMarker = /이야기|서사|허구|\bfiction(?:al)?\b|\bnarrative\b/i
    const explicitlyNarrative = narrativeMarker.test(claim.context) && narrativeMarker.test(claim.limitation)
    return authoritative || (readerOnly && explicitlyNarrative)
  })
}

function normalizeQuestion(question) {
  return question.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function candidateFor(brief, candidates) {
  const matches = candidates.filter((candidate) => candidate.brief_id === brief.id)
  if (matches.length !== 1) return { ok: false, reason: matches.length ? 'UNRESOLVED_DUPLICATE' : 'CANDIDATE_MISSING' }
  const candidate = matches[0]
  if (typeof candidate.question !== 'string' || !candidate.question.trim() || candidate.status !== 'BRIEF_PROPOSED' || typeof candidate.disposition_note !== 'string' || !candidate.disposition_note.trim()) return { ok: false, reason: 'CANDIDATE_NOT_RESOLVED' }
  const normalizedQuestion = normalizeQuestion(candidate.question)
  const duplicate = candidates.some((other) => other.id !== candidate.id && typeof other.question === 'string' && normalizeQuestion(other.question) === normalizedQuestion)
  if (duplicate) return { ok: false, reason: 'UNRESOLVED_DUPLICATE' }
  return { ok: true, candidate }
}

async function sourceIsCurrent(candidate, base) {
  if (candidate.source_kind === 'PUBLIC_READER') return { current: true }
  if (candidate.source_kind !== 'PUBLIC_ARCHIVE') return { current: false, reason: 'SOURCE_KIND_INVALID' }
  if (!/^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/SESSION_\d{3}\/SOURCE_MANIFEST\.json$/.test(candidate.source_manifest_ref)) return { current: false, reason: 'SOURCE_PATH_INVALID' }
  if (!/^[a-f0-9]{64}$/.test(candidate.source_manifest_sha256)) return { current: false, reason: 'SOURCE_HASH_INVALID' }
  const bytes = await readFile(resolve(base, candidate.source_manifest_ref))
  return createHash('sha256').update(bytes).digest('hex') === candidate.source_manifest_sha256
    ? { current: true } : { current: false, reason: 'SOURCE_CHANGED' }
}

export async function checkRelease(data, { changedFiles, briefIds, mode = data.config.publication_mode, base = data.base } = {}) {
  const contentOnly = checkContentOnly(changedFiles)
  const ids = briefIds?.length ? briefIds : data.briefs.filter((brief) => brief.publication_policy === 'AUTO_LOW_RISK').map((brief) => brief.id)
  const result = { mode, content_only: contentOnly, brief_ids: ids, requires_human: false, reasons: [] }
  const configIssue = publicationConfigIssue(data.config)
  if (configIssue) return { ...result, ...review('HUMAN_REVIEW_REQUIRED', [`INVALID_PUBLICATION_CONFIG:${configIssue}`], ids) }
  if (!PUBLICATION_MODES.includes(mode)) return { ...result, ...review('HUMAN_REVIEW_REQUIRED', ['UNKNOWN_PUBLICATION_MODE'], ids) }
  if (mode !== data.config.publication_mode) return { ...result, ...review('REJECTED', ['REQUESTED_MODE_MISMATCH'], ids, false) }
  if (mode === 'PR_ONLY') return { ...result, decision: 'PR_ONLY', reasons: ['AUTO_MERGE_DISABLED_BY_MODE'] }
  if (!contentOnly.allowed) return { ...result, ...review('REJECTED', contentOnly.reasons, ids) }
  if (mode === 'AUTO_LOW_RISK' && (data.config.publication_mode !== 'AUTO_LOW_RISK' || data.config.auto_publish_enabled !== true)) return { ...result, ...review('HOLD', ['AUTO_MODE_DISABLED'], ids, false) }
  if (new Set(ids).size !== ids.length) return { ...result, ...review('REJECTED', ['DUPLICATE_RELEASE_TARGET'], ids, false) }
  if (!ids.length) return { ...result, ...review('HOLD', ['NO_AUTO_BRIEFS']) }
  const bindingIssues = targetBindingIssues(changedFiles, ids, data.candidates, data.briefs)
  if (bindingIssues.length) return { ...result, ...review('REJECTED', bindingIssues, ids, false) }

  const reasons = []
  let decision = 'AUTO_PUBLISH_ELIGIBLE'
  for (const id of ids) {
    const brief = data.briefs.find((item) => item.id === id)
    if (!brief) { reasons.push(`BRIEF_MISSING:${id}`); decision = 'HOLD'; continue }
    const pack = data.evidence.get(id)
    const eligibility = publicationEligibility(brief, pack, { ...data.config, publication_mode: mode })
    if (eligibility === 'HOLD') {
      const requiresHuman = Boolean(pack && (pack.conflicts?.length || pack.unknowns?.length || pack.copyright_status !== 'CLEAR'))
      reasons.push(`${pack?.conflicts?.length ? 'EVIDENCE_CONFLICT' : pack?.unknowns?.length ? 'MATERIAL_UNKNOWNS' : pack && pack.copyright_status !== 'CLEAR' ? 'COPYRIGHT_UNCLEAR' : 'EVIDENCE_OR_METADATA_INCOMPLETE'}:${id}`)
      if (requiresHuman) result.requires_human = true
      decision = decision === 'HUMAN_REVIEW_REQUIRED' ? decision : 'HOLD'
      continue
    }
    if (eligibility !== 'AUTO_PUBLISH_ELIGIBLE') { reasons.push(`ELIGIBILITY_REQUIRES_REVIEW:${id}`); decision = 'HUMAN_REVIEW_REQUIRED'; continue }
    if (!hasAuthoritativeClaimSupport(brief, pack, data.config.site_origin)) { reasons.push(`AUTHORITATIVE_SUPPORT_MISSING:${id}`); decision = 'HUMAN_REVIEW_REQUIRED'; continue }
    const candidateResult = candidateFor(brief, data.candidates)
    if (!candidateResult.ok) { reasons.push(`${candidateResult.reason}:${id}`); decision = candidateResult.reason === 'UNRESOLVED_DUPLICATE' ? 'HUMAN_REVIEW_REQUIRED' : 'HOLD'; continue }
    try {
      const source = await sourceIsCurrent(candidateResult.candidate, base)
      if (!source.current) { reasons.push(`${source.reason}:${id}`); decision = 'HUMAN_REVIEW_REQUIRED' }
    } catch {
      reasons.push(`SOURCE_UNAVAILABLE:${id}`); decision = 'HUMAN_REVIEW_REQUIRED'
    }
  }
  if (reasons.length) return { ...result, ...review(decision, reasons, ids, result.requires_human || decision === 'HUMAN_REVIEW_REQUIRED') }
  return { ...result, decision: mode === 'AUTO_LOW_RISK_SHADOW' ? 'WOULD_AUTO_PUBLISH' : 'AUTO_PUBLISH_ELIGIBLE', requires_human: false, reasons: [] }
}


export async function checkHumanApprovedRelease(data, { changedFiles, briefIds, base = data.base } = {}) {
  const contentOnly = checkContentOnly(changedFiles)
  const ids = briefIds?.length ? briefIds : []
  const result = { mode: 'HUMAN_APPROVED', content_only: contentOnly, brief_ids: ids, requires_human: false, reasons: [] }
  const blocked = (reasons) => ({ ...result, decision: 'HUMAN_APPROVED_BLOCKED', reasons: [...new Set(reasons)].sort() })

  if (!contentOnly.allowed) return blocked(contentOnly.reasons)
  if (!ids.length) return blocked(['HUMAN_APPROVAL_TARGET_REQUIRED'])
  if (new Set(ids).size !== ids.length) return blocked(['DUPLICATE_RELEASE_TARGET'])

  const bindingIssues = targetBindingIssues(changedFiles, ids, data.candidates, data.briefs)
  if (bindingIssues.length) return blocked(bindingIssues)

  const reasons = []
  for (const id of ids) {
    const brief = data.briefs.find((item) => item.id === id)
    if (!brief) { reasons.push(`BRIEF_MISSING:${id}`); continue }
    if (!['READY', 'PUBLISHED'].includes(brief.status)) reasons.push(`BRIEF_STATUS_INVALID:${id}`)
    if (!['LOW', 'HIGH'].includes(brief.risk_level)) reasons.push(`RISK_LEVEL_INVALID:${id}`)
    if (!['AUTO_LOW_RISK', 'HUMAN_APPROVED'].includes(brief.publication_policy)) reasons.push(`PUBLICATION_POLICY_INVALID:${id}`)
    if (brief.semantic_qa_status !== 'PASS') reasons.push(`SEMANTIC_QA_NOT_PASS:${id}`)

    const pack = data.evidence.get(id)
    if (!pack || !Array.isArray(pack.claims) || !pack.claims.length || !brief.sources?.length) {
      reasons.push(`EVIDENCE_OR_METADATA_INCOMPLETE:${id}`)
      continue
    }
    if (pack.conflicts?.length) reasons.push(`EVIDENCE_CONFLICT:${id}`)
    if (pack.unknowns?.length) reasons.push(`MATERIAL_UNKNOWNS:${id}`)
    if (pack.copyright_status !== 'CLEAR') reasons.push(`COPYRIGHT_UNCLEAR:${id}`)
    if (!['VERIFIED_PUBLIC_READER_BACKFILL', 'VERIFIED_PUBLIC_ARCHIVE'].includes(pack.story_source_status)) {
      reasons.push(`STORY_SOURCE_NOT_VERIFIED:${id}`)
    }
    if (!hasAuthoritativeClaimSupport(brief, pack, data.config.site_origin)) {
      reasons.push(`AUTHORITATIVE_SUPPORT_MISSING:${id}`)
    }

    const candidateResult = candidateFor(brief, data.candidates)
    if (!candidateResult.ok) {
      reasons.push(`${candidateResult.reason}:${id}`)
      continue
    }
    try {
      const source = await sourceIsCurrent(candidateResult.candidate, base)
      if (!source.current) reasons.push(`${source.reason}:${id}`)
    } catch {
      reasons.push(`SOURCE_UNAVAILABLE:${id}`)
    }
  }

  if (reasons.length) return blocked(reasons)
  return { ...result, decision: 'HUMAN_APPROVED_ELIGIBLE', requires_human: false, reasons: [] }
}

export function verifyProductionPublication({ deployStatus, deployCommitSha, mergeSha, pageReachable, indexContains, sitemapContains }) {
  const reasons = []
  if (typeof deployStatus !== 'string' || deployStatus.trim().toUpperCase() !== 'READY') reasons.push('DEPLOY_NOT_READY')
  if (!mergeSha || deployCommitSha !== mergeSha) reasons.push('DEPLOY_COMMIT_MISMATCH')
  if (pageReachable !== true) reasons.push('KNOWLEDGE_PAGE_MISSING')
  if (indexContains !== true) reasons.push('KNOWLEDGE_INDEX_MISSING_ARTICLE')
  if (sitemapContains !== true) reasons.push('SITEMAP_MISSING_ARTICLE')
  return { status: reasons.length ? 'AUTO_PUBLISH_INCOMPLETE' : 'PUBLISHED', reasons }
}

export function changedFilesFromGit({ baseRef = 'origin/main', headRef = 'HEAD', cwd }) {
  const commands = [
    ['diff', '--name-only', `${baseRef}...${headRef}`],
    ['diff', '--name-only'],
    ['diff', '--cached', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ]
  return [...new Set(commands.flatMap((args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)))].sort()
}
