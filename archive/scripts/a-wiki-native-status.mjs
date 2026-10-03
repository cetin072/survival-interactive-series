import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const demand = (ok, code) => { if (!ok) throw new Error(code) }

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'))
}

async function writeJson(path, value) {
  await writeFile(resolve(path), JSON.stringify(value, null, 2) + '\n')
}

export async function statusFromJob(jobPath, statusPath, env = process.env) {
  const job = await readJson(jobPath)
  const semantic = job.version === 'wiki-fact-job-v1'
  demand(typeof env.BASE_SHA === 'string' && /^[a-f0-9]{40}$/.test(env.BASE_SHA), 'A_WIKI_BASE_SHA_REQUIRED')
  const status = {
    version: 'a-wiki-native-status-v1',
    phase: semantic ? 'EXTRACTOR_READY' : 'NO_JOB',
    base_main_sha: env.BASE_SHA,
    session_id: semantic ? job.source.session_id : null,
    job_id: semantic ? job.job_id : null,
    source_sha256: semantic ? job.source.manifest_sha256 : null,
    graph_sha256: semantic ? job.graph_sha256 : null,
    ...(env.REASON ? { reason: env.REASON } : {}),
    ...(env.PREVIOUS_MERGE_SHA ? { previous_merge_sha: env.PREVIOUS_MERGE_SHA } : {}),
  }
  await writeJson(statusPath, status)
  return status
}

export async function setPhase(statusPath, phase, env = process.env) {
  demand(['REVIEW_READY', 'HUMAN_REVIEW', 'REJECT', 'BLOCKED'].includes(phase), 'A_WIKI_PHASE_INVALID')
  const status = await readJson(statusPath)
  demand(status.version === 'a-wiki-native-status-v1', 'A_WIKI_STATUS_VERSION_INVALID')
  status.phase = phase
  if (env.REASON) status.reason = env.REASON
  else delete status.reason
  if (env.PROPOSAL_PATH) {
    const proposal = await readJson(env.PROPOSAL_PATH)
    demand(typeof proposal.proposal_sha256 === 'string' && /^[a-f0-9]{64}$/.test(proposal.proposal_sha256),
      'A_WIKI_PROPOSAL_SHA_REQUIRED')
    status.proposal_sha256 = proposal.proposal_sha256
  }
  await writeJson(statusPath, status)
  return status
}

export async function validatePublicationScope(finalizerResultPath, { cwd = process.cwd() } = {}) {
  const result = await readJson(finalizerResultPath)
  const changed = execFileSync('git', ['diff', '--name-only'], { cwd, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
  const allowed = new Set([
    'archive/content/graphs/C03-AFTERFALL/GRAPH.json',
    result.fact_ref,
    result.receipt_ref,
  ].filter(Boolean))
  demand(changed.length > 0 && changed.every((path) => allowed.has(path)),
    'A_WIKI_PUBLICATION_SCOPE_INVALID')
  return { changed, allowed: [...allowed] }
}

export async function runCli(args) {
  if (args[0] === 'from-job' && args.length === 3) {
    return statusFromJob(args[1], args[2])
  }
  if (args[0] === 'set-phase' && args.length === 3) {
    return setPhase(args[1], args[2])
  }
  if (args[0] === 'publication-scope' && args.length === 2) {
    return validatePublicationScope(args[1])
  }
  throw new Error('A_WIKI_NATIVE_STATUS_USAGE_INVALID')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runCli(process.argv.slice(2))
    process.stdout.write(JSON.stringify(result) + '\n')
  } catch (error) {
    process.stderr.write(JSON.stringify({ ok: false, error: error.message }) + '\n')
    process.exitCode = 1
  }
}
