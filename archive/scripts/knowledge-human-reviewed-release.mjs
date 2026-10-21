// The existing C approval consumer is the only caller. It has already verified
// the exact edited revision, evidence, PR checks and GitHub merge before this
// separate on-demand publication path starts. No new timer or shared secret.
import { pathToFileURL } from 'node:url'
import { trigger } from './scheduled-netlify-release.mjs'

const REPO = 'cetin072/survival-interactive-series'
const SITE = '4b344369-f418-48ba-81b8-991be8974486'
const SHA = /^[a-f0-9]{40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BRIEF = /^K-\d{3,}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const GOOD = (v, pattern) => typeof v === 'string' && pattern.test(v)

export function reviewedPayload({ itemId, briefId, mergeSha, prNumber, runId, now }) {
  if (!GOOD(itemId, UUID) || !GOOD(briefId, BRIEF) || !GOOD(mergeSha, SHA)
    || !Number.isSafeInteger(Number(prNumber)) || Number(prNumber) < 1
    || !/^\d+$/.test(String(runId)) || !Number.isFinite(Date.parse(now))) {
    throw Error('HUMAN_APPROVED_RELEASE_INPUT_INVALID')
  }
  return {
    version: 2, mode: 'HUMAN_APPROVED_KNOWLEDGE',
    repository: REPO, site_id: SITE,
    source_main_sha: mergeSha, merge_sha: mergeSha,
    review_item_id: itemId, brief_id: briefId, pr_number: Number(prNumber),
    run_id: String(runId), issued_at: new Date(now).toISOString(),
  }
}

const githubHeaders = token => ({
  Authorization: 'Bearer ' + token,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'survival-human-reviewed-publication',
})

export async function ensureReviewedMain({ payload, preparedSha, githubToken, fetcher = fetch }) {
  if (!GOOD(preparedSha, SHA) || !githubToken || githubToken.length < 20) throw Error('HUMAN_APPROVED_RELEASE_AUTH_REQUIRED')
  const [refResponse, prResponse] = await Promise.all([
    fetcher('https://api.github.com/repos/' + REPO + '/git/ref/heads/main', { headers: githubHeaders(githubToken) }),
    fetcher('https://api.github.com/repos/' + REPO + '/pulls/' + payload.pr_number, { headers: githubHeaders(githubToken) }),
  ])
  if (!refResponse.ok || !prResponse.ok) throw Error('HUMAN_APPROVED_RELEASE_GITHUB_UNAVAILABLE')
  const [ref, pr] = await Promise.all([refResponse.json(), prResponse.json()])
  if (ref.object?.sha !== payload.merge_sha || pr.state !== 'closed' || !pr.merged_at
    || pr.merge_commit_sha !== payload.merge_sha || pr.head?.sha !== preparedSha
    || pr.base?.ref !== 'main' || pr.head?.repo?.full_name !== REPO
    || !pr.body?.includes('<!-- knowledge-worker-phase-v1:PUBLICATION_HANDOFF -->')) {
    throw Error('HUMAN_APPROVED_RELEASE_GITHUB_PROOF_INVALID')
  }
  const briefResponse = await fetcher(
    'https://raw.githubusercontent.com/' + REPO + '/' + payload.merge_sha + '/knowledge/content/briefs/' + payload.brief_id + '.json',
    { headers: { 'User-Agent': 'survival-human-reviewed-publication' } },
  )
  if (!briefResponse.ok) throw Error('HUMAN_APPROVED_RELEASE_BRIEF_MISSING')
  const brief = await briefResponse.json()
  if (brief.id !== payload.brief_id || brief.status !== 'PUBLISHED'
    || brief.publication_policy !== 'HUMAN_APPROVED' || !GOOD(brief.slug, SLUG)) {
    throw Error('HUMAN_APPROVED_RELEASE_BRIEF_NOT_PUBLISHED')
  }
  return { slug: brief.slug, title: brief.title }
}

export async function releaseReviewed({ env = process.env, fetcher = fetch, runTrigger = trigger, now = new Date().toISOString() } = {}) {
  if (env.GITHUB_REPOSITORY !== REPO) throw Error('HUMAN_APPROVED_RELEASE_REPOSITORY_INVALID')
  const payload = reviewedPayload({
    itemId: env.REVIEW_ITEM_ID, briefId: env.BRIEF_ID,
    mergeSha: env.MERGE_SHA, prNumber: env.PR_NUMBER,
    runId: env.GITHUB_RUN_ID, now,
  })
  const brief = await ensureReviewedMain({
    payload, preparedSha: env.PREPARED_SHA,
    githubToken: env.GH_TOKEN, fetcher,
  })
  // The existing Netlify Build Hook remains the only capability to promote
  // a Production snapshot. One signed-use URL, one POST, no ambiguous retry.
  const result = await runTrigger({ site_id: SITE }, payload, env.NETLIFY_PRODUCTION_BUILD_HOOK, { fetcher })
  if (result?.status !== 'PUBLISHED' || result.source_main_sha !== payload.merge_sha) {
    throw Error('HUMAN_APPROVED_RELEASE_NOT_CONFIRMED')
  }
  const page = await fetcher('https://survival-diary-archive.netlify.app/knowledge/' + brief.slug + '/', { cache: 'no-store' })
  if (!page.ok || !(await page.text()).includes(brief.title)) throw Error('HUMAN_APPROVED_ARTICLE_NOT_VISIBLE')
  return { status: 'LIVE_VERIFIED', brief_id: payload.brief_id, merge_sha: payload.merge_sha, path: '/knowledge/' + brief.slug + '/' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await releaseReviewed()
    console.log(JSON.stringify(result))
  } catch (error) {
    const code = /^[A-Z][A-Z0-9_]{3,100}$/.test(error?.message ?? '') ? error.message : 'HUMAN_APPROVED_IMMEDIATE_RELEASE_FAILED'
    console.error(code)
    process.exitCode = 1
  }
}
