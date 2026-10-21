import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewedPayload, ensureReviewedMain, releaseReviewed } from '../knowledge-human-reviewed-release.mjs'

const repo = 'cetin072/survival-interactive-series'
const main = 'a'.repeat(40)
const prepared = 'b'.repeat(40)
const itemId = '263d256d-2cf8-45cf-82fb-98aab2e52d12'
const issued = '2026-10-21T11:10:00Z'
const payload = reviewedPayload({ itemId, briefId: 'K-015', mergeSha: main, prNumber: 425, runId: '1234', now: issued })
const brief = { id: 'K-015', title: '긴급 복구 요청의 우선순위는 어떻게 정할까',
  slug: 'emergency-restoration-priorities', status: 'PUBLISHED', publication_policy: 'HUMAN_APPROVED' }
const pr = { state: 'closed', merged_at: issued, merge_commit_sha: main, base: { ref: 'main' },
  head: { sha: prepared, repo: { full_name: repo } },
  body: '<!-- knowledge-worker-phase-v1:PUBLICATION_HANDOFF -->' }

function github(url, patch = {}) {
  if (url.includes('/pulls/')) return { ok: true, json: async () => ({ ...pr, ...patch }) }
  if (url.includes('/git/ref/heads/main')) return { ok: true, json: async () => ({ object: { sha: main } }) }
  if (url.includes('/knowledge/content/briefs/')) return { ok: true, json: async () => ({ ...brief, ...patch }) }
  return { ok: false }
}
const env = {
  GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: '1234',
  BRIEF_ID: 'K-015', REVIEW_ITEM_ID: itemId, PR_NUMBER: '425',
  PREPARED_SHA: prepared, MERGE_SHA: main,
  GH_TOKEN: 'a'.repeat(40),
  NETLIFY_PRODUCTION_BUILD_HOOK: 'https://api.netlify.com/build_hooks/' + 'c'.repeat(24),
}

test('manual reviewed payload binds one exact approval, PR and main commit', () => {
  assert.equal(payload.version, 2)
  assert.equal(payload.mode, 'HUMAN_APPROVED_KNOWLEDGE')
  assert.equal(payload.source_main_sha, main)
  assert.equal(payload.review_item_id, itemId)
  for (const patch of [{ itemId: '../bad' }, { briefId: '../bad' }, { mergeSha: 'x' }, { prNumber: -1 }]) {
    assert.throws(() => reviewedPayload({ itemId, briefId: 'K-015', mergeSha: main, prNumber: 425, runId: '1234', now: issued, ...patch }))
  }
})

test('requires merged approved PR exact head + public PUBLISHED human-approved brief', async () => {
  assert.deepEqual(await ensureReviewedMain({ payload, preparedSha: prepared, githubToken: env.GH_TOKEN, fetcher: github }),
    { slug: brief.slug, title: brief.title })
  await assert.rejects(ensureReviewedMain({ payload, preparedSha: prepared, githubToken: env.GH_TOKEN,
    fetcher: (url) => github(url, { state: 'open' }) }), /HUMAN_APPROVED_RELEASE_GITHUB_PROOF_INVALID/)
  await assert.rejects(ensureReviewedMain({ payload, preparedSha: prepared, githubToken: env.GH_TOKEN,
    fetcher: (url) => github(url, { status: 'READY' }) }), /HUMAN_APPROVED_RELEASE_BRIEF_NOT_PUBLISHED/)
})

test('single on-demand build and public article verification, no scheduled wait', async () => {
  let posts = 0, saw = ''
  const result = await releaseReviewed({ env, now: issued,
    fetcher: async (url, options) => {
      if (url.startsWith('https://survival-diary-archive.netlify.app/knowledge/')) {
        saw = url
        return { ok: true, text: async () => '<article>' + brief.title + '</article>' }
      }
      return github(url, {})
    },
    runTrigger: async (config, releasePayload, url) => {
      posts++
      assert.equal(config.site_id, payload.site_id)
      assert.equal(releasePayload.merge_sha, main)
      assert.equal(url, env.NETLIFY_PRODUCTION_BUILD_HOOK)
      return { status: 'PUBLISHED', source_main_sha: main }
    },
  })
  assert.equal(posts, 1)
  assert.match(saw, /emergency-restoration-priorities/)
  assert.equal(result.status, 'LIVE_VERIFIED')
})

test('reject failed publication and never report site live on a misleading receipt', async () => {
  await assert.rejects(releaseReviewed({ env, now: issued, fetcher: github,
    runTrigger: async () => ({ status: 'PUBLISHED', source_main_sha: 'f'.repeat(40) }),
  }), /HUMAN_APPROVED_RELEASE_NOT_CONFIRMED/)
})
