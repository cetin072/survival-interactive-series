import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchOrReuseTextProposalCi } from './github-text-proposal-ci.mjs'

const remoteRef = `refs/heads/codex/archive-publication-${'a'.repeat(32)}`
const branch = remoteRef.slice('refs/heads/'.length)
const commit = 'b'.repeat(40)
const token = 'synthetic-test-token-never-used-remotely'
const row = (extra = {}) => ({ id: 51, event: 'workflow_dispatch',
  head_branch: branch, head_sha: commit, ...extra })
const response = (value, status = 200) => ({ ok: true, status,
  json: async () => value })

test('dispatches CI once and reuses exact proposal run', async () => {
  let created = false
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${token}`)
    if (url.endsWith('/dispatches')) {
      const body = JSON.parse(options.body)
      assert.deepEqual(body, { ref: branch, inputs: { proposal_sha: commit } })
      created = true
      return response({ workflow_run_id: 51 })
    }
    if (url.endsWith('/actions/runs/51')) return response(row())
    return response({ workflow_runs: created ? [row()] : [] })
  }
  const input = { remoteRef, commit, token, fetchImpl }
  assert.deepEqual(await dispatchOrReuseTextProposalCi(input), {
    ciRunId: 51,
    ciUrl: 'https://github.com/cetin072/survival-interactive-series/actions/runs/51',
    reused: false })
  assert.equal((await dispatchOrReuseTextProposalCi(input)).reused, true)
})

test('rejects a run for a moved proposal without exposing token', async () => {
  const fetchImpl = async (url) => url.endsWith('/dispatches')
    ? response({ workflow_run_id: 51 })
    : url.endsWith('/actions/runs/51')
      ? response(row({ head_sha: 'c'.repeat(40) }))
      : response({ workflow_runs: [] })
  await assert.rejects(dispatchOrReuseTextProposalCi({ remoteRef,
    commit, token, fetchImpl }), (error) => {
    assert.match(error.message, /PUBLIC_CI_RUN_IDENTITY_INVALID/)
    assert.equal(error.message.includes(token), false)
    return true
  })
})

test('waits for GitHub 204 dispatch to expose the exact run before returning', async () => {
  let dispatched = false
  const fetchImpl = async (url) => {
    if (url.endsWith('/dispatches')) {
      dispatched = true
      return { ok: true, status: 204 }
    }
    assert.match(url, /\/actions\/workflows\/archive-web\.yml\/runs\?/)
    return response({ workflow_runs: dispatched ? [row()] : [] })
  }
  assert.deepEqual(await dispatchOrReuseTextProposalCi({ remoteRef,
    commit, token, fetchImpl }), {
    ciRunId: 51,
    ciUrl: 'https://github.com/cetin072/survival-interactive-series/actions/runs/51',
    reused: false,
  })
})
