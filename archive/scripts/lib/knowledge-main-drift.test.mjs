import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadKnowledge, root } from './knowledge-content.mjs'
import { applyApprovedPackageOnMain, mainMovementOutcome, validateApprovedPackage } from '../knowledge-review-revalidate.mjs'
import { planSemanticPreparation } from '../knowledge-semantic-prepare.mjs'
import { buildSemanticContext, hashPolicyBytes, reservedCandidateId } from './knowledge-semantic-jobs.mjs'
import { inspectApprovedReview } from '../knowledge-review-consumer.mjs'
import { reconcilePullRequest, verifyPins } from '../knowledge-semantic-finalize.mjs'

test('recoverable BLOCKED package reserves the single-work boundary without another brief allocator', () => {
  for (const decision of ['BRIEF_READY','HUMAN_REVIEW']) assert.equal(planSemanticPreparation({activeJobs:[],
    handledJobs:[{status:'BLOCKED',blocker_code:'MAIN_MOVED_REVALIDATION_REQUIRED',blocker_stage:'PR_RECONCILE',result_decision:decision}],
    scanner:{sources:[{status:'PENDING',source_manifest_ref:'other',source_manifest_sha256:'a'.repeat(64)}]}}).code,'ACTIVE_RECOVERABLE_JOB_EXISTS')
})

test('publication main movement is retryable without a terminal blocker or an internal retry loop', () => {
  assert.deepEqual(mainMovementOutcome('a'.repeat(40),'b'.repeat(40)),{status:'RETRYABLE',reason:'MAIN_MOVED_DURING_VALIDATION'})
  assert.equal(mainMovementOutcome('a'.repeat(40),'a'.repeat(40)).status,'READY')
  assert.throws(()=>mainMovementOutcome('invalid','a'.repeat(40)),/CURRENT_MAIN_INVALID/)
})

test('C3 approval survives unrelated main and rejects unregistered head or closed PR', async () => {
  const approved='a'.repeat(40), current='b'.repeat(40), head='c'.repeat(40)
  const item={id:'11111111-1111-4111-8111-111111111111',decision:'APPROVED',decided_at:'2026-10-05T00:00:00Z',
    source_ref:`https://github.com/cetin072/survival-interactive-series/blob/${approved}/knowledge/content/briefs/K-999.json`,
    payload:{brief_id:'K-999',head_sha:approved,pr_number:999,head_ref:'knowledge/worker/semantic-test'}}
  for(const [prHead,state,expected] of [[approved,'open','REVALIDATE_PACKAGE'],[head,'open','REVALIDATE_PACKAGE'],['d'.repeat(40),'open','BLOCKED'],[approved,'closed','BLOCKED']]) {
    const outcome=await inspectApprovedReview({projectUrl:'https://example.supabase.co',serviceRoleKey:'test',githubToken:'test',
      fetchImpl:async url=>({ok:true,json:async()=>{
        if(url.includes('archive_worker_list_approved_reviews'))return[item]
        if(url.includes('archive_knowledge_review_package'))return{status:'C3',job:{job_id:'job',semantic_result_sha256:'e'.repeat(64),source_sha256:'f'.repeat(64),policy_sha256:'1'.repeat(64)},prepared_heads:[head]}
        if(url.endsWith('/pulls/999'))return{state,base:{ref:'main'},head:{sha:prHead,ref:item.payload.head_ref,repo:{full_name:'cetin072/survival-interactive-series'}}}
        if(url.endsWith('/git/ref/heads/main'))return{object:{sha:current}}
        assert.fail('C3 must not use whole-repo ancestry as approval identity')
      }})})
    assert.equal(outcome.status,expected)
  }
})

test('real Git main drift fixture reapplies approved immutable data on new main; pins, target and draft identity fail closed', async () => {
  const base=await mkdtemp(join(tmpdir(),'knowledge-drift-'))
  try {
    for(const folder of ['knowledge','docs','archive/content','archive/web/public','archive/scripts']) await cp(join(root,folder),join(base,folder),{recursive:true})
    const git=(...args)=>execFileSync('git',args,{cwd:base,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
    git('init','-b','main');git('config','user.name','C3 fixture');git('config','user.email','fixture@example.test');git('config','core.autocrlf','false')
    const data=await loadKnowledge(base)
    const [policy,config,editorial]=await Promise.all(['knowledge/automation/worker-policy.json','knowledge/automation/config.json','docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md'].map(p=>readFile(join(base,p))))
    const candidate=structuredClone(data.candidates.find(c=>c.brief_id==='K-004'))
    const evidence=structuredClone(data.evidence.get('K-004')),brief=structuredClone(data.briefs.find(b=>b.id==='K-004'))
    // Existing verified Reader fixture supplies provenance; this is not a real new job.
    const source={kind:'PUBLIC_READER',ref:candidate.reader_book_ref+'#'+candidate.reader_chapter_id,sha256:candidate.reader_chapter_sha256,
      chapter_id:candidate.reader_chapter_id,chapter_sha256:candidate.reader_chapter_sha256,reader_book_sha256:candidate.reader_book_sha256,
      refs:candidate.source_refs,hashes:candidate.source_hashes}
    for (const ref of source.refs) {
      try { await readFile(join(base,ref)) } catch {
        await mkdir(join(base,ref,'..'),{recursive:true})
        await writeFile(join(base,ref),execFileSync('git',['show',`origin/worldline/afterfall-rpg:${ref}`],{cwd:root}))
      }
    }
    const job={job_id:'11111111-1111-4111-8111-111111111111',status:'HUMAN_REVIEW',source_kind:'PUBLIC_READER',source_ref:source.ref,source_sha256:source.sha256,
      work_key:`PUBLIC_READER:${source.ref}:${source.sha256}`,policy_sha256:hashPolicyBytes(policy,config,editorial),policy_pin:{sha256:hashPolicyBytes(policy,config,editorial)},submitted_at:'2026-10-05T00:00:00Z',
      final_pr_number:999,final_head_ref:'knowledge/worker/semantic-fixture',semantic_result_sha256:'a'.repeat(64)}
    candidate.id=reservedCandidateId(`PUBLIC_READER:${job.source_ref}:${job.source_sha256}`);candidate.brief_id='K-015';candidate.status='BRIEF_PROPOSED'
    evidence.brief_id='K-015';brief.id='K-015';brief.slug='main-drift-fixture';brief.status='READY';brief.publication_policy='HUMAN_APPROVED';brief.semantic_qa_status='PASS'
    candidate.question=brief.title;evidence.question=brief.title
    job.semantic_context={source,policy:{publication_mode:data.config.publication_mode,auto_publish_enabled:data.config.auto_publish_enabled},target:{brief_id:'K-015',candidate_id:candidate.id}}
    job.semantic_result={version:'knowledge-semantic-result-v1',job_id:job.job_id,decision:'HUMAN_REVIEW',code:'FIXTURE_REVIEW',note:'Synthetic package review',candidate,evidence,brief}
    git('add','.');git('commit','-m','baseline');const original=git('rev-parse','HEAD')
    await writeFile(join(base,'unrelated-main.txt'),'other automation\n');git('add','unrelated-main.txt');git('commit','-m','unrelated automation');const current=git('rev-parse','HEAD')
    const inspection={c3_job_id:job.job_id,item_id:'22222222-2222-4222-8222-222222222222',decided_at:'2026-10-05T01:00:00Z',brief_id:brief.id,
      approved_head_sha:original,pr_number:999,head_ref:job.final_head_ref,semantic_result_sha256:job.semantic_result_sha256,
      source_sha256:job.source_sha256,policy_sha256:job.policy_sha256}
    const packageData={status:'C3',job,review:{id:inspection.item_id,status:'APPROVED',decided_at:inspection.decided_at,payload:{brief_id:brief.id,head_sha:original}}}
    assert.equal(reconcilePullRequest({...job,final_head_sha:original,result_decision:'HUMAN_REVIEW'},
      {state:'open',base:{ref:'main',sha:original},head:{sha:original,ref:job.final_head_ref,repo:{full_name:'cetin072/survival-interactive-series'}}},current).status,'HUMAN_REVIEW')
    for(const field of ['semantic_result_sha256','source_sha256','policy_sha256']) assert.throws(()=>validateApprovedPackage(inspection,{...packageData,job:{...job,[field]:'f'.repeat(64)}}),/SEMANTIC_APPROVED_PACKAGE_CHANGED/)
    assert.throws(()=>validateApprovedPackage({...inspection,operator_draft_revision:2,operator_draft_sha256:'d'.repeat(64)},packageData),/SEMANTIC_APPROVED_PACKAGE_CHANGED/)
    for(const path of ['knowledge/automation/worker-policy.json','docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md']) {
      const originalBytes=await readFile(join(base,path));await writeFile(join(base,path),Buffer.concat([originalBytes,Buffer.from('\n')]))
      await assert.rejects(verifyPins(job,base),/SEMANTIC_POLICY_PIN_CHANGED/);await writeFile(join(base,path),originalBytes)
    }
    // Reader source changes are checked by the existing canonical chapter pin.
    const bookPath=join(base,'archive/content/stories/C03-AFTERFALL/BOOK.json'),bookBytes=await readFile(bookPath)
    const book=JSON.parse(bookBytes);book.chapters.find(c=>c.id===source.chapter_id).body+=' changed'
    await writeFile(bookPath,JSON.stringify(book));await assert.rejects(verifyPins(job,base),/SEMANTIC_SOURCE_SHA_CHANGED/);await writeFile(bookPath,bookBytes)
    await applyApprovedPackageOnMain({inspection,packageData,base})
    assert.equal(git('rev-parse','HEAD'),current)
    assert.equal(await readFile(join(base,'unrelated-main.txt'),'utf8'),'other automation\n')
    assert.equal(JSON.parse(await readFile(join(base,'knowledge/content/briefs/K-015.json'))).title,brief.title)
    await assert.rejects(applyApprovedPackageOnMain({inspection,packageData,base}),/SEMANTIC_TARGET_BRIEF_ALREADY_EXISTS/)
  } finally {await rm(base,{recursive:true,force:true})}
})
