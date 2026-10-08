import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverWikiSource, discoverWikiSources } from './lib/wiki-semantic-jobs.mjs'
import { collectCompletedWikiPublication } from './lib/a-wiki-publication-evidence.mjs'
import {
  buildWikiFactJob, buildWikiFactReviewJob, compileWikiFactProposal, validateWikiFactReview,
} from './lib/wiki-fact-extractor.mjs'
import { finalizeWikiFactProposal } from './lib/wiki-fact-finalizer.mjs'
import { fingerprint } from './lib/publication-plan.mjs'
import {
  compileVisualCatalog, validateVisualCatalog, visualByteHash, visualBytes,
} from './lib/visual-compiler.mjs'

export const repository = 'cetin072/survival-interactive-series'
const root = resolve(import.meta.dirname, '../..')
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const visualRef = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'
const approvedAppearanceRef = 'archive/content/public-facts/C03-AFTERFALL/S02/APPEARANCES_APPROVED_20260926.json'
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

export function compileAWikiVisualCatalog({ job, graph, appearanceBytes, previousCatalog = null }) {
  insist(job?.source?.manifest_ref && /^[a-f0-9]{64}$/.test(job.source.manifest_sha256 ?? ''),
    'A_WIKI_VISUAL_SOURCE_BINDING_INVALID')
  insist(graph?.anchor && /^[a-f0-9]{64}$/.test(graph.content_sha256 ?? ''),
    'A_WIKI_VISUAL_GRAPH_INVALID')
  const approved = JSON.parse(Buffer.from(appearanceBytes).toString('utf8'))
  const appearanceSha = visualByteHash(Buffer.from(appearanceBytes))
  const appearances = {
    ...approved,
    records: approved.records.map((item) => ({
      ...item,
      evidence: {
        source_ref: approvedAppearanceRef,
        source_sha256: appearanceSha,
        pointer: `/characters/${item.node_id}`,
      },
    })),
  }
  const identity = {
    chronicle_id: 'C03-AFTERFALL',
    worldline_id: 'AFTERFALL',
    visibility: 'PUBLIC_ARCHIVE',
    season_id: job.season_id,
    source_ref: job.source.manifest_ref,
    source_sha256: job.source.manifest_sha256,
    graph_sha256: graph.content_sha256,
    anchor: graph.anchor,
  }
  const batch = {
    batch_id: `batch-${fingerprint(identity)}`,
    snapshot: {
      chronicle_id: 'C03-AFTERFALL',
      worldline_id: 'AFTERFALL',
      visibility: 'PUBLIC_ARCHIVE',
      source_save_version: graph.anchor.save_version,
      source_game_time: graph.anchor.game_time,
    },
  }
  const catalog = compileVisualCatalog({ batch, graph, appearances })
  validateVisualCatalog(catalog)
  if (previousCatalog) {
    validateVisualCatalog(previousCatalog)
    insist(!previousCatalog.points.some((point) => point.point_type === 'MAP'),
      'A_WIKI_VISUAL_PUBLIC_MAP_RECOMPILE_REQUIRED')
    const nextBySubject = new Map(catalog.points.map((point) => [point.subject_id, point]))
    for (const previous of previousCatalog.points) {
      const next = nextBySubject.get(previous.subject_id)
      insist(next && next.point_id === previous.point_id, 'A_WIKI_VISUAL_POINT_IDENTITY_CHANGED')
    }
  }
  return { catalog, bytes: Buffer.from(visualBytes(catalog), 'utf8') }
}

function isAncestor(ancestor, descendant, cwd = root) {
  try {
    run('git', ['merge-base', '--is-ancestor', ancestor, descendant], cwd)
    return true
  } catch (error) {
    if (error.message === 'A_WIKI_COMMAND_GIT_1') return false
    throw error
  }
}

async function advance(row, expected, status, extra = {}, requestRpc = rpc) {
  return requestRpc('archive_a_wiki_native_job_advance', {
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

export async function prepareNativeJob({
  requestRpc = rpc, base = root, collectCompletion = collectCompletedWikiPublication,
} = {}) {
  const mainSha = run('git', ['rev-parse', 'HEAD'], base)
  insist(/^[a-f0-9]{40}$/.test(mainSha), 'A_WIKI_MAIN_SHA_INVALID')
  // Reconcile the durable ledger BEFORE looking for an unprocessed source.
  // Otherwise an already-merged receipt makes discovery return NO_JOB while
  // the one-active-job constraint keeps every later source blocked forever.
  const active = await requestRpc('archive_a_wiki_native_job_recovery_current', {})
  let reconciledJobId = null
  if (active && active.status !== 'NO_JOB') {
    if (['HUMAN_REVIEW', 'REJECT'].includes(active.status)) {
      return { status: active.status, session_id: active.session_id, job_id: active.job_id }
    }
    const sources = await discoverWikiSources(base)
    const evidence = await collectCompletion({ row: active, base, mainSha, sources })
    if (evidence) {
      const reconciled = await requestRpc('archive_a_wiki_native_job_reconcile_publication', {
        p_job_id: active.job_id, p_expected_status: active.status, p_evidence: evidence,
      })
      insist(['PUBLISHED', 'ALREADY_RECONCILED'].includes(reconciled?.status),
        'A_WIKI_COMPLETION_RECONCILE_FAILED')
      reconciledJobId = active.job_id
    } else if (active.status === 'BLOCKED'
      && (/^A_WIKI_COMMAND_GH_(?:1|FAILED)$/.test(active.blocker_code ?? '')
        || ['A_WIKI_PR_BINDING_INVALID', 'A_WIKI_PR_HEAD_CHANGED',
          'A_WIKI_PR_CHECK_REGISTRATION_TIMEOUT'].includes(active.blocker_code ?? ''))) {
      const graph = JSON.parse(await readFile(join(base, graphRef), 'utf8'))
      if (graph.content_sha256 !== active.graph_sha256) {
        const source = sources.find((candidate) => candidate.sourceManifestRef === active.source_ref
          && candidate.sourceDigest === active.source_sha256)
        insist(source, 'A_WIKI_REPREPARE_SOURCE_UNAVAILABLE')
        const replacement = await requestRpc('archive_a_wiki_native_job_supersede_reprepare', {
          p_job_id: active.job_id, p_expected_status: 'BLOCKED',
          p_job: buildWikiFactJob(source, graph), p_main_sha: mainSha,
        })
        insist(['EXTRACTOR_READY', 'ALREADY_REPREPARED'].includes(replacement?.status),
          'A_WIKI_REPREPARE_FAILED')
        return { status: replacement.status, session_id: source.sourceSession.session_id,
          season_id: source.seasonId, job_id: replacement.job_id, superseded_job_id: active.job_id }
      }
      const disposition = inspectSubmittedReview({ ...active, status: 'FINALIZING' })
      insist(disposition.action === 'PUBLISH', 'A_WIKI_BLOCKED_REVIEW_NOT_APPROVED')
      const resumed = await advance(active, 'BLOCKED', 'FINALIZING', {}, requestRpc)
      insist(resumed?.status === 'FINALIZING', 'A_WIKI_PUBLICATION_RESUME_FAILED')
      const dispatched = await requestRpc('archive_a_wiki_native_dispatch', {})
      insist(dispatched?.status === 'DISPATCHED' && Number.isInteger(dispatched.request_id),
        'A_WIKI_PUBLICATION_REDISPATCH_FAILED')
      return { status: 'FINALIZING', session_id: active.session_id,
        season_id: active.prepared_job?.season_id, job_id: active.job_id,
        recovery: 'GITHUB_PUBLICATION_RETRY', dispatch_request_id: dispatched.request_id }
    } else if (active.status === 'BLOCKED'
      && active.blocker_code === 'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED') {
      const source = sources.find((candidate) => candidate.sourceManifestRef === active.source_ref
        && candidate.sourceDigest === active.source_sha256)
      insist(source, 'A_WIKI_REPREPARE_SOURCE_UNAVAILABLE')
      const graph = JSON.parse(await readFile(join(base, graphRef), 'utf8'))
      if (graph.content_sha256 === active.graph_sha256) {
        return { status: 'BLOCKED', session_id: active.session_id,
          job_id: active.job_id, blocker_code: active.blocker_code }
      }
      const replacement = await requestRpc('archive_a_wiki_native_job_supersede_reprepare', {
        p_job_id: active.job_id, p_expected_status: 'BLOCKED',
        p_job: buildWikiFactJob(source, graph), p_main_sha: mainSha,
      })
      insist(['EXTRACTOR_READY', 'ALREADY_REPREPARED'].includes(replacement?.status),
        'A_WIKI_REPREPARE_FAILED')
      return { status: replacement.status, session_id: source.sourceSession.session_id,
        season_id: source.seasonId, job_id: replacement.job_id, superseded_job_id: active.job_id }
    } else {
      return { status: active.status, session_id: active.session_id,
        season_id: active.prepared_job?.season_id, job_id: active.job_id }
    }
  }
  let source
  try { source = await discoverWikiSource(base) }
  catch (error) {
    if (error.message === 'WIKI_NO_PENDING_SOURCE') return { status: 'NO_JOB',
      source_session: error.source_session ?? null, source_season: error.source_season ?? null,
      ...(reconciledJobId ? { reconciled_job_id: reconciledJobId } : {}) }
    throw error
  }
  const graph = JSON.parse(await readFile(join(base, graphRef), 'utf8'))
  const job = buildWikiFactJob(source, graph)
  const prepared = await requestRpc('archive_a_wiki_native_job_prepare', {
    p_job: job,
    p_main_sha: mainSha,
  })
  return { status: prepared?.status ?? 'UNKNOWN', season_id: source.seasonId,
    session_id: source.sourceSession.session_id, job_id: prepared?.job_id ?? null,
    ...(reconciledJobId ? { reconciled_job_id: reconciledJobId } : {}) }
}

export function publicationBranch(job, superseded = false) {
  const number = job.source.session_id.replace('SESSION_', '')
  insist(/^S\d{2,3}$/.test(job.season_id) && Number(job.season_id.slice(1)) >= 3,
    'A_WIKI_PUBLICATION_SEASON_INVALID')
  const season = job.season_id === 'S03' ? '' : `${job.season_id.toLowerCase()}-`
  return `automation/a-wiki-publish-${season}${number}-${job.source.manifest_sha256.slice(0, 12)}`
    + (superseded ? `-g${job.graph_sha256.slice(0, 12)}` : '')
}

function findPullRequest(headRef) {
  const all = JSON.parse(run('gh', ['pr', 'list', '--repo', repository, '--head', headRef, '--state', 'all',
    '--json', 'number,url,state,headRefName,headRefOid,baseRefName,baseRefOid,mergeCommit'], root) || '[]')
  return all.find((pr) => pr.headRefName === headRef) ?? null
}

export function mergedPublication(existingPr, branch) {
  if (!existingPr || existingPr.state !== 'MERGED') return null
  insist(existingPr.headRefName === branch && existingPr.baseRefName === 'main',
    'A_WIKI_MERGED_PR_BINDING_INVALID')
  insist(/^[a-f0-9]{40}$/.test(existingPr.headRefOid ?? '')
    && /^[a-f0-9]{40}$/.test(existingPr.mergeCommit?.oid ?? ''),
  'A_WIKI_MERGED_PR_SHA_INVALID')
  return {
    status: 'MERGED',
    branch,
    prNumber: existingPr.number,
    headSha: existingPr.headRefOid,
    mergeSha: existingPr.mergeCommit.oid,
  }
}

export function confirmMergedPublication(row, publication, evidence) {
  const review = validateWikiFactReview(row.review_job, row.review_result)
  insist(evidence && review.decision === 'APPROVE'
    && evidence.pr_number === publication.prNumber && evidence.head_ref === publication.branch
    && evidence.head_sha === publication.headSha && evidence.merge_sha === publication.mergeSha
    && evidence.source_ref === row.source_ref && evidence.source_sha256 === row.source_sha256
    && evidence.receipt_job_id === row.prepared_job.job_id
    && evidence.proposal_sha256 === row.proposal.proposal_sha256
    && evidence.review_sha256 === review.review_sha256,
  'A_WIKI_MERGED_PUBLICATION_EVIDENCE_INVALID')
  return publication
}

async function withMainWorktree(prefix, work) {
  const temp = await mkdtemp(join(tmpdir(), prefix))
  let worktree = false
  try {
    run('git', ['worktree', 'add', '--detach', temp, 'origin/main'], root)
    worktree = true
    return await work(temp)
  } finally {
    if (worktree) {
      try { run('git', ['worktree', 'remove', '--force', temp], root) } catch {}
    }
    await rm(temp, { recursive: true, force: true })
  }
}

async function buildPublicationHead(row, branch, currentMain, remoteSha = null) {
  const temp = await mkdtemp(join(tmpdir(), 'a-wiki-publish-'))
  let worktree = false
  try {
    run('git', ['worktree', 'add', '--detach', temp, currentMain], root)
    worktree = true
    // Unit/contract tests run against the unmutated latest-main base.
    run('node', ['--test',
      'archive/scripts/lib/publication-graph.test.mjs',
      'archive/scripts/lib/wiki-semantic-jobs.test.mjs',
      'archive/scripts/lib/wiki-fact-extractor.test.mjs',
      'archive/scripts/lib/wiki-fact-finalizer.test.mjs',
    ], temp)

    const previousCatalog = JSON.parse(await readFile(join(temp, visualRef), 'utf8'))
    const result = await finalizeWikiFactProposal({
      root: temp,
      job: row.prepared_job,
      proposal: row.proposal,
      review: row.review_result,
      apply: true,
    })
    insist(['FINALIZED', 'RECOVERED_AND_FINALIZED', 'NOOP_ALREADY_FINALIZED'].includes(result.status),
      'A_WIKI_FINALIZER_NOT_APPLIED')

    const finalizedGraph = JSON.parse(await readFile(join(temp, graphRef), 'utf8'))
    const appearanceBytes = await readFile(join(temp, approvedAppearanceRef))
    const visual = compileAWikiVisualCatalog({
      job: row.prepared_job,
      graph: finalizedGraph,
      appearanceBytes,
      previousCatalog,
    })
    await writeFile(join(temp, visualRef), visual.bytes)

    const trackedChanged = run('git', ['diff', '--name-only'], temp).split(/\r?\n/).filter(Boolean)
    const untrackedChanged = run('git', ['ls-files', '--others', '--exclude-standard'], temp).split(/\r?\n/).filter(Boolean)
    const changedPaths = [...new Set([...trackedChanged, ...untrackedChanged])]
    insist(changedPaths.length > 0, 'A_WIKI_PUBLICATION_EMPTY')
    const allowedPrefixes = [
      graphRef,
      visualRef,
      `archive/content/public-facts/C03-AFTERFALL/${row.prepared_job.season_id}/AWIKI_`,
      `archive/content/public-facts/C03-AFTERFALL/${row.prepared_job.season_id}/receipts/AWIKI_`,
    ]
    const invalidPaths = changedPaths.filter((path) =>
      !allowedPrefixes.some((allowed) => path === allowed || path.startsWith(allowed)))
    insist(invalidPaths.length === 0,
      `A_WIKI_PUBLICATION_SCOPE_INVALID|${invalidPaths[0]?.slice(0, 80) ?? 'UNKNOWN'}`)

    run('git', ['add', graphRef, visualRef,
      `archive/content/public-facts/C03-AFTERFALL/${row.prepared_job.season_id}`], temp)
    run('git', ['config', 'user.name', 'a-wiki-native-finalizer'], temp)
    run('git', ['config', 'user.email', 'a-wiki-native-finalizer@users.noreply.github.com'], temp)
    run('git', ['commit', '-m', `a-wiki: publish ${row.session_id} semantic facts`], temp)
    const headSha = run('git', ['rev-parse', 'HEAD'], temp)
    const pushArgs = remoteSha
      ? ['push', `--force-with-lease=refs/heads/${branch}:${remoteSha}`, 'origin', `HEAD:refs/heads/${branch}`]
      : ['push', 'origin', `HEAD:refs/heads/${branch}`]
    run('git', pushArgs, temp)
    return headSha
  } finally {
    if (worktree) {
      try { run('git', ['worktree', 'remove', '--force', temp], root) } catch {}
    }
    await rm(temp, { recursive: true, force: true })
  }
}

async function waitForPullRequestBinding(prNumber, headSha) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const info = JSON.parse(run('gh', ['pr', 'view', String(prNumber), '--repo', repository,
      '--json', 'number,url,state,headRefName,headRefOid,baseRefName,baseRefOid,mergeStateStatus'], root))
    if (info.headRefOid === headSha && info.baseRefName === 'main') return info
    if (attempt < 59) await new Promise((resolveWait) => setTimeout(resolveWait, 1000))
  }
  throw new Error('A_WIKI_PR_BINDING_INVALID')
}

async function waitForCheckRegistration(prNumber, headSha) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const info = JSON.parse(run('gh', ['pr', 'view', String(prNumber), '--repo', repository,
      '--json', 'headRefOid,statusCheckRollup'], root))
    insist(info.headRefOid === headSha, 'A_WIKI_PR_HEAD_CHANGED')
    if ((info.statusCheckRollup ?? []).length > 0) return
    if (attempt < 59) await new Promise((resolveWait) => setTimeout(resolveWait, 2000))
  }
  throw new Error('A_WIKI_PR_CHECK_REGISTRATION_TIMEOUT')
}

async function buildPublication(row) {
  run('git', ['fetch', 'origin', 'main'], root)

  const branch = publicationBranch(row.prepared_job, Boolean(row.supersedes_job_id))
  const existingPr = findPullRequest(branch)
  const alreadyMerged = mergedPublication(existingPr, branch)
  const currentMain = run('git', ['rev-parse', 'origin/main'], root)
  if (alreadyMerged) {
    return withMainWorktree('a-wiki-merged-proof-', async (base) => {
      const evidence = await collectCompletedWikiPublication({ row, base, mainSha: currentMain })
      return confirmMergedPublication(row, alreadyMerged, evidence)
    })
  }

  const currentGraph = JSON.parse(run('git', ['show', `origin/main:${graphRef}`], root))
  if (currentGraph.content_sha256 !== row.graph_sha256) throw new Error('A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED')

  let headSha = existingPr?.headRefOid ?? null
  const remote = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], root)
  if (remote) {
    const remoteSha = remote.split(/\s+/)[0]
    if (headSha && remoteSha !== headSha) throw new Error('A_WIKI_PUBLICATION_BRANCH_IDENTITY_CONFLICT')
    run('git', ['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], root)
    const needsRefresh = !isAncestor(currentMain, remoteSha)
    headSha = needsRefresh
      ? await buildPublicationHead(row, branch, currentMain, remoteSha)
      : remoteSha
  } else {
    headSha = await buildPublicationHead(row, branch, currentMain)
  }

  let pr = findPullRequest(branch)
  if (!pr || pr.state !== 'OPEN') {
    const url = run('gh', ['pr', 'create', '--repo', repository, '--base', 'main', '--head', branch,
      '--title', `A-Wiki semantic ${row.session_id}`,
      '--body', 'Native Extractor + independent Reviewer approved. Program Finalizer applied exact source-bound facts and refreshed the derived Visual catalog. Receipt is the durable completion signal. Production remains batched.'], root)
    pr = JSON.parse(run('gh', ['pr', 'view', url, '--repo', repository, '--json', 'number,url,state'], root))
  }
  pr = await waitForPullRequestBinding(pr.number, headSha)

  await waitForCheckRegistration(pr.number, headSha)
  run('gh', ['pr', 'checks', String(pr.number), '--repo', repository, '--watch', '--interval', '10'], root, { timeout: 1_200_000 })
  pr = JSON.parse(run('gh', ['pr', 'view', String(pr.number), '--repo', repository,
    '--json', 'number,state,headRefOid,baseRefName,baseRefOid,mergeStateStatus,statusCheckRollup'], root))
  insist(pr.headRefOid === headSha && pr.baseRefName === 'main' && pr.mergeStateStatus === 'CLEAN',
    'A_WIKI_PR_NOT_CLEAN')
  run('git', ['fetch', 'origin', 'main'], root)
  const currentGraphAfterChecks = JSON.parse(run('git', ['show', `origin/main:${graphRef}`], root))
  insist(currentGraphAfterChecks.content_sha256 === row.graph_sha256,
    'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED')

  const mergeRaw = run('gh', ['api', '--method', 'PUT', `repos/${repository}/pulls/${pr.number}/merge`,
    '-f', 'merge_method=squash', '-f', `sha=${headSha}`], root)
  const merged = JSON.parse(mergeRaw)
  insist(merged.merged === true && /^[a-f0-9]{40}$/.test(merged.sha ?? ''), 'A_WIKI_MERGE_NOT_CONFIRMED')
  return { status: 'MERGED', branch, prNumber: pr.number, headSha, mergeSha: merged.sha }
}

async function reprepareOnLatestMain({ requestRpc }) {
  run('git', ['fetch', 'origin', 'main'], root)
  return withMainWorktree('a-wiki-reprepare-', (base) => prepareNativeJob({ requestRpc, base }))
}

export async function consumeNativeJob({
  requestRpc = rpc, publish = buildPublication, reprepare = reprepareOnLatestMain,
} = {}) {
  const row = await requestRpc('archive_a_wiki_native_job_program_current', {})
  if (!row || row.status === 'NO_PROGRAM_JOB') return { status: 'NO_PROGRAM_JOB' }
  const change = (expected, status, extra) => advance(row, expected, status, extra, requestRpc)

  if (row.status === 'EXTRACTOR_SUBMITTED') {
    const compiled = compileSubmittedExtractor(row)
    if (compiled.action === 'HUMAN_REVIEW') {
      const update = await change('EXTRACTOR_SUBMITTED', 'HUMAN_REVIEW', { blockerCode: compiled.code })
      return { status: 'HUMAN_REVIEW', session_id: row.session_id, update }
    }
    const update = await change('EXTRACTOR_SUBMITTED', 'REVIEW_READY', {
      proposal: compiled.proposal,
      reviewJob: compiled.reviewJob,
    })
    return { status: 'REVIEW_READY', session_id: row.session_id, proposal_sha256: compiled.proposal.proposal_sha256, update }
  }

  if (row.status === 'REVIEW_SUBMITTED') {
    const disposition = inspectSubmittedReview(row)
    if (disposition.action !== 'PUBLISH') {
      const update = await change('REVIEW_SUBMITTED', disposition.action, {
        blockerCode: `REVIEWER_${disposition.action}`,
      })
      return { status: disposition.action, session_id: row.session_id, update }
    }
    const claimed = await change('REVIEW_SUBMITTED', 'FINALIZING')
    insist(claimed?.status === 'FINALIZING', 'A_WIKI_FINALIZING_CLAIM_FAILED')
    row.status = 'FINALIZING'
  }

  if (row.status === 'FINALIZING') {
    try {
      const publication = await publish(row)
      const update = await change('FINALIZING', 'PUBLISHED', {
        prNumber: publication.prNumber,
        headRef: publication.branch,
        headSha: publication.headSha,
        mergeSha: publication.mergeSha,
      })
      insist(update?.status === 'PUBLISHED', 'A_WIKI_PUBLISHED_STATE_NOT_CONFIRMED')
      return { ...publication, status: 'PUBLISHED', session_id: row.session_id, update }
    } catch (error) {
      const code = error.message.split(':')[0].slice(0, 120)
      const blocked = await change('FINALIZING', 'BLOCKED', { blockerCode: code }).catch(() => null)
      if (code === 'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED' && blocked?.status === 'BLOCKED') {
        // A fresh source-bound extraction and a fresh independent review are
        // required. Retrying the old approved proposal cannot repair drift.
        const next = await reprepare({ requestRpc })
        return { ...next, previous_job_id: row.job_id }
      }
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
