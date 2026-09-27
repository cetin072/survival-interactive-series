/** Open or reuse one Draft PR for an already approved remote text proposal.
 * GitHub token and responses are never included in thrown errors or receipts.
 */
const demand = (ok, code) => { if (!ok) throw new Error(code) }
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const refPattern = /^refs\/heads\/codex\/archive-publication-[a-z0-9-]{1,50}$/
const api = 'https://api.github.com/repos/cetin072/survival-interactive-series'

function readPr(row, branch, commit) {
  demand(row && Number.isSafeInteger(row.number) && row.number > 0
    && row.head?.ref === branch && row.head?.sha === commit
    && row.base?.ref === 'main'
    && row.state === 'open' && row.draft === true
    && row.merged_at == null
    && row.html_url === `https://github.com/cetin072/survival-interactive-series/pull/${row.number}`,
  'PUBLIC_DRAFT_PR_STATE_INVALID')
  return { prNumber: row.number, url: row.html_url }
}

export async function openOrReuseDraftTextPr({ remoteRef, commit, token,
  fetchImpl = globalThis.fetch } = {}) {
  demand(refPattern.test(remoteRef) && sha(commit)
    && typeof token === 'string' && token.length >= 20
    && typeof fetchImpl === 'function', 'PUBLIC_PR_CREDENTIAL_REQUIRED')
  const branch = remoteRef.slice('refs/heads/'.length)
  const headers = { Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
  const query = new URLSearchParams({ state: 'all',
    head: `cetin072:${branch}`, base: 'main', per_page: '100' })
  const listed = await fetchImpl(`${api}/pulls?${query}`, {
    headers, signal: AbortSignal.timeout(10_000),
  })
  demand(listed.ok, 'PUBLIC_PR_LOOKUP_FAILED')
  const rows = await listed.json()
  demand(Array.isArray(rows) && rows.length <= 100, 'PUBLIC_PR_LOOKUP_INVALID')
  const matching = rows.filter((row) => row?.head?.ref === branch
    && row?.base?.ref === 'main')
  demand(matching.length <= 1, 'PUBLIC_PR_DUPLICATE_REQUIRES_REVIEW')
  if (matching.length) return { ...readPr(matching[0], branch, commit),
    reused: true }

  const created = await fetchImpl(`${api}/pulls`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ head: branch, base: 'main', draft: true,
      title: 'Archive approved public text segment',
      body: 'Restricted Archive runner proposal. Public RAW approval and the exact source hash were checked before this branch was pushed. CI, Preview and Production receipts remain separate gates.',
      maintainer_can_modify: false }),
  })
  demand(created.ok, 'PUBLIC_PR_CREATE_FAILED')
  return { ...readPr(await created.json(), branch, commit), reused: false }
}
