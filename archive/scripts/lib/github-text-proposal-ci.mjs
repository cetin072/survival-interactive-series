/** Ensure one explicit Archive CI run for a GITHUB_TOKEN-created proposal.
 * The default-branch archive-web workflow must expose workflow_dispatch.
 * No check or publication is declared successful here: this only proves a
 * workflow run was created for the exact remote proposal commit.
 */
const api = 'https://api.github.com/repos/cetin072/survival-interactive-series'
const demand = (ok, code) => { if (!ok) throw new Error(code) }
const refPattern = /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/
const shaPattern = /^[a-f0-9]{40}$/
const positive = (value) => Number.isSafeInteger(value) && value > 0

function verifiedRun(row, branch, commit) {
  demand(row && positive(row.id) && row.event === 'workflow_dispatch'
    && row.head_branch === branch && row.head_sha === commit,
  'PUBLIC_CI_RUN_IDENTITY_INVALID')
  return { ciRunId: row.id, ciUrl: `https://github.com/cetin072/survival-interactive-series/actions/runs/${row.id}` }
}

export async function dispatchOrReuseTextProposalCi({ remoteRef, commit,
  token, fetchImpl = globalThis.fetch } = {}) {
  demand(refPattern.test(remoteRef) && shaPattern.test(commit)
    && typeof token === 'string' && token.length >= 20
    && typeof fetchImpl === 'function', 'PUBLIC_CI_CONFIGURATION_INVALID')
  const branch = remoteRef.slice('refs/heads/'.length)
  const headers = { Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10' }
  const query = new URLSearchParams({ branch, event: 'workflow_dispatch', per_page: '100' })
  const listed = await fetchImpl(`${api}/actions/workflows/archive-web.yml/runs?${query}`, {
    headers, signal: AbortSignal.timeout(10_000),
  })
  demand(listed.ok, 'PUBLIC_CI_LOOKUP_FAILED')
  const payload = await listed.json()
  demand(Array.isArray(payload?.workflow_runs), 'PUBLIC_CI_LOOKUP_INVALID')
  const existing = payload.workflow_runs.find((row) => row.head_branch === branch
    && row.head_sha === commit && row.event === 'workflow_dispatch')
  if (existing) return { ...verifiedRun(existing, branch, commit), reused: true }

  const dispatched = await fetchImpl(`${api}/actions/workflows/archive-web.yml/dispatches`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ ref: branch, inputs: { proposal_sha: commit } }),
  })
  demand(dispatched.ok, 'PUBLIC_CI_DISPATCH_FAILED')
  if (dispatched.status === 200) {
    const receipt = await dispatched.json()
    demand(positive(receipt?.workflow_run_id), 'PUBLIC_CI_DISPATCH_RECEIPT_INVALID')
    const run = await fetchImpl(`${api}/actions/runs/${receipt.workflow_run_id}`, {
      headers, signal: AbortSignal.timeout(10_000),
    })
    demand(run.ok, 'PUBLIC_CI_RUN_LOOKUP_FAILED')
    return { ...verifiedRun(await run.json(), branch, commit), reused: false }
  }
  if (dispatched.status === 204) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const observed = await fetchImpl(`${api}/actions/workflows/archive-web.yml/runs?${query}`, {
        headers, signal: AbortSignal.timeout(10_000),
      })
      demand(observed.ok, 'PUBLIC_CI_RUN_LOOKUP_FAILED')
      const rows = (await observed.json())?.workflow_runs
      demand(Array.isArray(rows), 'PUBLIC_CI_LOOKUP_INVALID')
      const match = rows.find((row) => row.head_branch === branch
        && row.head_sha === commit && row.event === 'workflow_dispatch')
      if (match) return { ...verifiedRun(match, branch, commit), reused: false }
    }
  }
  // A successful HTTP response alone does not prove that the run appeared.
  throw new Error('PUBLIC_CI_DISPATCH_RECEIPT_UNAVAILABLE')
}
