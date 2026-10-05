import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadKnowledge } from './lib/knowledge-content.mjs'
import { applySemanticPackage, postSupabaseRpc, validateSemanticResult } from './lib/knowledge-semantic-jobs.mjs'
import { verifyPins } from './knowledge-semantic-finalize.mjs'
import { applyApprovedOperatorDraft } from './knowledge-operator-draft-apply.mjs'

export function mainMovementOutcome(validatedMain, currentMain) {
  if (!/^[a-f0-9]{40}$/.test(validatedMain ?? '') || !/^[a-f0-9]{40}$/.test(currentMain ?? '')) throw new Error('CURRENT_MAIN_INVALID')
  return currentMain === validatedMain ? { status: 'READY' } : { status: 'RETRYABLE', reason: 'MAIN_MOVED_DURING_VALIDATION' }
}

export function validateApprovedPackage(inspection, packageData) {
  const job = packageData?.job, review = packageData?.review
  if (packageData?.status !== 'C3' || job?.job_id !== inspection.c3_job_id
    || review?.id !== inspection.item_id || review.status !== 'APPROVED'
    || Date.parse(review.decided_at) !== Date.parse(inspection.decided_at)
    || review.payload?.head_sha !== inspection.approved_head_sha || review.payload?.brief_id !== inspection.brief_id
    || job.semantic_result_sha256 !== inspection.semantic_result_sha256
    || job.source_sha256 !== inspection.source_sha256 || job.policy_sha256 !== inspection.policy_sha256
    || !['HUMAN_REVIEW', 'PR_OPEN'].includes(job.status)
    || job.final_pr_number !== inspection.pr_number || job.final_head_ref !== inspection.head_ref
    || job.semantic_result?.brief?.id !== inspection.brief_id
    || (review.payload.operator_draft_revision ?? null) !== (inspection.operator_draft_revision ?? null)
    || (review.payload.operator_draft_sha256 ?? null) !== (inspection.operator_draft_sha256 ?? null)
    || (inspection.operator_job_id && inspection.operator_job_id !== job.job_id)) throw new Error('SEMANTIC_APPROVED_PACKAGE_CHANGED')
  validateSemanticResult(job, job.semantic_result)
  return job
}

export async function applyApprovedPackageOnMain({ inspection, packageData, base, verifyPinsFn = verifyPins, applyDraft = applyApprovedOperatorDraft, secrets = {} }) {
  const job = validateApprovedPackage(inspection, packageData)
  await verifyPinsFn(job, base)
  const data = await loadKnowledge(base)
  if (data.briefs.some((brief) => brief.id === inspection.brief_id)) throw new Error('SEMANTIC_TARGET_BRIEF_ALREADY_EXISTS')
  await applySemanticPackage({ root: base, job, result: job.semantic_result, now: new Date(job.submitted_at ?? job.prepared_at).toISOString() })
  if (inspection.operator_draft_revision != null) await applyDraft({ ...secrets, jobId: job.job_id,
    revision: inspection.operator_draft_revision, draftSha256: inspection.operator_draft_sha256,
    briefId: inspection.brief_id, base })
  return job
}

// Local preparation only. Existing workflow retains approval, transport, CI and merge gates.
async function main() {
  const base = resolve(import.meta.dirname, '../..')
  const inspection = JSON.parse(await readFile(process.argv[2], 'utf8'))
  if (inspection.status !== 'REVALIDATE_PACKAGE') throw new Error('SEMANTIC_REVALIDATION_INPUT_INVALID')
  const shell = (command, args, cwd = base) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const git = (...args) => shell('git', args)
  git('fetch', 'origin', 'main:refs/remotes/origin/main')
  if (git('rev-parse', 'HEAD') !== inspection.current_main || git('rev-parse', 'origin/main') !== inspection.current_main) {
    console.log(JSON.stringify({ status: 'RETRYABLE', reason: 'MAIN_MOVED_BEFORE_VALIDATION' })); return
  }
  const secrets = { projectUrl: process.env.ARCHIVE_SUPABASE_URL, serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY }
  const packageData = await postSupabaseRpc({ ...secrets, name: 'archive_knowledge_review_package',
    args: { p_item_id: inspection.item_id, p_decided_at: inspection.decided_at } })
  git('switch', '--detach', inspection.current_main)
  await applyApprovedPackageOnMain({ inspection, packageData, base, secrets })
  const web = join(base, 'archive/web')
  shell('npm', ['ci'], web)
  shell('npm', ['run', 'knowledge:build'], web)
  shell('npm', ['run', 'knowledge:test'], web)
  shell('npm', ['run', 'knowledge:check'], web)
  shell('node', ['archive/scripts/knowledge-human-approved-prepare.mjs', '--brief', inspection.brief_id,
    '--base', inspection.current_main, '--head', 'HEAD', '--date', inspection.decided_at.slice(0, 10)])
  shell('npm', ['test'], web)
  shell('npm', ['run', 'build'], web)
  const gate = JSON.parse(shell('node', ['archive/scripts/knowledge-human-approved-release-check.mjs',
    '--brief', inspection.brief_id, '--base', inspection.current_main, '--head', 'HEAD']))
  if (gate.decision !== 'HUMAN_APPROVED_ELIGIBLE' || gate.content_only?.allowed !== true
    || gate.requires_human !== false || gate.reasons?.length) throw new Error('SEMANTIC_CURRENT_MAIN_RELEASE_GATE')
  git('fetch', 'origin', 'main:refs/remotes/origin/main')
  console.log(JSON.stringify(mainMovementOutcome(inspection.current_main, git('rev-parse', 'origin/main'))))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => {
  const reason = /^SEMANTIC_[A-Z_]+$/.test(error.message) ? error.message : 'CURRENT_MAIN_MACHINE_VALIDATION_FAILED'
  console.error(reason)
  console.log(JSON.stringify({ status: 'BLOCKED', reason }))
})
