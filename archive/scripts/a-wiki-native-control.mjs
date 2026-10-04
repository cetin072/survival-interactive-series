import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverWikiSource } from './lib/wiki-semantic-jobs.mjs'
import {
  buildWikiFactJob, buildWikiFactReviewJob, compileWikiFactProposal, validateWikiFactReview,
} from './lib/wiki-fact-extractor.mjs'
import { finalizeWikiFactProposal } from './lib/wiki-fact-finalizer.mjs'

export const repository = 'cetin072/survival-interactive-series'
const root = resolve(import.meta.dirname, '../..')
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const insist = (ok, code) => { if (!ok) throw new Error(code) }
const sha = (value) => createHash('sha256').update(value).digest('hex')
const run = (command, args, cwd = root, options = {}) => {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 8_000_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout ?? 1_200_000,
      env: { ...process.env, ...(options.env ?? {}) },
    }).trim()
  } catch (cause) {
    const error = new Error(`A_WIKI_COMMAND_${command.toUpperCase()}_${cause.status ?? 'FAILED'}`)
    error.cause = cause
    throw error
  }
}

async function rpc(name, args) {
  const url = process.env.ARCHIVE_SUPABASE_URL
  const key = process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
  insist(typeof url === 'string' && /^https:\/\//.test(url), 'A_WIKI_SUPABASE_URL_REQUIRED')
  insist(typeof key === 'string' && key.length > 20, 'A_WIKI_SUPABASE_SERVICE_ROLE_KEY_REQUIRED')
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(args ?? {}),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`A_WIKI_RPC_${name}_HTTP_${response.status}:${body.slice(0, 500)}`)
  return body ? JSON.parse(body) : null
}

export function compileSubmittedExtractor(row) {
  insist(row?.status === 'EXTRACTOR_SUBMITTED', 'A_WIKI_EXTRACTOR_ROW_INVALID')
  const proposal = compileWikiFactProposal(row.prepared_job, row.extractor_result)
  if (proposal.status === 'HUMAN_REVIEW') {
    return { action: 'HUMAN_REVIEW', code: 'EXTRACTOR_HUMAN_REVIEW', proposal }
  }
  const reviewJob = buildWikiFactReviewJob(row.prepared_job, proposal)
  return { action: 'REVIEW_READY', proposal, reviewJob }
}

export function inspectSubmittedReview(row) {
  insist(['REVIEW_SUBMITTED', 'FINALIZING'].includes(row?.status), 'A_WIKI_REVIEW_ROW_INVALID')
  const review = validateWikiFactReview(row.review_job, row.review_result)
  if (review.decision === 'HUMAN_REVIEW') return { action: 'HUMAN_REVIEW', review }
  if (review.decision === 'REJECT') return { action: 'REJECT', review }
  return { action: 'PUBLISH', review }
}

async function advance(row, expected, status, extra = {}) {
  return rpc('archive_a_wiki_native_job_advance', {
    p_job_id: row.job_id,
    p_expected_status: expected,
    p_status: status,
    p_proposal: extra.proposal ?? null,
    p_review_job: extra.reviewJob ?? null,
    p_blocker_code: extra.blockerCode ?? null,
    p_pr_number: extra.prNumber ?? null,
    p_head_ref: extra.headRef ?? null,
    p_head_sha: extra.headSha ?? null,
    p_merge_sha: extra.mergeSha ?? null,
  })
}

export async function prepareNativeJob({ requestRpc = rpc, base = root } = {}) {
  let source
  try { source = await discoverWikiSource(base) }
  catch (error) {
    if (error.message === 'WIKI_NO_PENDING_SOURCE') return { status: 'NO_JOB', source_session: error.source_session ?? null }
    throw error
  }
  const graph = JSON.parse(await readFile(join(base, graphRef), 'utf8'))
  const job = buildWikiFactJob(source, graph)
  const mainSha = run('git', ['rev-parse', 'HEAD'], base)
  insist(/^[a-f0-9]{40}$/.test(mainSha), 'A_WIKI_MAIN_SHA_INVALID')
  const prepared = await requestRpc('archive_a_wiki_native_job_prepare', {
    p_job: job,
    p_main_sha: mainSha,
  })
  return { status: prepared?.status ?? 'UNKNOWN', session_id: source.sourceSession.session_id, job_id: prepared?.job_id ?? null }
}

function publicationBranch(job) {
  const number = job.source.session_id.replace('SESSION_', '')
  return `automation/a-wiki-publish-${number}-${job.source.manifest_sha256.slice(0, 12)}`
}

function findPullRequest(headRef) {
  const all = JSON.parse(run('gh', ['pr', 'list', '--repo', repository, '--head', headRef, '--state', 'all',
    '--json', 'number,url,state,headRefName,headRefOid,baseRefName,baseRefOid,mergeCommit'], root) || '[]')
  return all.find((pr) => pr.headRefName === headRef) ?? null
}

async function buildPublication(row) {
  run('git', ['fetch', 'origin', 'main'], root)
  const currentMain = run('git', ['rev-parse', 'origin/main'], root)
  const currentGraph = JSON.parse(run('git', ['show', `origin/main:${graphRef}`], root))
  if (currentGraph.content_sha256 !== row.graph_sha256) throw new Error('A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED')

  const branch = publicationBranch(row.prepared_job)
  const existingPr = findPullRequest(branch)
  if (existingPr?.state === 'MERGED' && /^[a-f0-9]{40}$/.test(existingPr.mergeCommit?.oid ?? '')) {
    return {
      status: 'MERGED',
      branch,
      prNumber: existingPr.number,
      headSha: existingPr.headRefOid,
      mergeSha: existingPr.mergeCommit.oid,
    }
  }

  let headSha = existingPr?.headRefOid ?? null
  const remote = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], root)
  if (remote) {
    const remoteSha = remote.split(/\s+/)[0]
    if (headSha && remoteSha !== headSha) throw new Error('A_WIKI_PUBLICATION_BRANCH_IDENTITY_CONFLICT')
    headSha = remoteSha
  } else {
    const temp = await mkdtemp(join(tmpdir(), 'a-wiki-publish-'))
    let worktree = false
    try {
      run('git', ['worktree', 'add', '-b', branch, temp, 'origin/main'], root)
      worktree = true
      // Unit/contract tests must run against the unmutated repository state.
      // After apply, the Finalizer itself verifies exact persisted Graph bytes
      // and Receipt-last semantics, while the scope gate below verifies the diff.
      run('node', ['--test',
        'archive/scripts/lib/publication-graph.test.mjs',
        'archive/scripts/lib/wiki-semantic-jobs.test.mjs',
        'archive/scripts/lib/wiki-fact-extractor.test.mjs',
        'archive/scripts/lib/wiki-fact-finalizer.test.mjs',
      ], temp)

      const result = await finalizeWikiFactProposal({
        root: temp,
        job: row.prepared_job,
        proposal: row.proposal,
        review: row.review_result,
        apply: true,
      })
      insist(['FINALIZED', 'RECOVERED_AND_FINALIZED', 'NOOP_ALREADY_FINALIZED'].includes(result.status), 'A_WIKI_FINALIZER_NOT_APPLIED')

      const changed = run('git', ['status', '--porcelain'], temp).split(/\r?\n/).filter(Boolean)
      insist(changed.length > 0, 'A_WIKI_PUBLICATION_EMPTY')
      const allowedPrefixes = [
        'archive/content/graphs/C03-AFTERFALL/GRAPH.json',
        'archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_',
        'archive/content/public-facts/C03-AFTERFALL/S03/receipts/AWIKI_',
      ]
      const changedPaths = changed.map((line) => line.slice(3))
      insist(changedPaths.every((path) => allowedPrefixes.some((allowed) => path === allowed || path.startsWith(allowed))),
        'A_WIKI_PUBLICATION_SCOPE_INVALID')
      run('git', ['add', 'archive/content/graphs/C03-AFTERFALL/GRAPH.json',
        'archive/content/public-facts/C03-AFTERFALL/S03'], temp)
      run('git', ['config', 'user.name', 'a-wiki-native-finalizer'], temp)
      run('git', ['config', 'user.email', 'a-wiki-native-finalizer@users.noreply.github.com'], temp)
      run('git', ['commit', '-m', `a-wiki: publish ${row.session_id} semantic facts`], temp)
      headSha = run('git', ['rev-parse', 'HEAD'], temp)
      run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], temp)
    } finally {
      if (worktree) {
        try { run('git', ['worktree', 'remove', '--force', temp], root) } catch {}
      }
      await rm(temp, { recursive: true, force: true })
    }
  }

  let pr = findPullRequest(branch)
  if (!pr || pr.state !== 'OPEN') {
    const url = run('gh', ['pr', 'create', '--repo', repository, '--base', 'main', '--head', branch,
      '--title', `A-Wiki semantic ${row.session_id}`,
      '--body', 'Native Extractor + independent Reviewer approved. Program Finalizer applied exact source-bound facts. Receipt is the durable completion signal. Production remains batched.'], root)
    pr = JSON.parse(run('gh', ['pr', 'view', url, '--repo', repository,
      '--json', 'number,url,state,headRefName,headRefOid,baseRefName,baseRefOid,mergeStateStatus'], root))
  }
  insist(pr.headRefOid === headSha && pr.baseRefName === 'main', 'A_WIKI_PR_BINDING_INVALID')

  run('gh', ['pr', 'checks', String(pr.number), '--repo', repository, '--watch', '--interval', '10'], root, { timeout: 1_200_000 })
  pr = JSON.parse(run('gh', ['pr', 'view', String(pr.number), '--repo', repository,
    '--json', 'number,state,headRefOid,baseRefName,baseRefOid,mergeStateStatus,statusCheckRollup'], root))
  insist(pr.headRefOid === headSha && pr.baseRefName === 'main' && pr.mergeStateStatus === 'CLEAN', 'A_WIKI_PR_NOT_CLEAN')
  run('git', ['fetch', 'origin', 'main'], root)
  const currentGraphAfterChecks = JSON.parse(run('git', ['show', `origin/main:${graphRef}`], root))
  insist(currentGraphAfterChecks.content_sha256 === row.graph_sha256, 'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED')

  const mergeRaw = run('gh', ['api', '--method', 'PUT', `repos/${repository}/pulls/${pr.number}/merge`,
    '-f', 'merge_method=squash', '-f', `sha=${headSha}`], root)
  const merged = JSON.parse(mergeRaw)
  insist(merged.merged === true && /^[a-f0-9]{40}$/.test(merged.sha ?? ''), 'A_WIKI_MERGE_NOT_CONFIRMED')
  return { status: 'MERGED', branch, prNumber: pr.number, headSha, mergeSha: merged.sha }
}

export async function consumeNativeJob({ requestRpc = rpc } = {}) {
  const row = await requestRpc('archive_a_wiki_native_job_program_current', {})
  if (!row || row.status === 'NO_PROGRAM_JOB') return { status: 'NO_PROGRAM_JOB' }

  if (row.status === 'EXTRACTOR_SUBMITTED') {
    const compiled = compileSubmittedExtractor(row)
    if (compiled.action === 'HUMAN_REVIEW') {
      const update = await advance(row, 'EXTRACTOR_SUBMITTED', 'HUMAN_REVIEW', { blockerCode: compiled.code })
      return { status: 'HUMAN_REVIEW', session_id: row.session_id, update }
    }
    const update = await advance(row, 'EXTRACTOR_SUBMITTED', 'REVIEW_READY', {
      proposal: compiled.proposal,
      reviewJob: compiled.reviewJob,
    })
    return { status: 'REVIEW_READY', session_id: row.session_id, proposal_sha256: compiled.proposal.proposal_sha256, update }
  }

  if (row.status === 'REVIEW_SUBMITTED') {
    const disposition = inspectSubmittedReview(row)
    if (disposition.action !== 'PUBLISH') {
      const update = await advance(row, 'REVIEW_SUBMITTED', disposition.action, {
        blockerCode: `REVIEWER_${disposition.action}`,
      })
      return { status: disposition.action, session_id: row.session_id, update }
    }
    const claimed = await advance(row, 'REVIEW_SUBMITTED', 'FINALIZING')
    insist(claimed?.status === 'FINALIZING', 'A_WIKI_FINALIZING_CLAIM_FAILED')
    row.status = 'FINALIZING'
  }

  if (row.status === 'FINALIZING') {
    try {
      const publication = await buildPublication(row)
      const update = await advance(row, 'FINALIZING', 'PUBLISHED', {
        prNumber: publication.prNumber,
        headRef: publication.branch,
        headSha: publication.headSha,
        mergeSha: publication.mergeSha,
      })
      return { status: 'PUBLISHED', session_id: row.session_id, ...publication, update }
    } catch (error) {
      const code = error.message.split(':')[0].slice(0, 120)
      await advance(row, 'FINALIZING', 'BLOCKED', { blockerCode: code }).catch(() => {})
      return { status: 'BLOCKED', session_id: row.session_id, blocker_code: code }
    }
  }

  return { status: 'NO_ACTION', job_status: row.status, session_id: row.session_id }
}

export async function runCli(args) {
  insist(args.length === 1 && ['prepare', 'consume'].includes(args[0]), 'A_WIKI_NATIVE_CONTROL_USAGE')
  return args[0] === 'prepare' ? prepareNativeJob() : consumeNativeJob()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2))
    .then((result) => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch((error) => {
      process.stderr.write(JSON.stringify({ status: 'BLOCKED', error: error.message.split(':')[0] }) + '\n')
      process.exitCode = 1
    })
}
