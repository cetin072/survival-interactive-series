// Read-only public workflow evidence, gated by the existing Operator RPC in the caller.
// Never send credentials, inspect logs, or treat dispatch/CI as content publication.
export const WORKFLOW_FRESH_MS = 300_000
export const workflowFiles = { archive: 'archive-daily.yml', visual: 'archive-illustration-prep.yml' } as const
export type WorkflowKind = keyof typeof workflowFiles
export type WorkflowObservation = {
  checkedAt: string
  run: { id: number; status: string; conclusion: string | null; createdAt: string; url: string } | null
  error: boolean
}
export type WorkflowObservations = Partial<Record<WorkflowKind, WorkflowObservation>>
const repo = 'cetin072/survival-interactive-series'

export async function readWorkflow(kind: WorkflowKind, fetcher: typeof fetch = fetch): Promise<WorkflowObservation> {
  try {
    const response = await fetcher(`https://api.github.com/repos/${repo}/actions/workflows/${workflowFiles[kind]}/runs?branch=main&per_page=10`, {
      credentials: 'omit', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) throw new Error('unavailable')
    const body = await response.json()
    if (!Array.isArray(body.workflow_runs)) throw new Error('invalid')
    const rows = body.workflow_runs.filter((r: { event?: string }) => ['schedule', 'workflow_dispatch', 'repository_dispatch'].includes(r.event ?? ''))
    const r = rows[0]
    if (!r) throw new Error('missing')
    if (!Number.isSafeInteger(r.id) || r.id <= 0 || r.head_branch !== 'main'
      || r.path !== `.github/workflows/${workflowFiles[kind]}`
      || r.repository?.full_name !== repo || !Number.isFinite(Date.parse(r.created_at))
      || Date.parse(r.created_at) > Date.now()
      || !['queued','in_progress','completed','waiting','requested','pending'].includes(r.status)
      || (r.conclusion !== null && typeof r.conclusion !== 'string')) throw new Error('invalid')
    return { checkedAt: new Date().toISOString(), error: false, run: {
      id: r.id, status: r.status, conclusion: r.conclusion, createdAt: r.created_at,
      url: `https://github.com/${repo}/actions/runs/${r.id}`,
    } }
  } catch { return { checkedAt: new Date().toISOString(), run: null, error: true } }
}

export function workflowSignal(observation: WorkflowObservation | undefined, now: number, expectedWithinHours: number) {
  const unknown = { label: '실행 결과 조회 불가', tone: 'neutral' }
  if (!observation || observation.error || !observation.run
    || !Number.isFinite(Date.parse(observation.checkedAt)) || now - Date.parse(observation.checkedAt) >= WORKFLOW_FRESH_MS
    || now < Date.parse(observation.checkedAt)) return unknown
  const r = observation.run
  if (r.status === 'completed' && ['failure','timed_out','action_required','startup_failure'].includes(r.conclusion ?? ''))
    return { label: '최근 실행 실패', tone: 'danger' }
  if (now - Date.parse(r.createdAt) > expectedWithinHours * 3_600_000) return { label: '실행 기록 오래됨', tone: 'warning' }
  if (r.status !== 'completed') return { label: '실행 중·대기', tone: 'running' }
  if (r.conclusion === 'success') return { label: '최근 실행 성공', tone: 'ok' }
  return { label: '실행 취소·미완료', tone: 'warning' }
}
