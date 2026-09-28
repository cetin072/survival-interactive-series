import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { publicationEligibility } from './knowledge-content.mjs'

export const PUBLICATION_MODES = Object.freeze(['PR_ONLY', 'AUTO_LOW_RISK_SHADOW', 'AUTO_LOW_RISK'])
export const AUTO_PUBLICATION_PATHS = Object.freeze([
  'knowledge/content/briefs/',
  'knowledge/content/candidates/',
  'knowledge/content/evidence/',
  'knowledge/content/topics.json',
  'knowledge/content/stories.json',
  'knowledge/automation/state.json',
  'archive/web/public/knowledge/',
  'archive/web/public/sitemap.xml',
])

const review = (decision, reasons, briefIds = [], requiresHuman = ['HUMAN_REVIEW_REQUIRED', 'HOLD'].includes(decision)) => ({ decision, brief_ids: briefIds, requires_human: requiresHuman, reasons })
const normalizePath = (path) => path.replaceAll('\\', '/').replace(/^\.\//, '')

export function checkContentOnly(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return { allowed: false, rejected: [], reasons: ['CHANGED_FILES_REQUIRED'] }
  const rejected = [...new Set(changedFiles.map(normalizePath).filter((path) =>
    !AUTO_PUBLICATION_PATHS.some((allowed) => {
      if (allowed === 'knowledge/content/briefs/' || allowed === 'knowledge/content/candidates/' || allowed === 'knowledge/content/evidence/') {
        return path.startsWith(allowed) && path.slice(allowed.length).endsWith('.json') && !path.slice(allowed.length).includes('/')
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
    // A claim grounded only in the verified Reader is narrative provenance, not real-world advice.
    const readerContext = cited.every((source) => new URL(source.url).hostname.toLowerCase() === siteHost)
    return authoritative || readerContext
  })
}

function candidateFor(brief, candidates) {
  const matches = candidates.filter((candidate) => candidate.brief_id === brief.id)
  if (matches.length !== 1) return { ok: false, reason: matches.length ? 'UNRESOLVED_DUPLICATE' : 'CANDIDATE_MISSING' }
  const candidate = matches[0]
  if (candidate.status !== 'BRIEF_PROPOSED' || !candidate.disposition_note?.trim()) return { ok: false, reason: 'CANDIDATE_NOT_RESOLVED' }
  const normalizedQuestion = candidate.question.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const duplicate = candidates.some((other) => other.id !== candidate.id && other.question.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === normalizedQuestion)
  if (duplicate) return { ok: false, reason: 'UNRESOLVED_DUPLICATE' }
  return { ok: true, candidate }
}

async function sourceIsCurrent(candidate, base) {
  if (candidate.source_kind !== 'PUBLIC_ARCHIVE') return true
  if (!/^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/SESSION_\d{3}\/SOURCE_MANIFEST\.json$/.test(candidate.source_manifest_ref) || !/^[a-f0-9]{64}$/.test(candidate.source_manifest_sha256)) return false
  const bytes = await readFile(resolve(base, candidate.source_manifest_ref))
  return createHash('sha256').update(bytes).digest('hex') === candidate.source_manifest_sha256
}

export async function checkRelease(data, { changedFiles, briefIds, mode = data.config.publication_mode, base = data.base } = {}) {
  const contentOnly = checkContentOnly(changedFiles)
  const ids = briefIds?.length ? briefIds : data.briefs.filter((brief) => brief.publication_policy === 'AUTO_LOW_RISK').map((brief) => brief.id)
  const result = { mode, content_only: contentOnly, brief_ids: ids, requires_human: false, reasons: [] }
  if (!PUBLICATION_MODES.includes(mode)) return { ...result, ...review('HUMAN_REVIEW_REQUIRED', ['UNKNOWN_PUBLICATION_MODE'], ids) }
  if (mode === 'PR_ONLY') return { ...result, decision: 'PR_ONLY', reasons: ['AUTO_MERGE_DISABLED_BY_MODE'] }
  if (!contentOnly.allowed) return { ...result, ...review('REJECTED', contentOnly.reasons, ids) }
  if (mode === 'AUTO_LOW_RISK' && data.config.auto_publish_enabled !== true) return { ...result, ...review('HOLD', ['AUTO_MODE_DISABLED'], ids, false) }
  if (!ids.length) return { ...result, ...review('HOLD', ['NO_AUTO_BRIEFS']) }

  const reasons = []
  let decision = 'AUTO_PUBLISH_ELIGIBLE'
  for (const id of ids) {
    const brief = data.briefs.find((item) => item.id === id)
    if (!brief) { reasons.push(`BRIEF_MISSING:${id}`); decision = 'HOLD'; continue }
    const pack = data.evidence.get(id)
    const eligibility = publicationEligibility(brief, pack, { ...data.config, publication_mode: mode })
    if (eligibility === 'HOLD') { reasons.push(`EVIDENCE_OR_METADATA_INCOMPLETE:${id}`); decision = decision === 'HUMAN_REVIEW_REQUIRED' ? decision : 'HOLD'; continue }
    if (eligibility !== 'AUTO_PUBLISH_ELIGIBLE') { reasons.push(`ELIGIBILITY_REQUIRES_REVIEW:${id}`); decision = 'HUMAN_REVIEW_REQUIRED'; continue }
    if (!hasAuthoritativeClaimSupport(brief, pack, data.config.site_origin)) { reasons.push(`AUTHORITATIVE_SUPPORT_MISSING:${id}`); decision = 'HUMAN_REVIEW_REQUIRED'; continue }
    const candidateResult = candidateFor(brief, data.candidates)
    if (!candidateResult.ok) { reasons.push(`${candidateResult.reason}:${id}`); decision = candidateResult.reason === 'UNRESOLVED_DUPLICATE' ? 'HUMAN_REVIEW_REQUIRED' : 'HOLD'; continue }
    try {
      if (!await sourceIsCurrent(candidateResult.candidate, base)) { reasons.push(`SOURCE_CHANGED:${id}`); decision = 'HUMAN_REVIEW_REQUIRED' }
    } catch {
      reasons.push(`SOURCE_UNAVAILABLE:${id}`); decision = 'HUMAN_REVIEW_REQUIRED'
    }
  }
  if (reasons.length) return { ...result, ...review(decision, reasons, ids) }
  return { ...result, decision: mode === 'AUTO_LOW_RISK_SHADOW' ? 'WOULD_AUTO_PUBLISH' : 'AUTO_PUBLISH_ELIGIBLE', requires_human: false, reasons: [] }
}

export function verifyProductionPublication({ deployStatus, deployCommitSha, mergeSha, pageReachable, indexContains, sitemapContains }) {
  const reasons = []
  if (deployStatus !== 'READY') reasons.push('DEPLOY_NOT_READY')
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
