import test from 'node:test'
import assert from 'node:assert/strict'
import {evaluateEditorialSnapshot,issueKey,locateQuote,verifyEditorialRights} from './knowledge-editor-review.mjs'
import {waitExactChecks,publicBaselineSha} from '../knowledge-editor-request.mjs'
const condition='실제 도로 상태와 통신 가능 여부는 지역과 시점에 따라 달라진다.'
function fixture() {
 const brief={id:'K-999',title:'연락 기록은 어떻게 남길까',summary:'요약',meta_description:'검색 설명',lead:'사전 연락 계획과 마지막 확인 시각을 남깁니다.',scope:'일반적인 연락 기록만 다루며 실제 출동 여부는 관할기관이 판단합니다.',basis:'공식 자료의 기록 원칙',footer:'현장기관의 판단을 따릅니다.',editorial_note:'사람 편집',risk_level:'HIGH',sources:[{id:'S1',url:'https://www.fema.gov/guide'}],sections:[{heading:'기록',blocks:[{type:'prose',text:'현재 상태가 확인되지 않으면 출동하지 않고 담당 기관에 확인합니다.'}]}]}
 const evidence={claims:[{claim:brief.lead,context:'자료는 연락 계획을 설명한다.',limitation:'실제 현장 상태를 확정하지 않는다.',source_ids:['S1']}],unknowns:[condition],conflicts:[],copyright_status:'CLEAR',story_source_status:'VERIFIED_PUBLIC_READER_BACKFILL'}
 return {brief,job:{job_id:'a',source_kind:'PUBLIC_READER',semantic_result:{brief:structuredClone(brief),evidence},semantic_result_sha256:'a'.repeat(64)},review:{claims:structuredClone(evidence.claims),resolutions:[]}}
}
test('saved current body resolves a scoped condition; immutable evidence remains intact',()=>{
 const s=fixture(),before=JSON.stringify(s.job.semantic_result)
 assert.equal(evaluateEditorialSnapshot(s).status,'NEEDS_CHANGES')
 s.review.resolutions.push({key:issueKey('unknowns',condition),method:'SITE_CONDITION',quote:s.brief.scope,reason:'현장별 상태를 확정하지 않는 일반 기록 안내이며 관할기관이 판단하도록 범위를 제한했습니다.',source_ids:['S1']})
 const result=evaluateEditorialSnapshot(s)
 assert.equal(result.status,'STRUCTURE_CHECKED');assert.deepEqual(result.evidence.unknowns,[])
 assert.equal(JSON.stringify(s.job.semantic_result),before)
 s.brief.scope='연락만 기록합니다.'
 assert.equal(evaluateEditorialSnapshot(s).status,'NEEDS_CHANGES')
})
test('checkboxes, empty reasons and arbitrary unknown kinds cannot clear facts',()=>{
 const s=fixture()
 s.review.resolutions=[{key:issueKey('unknowns',condition),checked:true,method:'PASS',reason:'확인'}]
 assert.equal(evaluateEditorialSnapshot(s).status,'NEEDS_CHANGES')
 s.review.resolutions[0].method='SITE_CONDITION'
 assert.equal(evaluateEditorialSnapshot(s).status,'NEEDS_CHANGES')
})
test('removed claim requires exact original quote absent from current manuscript',()=>{
 const s=fixture(),quote=s.brief.sections[0].blocks[0].text
 s.review.resolutions=[{key:issueKey('unknowns',condition),method:'REMOVED',quote,reason:'해당 현장의 상태를 확정하는 것으로 해석될 수 있는 문장을 삭제했습니다.',source_ids:[]}]
 assert.equal(evaluateEditorialSnapshot(s).status,'NEEDS_CHANGES')
 s.brief.sections=[]
 assert.equal(evaluateEditorialSnapshot(s).issues.some(i=>i.key===issueKey('unknowns',condition)),false)
 assert.equal(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='sections'),true)
})
test('quote anchors follow content, reject ambiguity and never point to the next paragraph',()=>{
 const b=fixture().brief,q=b.sections[0].blocks[0].text
 assert.equal(locateQuote(b,q).kind,'EXACT')
 b.sections.unshift({heading:'새 문단',blocks:[{type:'prose',text:'추가 내용'}]})
 assert.equal(locateQuote(b,q).section,1)
 b.sections.push(structuredClone(b.sections[1]));assert.equal(locateQuote(b,q).kind,'AMBIGUOUS')
 b.sections=b.sections.slice(0,1);assert.equal(locateQuote(b,q).kind,'MISSING')
})
test('dangerous safety specifics and private contact details do not pass with a limitation note',()=>{
 const s=fixture();s.job.semantic_result.evidence.unknowns=[]
 s.brief.sections[0].blocks[0].text='화재에서는 30 m를 안전거리로 정합니다. 현장기관에 판단을 맡깁니다.'
 assert.equal(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='safety-specific'),true)
 s.brief.sections[0].blocks[0].text='담당자의 개인번호는 010-1234-5678입니다.'
 assert.equal(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='privacy'),true)
})
test('a changed source invalidates inherited rights; provenance is only projected after pin verification',()=>{
 const s=fixture();s.job.semantic_result.evidence.unknowns=[]
 s.brief.sources[0].url='https://www.nist.gov/changed'
 assert.equal(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='rights'),true)
 s.job.semantic_result.evidence.story_source_status='NARRATIVE_PROVENANCE_ONLY'
 assert.equal(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='provenance'),true)
 const evaluated=evaluateEditorialSnapshot(s,{sourceVerified:true,rightsVerified:true})
 assert.equal(evaluated.evidence.story_source_status,'VERIFIED_PUBLIC_READER_BACKFILL')
})
test('rights checks reject private hosts, unrelated agencies, redirects and fabricated quotations',async()=>{
 const brief=fixture().brief
 let calls=0
 assert.equal(await verifyEditorialRights(brief,{rights:[{source_id:'S1',url:'https://127.0.0.1/','quote':'This material is available in the public domain.'}]},{fetcher:async()=>{calls++}}),false)
 assert.equal(calls,0)
 assert.equal(await verifyEditorialRights(brief,{rights:[{source_id:'S1',url:'https://www.nist.gov/terms','quote':'This material is available in the public domain.'}]}),false)
 const proof={rights:[{source_id:'S1',url:'https://www.fema.gov/terms',quote:'This material is available in the public domain.'}]}
 assert.equal(await verifyEditorialRights(brief,proof,{fetcher:async(_url,init)=>{assert.equal(init.redirect,'error');return new Response('No such permission')}}),false)
 assert.equal(await verifyEditorialRights(brief,proof,{fetcher:async()=>new Response('<p>This material is available in the public domain.</p>')}),true)
})
test('a real claim cannot be relabelled fictional to bypass official support',()=>{
 const s=fixture();s.job.semantic_result.evidence.unknowns=[];s.review.claims[0].role='NARRATIVE'
 assert.equal(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='claim:0'),true)
})
const head='a'.repeat(40),pr={state:'open',head:{sha:head}}
const checks=(sha=head)=>['build','knowledge','validate','browser'].map(name=>({name,head_sha:sha,status:'completed',conclusion:'success'}))
const readFor=(runs,status='success',pull=pr)=>path=>path.includes('check-runs')?{check_runs:runs}:path.endsWith('/status')?{statuses:[{context:'netlify/survival-diary-archive/deploy-preview',state:status}]}:pull
test('required CI must succeed on the exact PR head; stale success and moved head fail',async()=>{
 await waitExactChecks({head,pr:1,read:readFor(checks()),maxAttempts:1,sleep:async()=>{}})
 await assert.rejects(waitExactChecks({head,pr:1,read:readFor(checks('b'.repeat(40))),maxAttempts:1,sleep:async()=>{}}),/CI_TIMEOUT/)
 await assert.rejects(waitExactChecks({head,pr:1,read:readFor(checks(),'success',{state:'open',head:{sha:'b'.repeat(40)}}),maxAttempts:1}),/HEAD_CHANGED/)
 await assert.rejects(waitExactChecks({head,pr:1,read:readFor([{name:'browser',head_sha:head,status:'completed',conclusion:'failure'}]),maxAttempts:1}),/CI_FAILED/)
})

test('every public text surface participates in privacy and high-risk checks',()=>{
 for(const field of ['meta_description','label','editorial_note']) {
  const s=fixture();s.brief[field]='담당자 010-1234-5678';
  assert.ok(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='privacy'),field)
 }
 for(const block of [{type:'image',src:'https://example.gov/a.webp',alt:'010-1234-5678'}, {type:'youtube',url:'https://youtu.be/abcdefghi',title:'010-1234-5678'}, {type:'table',headers:['안내'],rows:[['010-1234-5678']]}]) {
  const s=fixture();s.brief.sections[0].blocks=[block];
  assert.ok(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='privacy'))
 }
 const s=fixture();s.brief.sources[0].note='전압 220 V 사용을 허용합니다.'
 assert.ok(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='safety-specific'))
})
test('two occurrences in the same paragraph are ambiguous',()=>{
 const s=fixture(),q=s.brief.sections[0].blocks[0].text
 s.brief.sections[0].blocks[0].text=q+' '+q
 assert.equal(locateQuote(s.brief,q).kind,'AMBIGUOUS')
})

test('republication uses the latest verified public baseline and preserves its exact identity',()=>{
 const s=fixture();s.brief.slug='same-public-url';s.job.status='PUBLISHED';s.job.merge_sha='a'.repeat(40)
 assert.equal(publicBaselineSha(s),'a'.repeat(40))
 s.public_baseline={merge_sha:'b'.repeat(40),brief_id:s.brief.id,slug:s.brief.slug}
 assert.equal(publicBaselineSha(s),'b'.repeat(40))
 s.job.status='HOLD';assert.equal(publicBaselineSha(s),'b'.repeat(40))
 for(const patch of [{brief_id:'K-001'},{slug:'another-url'},{merge_sha:'bad'}])assert.throws(()=>publicBaselineSha({...s,public_baseline:{...s.public_baseline,...patch}}),/PUBLIC_BASELINE_INVALID/)
 assert.equal(publicBaselineSha({...s,public_baseline:null}),null)
})

test('a previously low-risk article cannot inherit an exemption for newly added safety instructions',()=>{
 const s=fixture();s.brief.risk_level='LOW';s.brief.sections[0].blocks[0].text='전압 220 V에서 직접 작업합니다.'
 assert.ok(evaluateEditorialSnapshot(s).issues.some(i=>i.key==='safety-specific'))
})

test('legacy resource names produce an actionable issue before the final content validator',()=>{
 const s=fixture();s.brief.tools=['현장 점검 기록지'];
 const result=evaluateEditorialSnapshot(s)
 assert.ok(result.issues.some(i=>i.key==='tools:0'&&i.action.includes('삭제')))
})
