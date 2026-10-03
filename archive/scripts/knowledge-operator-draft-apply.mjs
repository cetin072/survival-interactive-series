import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadKnowledge, validateKnowledge, root } from './lib/knowledge-content.mjs'

const shaPattern = /^[a-f0-9]{64}$/
const jobPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function fetchDraft({ projectUrl, serviceRoleKey, jobId, revision, draftSha256, fetchImpl = fetch }) {
  if (!projectUrl || !serviceRoleKey) throw new Error('KNOWLEDGE_OPERATOR_DRAFT_SECRETS_MISSING')
  const response = await fetchImpl(`${projectUrl.replace(/\/$/, '')}/rest/v1/rpc/archive_worker_knowledge_operator_draft`, {
    method: 'POST',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_job_id: jobId, p_revision: revision, p_draft_sha256: draftSha256 }),
  })
  if (!response.ok) throw new Error(`KNOWLEDGE_OPERATOR_DRAFT_RPC_HTTP_${response.status}`)
  return response.json()
}

export async function applyApprovedOperatorDraft({
  projectUrl,
  serviceRoleKey,
  jobId,
  revision,
  draftSha256,
  briefId,
  base = root,
  fetchImpl = fetch,
} = {}) {
  if (!jobPattern.test(jobId ?? '')) throw new Error('KNOWLEDGE_OPERATOR_DRAFT_JOB_INVALID')
  if (!Number.isInteger(revision) || revision < 1) throw new Error('KNOWLEDGE_OPERATOR_DRAFT_REVISION_INVALID')
  if (!shaPattern.test(draftSha256 ?? '')) throw new Error('KNOWLEDGE_OPERATOR_DRAFT_SHA_INVALID')
  if (!/^K-\d+$/.test(briefId ?? '')) throw new Error('KNOWLEDGE_OPERATOR_DRAFT_BRIEF_INVALID')

  const payload = await fetchDraft({ projectUrl, serviceRoleKey, jobId, revision, draftSha256, fetchImpl })
  if (payload?.job_id !== jobId || payload?.brief_id !== briefId || payload?.revision !== revision || payload?.draft_sha256 !== draftSha256) {
    throw new Error('KNOWLEDGE_OPERATOR_DRAFT_BINDING_MISMATCH')
  }
  if (!payload.brief || typeof payload.brief !== 'object' || Array.isArray(payload.brief)) {
    throw new Error('KNOWLEDGE_OPERATOR_DRAFT_BRIEF_MISSING')
  }

  const current = JSON.parse(await readFile(join(base, 'knowledge/content/briefs', `${briefId}.json`), 'utf8'))
  if (current.id !== briefId || current.title !== payload.brief.title || current.sources == null) {
    throw new Error('KNOWLEDGE_OPERATOR_DRAFT_BASE_MISMATCH')
  }

  const prepared = {
    ...payload.brief,
    id: current.id,
    title: current.title,
    content_type: 'BRIEF',
    status: 'READY',
    publication_policy: 'HUMAN_APPROVED',
    semantic_qa_status: 'PASS',
  }
  await writeFile(join(base, 'knowledge/content/briefs', `${briefId}.json`), `${JSON.stringify(prepared, null, 2)}\n`)

  const data = await loadKnowledge(base)
  await validateKnowledge(data)
  return { status: 'OPERATOR_DRAFT_APPLIED', brief_id: briefId, revision, draft_sha256: draftSha256 }
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1]
    if (!key?.startsWith('--') || value == null) throw new Error('KNOWLEDGE_OPERATOR_DRAFT_USAGE')
    options[key.slice(2).replaceAll('-', '_')] = value
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await applyApprovedOperatorDraft({
    projectUrl: process.env.ARCHIVE_SUPABASE_URL,
    serviceRoleKey: process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
    jobId: options.job_id,
    revision: Number(options.revision),
    draftSha256: options.draft_sha256,
    briefId: options.brief_id,
  })
  console.log(JSON.stringify(result))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
