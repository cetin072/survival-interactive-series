/** One daily AFTERFALL source cycle. The only database capability is a restricted SELECT login. */
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DAILY_SOURCE_SESSION, discoverCompletePairs, materializeSegment, publishedWatermark } from './lib/archive-daily-core.mjs'
import { checkAppendOnlyEdition } from './lib/reader-auto.mjs'
import { createBatch, fingerprint } from './lib/publication-plan.mjs'
import { byteHash, graphBytes, reconcileReaderOnlyGraph } from './lib/publication-graph.mjs'
import { compileVisualCatalog, validateVisualCatalog, visualByteHash, visualBytes } from './lib/visual-compiler.mjs'
import { publicKnowledgeInventory, scanKnowledge } from './lib/knowledge-scan.mjs'

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
    const role = (await client.query(`select current_user::text as role_name, session_user::text as session_role,
      current_setting('transaction_read_only')::text as read_only, r.rolsuper, r.rolbypassrls,
      r.rolcreaterole, r.rolcreatedb, r.rolreplication,
      has_table_privilege(current_user,'survival_rpg.transcript_messages','SELECT') as can_read_messages,
      has_table_privilege(current_user,'survival_rpg.transcript_sessions','SELECT') as can_read_sessions,
      has_table_privilege(current_user,'survival_rpg.transcript_turn_state_links','SELECT') as can_read_links,
      has_table_privilege(current_user,'survival_rpg.transcript_messages','INSERT,UPDATE,DELETE') as can_write_messages,
      has_table_privilege(current_user,'survival_rpg.transcript_sessions','INSERT,UPDATE,DELETE') as can_write_sessions,
      has_table_privilege(current_user,'survival_rpg.transcript_turn_state_links','INSERT,UPDATE,DELETE') as can_write_links,
      (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='survival_rpg' and c.relkind in ('r','p','v','m')
          and c.relname not in ('transcript_messages','transcript_sessions','transcript_turn_state_links')
          and has_table_privilege(current_user,c.oid,'SELECT')) as other_source_selects
      from pg_roles r where r.rolname=current_user`)).rows[0]
    insist(role?.role_name === 'archive_exporter' && role.session_role === 'archive_exporter'
      && role.read_only === 'on' && role.rolsuper === false && role.rolbypassrls === false
      && role.rolcreaterole === false && role.rolcreatedb === false && role.rolreplication === false
      && role.can_read_messages === true && role.can_read_sessions === true && role.can_read_links === true
      && role.can_write_messages === false && role.can_write_sessions === false
      && role.can_write_links === false && role.other_source_selects === 0,
    'RESTRICTED_EXPORT_ROLE_REQUIRED')
    const session = (await client.query(`select id::text,worldline_id,chronicle_id,season_id,status,last_message_order
      from survival_rpg.transcript_sessions where id=$1::uuid`, [DAILY_SOURCE_SESSION])).rows[0]
    insist(session, 'SOURCE_SESSION_MISSING')
    const rows = (await client.query(`select id::text,session_id::text,worldline_id,chronicle_id,season_id,
      turn_no,message_order,role,content,content_sha256,save_version,public_safe,source_type,game_time,recorded_at
      from survival_rpg.transcript_messages where session_id=$1::uuid and message_order >= $2::integer
      order by message_order limit 201`, [DAILY_SOURCE_SESSION, nextOrder])).rows
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

async function compileCandidate(state, live) {
  const { session, discovery, links } = live
  const source = materializeSegment({ session, discovery, sessionId: state.nextSessionId,
    links, sealedAt: discovery.rows.at(-1).recorded_at.toISOString() })
  const prefix = `${seasonRoot}/${state.nextSessionId}`
  insist(!state.manifest.sessions.some((item) => item.session_id === state.nextSessionId), 'SEGMENT_ID_COLLISION')
  await mkdir(absolute(prefix), { recursive: false })
  await writeFile(absolute(`${prefix}/PART_001.md`), source.part, { flag: 'wx' })
  await writeFile(absolute(`${prefix}/SOURCE_MANIFEST.json`), bytes(source.source), { flag: 'wx' })
  const nextManifest = { ...state.manifest, sessions: [...state.manifest.sessions, source.entry],
    source_policy: 'Only listed immutable verified segments are published. Each SOURCE_MANIFEST is sealed.' }
  await writeFile(absolute(`${seasonRoot}/MANIFEST.json`), bytes(nextManifest))
  const priorBook = await readJSON(bookRef)
  const { makeBooks } = await import('./build-reader-edition.mjs')
  const [book] = await makeBooks({ catalogs: { 'C03-AFTERFALL': (await import('./reader-source-catalog.mjs')).rawCatalog['C03-AFTERFALL'] } })
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
  if (Number.isSafeInteger(last.save_version) && last.save_version > priorGraph.anchor.save_version) {
    const snapshot = { version: 'publication-snapshot-v1', chronicle_id: 'C03-AFTERFALL',
    worldline_id: 'AFTERFALL', season_id: 'S03', visibility: 'PUBLIC_ARCHIVE',
    source_revision: git('rev-parse', 'HEAD'), source_save_version: last.save_version,
    source_game_time: last.game_time,
    source_checkpoint: 'worldlines/AFTERFALL/seasons/S03/CURRENT_CHECKPOINT_2027-04-08.md',
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

  const inventory = await publicKnowledgeInventory(root)
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
  run('node', ['--test', 'archive/scripts/lib/archive-daily-core.test.mjs'])
  run('node', ['--test', 'archive/scripts/lib/reader-batch.test.mjs',
    'archive/scripts/lib/publication-graph.test.mjs', 'archive/scripts/lib/visual-compiler.test.mjs'])
  run('npm', ['ci'], absolute('archive/web'))
  run('npm', ['test', '--', '--run'], absolute('archive/web'))
  run('npm', ['run', 'reader:check'], absolute('archive/web'))
  run('npm', ['run', 'build'], absolute('archive/web'))
}

function proposal({ discovery, candidate, base }) {
  insist(git('rev-parse', 'origin/main') === base, 'STALE_BASE_HUMAN_REVIEW_REQUIRED')
  const digest = candidate.source.segmentId.slice(8, 20)
  const branch = `codex/archive-daily-${discovery.startOrder}-${discovery.endOrder}-${digest}`
  const changed = git('status', '--short').split('\n').filter(Boolean)
  insist(changed.every((line) => [candidate.prefix, `${seasonRoot}/MANIFEST.json`, bookRef,
    graphRef, visualRef].some((ref) => line.slice(3).startsWith(ref))), 'OWNERSHIP_VIOLATION')
  git('switch', '-c', branch)
  git('add', `${seasonRoot}/MANIFEST.json`, candidate.prefix, bookRef, graphRef, visualRef)
  git('-c', 'user.name=archive-daily', '-c', 'user.email=archive-daily@users.noreply.github.com',
    'commit', '-m', `archive: publish S03 source orders ${discovery.startOrder}-${discovery.endOrder}`)
  const commit = git('rev-parse', 'HEAD')
  git('push', 'origin', `HEAD:refs/heads/${branch}`)
  const existing = JSON.parse(gh('pr', 'list', '--repo', 'cetin072/survival-interactive-series',
    '--head', branch, '--state', 'open', '--json', 'number,url'))
  const body = `Source session: ${DAILY_SOURCE_SESSION}\nSource orders: ${discovery.startOrder}-${discovery.endOrder}\nPairs: ${discovery.pairs}\nRAW segments: 1\nReader chapters added: ${candidate.additions.length}\nGraph facts added: ${candidate.graphReport.nodes_added}; Reader links: ${candidate.graphReport.story_links}\nVisual points: ${candidate.catalog.points.length}\nReplay: same published range is NOOP after merge\nMode: SHADOW until acceptance; Production auto merge disabled.\n`
  let pr = existing[0]
  if (!pr) {
    const bodyFile = join(tmpdir(), `archive-daily-pr-${randomUUID()}.md`)
    writeFileSync(bodyFile, body, { flag: 'wx' })
    try { pr = { url: gh('pr', 'create', '--repo', 'cetin072/survival-interactive-series',
      '--base', 'main', '--head', branch, '--title', `Archive daily S03 ${discovery.startOrder}-${discovery.endOrder}`,
      '--body-file', bodyFile) } }
    finally { unlinkSync(bodyFile) }
  }
  return { branch, commit, pr: pr.url }
}

function priorProposal(discovery) {
  const segment = `segment-${sha(JSON.stringify({ sourceId: DAILY_SOURCE_SESSION,
    start: discovery.startOrder, end: discovery.endOrder,
    hashes: discovery.rows.map((row) => row.content_sha256) }))}`
  const branch = `codex/archive-daily-${discovery.startOrder}-${discovery.endOrder}-${segment.slice(8, 20)}`
  const open = JSON.parse(gh('pr', 'list', '--repo', 'cetin072/survival-interactive-series',
    '--head', branch, '--state', 'open', '--json', 'number,url,headRefOid'))
  if (open.length) return { branch, pr: open[0].url, commit: open[0].headRefOid, status: 'EXISTING_PROPOSAL_NOOP' }
  insist(!git('ls-remote', '--heads', 'origin', branch), 'ORPHAN_BRANCH_HUMAN_REVIEW_REQUIRED')
  return null
}

function previewGate(pr, expectedHead, expectedBase) {
  execFileSync('gh', ['pr', 'checks', pr, '--repo', 'cetin072/survival-interactive-series', '--watch'],
    { cwd: root, stdio: 'ignore', timeout: 1_200_000 })
  const info = JSON.parse(gh('pr', 'view', pr, '--repo', 'cetin072/survival-interactive-series',
    '--json', 'headRefOid,baseRefOid,mergeStateStatus,statusCheckRollup'))
  insist(info.headRefOid === expectedHead && info.baseRefOid === expectedBase
    && info.mergeStateStatus === 'CLEAN', 'STALE_OR_UNMERGEABLE_PR')
  const checks = info.statusCheckRollup ?? []
  for (const name of ['appearance', 'browser', 'build', 'validate']) {
    insist(checks.some((item) => item.__typename === 'CheckRun' && item.name === name
      && item.status === 'COMPLETED' && item.conclusion === 'SUCCESS'),
    'REQUIRED_CI_NOT_GREEN')
  }
  insist(checks.every((item) => item.__typename === 'StatusContext'
    ? item.state === 'SUCCESS'
    : ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(item.conclusion)), 'PR_CHECK_FAILED')
  const preview = checks.find((item) => item.__typename === 'StatusContext'
    && item.context === 'netlify/survival-diary-archive/deploy-preview')
  insist(preview?.state === 'SUCCESS' && /^https:\/\/deploy-preview-\d+--survival-diary-archive\.netlify\.app\/?$/.test(preview.targetUrl),
    'PREVIEW_NOT_READY')
  return preview.targetUrl
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

async function autoPublish(result, candidate, base) {
  const preview = previewGate(result.pr, result.commit, base)
  await verifySite(preview, candidate.additions[0].id, `${candidate.source.entry.session_id}/PART_001.md`)
  insist(git('rev-parse', 'origin/main') === base, 'BASE_MOVED_HUMAN_REVIEW_REQUIRED')
  gh('pr', 'merge', result.pr, '--repo', 'cetin072/survival-interactive-series',
    '--squash', '--match-head-commit', result.commit)
  const merged = JSON.parse(gh('pr', 'view', result.pr, '--repo', 'cetin072/survival-interactive-series',
    '--json', 'state,mergeCommit'))
  insist(merged.state === 'MERGED' && /^[a-f0-9]{40}$/.test(merged.mergeCommit?.oid),
    'MERGE_NOT_CONFIRMED')
  const production = 'https://survival-diary-archive.netlify.app/'
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await verifySite(production, candidate.additions[0].id, `${candidate.source.entry.session_id}/PART_001.md`)
      return { status: 'PRODUCTION_VERIFIED', merge_sha: merged.mergeCommit.oid, production }
    } catch (error) {
      if (attempt === 29) throw new Error('PRODUCTION_VERIFICATION_REQUIRED')
      await new Promise((resolve) => setTimeout(resolve, 20000))
    }
  }
}

export async function runDaily(args) {
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
  if (existing) return { ...summary, ...existing }
  const candidate = await compileCandidate(state, live)
  gates()
  const result = proposal({ discovery: live.discovery, candidate, base })
  const publication = mode === 'AUTO' ? await autoPublish(result, candidate, base)
    : { status: 'SHADOW_PROPOSAL', would_auto_publish: true }
  return { ...summary, ...publication, ...result,
    raw_segment_sha256: sha(candidate.source.part), reader_chapters_added: candidate.additions.length,
    graph_facts_added: 0, visual_points: candidate.catalog.points.length,
    auto_mode_enabled: mode === 'AUTO' }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.stdout.write(JSON.stringify(await runDaily(process.argv.slice(2))) + '\n') }
  catch (error) {
    const code = /^[A-Z][A-Z0-9_]{3,100}$/.test(error.message) ? error.message : 'ARCHIVE_DAILY_FAILED'
    process.stderr.write(JSON.stringify({ status: code, database_writes: 0 }) + '\n')
    process.exitCode = 1
  }
}
