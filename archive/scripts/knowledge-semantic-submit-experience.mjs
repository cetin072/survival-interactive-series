import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { postSupabaseRpc, validateSemanticResult } from './lib/knowledge-semantic-jobs.mjs'
import { EX001_REF } from './knowledge-semantic-prepare-experience.mjs'

const root = resolve(import.meta.dirname, '../..')
const request = (name, args) => postSupabaseRpc({
  projectUrl: process.env.ARCHIVE_SUPABASE_URL,
  serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
  name, args,
})

export async function runExperienceSeedSubmit() {
  const current = await request('archive_knowledge_semantic_job_current', {})
  const job = current.job
  if (current.status !== 'PREPARED' || !job || job.source_kind !== 'USER_REPORTED_EXPERIENCE' || job.source_ref !== EX001_REF) throw new Error('EXPERIENCE_PREPARED_JOB_REQUIRED')
  const sourceHash = createHash('sha256').update(await readFile(join(root, EX001_REF))).digest('hex')
  if (job.source_sha256 !== sourceHash) throw new Error('EXPERIENCE_SOURCE_CHANGED')
  job.semantic_context = job.context
  const result = JSON.parse(await readFile(join(root, 'knowledge/automation/pilots/EX-001-semantic-result.template.json'), 'utf8'))
  result.job_id = job.job_id
  result.brief.id = job.context.target.brief_id
  result.evidence.brief_id = job.context.target.brief_id
  result.candidate.brief_id = job.context.target.brief_id
  result.candidate.id = job.context.target.candidate_id
  validateSemanticResult(job, result)
  const submitted = await request('archive_knowledge_semantic_job_submit', {
    p_job_id: job.job_id, p_source_ref: job.source_ref, p_source_sha256: job.source_sha256, p_result: result,
  })
  if (!['ACCEPTED', 'ALREADY_SUBMITTED'].includes(submitted.status)) throw new Error('EXPERIENCE_SUBMIT_' + (submitted.reason ?? submitted.status))
  return { status: submitted.status, job_id: job.job_id, brief_id: result.brief.id, candidate_id: result.candidate.id, decision: result.decision }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runExperienceSeedSubmit().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(error.message.split(':')[0])
    process.exitCode = 1
  })
}
