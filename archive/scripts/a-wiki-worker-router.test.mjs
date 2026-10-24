import {test} from 'node:test'
import assert from 'node:assert/strict'
import {byteHash,graphHash} from './lib/publication-graph.mjs'
import {enqueueReviewWork,emptyReviewLedger} from './lib/wiki-continuous-review.mjs'
import {prepareContinuousJob,consumeContinuousJob,choosePendingReview} from './a-wiki-worker-router.mjs'
const at='2026-10-16T00:00:00.000Z', mainSha='a'.repeat(40)
function scope(id='C01-FIXTURE') {
 const text='Mira recorded a broken hinge beside the northern gate.'
 const binding={chronicle_id:id,worldline_id:id,source_id:'chapter-01',source_sha256:byteHash(text),
 raw:[{ref:'fixture.md',sha256:byteHash(text)}],wiki_sha256:byteHash('wiki'),book_sha256:byteHash('book'),approval_sha256:byteHash('approval')}
 return {...binding,scope_sha256:graphHash(binding),source_ref:`archive/content/stories/${id}/BOOK.json`,
 source:{text},existing:{nodes:[{id:'char-mira',facts:[]}],relations:[]},publication_policy:'NEW_EXACT_HUMAN_APPROVAL_REQUIRED'}
}
const noopLegacy=async()=>({status:'NO_JOB'})
function harness(s=scope()) {
 const q=enqueueReviewWork({scopes:[s]},emptyReviewLedger(),at)
 const state={jobs:[],active_job:null};const calls=[]
 const rpc=async(name,args)=>{
  calls.push({name,args})
  if(name==='archive_a_wiki_review_snapshot')return structuredClone(state)
  if(name==='archive_a_wiki_review_scan')return {status:'RECORDED'}
  if(name==='archive_a_wiki_review_prepare'){
   state.active_job={status:'EXTRACTOR_READY',job_id:args.p_job.job_id,prepared_job:args.p_job,
    chronicle_id:s.chronicle_id,source_id:s.source_id,scope_sha256:s.scope_sha256,created_at:at,binding_sha256:'b'.repeat(64)}
   return {status:'EXTRACTOR_READY',job_id:args.p_job.job_id}
  }
  if(name==='archive_a_wiki_review_advance'){
   assert.equal(state.active_job.status,args.p_expected_status)
   state.active_job={...state.active_job,status:args.p_status,...args.p_package}
   if(args.p_status==='REVIEW_READY')state.active_job.review_job=args.p_package.review_job
   return {status:args.p_status}
  }
  throw new Error(name)
 }
 return {q,state,calls,rpc,discover:async()=>({scopes:[s],new_source:null})}
}
test('version router returns existing C03 prepare byte shape and does not touch review DB',async()=>{
 const h=harness();const legacy={status:'EXTRACTOR_READY',job_id:'legacy-id',session_id:'SESSION_003'}
 const r=await prepareContinuousJob({requestRpc:h.rpc,legacyPrepare:async()=>legacy,mainSha})
 assert.deepEqual(r,{route:'C03_V1',...legacy});assert.equal(h.calls.length,0)
})
test('C03 consume priority preserves its finalizer owner',async()=>{
 const h=harness();const r=await consumeContinuousJob({requestRpc:h.rpc,legacyConsume:async()=>({status:'PUBLISHED',prNumber:123})})
 assert.equal(r.route,'C03_V1');assert.equal(h.calls.length,0)
})
test('C01 and C02 prepare distinct jobs and next world rotates from actual DB history',async()=>{
 const a=scope(),b=scope('C02-FIXTURE');const h=harness(a)
 const r=await prepareContinuousJob({requestRpc:h.rpc,legacyPrepare:noopLegacy,discover:h.discover,mainSha})
 assert.equal(r.status,'EXTRACTOR_READY');assert.equal(h.state.active_job.chronicle_id,a.chronicle_id)
 assert.notEqual(a.scope_sha256,b.scope_sha256)
 assert.equal(choosePendingReview([a,b],[{scope_sha256:a.scope_sha256,chronicle_id:a.chronicle_id,created_at:at}]),b)
})
test('actual Program consume compiles immutable review job then preserves human approval boundary',async()=>{
 const s=scope(),h=harness(s)
 h.state.active_job={status:'EXTRACTOR_SUBMITTED',job_id:h.q.job.job_id,prepared_job:h.q.job,
 chronicle_id:s.chronicle_id,source_id:s.source_id,scope_sha256:s.scope_sha256,created_at:at,
 extractor_execution_id:'extractor-fixture',extractor_submitted_at:at,
 extractor_result:{version:'wiki-continuous-result-v1',job_id:h.q.job.job_id,scope_sha256:s.scope_sha256,
 coverage:'COMPLETE',checked_fact_count:1,next_review_condition:'source or wiki changes',insufficient_evidence:[],
 candidates:[{work_type:'MISSING_FACT',chronicle_id:s.chronicle_id,text:'Mira recorded a broken hinge.',assertion_kind:'RECORDED',meaningful_change:'Missing condition.',entity_ids:['char-mira'],evidence:[{source_sha256:s.source_sha256,quote:s.source.text}]}]}}
 assert.equal((await consumeContinuousJob({requestRpc:h.rpc,discover:h.discover,includeLegacy:false})).status,'REVIEW_READY')
 const row=h.state.active_job
 assert.equal(row.review_job.job.job_id,h.q.job.job_id)
 assert.equal(row.review_job.proposal_sha256,row.proposal_sha256)
 row.status='REVIEW_SUBMITTED';row.reviewer_execution_id='separate-reviewer';row.review_submitted_at=at
 row.review_result={version:'wiki-continuous-review-v1',job_id:row.job_id,proposal_sha256:row.proposal_sha256,decision:'APPROVE',note:'Fixture review.'}
 assert.equal((await consumeContinuousJob({requestRpc:h.rpc,discover:h.discover,includeLegacy:false})).status,'HUMAN_APPROVAL_REQUIRED')
 assert.ok(!h.calls.some(c=>/publish|native_job_advance/.test(c.name)))
})
test('source/wiki drift retires old active proposal without recycling its review',async()=>{
 const s=scope(),h=harness(s)
 h.state.active_job={status:'REVIEW_SUBMITTED',job_id:h.q.job.job_id,prepared_job:h.q.job,
 chronicle_id:s.chronicle_id,source_id:s.source_id,scope_sha256:'f'.repeat(64)}
 const r=await consumeContinuousJob({requestRpc:h.rpc,discover:h.discover,includeLegacy:false})
 assert.equal(r.status,'SUPERSEDED')
 assert.equal(h.calls.at(-1).args.p_package.reason,'SOURCE_OR_WIKI_CHANGED_FRESH_REVIEW_REQUIRED')
})
test('invalid extraction blocks and never creates a reviewer approval',async()=>{
 const s=scope(),h=harness(s)
 h.state.active_job={status:'EXTRACTOR_SUBMITTED',job_id:h.q.job.job_id,prepared_job:h.q.job,
 chronicle_id:s.chronicle_id,source_id:s.source_id,scope_sha256:s.scope_sha256,created_at:at,
 extractor_execution_id:'extractor-fixture',extractor_submitted_at:at,extractor_result:{}}
 const r=await consumeContinuousJob({requestRpc:h.rpc,discover:h.discover,includeLegacy:false})
 assert.equal(r.status,'BLOCKED')
})
