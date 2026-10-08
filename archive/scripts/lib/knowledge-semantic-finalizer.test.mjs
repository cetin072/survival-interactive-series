import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { humanReviewPackageAllowed, validateReservedBriefTarget, verifyBriefReservation, finalizerAction, reconcilePullRequest, runSemanticFinalizer, semanticBranchRef } from '../knowledge-semantic-finalize.mjs'

const job = { job_id: '287c20fb-7ad2-41e4-b9be-12426675d234', source_kind: 'PUBLIC_ARCHIVE', source_ref: 'manifest', source_sha256: 'a'.repeat(64), semantic_context: { target: { brief_id: 'K-011', candidate_id: 'KC-test' }, source: { kind: 'PUBLIC_ARCHIVE' } } }

test('human waiting is neither polled nor reconciled by the machine finalizer', async () => {
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { status: 'NO_SUBMITTED_JOB' }, openJobs: [{ ...job, status: 'HUMAN_REVIEW' }] })
  const result = await runSemanticFinalizer({ requestRpc, shell, mainSha: 'b'.repeat(40) })
  assert.deepEqual(result.jobs, [])
  assert.equal(calls.filter((call) => call[0] === 'shell').length, 0)
  assert.equal(calls.filter((call) => call[1] === 'archive_knowledge_semantic_job_update').length, 0)
  const workflow = await readFile(new URL('../../../.github/workflows/knowledge-semantic-finalizer.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(workflow, /\bschedule:|cron:/)
  assert.match(workflow, /workflow_dispatch:/)
})

test('worker interruption before submit leaves C-PREPARED job reusable', () => {
  const prepared = { ...job, status: 'PREPARED', semantic_result: null }
  assert.equal(prepared.status, 'PREPARED')
  assert.equal(prepared.semantic_result, null)
})

test('submit interruption leaves finalizer-owned SUBMITTED job recoverable', () => {
  const submitted = { ...job, status: 'SUBMITTED', semantic_result: { version: 'knowledge-semantic-result-v1', decision: 'HOLD', job_id: job.job_id, code: 'NO_DISTINCT_SAFE_QUESTION', note: 'No new question.' } }
  assert.equal(submitted.status, 'SUBMITTED')
  assert.equal(finalizerAction(submitted, submitted.semantic_result).action, 'HOLD')
})

test('deterministic branch identity rejects invalid job ids', () => {
  assert.match(semanticBranchRef(job.job_id), /^knowledge\/worker\/semantic-/)
  assert.throws(() => semanticBranchRef('not-a-uuid'), /SEMANTIC_JOB_ID_INVALID/)
})

test('unrelated main movement preserves both human and low-risk PRs with strict transport checks', () => {
  for (const decision of ['HUMAN_REVIEW','BRIEF_READY']) {
    const j={final_pr_number:9,final_head_sha:'a'.repeat(40),final_head_ref:'knowledge/worker/semantic-test',result_decision:decision}
    const pr={state:'open',head:{sha:j.final_head_sha,ref:j.final_head_ref,repo:{full_name:'cetin072/survival-interactive-series'}},base:{ref:'main',sha:'b'.repeat(40)}}
    assert.deepEqual(reconcilePullRequest(j,pr,'c'.repeat(40)),{status:decision==='HUMAN_REVIEW'?'HUMAN_REVIEW':'PR_OPEN',revalidation_required:true})
    assert.equal(reconcilePullRequest(j,{...pr,head:{...pr.head,sha:'d'.repeat(40)}}).code,'PR_HEAD_CHANGED')
    assert.equal(reconcilePullRequest(j,{...pr,state:'closed',merged:false}).code,'PR_CLOSED_WITHOUT_MERGE')
    assert.equal(reconcilePullRequest(j,{...pr,head:{...pr.head,ref:'changed'}}).code,'PR_REF_CHANGED')
    assert.equal(reconcilePullRequest(j,{...pr,head:{...pr.head,repo:{full_name:'other/repo'}}}).code,'PR_REPOSITORY_MISMATCH')
  }
})

const packagedResult = (decision = 'BRIEF_READY') => ({
  version: 'knowledge-semantic-result-v1', job_id: job.job_id, decision,
  ...(decision === 'HUMAN_REVIEW' ? { code: 'RISK_REVIEW', note: 'Risk requires a person.' } : {}),
  candidate: { id: 'KC-test', brief_id: 'K-011', topic_id: 'T-1', status: 'BRIEF_PROPOSED', source_kind: 'PUBLIC_ARCHIVE', source_manifest_ref: 'manifest', source_manifest_sha256: 'a'.repeat(64), question: '짧은 생존 질문은 무엇일까?' },
  evidence: { brief_id: 'K-011', question: '짧은 생존 질문은 무엇일까?', claims: [{ claim: 'Claim', source_ids: ['S1'], context: 'Context', limitation: 'Limit' }] },
  brief: { id: 'K-011', title: '짧은 생존 질문은 무엇일까?', topic_id: 'T-1', content_type: 'BRIEF', status: 'READY', risk_level: decision === 'HUMAN_REVIEW' ? 'HIGH' : 'LOW', publication_policy: decision === 'HUMAN_REVIEW' ? 'HUMAN_APPROVED' : 'AUTO_LOW_RISK', semantic_qa_status: decision === 'HUMAN_REVIEW' ? 'REVIEW' : 'PASS' },
})

function finalizerHarness({ claimedJob, openJobs = [], pullRequest = null } = {}) {
  const calls = []
  const requestRpc = async (name, args) => {
    calls.push(['rpc', name, args])
    if (name === 'archive_knowledge_semantic_job_claim_finalizer') return claimedJob
    if (name === 'archive_knowledge_semantic_job_list_reconcile_v2') return openJobs
    return { ok: true }
  }
  const shell = (command, args) => {
    calls.push(['shell', command, args])
    if (args[0] === 'api') return JSON.stringify(pullRequest)
    return ''
  }
  return { calls, requestRpc, shell }
}

test('finalizer orchestration sends BRIEF_READY through package, draft PR, and PR_OPEN persistence', async () => {
  const result = packagedResult()
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { ...job, status: 'FINALIZING', result_decision: result.decision, semantic_result: result } })
  const seen = []
  const outcome = await runSemanticFinalizer({
    requestRpc, shell, mainSha: 'b'.repeat(40),
    verifyPinsFn: async () => ({ context: job.semantic_context }),
    packageSemantic: async (_job, _result, pins) => { seen.push(['package', pins]); return { head_sha: 'c'.repeat(40), release_decision: 'WOULD_AUTO_PUBLISH' } },
    createDraft: async (_job, _result, headRef, headSha) => { seen.push(['draft', headRef, headSha]); return { number: 12, url: 'https://example.invalid/pr/12' } },
  })
  assert.equal(outcome.status, 'PR_OPEN')
  assert.equal(outcome.pr_number, 12)
  assert.equal(outcome.head_sha, 'c'.repeat(40))
  assert.equal(seen[0][0], 'package')
  assert.equal(seen[1][0], 'draft')
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'PR_OPEN'))
})

test('finalizer orchestration records HOLD without packaging or opening a PR', async () => {
  const result = { version: 'knowledge-semantic-result-v1', job_id: job.job_id, decision: 'HOLD', code: 'NO_DISTINCT_SAFE_QUESTION', note: 'No distinct safe question.' }
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { ...job, status: 'FINALIZING', semantic_result: result } })
  const outcome = await runSemanticFinalizer({ requestRpc, shell, mainSha: 'b'.repeat(40), packageSemantic: async () => assert.fail('HOLD must not package'), createDraft: async () => assert.fail('HOLD must not open a PR') })
  assert.equal(outcome.status, 'HOLD')
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'HOLD'))
})

test('finalizer orchestration enqueues HUMAN_REVIEW after packaging and persists review state', async () => {
  const result = packagedResult('HUMAN_REVIEW')
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { ...job, status: 'FINALIZING', result_decision: result.decision, semantic_result: result } })
  let enqueued = 0
  const outcome = await runSemanticFinalizer({
    requestRpc, shell, mainSha: 'b'.repeat(40),
    verifyPinsFn: async () => ({ context: job.semantic_context }),
    packageSemantic: async () => ({ head_sha: 'd'.repeat(40), release_decision: 'HUMAN_REVIEW_REQUIRED' }),
    createDraft: async () => ({ number: 13, url: 'https://example.invalid/pr/13' }),
    enqueueReviewEntry: async (payload) => { enqueued += 1; assert.equal(payload.p_payload.brief_id, 'K-011') },
  })
  assert.equal(outcome.status, 'HUMAN_REVIEW', JSON.stringify(outcome))
  assert.equal(enqueued, 1)
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'HUMAN_REVIEW'))
})

test('finalizer blocks a changed pinned source before packaging or opening a PR', async () => {
  const result = packagedResult()
  const { calls, requestRpc, shell } = finalizerHarness({ claimedJob: { ...job, status: 'FINALIZING', result_decision: result.decision, semantic_result: result } })
  const outcome = await runSemanticFinalizer({
    requestRpc, shell, mainSha: 'b'.repeat(40),
    verifyPinsFn: async () => { throw new Error('SEMANTIC_SOURCE_SHA_CHANGED') },
    packageSemantic: async () => assert.fail('changed source must not be packaged'),
    createDraft: async () => assert.fail('changed source must not open a PR'),
  })
  assert.equal(outcome.status, 'BLOCKED')
  assert.equal(outcome.blocker_code, 'SEMANTIC_SOURCE_SHA_CHANGED')
  assert.ok(calls.some((call) => call[0] === 'rpc' && call[1] === 'archive_knowledge_semantic_job_update' && call[2].p_status === 'BLOCKED'))
})

test('main drift leaves HUMAN_REVIEW and BRIEF_READY open; semantic, source and policy changes still fail closed', async () => {
  for (const decision of ['HUMAN_REVIEW','BRIEF_READY']) {
    const result=packagedResult(decision)
    const submitted={...job,status:decision==='HUMAN_REVIEW'?'HUMAN_REVIEW':'PR_OPEN',result_decision:decision,semantic_result:result,
      result_digest_verified:true,final_pr_number:14,final_head_ref:semanticBranchRef(job.job_id),final_head_sha:'e'.repeat(40)}
    const pr={state:'open',merged:false,head:{sha:submitted.final_head_sha,ref:submitted.final_head_ref,repo:{full_name:'cetin072/survival-interactive-series'}},base:{ref:'main',sha:'f'.repeat(40)}}
    const harness=finalizerHarness({claimedJob:{status:'NO_SUBMITTED_JOB'},openJobs:[submitted],pullRequest:pr})
    const outcome=await runSemanticFinalizer({...harness,mainSha:'0'.repeat(40),verifyPinsFn:async()=>({context:job.semantic_context})})
    if (decision === 'HUMAN_REVIEW') {
      assert.deepEqual(outcome.jobs, [])
      assert.equal(harness.calls.filter(c=>c[0]==='shell').length, 0)
      continue // Approval consumer validates human packages; the polling finalizer leaves them untouched.
    }
    assert.equal(outcome.jobs[0].status,submitted.status)
    assert.equal(outcome.jobs[0].revalidation_required,true)
    assert.ok(!harness.calls.some(c=>c[0]==='shell'&&c[2][1]==='close'))
    assert.ok(!harness.calls.some(c=>c[1]==='archive_knowledge_semantic_job_update'))
    for(const code of ['SEMANTIC_SOURCE_SHA_CHANGED','SEMANTIC_POLICY_PIN_CHANGED']) {
      const h=finalizerHarness({claimedJob:{status:'NO_SUBMITTED_JOB'},openJobs:[submitted],pullRequest:pr})
      const failed=await runSemanticFinalizer({...h,mainSha:'0'.repeat(40),verifyPinsFn:async()=>{throw Error(code)}})
      assert.equal(failed.jobs[0].code,code)
    }
    const h=finalizerHarness({claimedJob:{status:'NO_SUBMITTED_JOB'},openJobs:[{...submitted,result_digest_verified:false}],pullRequest:pr})
    const failed=await runSemanticFinalizer({...h,mainSha:'0'.repeat(40),verifyPinsFn:async()=>{}})
    assert.equal(failed.jobs[0].code,'SEMANTIC_RESULT_IDENTITY_CHANGED')
  }
})

test('K-015..K-019 reservations survive gaps in main K-014', () => {
  const j=structuredClone(job), r=packagedResult()
  for(const id of ['K-015','K-016','K-017','K-018','K-019']) {
    j.semantic_context.target.brief_id=id
    r.brief.id=r.candidate.brief_id=r.evidence.brief_id=id
    assert.equal(validateReservedBriefTarget(j,r,[{id:'K-014'}]),id)
  }
})
test('main collision and mismatched package identities fail closed', () => {
  const j=structuredClone(job), r=packagedResult()
  j.semantic_context.target.brief_id='K-018'
  r.brief.id=r.candidate.brief_id=r.evidence.brief_id='K-018'
  assert.throws(()=>validateReservedBriefTarget(j,r,[{id:'K-018',title:'different'}]),/SEMANTIC_TARGET_BRIEF_STALE/)
  for(const field of ['brief','candidate','evidence']) {
    const changed=structuredClone(r)
    changed[field][field==='brief'?'id':'brief_id']='K-019'
    assert.throws(()=>validateReservedBriefTarget(j,changed),/SEMANTIC_TARGET_BRIEF_STALE/)
  }
})
test('DB reservation and result binding rejection fail closed', async () => {
  const j={...job,policy_sha256:'b'.repeat(64),semantic_result_sha256:'c'.repeat(64)}
  for(const code of ['SEMANTIC_TARGET_BRIEF_STALE','SEMANTIC_RESULT_IDENTITY_CHANGED']) {
    await assert.rejects(verifyBriefReservation(j,packagedResult(),{requestRpc:async(name,args)=>{
      assert.equal(name,'archive_knowledge_semantic_job_verify_reservation')
      assert.equal(args.p_job_id,j.job_id)
      assert.equal(args.p_source_ref,j.source_ref)
      assert.equal(args.p_source_sha256,j.source_sha256)
      assert.equal(args.p_policy_sha256,j.policy_sha256)
      assert.equal(args.p_result_sha256,j.semantic_result_sha256)
      return {status:'REJECTED',code}
    }}),new RegExp(code))
  }
})

test('material unknowns enter human review while incomplete or rejected packages stay blocked', () => {
  assert.equal(humanReviewPackageAllowed({decision:'HOLD',requires_human:true,reasons:['MATERIAL_UNKNOWNS:K-018']}),true)
  assert.equal(humanReviewPackageAllowed({decision:'HUMAN_REVIEW_REQUIRED',requires_human:true}),true)
  for(const gate of [{decision:'HOLD',requires_human:false},{decision:'REJECTED',requires_human:true},{decision:'AUTO_PUBLISH_ELIGIBLE',requires_human:false}]) assert.equal(humanReviewPackageAllowed(gate),false)
})
