/** One daily AFTERFALL source cycle. The only database capability is a restricted SELECT login. */
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertRestrictedExportRole } from './lib/archive-export-role.mjs'
import { DAILY_SOURCE_SESSION, discoverCompletePairs, materializeSegment, publishedWatermark } from './lib/archive-daily-core.mjs'
import { readDiscoverySnapshot } from './lib/archive-discovery-read.mjs'
import { candidateState, loadPublishedIndex, verifyDiscoveryCandidate } from './lib/archive-source-discovery.mjs'
import { approvedSeasonCatalog } from './lib/approved-reader-sources.mjs'
import { checkAppendOnlyEdition } from './lib/reader-auto.mjs'
import { createBatch, fingerprint } from './lib/publication-plan.mjs'
import { byteHash, graphBytes, reconcileReaderOnlyGraph } from './lib/publication-graph.mjs'
import { compileVisualCatalog, validateVisualCatalog, visualByteHash, visualBytes } from './lib/visual-compiler.mjs'
import { publicKnowledgeInventory, scanKnowledge } from './lib/knowledge-scan.mjs'
import { findProductionSite, findReadyProductionDeploy } from './lib/netlify-production.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const seasonRoot = 'archive/content/transcripts/C03-AFTERFALL/S03'
const bookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'
const graphRef = 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'
const visualRef = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'
const approvedAppearanceRef = 'archive/content/public-facts/C03-AFTERFALL/S02/APPEARANCES_APPROVED_20260926.json'
const sha = (value) => createHash('sha256').update(value).digest('hex')
const insist = (ok, code) => { if (!ok) throw new Error(code) }
const bytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n')
const absolute = (ref) => resolve(root, ref)
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 4_000_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const gh = (...args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8', maxBuffer: 4_000_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const readJSON = async (ref) => JSON.parse(await readFile(absolute(ref), 'utf8'))

async function publishedState() {
  const manifest = await readJSON(`${seasonRoot}/MANIFEST.json`)
  const sources = new Map()
  for (const entry of manifest.sessions) {
    if (entry.source_session_uuid !== DAILY_SOURCE_SESSION) continue
    sources.set(entry.session_id, await readJSON(`${seasonRoot}/${entry.session_id}/SOURCE_MANIFEST.json`))
  }
  return { manifest, ...publishedWatermark(manifest, sources) }
}

async function sourceClient() {
  insist(process.env.ARCHIVE_EXPORT_DATABASE_URL, 'BLOCKER_SECRET_SETUP_REQUIRED')
  const { Client } = await import('pg')
  const client = new Client({ connectionString: process.env.ARCHIVE_EXPORT_DATABASE_URL,
    ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000 })
  await client.connect()
  return client
}

async function liveSource(nextOrder) {
  const client = await sourceClient()
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query("SET LOCAL statement_timeout = '10s'")
    await assertRestrictedExportRole(client)
    const session = (await client.query(`select id::text,worldline_id,chronicle_id,season_id,status,last_message_order
      from survival_rpg.transcript_sessions where id=$1::uuid`, [DAILY_SOURCE_SESSION])).rows[0]
    insist(session, 'SOURCE_SESSION_MISSING')
    const rows = (await client.query(`select id::text,session_id::text,worldline_id,chronicle_id,season_id,
      turn_no,message_order,role,content,content_sha256,save_version,public_safe,source_type,game_time,recorded_at
      from survival_rpg.transcript_messages where session_id=$1::uuid and message_order between $2::integer and $3::integer
      order by message_order limit 200`, [DAILY_SOURCE_SESSION, nextOrder, Math.min(session.last_message_order, nextOrder + 199)])).rows
    const discovery = discoverCompletePairs(session, rows, nextOrder)
    let links = []
    if (discovery.status === 'NEW_SOURCE_RANGE') {
      links = (await client.query(`select turn_no,user_message_id::text,gm_message_id::text,outcome,
        user_save_version,gm_save_version,linked_save_version
        from survival_rpg.transcript_turn_state_links
        where session_id=$1::uuid and turn_no between $2::integer and $3::integer order by turn_no`,
      [DAILY_SOURCE_SESSION, discovery.rows[0].turn_no, discovery.rows.at(-1).turn_no])).rows
    }
    await client.query('COMMIT')
    return { session, discovery, links }
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { await client.end() }
}

export async function compileCandidate(state, live, { workspace = root, discoveryV2 = false } = {}) {
  const { session, discovery, links } = live
  const seasonRoot = `archive/content/transcripts/C03-AFTERFALL/${session.season_id}`
  const absolute = (ref) => resolve(workspace, ref)
  const readJSON = async (ref) => JSON.parse(await readFile(absolute(ref), 'utf8'))
  const source = materializeSegment({ session, discovery, sessionId: state.nextSessionId,
    links, sealedAt: new Date(discovery.rows.at(-1).recorded_at).toISOString() })
  const prefix = `${seasonRoot}/${state.nextSessionId}`
  insist(!state.manifest.sessions.some((item) => item.session_id === state.nextSessionId), 'SEGMENT_ID_COLLISION')
  await mkdir(absolute(seasonRoot), { recursive: true })
  await mkdir(absolute(prefix), { recursive: false })
  await writeFile(absolute(`${prefix}/PART_001.md`), source.part, { flag: 'wx' })
  await writeFile(absolute(`${prefix}/SOURCE_MANIFEST.json`), bytes(source.source), { flag: 'wx' })
  const nextManifest = { ...state.manifest, sessions: [...state.manifest.sessions, source.entry],
    source_policy: 'Only listed immutable verified segments are published. Each SOURCE_MANIFEST is sealed.' }
  await writeFile(absolute(`${seasonRoot}/MANIFEST.json`), bytes(nextManifest))
  const priorBook = await readJSON(bookRef)
  const { makeBooks } = await import('./build-reader-edition.mjs')
  const { rawCatalog } = await import('./reader-source-catalog.mjs')
  const catalogParts = rawCatalog['C03-AFTERFALL'].filter((p) => !p.autoPublication)
  for (const season of (await readdir(absolute('archive/content/transcripts/C03-AFTERFALL'))).filter((s) => /^S\d{2,3}$/.test(s) && !['S01', 'S02'].includes(s)).sort()) {
    const manifest = await readJSON(`archive/content/transcripts/C03-AFTERFALL/${season}/MANIFEST.json`)
    catalogParts.push(...await approvedSeasonCatalog(manifest, season, {
      read: (ref) => readFile(absolute(ref)),
      listParts: async (ref) => (await readdir(absolute(ref))).filter((name) => /^PART_\d{3}\.md$/.test(name)),
    }))
  }
  const [book] = await makeBooks({ readSource: (ref) => readFile(absolute(ref)), catalogs: { 'C03-AFTERFALL': catalogParts } })
  const allowed = new Set([`${prefix}/SOURCE_MANIFEST.json`])
  const additions = checkAppendOnlyEdition(priorBook, book, allowed)
  insist(additions.length === 1, 'READER_ADDITION_MISMATCH')
  await writeFile(absolute(bookRef), bytes(book))

  const last = discovery.rows.at(-1)
  const priorGraph = await readJSON(graphRef)
  const oldVisual = await readJSON(visualRef)
  let graphReport = { nodes_added: 0, nodes_updated: 0, relations_added: 0,
    relations_updated: 0, story_links: priorGraph.story_links.length, status: 'NO_STRUCTURED_ANCHOR' }
  let catalog = oldVisual
  const checkpoint = discoveryV2 ? session.archive_intent?.checkpoint_ref : 'worldlines/AFTERFALL/seasons/S03/CURRENT_CHECKPOINT_2027-04-08.md'
  let verifiedCheckpoint = !discoveryV2
  if (discoveryV2 && checkpoint && session.archive_intent?.checkpoint_revision) {
    try { git('cat-file', '-e', `${session.archive_intent.checkpoint_revision}:${checkpoint}`); verifiedCheckpoint = true }
    catch { graphReport.status = 'CHECKPOINT_NOT_VERIFIED' }
  }
  const linkedAnchor = links.some((link) => link.gm_message_id === last.id && link.outcome === 'APPLIED')
  if (Number.isSafeInteger(last.save_version) && last.save_version > priorGraph.anchor.save_version
    && (!discoveryV2 || (verifiedCheckpoint && linkedAnchor))) {
    const snapshot = { version: 'publication-snapshot-v1', chronicle_id: 'C03-AFTERFALL',
    worldline_id: 'AFTERFALL', season_id: session.season_id, visibility: 'PUBLIC_ARCHIVE',
    source_revision: discoveryV2 ? session.archive_intent.checkpoint_revision : git('rev-parse', 'HEAD'), source_save_version: last.save_version,
    source_game_time: last.game_time,
    source_checkpoint: checkpoint,
    coverage_status: 'PARTIAL', sources: [{ session_id: source.entry.session_id,
      source_ref: `${prefix}/SOURCE_MANIFEST.json`, source_digest: fingerprint(source.entry),
      visibility: 'PUBLIC_ARCHIVE', capture_quality: source.entry.capture_quality,
      atomic_pairing_complete: true, captured_message_range: source.entry.captured_message_range,
      user_messages: source.entry.user_messages, gm_public_blocks: source.entry.gm_public_blocks }] }
    const batch = createBatch(snapshot)
    const reconciled = reconcileReaderOnlyGraph({ previous: priorGraph,
      book, bookSource: { source_ref: bookRef, source_sha256: byteHash(bytes(book)) },
      boundary: { save_version: last.save_version, game_time: last.game_time } })
    graphReport = reconciled.report
    await writeFile(absolute(graphRef), graphBytes(reconciled.graph))

    const appearanceBytes = await readFile(absolute(approvedAppearanceRef))
    const approved = JSON.parse(appearanceBytes)
    const appearances = { ...approved, records: approved.records.map((item) => ({ ...item,
      evidence: { source_ref: approvedAppearanceRef, source_sha256: visualByteHash(appearanceBytes),
        pointer: `/characters/${item.node_id}` } })) }
    catalog = compileVisualCatalog({ batch, graph: reconciled.graph, appearances })
    validateVisualCatalog(catalog)
    for (const point of oldVisual.points) {
      const current = catalog.points.find((item) => item.subject_id === point.subject_id)
      insist(current?.point_id === point.point_id && current.generation_key === point.generation_key,
        'EXISTING_VISUAL_IDENTITY_CHANGED')
    }
    await writeFile(absolute(visualRef), visualBytes(catalog))
  }

  const inventory = await publicKnowledgeInventory(workspace)
  const knowledge = scanKnowledge(inventory, await readJSON('knowledge/automation/state.json'))
  insist(knowledge.status === 'PENDING' && knowledge.sources.some((item) =>
    item.source_manifest_ref === `${prefix}/SOURCE_MANIFEST.json` && item.status === 'PENDING'),
  'KNOWLEDGE_HANDOFF_FAILED')
  insist(!knowledge.sources.some((item) => item.status === 'SOURCE_CHANGED_RESCAN_REQUIRED'),
    'OLD_KNOWLEDGE_SOURCE_CHANGED')
  return { source, additions, graphReport, catalog, prefix }
}

function gates() {
  const run = (executable, args, cwd = root) => execFileSync(executable === 'npm' && process.platform === 'win32' ? 'npm.cmd' : executable, args,
    { cwd, stdio: 'ignore', timeout: 300_000 })
  run('node', ['--test', 'archive/scripts/lib/archive-daily-core.test.mjs', 'archive/scripts/lib/archive-source-discovery.test.mjs'])
  run('node', ['--test', 'archive/scripts/lib/netlify-production.test.mjs'])
  run('node', ['--test', 'archive/scripts/lib/reader-batch.test.mjs',
    'archive/scripts/lib/publication-graph.test.mjs', 'archive/scripts/lib/visual-compiler.test.mjs'])
  run('npm', ['ci'], absolute('archive/web'))
  run('npm', ['test', '--', '--run'], absolute('archive/web'))
  run('npm', ['run', 'reader:check'], absolute('archive/web'))
  run('npm', ['run', 'build'], absolute('archive/web'))
}

export function assertMainBase(base, code = 'STALE_BASE_HUMAN_REVIEW_REQUIRED') {
  insist(git('rev-parse', 'origin/main') === base, code)
}

function proposal({ discovery, candidate, base, mode }) {
  const seasonRoot = candidate.prefix.slice(0, candidate.prefix.lastIndexOf('/'))
  const seasonId = candidate.source.source.season_id
  assertMainBase(base)
  const digest = candidate.source.segmentId.slice(8, 20)
  const branch = `codex/archive-daily-${discovery.startOrder}-${discovery.endOrder}-${digest}`
  const changed = [...new Set([
    ...git('diff', 'HEAD', '--name-only').split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean))]
  const owned = [candidate.prefix, `${seasonRoot}/MANIFEST.json`, bookRef, graphRef, visualRef]
  insist(changed.every((path) => owned.some((ref) => path === ref || path.startsWith(`${ref}/`))),
    'OWNERSHIP_VIOLATION')
  git('switch', '-c', branch)
  git('add', `${seasonRoot}/MANIFEST.json`, candidate.prefix, bookRef, graphRef, visualRef)
  git('-c', 'user.name=archive-daily', '-c', 'user.email=archive-daily@users.noreply.github.com',
    'commit', '-m', `archive: publish ${seasonId} source orders ${discovery.startOrder}-${discovery.endOrder}`)
  const commit = git('rev-parse', 'HEAD')
  git('push', 'origin', `HEAD:refs/heads/${branch}`)
  const existing = JSON.parse(gh('pr', 'list', '--repo', 'cetin072/survival-interactive-series',
    '--head', branch, '--state', 'open', '--json', 'number,url'))
  const body = `Source session: ${candidate.source.source.source_session_uuid}\nSource orders: ${discovery.startOrder}-${discovery.endOrder}\nPairs: ${discovery.pairs}\nRAW segments: 1\nReader chapters added: ${candidate.additions.length}\nGraph facts added: ${candidate.graphReport.nodes_added}; Reader links: ${candidate.graphReport.story_links}\nVisual points: ${candidate.catalog.points.length}\nReplay: same published range is NOOP after merge\nMode: ${mode}.\n`
  let pr = existing[0]
  if (!pr) {
    const bodyFile = join(tmpdir(), `archive-daily-pr-${randomUUID()}.md`)
    writeFileSync(bodyFile, body, { flag: 'wx' })
    try { pr = { url: gh('pr', 'create', '--repo', 'cetin072/survival-interactive-series',
      '--base', 'main', '--head', branch, '--title', `Archive daily ${seasonId} ${discovery.startOrder}-${discovery.endOrder}`,
      '--body-file', bodyFile) } }
    finally { unlinkSync(bodyFile) }
  }
  return { branch, commit, pr: pr.url }
}

function priorProposal(discovery, sourceId = DAILY_SOURCE_SESSION) {
  const segment = `segment-${sha(JSON.stringify({ sourceId,
    start: discovery.startOrder, end: discovery.endOrder,
    hashes: discovery.rows.map((row) => row.content_sha256) }))}`
  const branch = `codex/archive-daily-${discovery.startOrder}-${discovery.endOrder}-${segment.slice(8, 20)}`
  const open = JSON.parse(gh('pr', 'list', '--repo', 'cetin072/survival-interactive-series',
    '--head', branch, '--state', 'open', '--json', 'number,url,headRefOid'))
  if (open.length) return { branch, pr: open[0].url, commit: open[0].headRefOid, status: 'EXISTING_PROPOSAL_NOOP' }
  insist(!git('ls-remote', '--heads', 'origin', branch), 'ORPHAN_BRANCH_HUMAN_REVIEW_REQUIRED')
  return null
}

async function verifyExistingProposal(existing, candidate, base) {
  const seasonRoot = candidate.prefix.slice(0, candidate.prefix.lastIndexOf('/'))
  const info = JSON.parse(gh('pr', 'view', existing.pr, '--repo', 'cetin072/survival-interactive-series',
    '--json', 'headRefName,headRefOid,baseRefName,baseRefOid,state'))
  insist(info.state === 'OPEN' && info.headRefName === existing.branch
    && info.headRefOid === existing.commit && info.baseRefName === 'main'
    && info.baseRefOid === base, 'EXISTING_PROPOSAL_CHANGED')
  git('fetch', 'origin', `refs/heads/${existing.branch}`)
  insist(git('rev-parse', 'FETCH_HEAD') === existing.commit, 'EXISTING_PROPOSAL_CHANGED')
  const allowed = new Set([`${seasonRoot}/MANIFEST.json`, `${candidate.prefix}/PART_001.md`,
    `${candidate.prefix}/SOURCE_MANIFEST.json`, bookRef, graphRef, visualRef])
  const changed = git('diff', '--name-only', base, existing.commit).split('\n').filter(Boolean)
  insist(changed.length >= 4 && changed.every((ref) => allowed.has(ref)), 'EXISTING_PROPOSAL_OWNERSHIP_VIOLATION')
  for (const ref of allowed) {
    const committed = execFileSync('git', ['show', `${existing.commit}:${ref}`],
      { cwd: root, maxBuffer: 4_000_000, stdio: ['ignore', 'pipe', 'pipe'] })
    const expected = await readFile(absolute(ref))
    insist(committed.equals(expected), 'EXISTING_PROPOSAL_SOURCE_MISMATCH')
  }
}

async function previewGate(pr, expectedHead, expectedBase) {
  const requiredNames = ['browser', 'build', 'validate']
  let registered = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const info = JSON.parse(gh('pr', 'view', pr, '--repo', 'cetin072/survival-interactive-series',
      '--json', 'headRefOid,baseRefOid,statusCheckRollup'))
    insist(info.headRefOid === expectedHead && info.baseRefOid === expectedBase,
      'STALE_OR_UNMERGEABLE_PR')
    const checks = info.statusCheckRollup ?? []
    const requiredRegistered = requiredNames.every((name) => checks.some((item) =>
      item.__typename === 'CheckRun' && item.name === name))
    const previewRegistered = checks.some((item) => item.__typename === 'StatusContext'
      && item.context === 'netlify/survival-diary-archive/deploy-preview')
    if (requiredRegistered && previewRegistered) {
      registered = true
      break
    }
    if (attempt < 119) await new Promise((resolveWait) => setTimeout(resolveWait, 5000))
  }
  insist(registered, 'CHECK_REGISTRATION_TIMEOUT')
  try {
    execFileSync('gh', ['pr', 'checks', pr, '--repo', 'cetin072/survival-interactive-series', '--watch'],
      { cwd: root, stdio: 'ignore', timeout: 1_200_000 })
  } catch {
    throw new Error('PR_CHECK_FAILED')
  }
  const info = JSON.parse(gh('pr', 'view', pr, '--repo', 'cetin072/survival-interactive-series',
    '--json', 'headRefOid,baseRefOid,mergeStateStatus,statusCheckRollup'))
  insist(info.headRefOid === expectedHead && info.baseRefOid === expectedBase
    && info.mergeStateStatus === 'CLEAN', 'STALE_OR_UNMERGEABLE_PR')
  const checks = info.statusCheckRollup ?? []
  for (const name of requiredNames) {
    insist(checks.some((item) => item.__typename === 'CheckRun' && item.name === name
      && item.status === 'COMPLETED' && item.conclusion === 'SUCCESS'),
    'REQUIRED_CI_NOT_GREEN')
  }
  insist(checks.every((item) => item.__typename === 'StatusContext'
    ? item.state === 'SUCCESS'
    : ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(item.conclusion)), 'PR_CHECK_FAILED')
  const preview = checks.find((item) => item.__typename === 'StatusContext'
    && item.context === 'netlify/survival-diary-archive/deploy-preview')
  const number = Number(new URL(pr).pathname.match(/\/pull\/(\d+)\/?$/)?.[1])
  insist(Number.isSafeInteger(number) && number > 0, 'INVALID_PREVIEW_PR')
  const previewUrl = `https://deploy-preview-${number}--survival-diary-archive.netlify.app/`
  const knownTarget = typeof preview?.targetUrl === 'string' && (
    /^https:\/\/app\.netlify\.com\/projects\/survival-diary-archive\/deploys\/[a-f0-9]+\/?$/.test(preview.targetUrl)
    || preview.targetUrl.replace(/\/$/, '') === previewUrl.replace(/\/$/, '')
  )
  insist(preview?.state === 'SUCCESS' && knownTarget, 'PREVIEW_NOT_READY')
  return previewUrl
}

async function verifySite(url, chapterId, rawRef) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  insist(response.ok, 'SITE_NOT_READY')
  const html = await response.text()
  const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((match) => match[1])
  insist(scripts.length > 0, 'SITE_BUNDLE_MISSING')
  const assets = await Promise.all(scripts.map(async (path) => {
    const result = await fetch(new URL(path, url), { signal: AbortSignal.timeout(12000) })
    insist(result.ok, 'SITE_BUNDLE_NOT_READY')
    return result.text()
  }))
  const joined = assets.join('\n')
  insist(joined.includes(chapterId) && joined.includes(rawRef)
    && ['char-jinwoo', 'char-eunchae', 'char-seojin'].every((id) => joined.includes(id)),
  'SITE_CONTENT_NOT_READY')
}

async function netlifyApi(path) {
  insist(process.env.NETLIFY_AUTH_TOKEN, 'NETLIFY_AUTH_TOKEN_SETUP_REQUIRED')
  let response
  try {
    response = await fetch(`https://api.netlify.com/api/v1${path}`, {
      headers: { authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    })
  } catch { throw new Error('AUTO_PUBLISH_INCOMPLETE') }
  if (!response.ok) throw new Error('AUTO_PUBLISH_INCOMPLETE')
  try { return await response.json() }
  catch { throw new Error('AUTO_PUBLISH_INCOMPLETE') }
}

async function netlifyProductionSite() {
  const sites = await netlifyApi('/sites?name=survival-diary-archive&per_page=100')
  const site = findProductionSite(sites)
  return site
}

async function waitForProductionDeploy(site, expectedCommit, candidate) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const query = new URLSearchParams({ production: 'true', per_page: '100' })
    const deploys = await netlifyApi(`/sites/${encodeURIComponent(site.id)}/deploys?${query}`)
    if (!Array.isArray(deploys)) throw new Error('AUTO_PUBLISH_INCOMPLETE')
    const matching = deploys.find((deploy) => deploy?.context === 'production'
      && deploy.commit_ref === expectedCommit && deploy.draft !== true)
    if (matching?.state === 'error') throw new Error('AUTO_PUBLISH_INCOMPLETE')
    const ready = findReadyProductionDeploy(deploys, expectedCommit)
    if (ready) {
      try {
        await verifySite('https://survival-diary-archive.netlify.app/',
          candidate.additions[0].id, `${candidate.source.entry.session_id}/PART_001.md`)
        return { status: 'PRODUCTION_VERIFIED', merge_sha: expectedCommit,
          production: 'https://survival-diary-archive.netlify.app/', netlify_deploy_id: ready.id }
      } catch { /* The matching deploy may be ready before its CDN content is visible. */ }
    }
    if (attempt < 29) await new Promise((resolve) => setTimeout(resolve, 20000))
  }
  throw new Error('AUTO_PUBLISH_INCOMPLETE')
}

async function autoPublish(result, candidate, base, revalidate = async () => {}) {
  const preview = await previewGate(result.pr, result.commit, base)
  await verifySite(preview, candidate.additions[0].id, `${candidate.source.entry.session_id}/PART_001.md`)
  await revalidate()
  assertMainBase(base, 'BASE_MOVED_HUMAN_REVIEW_REQUIRED')
  gh('pr', 'merge', result.pr, '--repo', 'cetin072/survival-interactive-series',
    '--squash', '--match-head-commit', result.commit)
  const merged = JSON.parse(gh('pr', 'view', result.pr, '--repo', 'cetin072/survival-interactive-series',
    '--json', 'state,mergeCommit'))
  insist(merged.state === 'MERGED' && /^[a-f0-9]{40}$/.test(merged.mergeCommit?.oid),
    'MERGE_NOT_CONFIRMED')
  return { status: 'PRODUCTION_QUEUED', merge_sha: merged.mergeCommit.oid,
    production_release: 'BATCHED_RELEASE_GATE' }
}

/** Dedicated V2 entrypoint; neither --apply nor the regular schedule is switched. */
export async function discoveryCheck() {
  const base = git('rev-parse', 'origin/main')
  const paths = git('ls-tree', '-r', '--name-only', base).split('\n')
  const published = await loadPublishedIndex({ paths,
    read: async (ref) => execFileSync('git', ['show', `${base}:${ref}`], { cwd: root, maxBuffer: 4_000_000 }) })
  const client = await sourceClient()
  try {
    const { report } = await readDiscoverySnapshot(client, published)
    return { ...report, main_head: base, operating_mode: (await readJSON('archive/automation/config.json')).mode,
      activation: 'NOT_RUN' }
  } finally { await client.end() }
}

/** Unscheduled opt-in V2 adapter. Deployment/activation still requires separate approval. */
export async function discoveryApply() {
  insist(git('status', '--porcelain') === '', 'DIRTY_WORKTREE_HUMAN_REVIEW_REQUIRED')
  git('fetch', 'origin', 'main')
  const base = git('rev-parse', 'origin/main')
  insist(git('rev-parse', 'HEAD') === base, 'STALE_BASE_HUMAN_REVIEW_REQUIRED')
  const published = await loadPublishedIndex({ paths: git('ls-tree', '-r', '--name-only', base).split('\n'),
    read: async (ref) => execFileSync('git', ['show', `${base}:${ref}`], { cwd: root, maxBuffer: 4_000_000 }) })
  const readSnapshot = async () => {
    const client = await sourceClient()
    try { return await readDiscoverySnapshot(client, published) } finally { await client.end() }
  }
  const { live, report } = await readSnapshot()
  if (!live || live.discovery.status !== 'NEW_SOURCE_RANGE') return report
  const mode = (await readJSON('archive/automation/config.json')).mode
  insist(['SHADOW', 'AUTO'].includes(mode), 'INVALID_ARCHIVE_MODE')
  const revalidate = async () => {
    git('fetch', 'origin', 'main')
    assertMainBase(base, 'BASE_MOVED_HUMAN_REVIEW_REQUIRED')
    const current = await readSnapshot()
    verifyDiscoveryCandidate(live, current.live)
  }
  insist(process.env.GH_TOKEN, 'BLOCKER_GITHUB_TOKEN_SETUP_REQUIRED')
  const existing = priorProposal(live.discovery, live.session.id)
  const candidate = await compileCandidate(candidateState(live.session, published), live, { discoveryV2: true })
  gates()
  await revalidate()
  if (existing) await verifyExistingProposal(existing, candidate, base)
  const result = existing ?? proposal({ discovery: live.discovery, candidate, base, mode })
  const publication = mode === 'AUTO' ? await autoPublish(result, candidate, base, revalidate)
    : { status: 'SHADOW_PROPOSAL' }
  return { ...report, ...result, ...publication }
}

/** Offline DTO only. Builds in a disposable copy; never opens a DB or calls gh. */
export async function candidateCheck(fixture) {
  const input = JSON.parse(await readFile(resolve(fixture), 'utf8'))
  insist(input.synthetic === true, 'SYNTHETIC_FIXTURE_REQUIRED')
  const { session, rows, links = [], nextOrder = 0 } = input
  const { validateIntent } = await import('./lib/archive-source-discovery.mjs')
  const intent = validateIntent(session.archive_intent, session)
  insist(intent.disposition === 'ADOPTED' && intent.publication === 'APPROVED', 'UNAPPROVED_CANDIDATE')
  const discovery = discoverCompletePairs(session, rows, nextOrder)
  insist(discovery.status === 'NEW_SOURCE_RANGE', 'NO_CANDIDATE_RANGE')
  const workspace = await mkdtemp(join(tmpdir(), 'archive-discovery-candidate-'))
  try {
    const baseline = git('rev-parse', 'HEAD')
    const paths = git('ls-tree', '-r', '--name-only', baseline).split('\n')
    // Gates also run with an uncommitted content candidate present. Never treat it
    // as baseline or copy its unpublished bodies into a synthetic test.
    for (const ref of paths.filter((p) => p.startsWith('archive/content/') || p === 'knowledge/automation/state.json')) {
      const target = resolve(workspace, ref)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, execFileSync('git', ['-c', 'core.longpaths=true', 'show', `${baseline}:${ref}`], { cwd: root, maxBuffer: 4_000_000 }))
    }
    const published = await loadPublishedIndex({ paths,
      read: async (ref) => execFileSync('git', ['show', `HEAD:${ref}`], { cwd: root, maxBuffer: 4_000_000 }) })
    const protectedFiles = paths.filter((ref) => ref.startsWith('archive/content/')
      && ![bookRef, graphRef, visualRef, `archive/content/transcripts/C03-AFTERFALL/${session.season_id}/MANIFEST.json`].includes(ref))
    const before = new Map(await Promise.all(protectedFiles.map(async (ref) => [ref, sha(await readFile(resolve(workspace, ref)))])))
    const candidate = await compileCandidate(candidateState(session, published), { session, discovery, links }, { workspace, discoveryV2: true })
    for (const [ref, hash] of before) insist(sha(await readFile(resolve(workspace, ref))) === hash, 'EXISTING_PUBLIC_FILE_CHANGED')
    return { status: 'ISOLATED_CANDIDATE_PASS', preserved_public_files: before.size, season_id: session.season_id, session_id: candidate.source.entry.session_id,
      source_session_uuid: session.id, publication_segment_id: candidate.source.segmentId,
      pairs: discovery.pairs, reader_chapters_added: candidate.additions.length, graph: candidate.graphReport.status,
      database_writes: 0, remote_writes: 0 }
  } finally { await rm(workspace, { recursive: true, force: true }) }
}

export async function runDaily(args) {
  if (args[0] === '--discovery-apply' && args.length === 1) return discoveryApply()
  if (args[0] === '--discovery-check' && args.length === 1) return discoveryCheck()
  if (args[0] === '--candidate-check' && args.length === 2) return candidateCheck(args[1])
  insist(args.length === 1 && ['--check', '--apply'].includes(args[0]), 'USAGE_CHECK_OR_APPLY')
  const mode = (await readJSON('archive/automation/config.json')).mode
  insist(['SHADOW', 'AUTO'].includes(mode), 'INVALID_ARCHIVE_MODE')
  const base = git('rev-parse', 'HEAD')
  const state = await publishedState()
  const live = await liveSource(state.nextOrder)
  const summary = { status: live.discovery.status, mode, last_published_order: state.nextOrder - 1,
    live_last_message_order: live.session.last_message_order,
    discovered_range: live.discovery.status === 'NEW_SOURCE_RANGE'
      ? [live.discovery.startOrder, live.discovery.endOrder] : null,
    pairs: live.discovery.pairs ?? 0, database_writes: 0 }
  if (args[0] === '--check' || live.discovery.status === 'NO_NEW_SOURCE') return summary
  insist(process.env.GH_TOKEN, 'BLOCKER_GITHUB_TOKEN_SETUP_REQUIRED')
  insist(git('status', '--porcelain') === '', 'DIRTY_WORKTREE_HUMAN_REVIEW_REQUIRED')
  insist(base === git('rev-parse', 'origin/main'), 'STALE_BASE_HUMAN_REVIEW_REQUIRED')
  const existing = priorProposal(live.discovery)
  if (existing && mode === 'SHADOW') return { ...summary, ...existing }
  const candidate = await compileCandidate(state, live)
  gates()
  if (existing) await verifyExistingProposal(existing, candidate, base)
  const result = existing ?? proposal({ discovery: live.discovery, candidate, base, mode })
  const publication = mode === 'AUTO' ? await autoPublish(result, candidate, base)
    : { status: 'SHADOW_PROPOSAL', would_auto_publish: true }
  return { ...summary, ...result, ...publication,
    raw_segment_sha256: sha(candidate.source.part), reader_chapters_added: candidate.additions.length,
    graph_facts_added: candidate.graphReport.nodes_added + candidate.graphReport.relations_added,
    visual_points: candidate.catalog.points.length,
    auto_mode_enabled: mode === 'AUTO' }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await runDaily(process.argv.slice(2))) + '\n') }
  catch (error) {
    const code = /^[A-Z][A-Z0-9_]{3,100}$/.test(error.message) ? error.message : 'ARCHIVE_DAILY_FAILED'
    process.stderr.write(JSON.stringify({ status: code,
      ...(code === 'AUTO_PUBLISH_INCOMPLETE' ? { human_review_required: true } : {}),
      database_writes: 0 }) + '\n')
    process.exitCode = 1
  }
}
