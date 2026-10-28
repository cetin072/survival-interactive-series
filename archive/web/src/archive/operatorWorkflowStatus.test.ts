import { describe, it, expect } from 'vitest'
import { readWorkflow, workflowSignal, WORKFLOW_FRESH_MS, confirmedOperatorHold, OPERATOR_HOLD_JOB } from './operatorWorkflowStatus'

describe('actual workflow evidence', () => {
  const now = Date.now()
  const checkedAt = new Date(now).toISOString()
  const run = { id: 12, status: 'completed', conclusion: 'success', createdAt: checkedAt, url: 'https://github.com/cetin072/survival-interactive-series/actions/runs/12' }
  it('separates recent success, failure, in-flight and old execution', () => {
    expect(workflowSignal({ checkedAt, run, error: false }, now, 30).tone).toBe('ok')
    expect(workflowSignal({ checkedAt, run: { ...run, conclusion: 'failure' }, error: false }, now, 30).tone).toBe('danger')
    expect(workflowSignal({ checkedAt, run: { ...run, status: 'in_progress', conclusion: null }, error: false }, now, 30).tone).toBe('running')
    expect(workflowSignal({ checkedAt, run: { ...run, createdAt: new Date(now - 31*3600000).toISOString() }, error: false }, now, 30).label).toBe('실행 기록 오래됨')
  })
  it('never retains successful evidence after error, expiry or clock rollback', () => {
    expect(workflowSignal(undefined, now, 30).tone).toBe('neutral')
    expect(workflowSignal({ checkedAt, run, error: true }, now, 30).tone).toBe('neutral')
    expect(workflowSignal({ checkedAt, run, error: false }, now + WORKFLOW_FRESH_MS, 30).tone).toBe('neutral')
    expect(workflowSignal({ checkedAt, run, error: false }, now - 1, 30).tone).toBe('neutral')
  })
  it('uses only fixed public GETs and validates workflow/repository identity', async () => {
    const fixture = { id: 12, head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/archive-illustration-prep.yml', repository: { full_name: 'cetin072/survival-interactive-series' }, status: 'completed', conclusion: 'failure', created_at: checkedAt }
    let calls = 0
    const fetcher = (async (url, init) => {
      calls++
      expect(String(url)).toContain('/actions/workflows/archive-illustration-prep.yml/runs?branch=main')
      expect(init?.credentials).toBe('omit')
      expect(init?.headers).not.toHaveProperty('Authorization')
      return new Response(JSON.stringify({ workflow_runs: [fixture] }))
    }) as typeof fetch
    const result = await readWorkflow('visual', fetcher)
    expect(calls).toBe(1)
    expect(result.run?.conclusion).toBe('failure')
    expect(result.run?.url).toBe(run.url)
    fixture.repository.full_name = 'other/repo'
    expect((await readWorkflow('visual', fetcher)).error).toBe(true)
  })
  it('fails closed on quota/CORS/network, no operational runs or malformed responses', async () => {
    for (const response of [new Response('', { status: 403 }), new Response('{}'), new Response('{"workflow_runs":[]}')]) {
      const result = await readWorkflow('archive', (async () => response) as typeof fetch)
      expect(result.error).toBe(true)
      expect(result.run).toBeNull()
    }
    expect((await readWorkflow('archive', (async () => { throw new Error('network') }) as typeof fetch)).error).toBe(true)
  })
})


describe('operator hold evidence', () => {
  const jobs = [
    {run_id:12,name:'policy',status:'completed',conclusion:'success'},
    {run_id:12,name:OPERATOR_HOLD_JOB,status:'completed',conclusion:'success'},
    {run_id:12,name:'prepare',status:'completed',conclusion:'skipped'},
  ]
  it('requires complete matching evidence and skipped mutation job', () => {
    expect(confirmedOperatorHold({total_count:3,jobs},12)).toBe(true)
    expect(confirmedOperatorHold({total_count:4,jobs},12)).toBe(false)
    expect(confirmedOperatorHold({total_count:3,jobs},13)).toBe(false)
    for (const conclusion of ['failure','success','cancelled']) {
      expect(confirmedOperatorHold({total_count:3,jobs:jobs.map(j=>j.name==='prepare'?{...j,conclusion}:j)},12)).toBe(false)
    }
  })
  it('does not hide failures or expired observations', () => {
    const now=Date.now(),checkedAt=new Date(now).toISOString()
    const observation={checkedAt,operatorHold:true,error:false,run:{id:12,status:'completed',conclusion:'success',createdAt:checkedAt,url:''}}
    expect(workflowSignal(observation,now,30).label).toContain('운영자 보류')
    expect(workflowSignal({...observation,run:{...observation.run,conclusion:'failure'}},now,30).tone).toBe('danger')
    expect(workflowSignal(observation,now+WORKFLOW_FRESH_MS,30).tone).toBe('neutral')
  })
})
