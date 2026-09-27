import assert from 'node:assert/strict'
import test from 'node:test'
import { openOrReuseDraftTextPr } from './github-text-proposal-pr.mjs'

const remoteRef = `refs/heads/codex/archive-publication-${'a'.repeat(32)}`
const commit = 'b'.repeat(40)
const token = 'synthetic-test-token-never-used-remotely'
const branch = remoteRef.slice('refs/heads/'.length)
const row = (overrides = {}) => ({ number: 42, state: 'open', draft: true,
  merged_at: null, head: { ref: branch, sha: commit }, base: { ref: 'main' },
  html_url: 'https://github.com/cetin072/survival-interactive-series/pull/42',
  ...overrides })
const response = (data) => ({ ok: true, json: async () => data })

test('creates one Draft PR for verified proposal commit and reuses it', async () => {
  let created = null
  const fetchImpl = async (_url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${token}`)
    if (options.method === 'POST') {
      created = JSON.parse(options.body)
      return response(row())
    }
    return response(created ? [row()] : [])
  }
  const input = { remoteRef, commit, token, fetchImpl }
  assert.deepEqual(await openOrReuseDraftTextPr(input), {
    prNumber: 42, url: row().html_url, reused: false })
  assert.equal(created.draft, true)
  assert.equal(created.base, 'main')
  assert.equal(created.head, branch)
  assert.deepEqual(await openOrReuseDraftTextPr(input), {
    prNumber: 42, url: row().html_url, reused: true })
})

test('rejects moved, published, duplicate, or closed proposals without leaking token', async () => {
  for (const listed of [[row({ head: { ref: branch, sha: 'c'.repeat(40) } })],
    [row({ draft: false })], [row(), row()], [row({ state: 'closed' })]]) {
    await assert.rejects(openOrReuseDraftTextPr({ remoteRef, commit, token,
      fetchImpl: async () => response(listed) }), (error) => {
      assert.equal(error.message.includes(token), false)
      return true
    })
  }
})
