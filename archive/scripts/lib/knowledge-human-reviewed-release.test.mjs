import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reviewedPayload, ensureReviewedMain, releaseReviewed } from '../knowledge-human-reviewed-release.mjs'
import { assertReviewedContentScope } from '../scheduled-netlify-release.mjs'
const repo='cetin072/survival-interactive-series', main='a'.repeat(40), prepared='b'.repeat(40), old='c'.repeat(40)
const itemId='263d256d-2cf8-45cf-82fb-98aab2e52d12', jobId='c8da8c82-c60c-4dd9-9556-b3f0d08c9507', issued='2026-10-21T11:10:00Z'
const payload=reviewedPayload({itemId,briefId:'K-015',mergeSha:main,prNumber:425,runId:'1234',now:issued})
const brief={id:'K-015',title:'긴급 복구 요청의 우선순위는 어떻게 정할까',meta_description:'승인한 검색 설명',lead:'승인한 도입',sections:[{heading:'확인',blocks:[{text:'사람이 수정한 실제 본문'}]}],slug:'emergency-restoration-priorities',status:'PUBLISHED',publication_policy:'HUMAN_APPROVED'}
const pr={state:'closed',merged_at:issued,merge_commit_sha:main,base:{ref:'main'},head:{sha:prepared,repo:{full_name:repo}},body:'<!-- knowledge-worker-phase-v1:PUBLICATION_HANDOFF -->'}
const env={GITHUB_REPOSITORY:repo,GITHUB_RUN_ID:'1234',BRIEF_ID:'K-015',REVIEW_ITEM_ID:itemId,PR_NUMBER:'425',PREPARED_SHA:prepared,MERGE_SHA:main,GH_TOKEN:'a'.repeat(40),DECIDED_AT:issued,ARCHIVE_SUPABASE_URL:'https://test.supabase.co',ARCHIVE_SUPABASE_SERVICE_ROLE_KEY:'server-only',NETLIFY_PRODUCTION_BUILD_HOOK:'https://api.netlify.com/build_hooks/'+'c'.repeat(24)}
function fixture(patch={}) {
 const body={...brief,...patch.brief}
 return async url=>{
  let data
  if(url.includes('archive_knowledge_review_package')) data={status:'C3',review:{id:itemId,status:patch.approval||'APPROVED',decided_at:issued,payload:{brief_id:'K-015',operator_draft_revision:1,operator_draft_sha256:'d'.repeat(64)}},job:{job_id:jobId,final_pr_number:425},prepared_heads:[prepared]}
  else if(url.includes('archive_worker_knowledge_operator_draft')) data={job_id:jobId,brief_id:'K-015',revision:1,draft_sha256:'d'.repeat(64),brief}
  else if(url.includes('/pulls/')) data={...pr,...patch.pr}
  else if(url.includes('/git/ref/heads/main')) data={object:{sha:main}}
  else if(url.includes('raw.githubusercontent.com')) data=body
  else if(url.includes('/sites/')) data={id:payload.site_id,published_deploy:{state:'ready',context:'production',commit_ref:patch.live?main:old,published_at:issued}}
  else if(url.includes('/compare/')) data={status:'ahead',files:(patch.files||['knowledge/content/briefs/K-015.json']).map(filename=>({filename}))}
  else if(url.endsWith('/deploy-meta.json')) data={context:'production',commit_ref:patch.meta||main}
  else if(url.endsWith('/sitemap.xml')) return {ok:true,text:async()=>'<loc>https://survival-diary-archive.netlify.app/knowledge/'+brief.slug+'/</loc>'}
  else if(url.endsWith('/knowledge/')) return {ok:true,text:async()=>'<a href="/knowledge/'+brief.slug+'/">'+brief.title+'</a>'}
  else if(url.includes('/knowledge/')) return {ok:true,text:async()=>(patch.noMetadata?'':'<title>고유 글 제목</title><meta name="description" content="'+brief.meta_description+'"><link rel="canonical" href="https://survival-diary-archive.netlify.app/knowledge/'+brief.slug+'/"><script type="application/ld+json">'+JSON.stringify({'@type':'Article',headline:brief.title,description:brief.meta_description,mainEntityOfPage:'https://survival-diary-archive.netlify.app/knowledge/'+brief.slug+'/'})+'</script>')+brief.title+brief.lead+brief.sections[0].heading+(patch.page||'사람이 수정한 실제 본문')}
  else throw Error('Unexpected URL '+url)
  return {ok:true,json:async()=>data,text:async()=>JSON.stringify(data)}
 }
}
test('reviewed payload binds one exact approval, PR and main SHA',()=>{
 assert.equal(payload.mode,'HUMAN_APPROVED_KNOWLEDGE')
 for(const patch of [{itemId:'../bad'},{briefId:'../bad'},{mergeSha:'x'},{prNumber:-1}]) assert.throws(()=>reviewedPayload({itemId,briefId:'K-015',mergeSha:main,prNumber:425,runId:'1234',now:issued,...patch}))
})
test('merged PR and published brief proof must match',async()=>{
 assert.equal((await ensureReviewedMain({payload,preparedSha:prepared,githubToken:env.GH_TOKEN,fetcher:fixture()})).slug,brief.slug)
 await assert.rejects(ensureReviewedMain({payload,preparedSha:prepared,githubToken:env.GH_TOKEN,fetcher:fixture({pr:{state:'open'}})}))
})
test('one immediate build followed by actual body/index/sitemap/exact-production verification',async()=>{
 let posts=0
 const result=await releaseReviewed({env,fetcher:fixture(),now:issued,runTrigger:async()=>{posts++;return {status:'PUBLISHED',source_main_sha:main}}})
 assert.equal(posts,1); assert.equal(result.status,'LIVE_VERIFIED')
})
test('already live recovery never POSTs a duplicate Production build',async()=>{
 assert.equal((await releaseReviewed({env,fetcher:fixture({live:true}),now:issued,runTrigger:async()=>{throw Error('must not POST')}})).status,'LIVE_VERIFIED')
})
test('wrong body, stale metadata, approval failure and another pending brief never report complete',async()=>{
 for(const patch of [{noMetadata:true},{page:'古い本文'},{meta:old},{approval:'PENDING'},{files:['knowledge/content/briefs/K-016.json']},{files:['archive/content/new-story.json']},{brief:{sections:[]}}]) {
  await assert.rejects(releaseReviewed({env,fetcher:fixture(patch),now:issued,runTrigger:async()=>({status:'PUBLISHED',source_main_sha:main})}))
 }
})
test('failed or wrong publication receipt is not completion',async()=>{
 await assert.rejects(releaseReviewed({env,fetcher:fixture(),now:issued,runTrigger:async()=>({status:'PUBLISHED',source_main_sha:old})}),/HUMAN_APPROVED_RELEASE_NOT_CONFIRMED/)
})
test('scope refuses another pending authored article and incomplete comparisons',async()=>{
 for(const filename of ['knowledge/content/briefs/K-016.json','archive/content/chronicles/new.json']) await assert.rejects(assertReviewedContentScope({repository:repo},payload,old,fixture({files:[filename]})),/OTHER_CONTENT_PENDING/)
})
test('workflow records consumption only after public verification, including already-merged recovery',()=>{
 const yaml=readFileSync(new URL('../../../.github/workflows/knowledge-review-consumer.yml',import.meta.url),'utf8')
 assert.ok(yaml.indexOf('id: publication')<yaml.indexOf('name: Record publicly verified'))
 assert.match(yaml,/steps\.publication\.outputs\.status == 'LIVE_VERIFIED'/)
 assert.doesNotMatch(yaml,/production: 'BATCHED_RELEASE_GATE'|name: Recover already-merged approval receipt/)
})
