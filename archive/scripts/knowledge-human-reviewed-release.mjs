// Existing exact-revision C consumer; no timer, upload bypass or second hook.
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { trigger, publishedDeploy, assertReviewedContentScope } from './scheduled-netlify-release.mjs'
import { postSupabaseRpc } from './lib/knowledge-semantic-jobs.mjs'
const REPO = 'cetin072/survival-interactive-series'
const SITE = '4b344369-f418-48ba-81b8-991be8974486'
const ORIGIN = 'https://survival-diary-archive.netlify.app'
const SHA = /^[a-f0-9]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BRIEF = /^K-\d{3,}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const GOOD = (v, pattern) => typeof v === 'string' && pattern.test(v)
export function reviewedPayload({ itemId, briefId, mergeSha, prNumber, runId, now }) {
  if (!GOOD(itemId, UUID) || !GOOD(briefId, BRIEF) || !GOOD(mergeSha, SHA)
    || !Number.isSafeInteger(Number(prNumber)) || Number(prNumber) < 1
    || !/^\d+$/.test(String(runId)) || !Number.isFinite(Date.parse(now))) throw Error('HUMAN_APPROVED_RELEASE_INPUT_INVALID')
  return { version: 2, mode: 'HUMAN_APPROVED_KNOWLEDGE', repository: REPO, site_id: SITE,
    source_main_sha: mergeSha, merge_sha: mergeSha, review_item_id: itemId, brief_id: briefId,
    pr_number: Number(prNumber), run_id: String(runId), issued_at: new Date(now).toISOString() }
}
const githubHeaders = token => ({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'survival-human-reviewed-publication' })
export async function ensureReviewedMain({ payload, preparedSha, githubToken, fetcher = fetch }) {
  if (!GOOD(preparedSha, SHA) || !githubToken || githubToken.length < 20) throw Error('HUMAN_APPROVED_RELEASE_AUTH_REQUIRED')
  const [refResponse, prResponse] = await Promise.all([
    fetcher('https://api.github.com/repos/' + REPO + '/git/ref/heads/main', { headers: githubHeaders(githubToken) }),
    fetcher('https://api.github.com/repos/' + REPO + '/pulls/' + payload.pr_number, { headers: githubHeaders(githubToken) }),
  ])
  if (!refResponse.ok || !prResponse.ok) throw Error('HUMAN_APPROVED_RELEASE_GITHUB_UNAVAILABLE')
  const [ref, pr] = await Promise.all([refResponse.json(), prResponse.json()])
  if (ref.object?.sha !== payload.merge_sha || pr.state !== 'closed' || !pr.merged_at
    || pr.merge_commit_sha !== payload.merge_sha || pr.head?.sha !== preparedSha || pr.base?.ref !== 'main'
    || pr.head?.repo?.full_name !== REPO || !pr.body?.includes('<!-- knowledge-worker-phase-v1:PUBLICATION_HANDOFF -->')) {
    throw Error('HUMAN_APPROVED_RELEASE_GITHUB_PROOF_INVALID')
  }
  const briefResponse = await fetcher('https://raw.githubusercontent.com/' + REPO + '/' + payload.merge_sha
    + '/knowledge/content/briefs/' + payload.brief_id + '.json')
  if (!briefResponse.ok) throw Error('HUMAN_APPROVED_RELEASE_BRIEF_MISSING')
  const brief = await briefResponse.json()
  if (brief.id !== payload.brief_id || brief.status !== 'PUBLISHED'
    || brief.publication_policy !== 'HUMAN_APPROVED' || !GOOD(brief.slug, SLUG)) throw Error('HUMAN_APPROVED_RELEASE_BRIEF_NOT_PUBLISHED')
  return brief
}
export async function ensureApproval({ env, payload, fetcher = fetch }) {
  if(env.EDITORIAL_REQUEST_ID) {
    if(env.EDITORIAL_REQUEST_ID!==payload.review_item_id)throw Error('HUMAN_APPROVED_DB_PROOF_INVALID')
    const request=await postSupabaseRpc({projectUrl:env.ARCHIVE_SUPABASE_URL,serviceRoleKey:env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
      name:'archive_worker_knowledge_editor_request',args:{p_request_id:env.EDITORIAL_REQUEST_ID,p_action:'GET'},fetchImpl:fetcher})
    if(request.status!=='PUBLISHING'||request.publish_requested!==true||!request.approved_by
      ||request.result?.brief_id!==payload.brief_id||request.result?.pr_number!==payload.pr_number
      ||request.result?.prepared_sha!==env.PREPARED_SHA||request.result?.merge_sha!==payload.merge_sha
      ||request.snapshot?.brief?.id!==payload.brief_id)throw Error('HUMAN_APPROVED_DB_PROOF_INVALID')
    return request.snapshot.brief
  }
  const data = await postSupabaseRpc({ projectUrl: env.ARCHIVE_SUPABASE_URL, serviceRoleKey: env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
    name: 'archive_knowledge_review_package', args: { p_item_id: payload.review_item_id, p_decided_at: env.DECIDED_AT }, fetchImpl: fetcher })
  if (data.status !== 'C3' || data.review?.id !== payload.review_item_id || data.review.status !== 'APPROVED'
    || Date.parse(data.review.decided_at) !== Date.parse(env.DECIDED_AT)
    || data.review.payload?.brief_id !== payload.brief_id || data.job?.final_pr_number !== payload.pr_number
    || !data.prepared_heads?.includes(env.PREPARED_SHA)
    || data.review.payload?.operator_draft_revision == null
) throw Error('HUMAN_APPROVED_DB_PROOF_INVALID')
  const draft = await postSupabaseRpc({ projectUrl: env.ARCHIVE_SUPABASE_URL, serviceRoleKey: env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,
    name: 'archive_worker_knowledge_operator_draft', args: { p_job_id: data.job.job_id,
      p_revision: data.review.payload.operator_draft_revision, p_draft_sha256: data.review.payload.operator_draft_sha256 }, fetchImpl: fetcher })
  if (draft.job_id !== data.job.job_id || draft.brief_id !== payload.brief_id
    || draft.revision !== data.review.payload.operator_draft_revision
    || draft.draft_sha256 !== data.review.payload.operator_draft_sha256) throw Error('HUMAN_APPROVED_DB_PROOF_INVALID')
  return draft.brief
}
const normalize = text => String(text).replaceAll('&#x27;', '&#39;').replace(/\s+/g, ' ').trim()
const esc = text => String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
export async function verifyPublicArticle({ payload, brief, fetcher = fetch }) {
  const path = '/knowledge/' + brief.slug + '/'
  const read = async route => {
    const response = await fetcher(ORIGIN + route, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw Error('HUMAN_APPROVED_ARTICLE_NOT_VISIBLE')
    return response.text()
  }
  const [page, index, sitemap, metaText] = await Promise.all([read(path), read('/knowledge/'), read('/sitemap.xml'), read('/deploy-meta.json')])
  const meta = JSON.parse(metaText)
  const expected = [brief.title, brief.lead, ...(brief.sections || []).flatMap(section =>
    [section.heading, ...(section.blocks || []).flatMap(block => [block.text, ...(block.items || []), ...(block.headers || []), ...(block.rows || []).flat()])])].filter(text => typeof text === 'string' && text.trim())
  if (meta.commit_ref !== payload.merge_sha || meta.context !== 'production'
    || !expected.every(text => normalize(page).includes(normalize(esc(text))))
    || !index.includes(path) || !sitemap.includes(ORIGIN + path)) throw Error('HUMAN_APPROVED_PUBLIC_CONTENT_MISMATCH')
  return path
}
export async function releaseReviewed({ env = process.env, fetcher = fetch, runTrigger = trigger, now = new Date().toISOString() } = {}) {
  if (env.GITHUB_REPOSITORY !== REPO) throw Error('HUMAN_APPROVED_RELEASE_REPOSITORY_INVALID')
  const payload = reviewedPayload({ itemId: env.REVIEW_ITEM_ID, briefId: env.BRIEF_ID, mergeSha: env.MERGE_SHA,
    prNumber: env.PR_NUMBER, runId: env.GITHUB_RUN_ID, now })
  const approved = await ensureApproval({ env, payload, fetcher })
  const brief = await ensureReviewedMain({ payload, preparedSha: env.PREPARED_SHA, githubToken: env.GH_TOKEN, fetcher })
  if (brief.title !== approved.title || brief.lead !== approved.lead || JSON.stringify(brief.sections) !== JSON.stringify(approved.sections)) throw Error('HUMAN_APPROVED_DRAFT_CONTENT_CHANGED')
  const siteResponse = await fetcher('https://api.netlify.com/api/v1/sites/' + SITE, { cache: 'no-store' })
  if (!siteResponse.ok) throw Error('PUBLIC_PRODUCTION_UNAVAILABLE')
  const published = publishedDeploy(await siteResponse.json(), SITE)
  if (published.commit_ref !== payload.merge_sha) {
    await assertReviewedContentScope({ repository: REPO }, payload, published.commit_ref, fetcher)
    const result = await runTrigger({ site_id: SITE }, payload, env.NETLIFY_PRODUCTION_BUILD_HOOK, { fetcher })
    if (result?.status !== 'PUBLISHED' || result.source_main_sha !== payload.merge_sha) throw Error('HUMAN_APPROVED_RELEASE_NOT_CONFIRMED')
  }
  // Already-live recovery observes the exact snapshot instead of POSTing again.
  const path = await verifyPublicArticle({ payload, brief, fetcher })
  return { status: 'LIVE_VERIFIED', brief_id: payload.brief_id, merge_sha: payload.merge_sha,
    path, public_url: ORIGIN + path, verified_at: new Date().toISOString() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await releaseReviewed()
    console.log(JSON.stringify(result))
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      'status=' + result.status + '\npublic_url=' + result.public_url + '\nverified_at=' + result.verified_at + '\n')
  } catch (error) {
    console.error(/^[A-Z][A-Z0-9_]{3,100}$/.test(error?.message ?? '') ? error.message : 'HUMAN_APPROVED_IMMEDIATE_RELEASE_FAILED')
    process.exitCode = 1
  }
}
