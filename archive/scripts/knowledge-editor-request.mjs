// Reuses the C review consumer's concurrency, Git CI, static renderer and
// verified human release. No schedule, token, public account or upload path.
import {execFileSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {loadKnowledge,validateKnowledge} from './lib/knowledge-content.mjs'
import {postSupabaseRpc} from './lib/knowledge-semantic-jobs.mjs'
import {verifyPins} from './knowledge-semantic-finalize.mjs'
import {evaluateEditorialSnapshot,verifyEditorialRights} from './lib/knowledge-editor-review.mjs'
import {checkHumanApprovedRelease} from './lib/knowledge-release.mjs'
import {releaseReviewed,verifyPublicArticle} from './knowledge-human-reviewed-release.mjs'
const repo='cetin072/survival-interactive-series'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const root=resolve(import.meta.dirname,'../..')
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const command=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
const git=(...args)=>command('git',args)
const gh=(...args)=>command('gh',args[0]==='api'?args:[...args,'--repo',repo])
const rpc=(name,args)=>postSupabaseRpc({projectUrl:process.env.ARCHIVE_SUPABASE_URL,serviceRoleKey:process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,name,args})
const pause=ms=>new Promise(r=>setTimeout(r,ms))
export function candidateFromSnapshot(snapshot, brief) {
 const j=snapshot.job,s=j.semantic_context.source
 const c={...structuredClone(j.semantic_result?.candidate??{}),id:j.semantic_context.target.candidate_id,topic_id:brief.topic_id,question:brief.title,brief_id:brief.id,source_kind:j.source_kind,status:'BRIEF_PROPOSED',disposition_note:'운영자가 보관된 글감에서 새 원고를 작성하고 검토를 요청했습니다.'}
 if(j.source_kind==='PUBLIC_READER') Object.assign(c,{reader_book_ref:s.reader_book_ref,reader_book_sha256:s.reader_book_sha256,reader_chapter_id:s.chapter_id,reader_chapter_sha256:s.chapter_sha256,source_refs:s.refs,source_hashes:s.hashes})
 else if(j.source_kind==='PUBLIC_ARCHIVE') Object.assign(c,{source_manifest_ref:j.source_ref,source_manifest_sha256:j.source_sha256})
 else Object.assign(c,{source_ref:j.source_ref,source_sha256:j.source_sha256})
 return c
}
export async function prepareEditorialFiles({snapshot,base=root,sourceVerifier=verifyPins,rightsVerifier=verifyEditorialRights}) {
 const {job,brief:approved,review}=snapshot
 // Pin verifier never consults the editable copy for source/policy authority.
 await sourceVerifier(job,base)
 const sameSources=JSON.stringify(approved.sources)===JSON.stringify(job.semantic_result?.brief?.sources)
 const rightsVerified=(sameSources&&job.semantic_result?.evidence?.copyright_status==='CLEAR')||await rightsVerifier(approved,review,{trustedSources:job.semantic_result?.evidence?.copyright_status==='CLEAR'?job.semantic_result.brief?.sources??[]:[]})
 const evaluation=evaluateEditorialSnapshot(snapshot,{sourceVerified:true,rightsVerified})
 if(evaluation.issues.length) return evaluation
 const data=await loadKnowledge(base)
 const prior=data.briefs.find(b=>b.id===approved.id)
 if(prior&&job.status!=='PUBLISHED') throw Error('KNOWLEDGE_EDITOR_RESERVED_ID_CONFLICT')
 if(prior&&(prior.slug!==approved.slug||prior.id!==approved.id))throw Error('KNOWLEDGE_EDITOR_PUBLIC_URL_CHANGED')
 const authored=['id','slug','title','summary','meta_description','lead','label','scope','basis','footer','editorial_note','sections','sources','tools','source_checked_at','risk_level','risk_domains','story_refs','related_brief_ids','guide_id']
 if(prior?.status==='PUBLISHED'&&authored.every(key=>JSON.stringify(prior[key]??null)===JSON.stringify(approved[key]??null)))return {...evaluation,status:'ALREADY_LIVE',brief:prior,brief_id:prior.id}
 const today=new Date().toISOString().slice(0,10)
 const brief={...structuredClone(approved),content_type:'BRIEF',status:'READY',publication_policy:'HUMAN_APPROVED',
  // A server-side structural/content/evidence check creates this projection.
  // The saved manuscript's original QA marker is never overwritten.
  semantic_qa_status:'PASS',published_at:prior?.published_at??null,updated_at:today}
 if(job.semantic_context?.editorial_contract?.version==='V2') {
  const heading=job.source_kind==='USER_REPORTED_EXPERIENCE'?'이 질문이 생긴 실제 경험':'《생존일기》에서 시작한 질문'
  if(brief.sections.at(-1)?.heading!==heading||brief.lead.trim().split(/[.!?]/)[0].length<20) throw Error('KNOWLEDGE_EDITOR_EDITORIAL_CONTRACT')
 }
 const candidate=candidateFromSnapshot(snapshot,brief)
 candidate.question=brief.title
 if(data.candidates.some(c=>c.id===candidate.id&&c.brief_id!==brief.id))candidate.id='KC-editorial-'+job.job_id
 // No guessed Story registry IDs. Narrative provenance remains in pinned Candidate.
 const validStories=new Set(data.stories.map(s=>s.id))
 const invalid=brief.story_refs.filter(id=>!validStories.has(id))
 const provenance=new Set([job.source_ref,job.semantic_context.source.reader_book_ref,...job.semantic_context.source.refs])
 if(invalid.some(id=>!provenance.has(id)))throw Error('KNOWLEDGE_EDITOR_STORY_REFERENCE_INVALID')
 brief.story_refs=brief.story_refs.filter(id=>validStories.has(id))
 if(invalid.length)evaluation.evidence.editorial_review.projected_provenance_refs=invalid
 const topic=data.topics.find(t=>t.id===brief.topic_id)
 if(!topic) {
  const proposed=job.semantic_result?.topic
  if(proposed?.id!==brief.topic_id) throw Error('KNOWLEDGE_EDITOR_TOPIC_REQUIRED')
  data.topics.push({...proposed,brief_ids:[brief.id],guide_id:null,tools:[],story_refs:[]})
 } else if(!topic.brief_ids.includes(brief.id)) topic.brief_ids.push(brief.id)
 const write=async(path,value)=>writeFile(join(base,path),JSON.stringify(value,null,2)+'\n')
 await write('knowledge/content/briefs/'+brief.id+'.json',brief)
 await write('knowledge/content/evidence/'+brief.id+'.json',evaluation.evidence)
 await write('knowledge/content/candidates/'+candidate.id+'.json',candidate)
 await write('knowledge/content/topics.json',data.topics)
 await validateKnowledge(await loadKnowledge(base))
 return {...evaluation,brief_id:brief.id,brief,projected_sha256:digest(brief)}
}
const permitted=(p,id,slug,candidate)=>[
 'knowledge/content/briefs/'+id+'.json','knowledge/content/evidence/'+id+'.json',
 'knowledge/content/candidates/'+candidate+'.json','knowledge/content/topics.json',
 'archive/web/public/knowledge/'+slug+'/index.html','archive/web/public/knowledge/index.html','archive/web/public/sitemap.xml'
].includes(p)
export async function waitExactChecks({head,pr,read=(path)=>JSON.parse(gh('api',path)),sleep=pause,maxAttempts=80}) {
 for(let i=0;i<maxAttempts;i++) {
  const current=read('repos/'+repo+'/pulls/'+pr)
  if(current.head.sha!==head||current.state!=='open')throw Error('KNOWLEDGE_EDITOR_PR_HEAD_CHANGED')
  const checks=read('repos/'+repo+'/commits/'+head+'/check-runs?per_page=100').check_runs
  if(checks.some(c=>c.status==='completed'&&!['success','neutral','skipped'].includes(c.conclusion)))throw Error('KNOWLEDGE_EDITOR_REQUIRED_CI_FAILED')
  const required=['build','knowledge','validate','browser']
  const statuses=read('repos/'+repo+'/commits/'+head+'/status').statuses
  const netlify=statuses.find(s=>s.context==='netlify/survival-diary-archive/deploy-preview')
  if(required.every(name=>checks.some(c=>c.name===name&&c.head_sha===head&&c.conclusion==='success'))&&netlify?.state==='success')return
  if(netlify&&['failure','error'].includes(netlify.state))throw Error('KNOWLEDGE_EDITOR_PREVIEW_FAILED')
  await sleep(10000)
 }
 throw Error('KNOWLEDGE_EDITOR_CI_TIMEOUT')
}
async function main() {
 const requestId=process.env.EDITORIAL_REQUEST_ID
 if(!uuid.test(requestId??'')||process.env.GITHUB_REPOSITORY!==repo)throw Error('KNOWLEDGE_EDITOR_REQUEST_INVALID')
 let request=await rpc('archive_worker_knowledge_editor_request',{p_request_id:requestId,p_action:'CLAIM'})
 if(['NOOP','BUSY'].includes(request.status)){console.log(JSON.stringify({status:request.status}));return}
 const update=async(status,result={})=>{
  request=await rpc('archive_worker_knowledge_editor_request',{p_request_id:requestId,p_action:status,p_lease_token:request.lease_token,p_result:result})
  console.log(JSON.stringify({status:request.status,request_id:requestId}))
 }
 try {
  if(request.publish_requested&&request.result?.pr_number&&!request.result?.merge_sha) {
   const previousPr=JSON.parse(gh('api','repos/'+repo+'/pulls/'+request.result.pr_number))
   if(previousPr.merged_at&&previousPr.head?.sha===request.result.prepared_sha)await update('PUBLISHING',{merge_sha:previousPr.merge_commit_sha})
  }
  if(request.publish_requested&&request.result?.merge_sha&&request.result?.prepared_sha) {
   await update('PUBLISHING')
   const live=await releaseReviewed({env:{...process.env,EDITORIAL_REQUEST_ID:requestId,REVIEW_ITEM_ID:requestId,BRIEF_ID:request.result.brief_id,MERGE_SHA:request.result.merge_sha,PREPARED_SHA:request.result.prepared_sha,PR_NUMBER:String(request.result.pr_number)}})
   await update('PUBLISHED',live);return
  }
  const current=JSON.parse(gh('api','repos/'+repo+'/git/ref/heads/main')).object.sha
  git('fetch','origin','main:refs/remotes/origin/main');git('switch','--detach',current)
  const snapshot=request.snapshot, job=snapshot.job
  // Editing an existing public article may replace only its last known public
  // version. Another author's update cannot be overwritten by an older draft.
  if(job.status==='PUBLISHED') {
   const actual=await readFile(join(root,'knowledge/content/briefs/'+snapshot.brief.id+'.json'),'utf8')
   const previous=git('show',job.merge_sha+':knowledge/content/briefs/'+snapshot.brief.id+'.json')
   if(actual.trim()!==previous.trim())throw Error('KNOWLEDGE_EDITOR_PUBLIC_VERSION_CONFLICT')
  }
  const preparation=await prepareEditorialFiles({snapshot})
  if(preparation.issues?.length){await update('FAILED',{issues:preparation.issues});return}
  if(preparation.status==='ALREADY_LIVE') {
   if(!request.publish_requested){await update('CHECKED',{issues:[],reason:'NO_CHANGES'});return}
   const metaResponse=await fetch('https://survival-diary-archive.netlify.app/deploy-meta.json',{cache:'no-store'})
   if(!metaResponse.ok)throw Error('KNOWLEDGE_EDITOR_PUBLIC_READ_FAILED')
   const meta=await metaResponse.json()
   if(meta.context!=='production'||!/^[a-f0-9]{40}$/.test(meta.commit_ref??''))throw Error('KNOWLEDGE_EDITOR_PUBLIC_READ_FAILED')
   const path=await verifyPublicArticle({payload:{merge_sha:meta.commit_ref},brief:preparation.brief})
   await update('PUBLISHING',{reason:'ALREADY_LIVE'})
   await update('PUBLISHED',{status:'LIVE_VERIFIED',merge_sha:meta.commit_ref,public_url:'https://survival-diary-archive.netlify.app'+path,verified_at:new Date().toISOString(),issues:[]});return
  }
  command('npm',['ci'],join(root,'archive/web'))
  command('npm',['run','knowledge:build'],join(root,'archive/web'))
  command('npm',['run','knowledge:test'],join(root,'archive/web'))
  command('npm',['test'],join(root,'archive/web'))
  command('npm',['run','build:verified'],join(root,'archive/web'))
  if(!request.publish_requested){await update('CHECKED',{issues:[],checked_revision:request.revision});return}
  command('node',['archive/scripts/knowledge-human-approved-prepare.mjs','--brief',preparation.brief_id,'--base',current,'--head','HEAD'])
  const brief=JSON.parse(await readFile(join(root,'knowledge/content/briefs/'+preparation.brief_id+'.json'),'utf8'))
  const candidate=(await loadKnowledge(root)).candidates.find(c=>c.brief_id===brief.id)
  const changed=git('status','--porcelain').split(/\r?\n/).filter(Boolean).map(s=>s.slice(3))
  if(!changed.length) {await update('CHECKED',{issues:[],reason:'NO_CHANGES'});return}
  if(changed.some(p=>!permitted(p,brief.id,brief.slug,candidate.id)))throw Error('KNOWLEDGE_EDITOR_SCOPE_VIOLATION')
  const gate=await checkHumanApprovedRelease(await loadKnowledge(root),{changedFiles:changed,briefIds:[brief.id],base:root})
  if(gate.decision!=='HUMAN_APPROVED_ELIGIBLE'||gate.requires_human!==false)throw Error('KNOWLEDGE_EDITOR_RELEASE_GATE')
  const branch='knowledge/worker/editorial-'+requestId+'-'+request.attempt
  git('switch','-c',branch);git('config','user.name','knowledge-human-review-bot');git('config','user.email','knowledge-human-review-bot@users.noreply.github.com')
  git('add','--',...changed)
  const staged=git('diff','--cached','--name-only').split(/\r?\n/).filter(Boolean)
  if(staged.some(p=>!permitted(p,brief.id,brief.slug,candidate.id)))throw Error('KNOWLEDGE_EDITOR_SCOPE_VIOLATION')
  git('commit','-m','knowledge: prepare '+brief.id+' human-approved publication')
  const head=git('rev-parse','HEAD')
  if(JSON.parse(gh('api','repos/'+repo+'/git/ref/heads/main')).object.sha!==current)throw Error('KNOWLEDGE_EDITOR_MAIN_MOVED')
  git('push','origin','HEAD:refs/heads/'+branch)
  const body='<!-- knowledge-worker-phase-v1:PUBLICATION_HANDOFF -->\n\nOperator requested this exact saved revision. Editorial request: '+requestId+'; revision: '+request.revision+'; draft digest: '+request.draft_sha256+'. Original source and approval history are preserved. Required CI and public verification remain mandatory.'
  const created=JSON.parse(gh('api','--method','POST','repos/'+repo+'/pulls','-f','title=knowledge: prepare '+brief.id+' human-approved publication','-f','head='+branch,'-f','base=main','-f','body='+body))
  await update('WAITING_CI',{pr_number:created.number,prepared_sha:head,validated_main_sha:current,brief_id:brief.id,slug:brief.slug,projected_sha256:preparation.projected_sha256,issues:[]})
  await waitExactChecks({head,pr:created.number})
  if(JSON.parse(gh('api','repos/'+repo+'/git/ref/heads/main')).object.sha!==current)throw Error('KNOWLEDGE_EDITOR_MAIN_MOVED')
  const pr=JSON.parse(gh('api','repos/'+repo+'/pulls/'+created.number))
  if(pr.head.sha!==head||pr.base.ref!=='main')throw Error('KNOWLEDGE_EDITOR_PR_HEAD_CHANGED')
  await update('WAITING_CI')
  const merged=JSON.parse(gh('api','--method','PUT','repos/'+repo+'/pulls/'+created.number+'/merge','-f','merge_method=squash','-f','sha='+head))
  if(!merged.merged)throw Error('KNOWLEDGE_EDITOR_MERGE_FAILED')
  await update('PUBLISHING',{merge_sha:merged.sha})
  const live=await releaseReviewed({env:{...process.env,EDITORIAL_REQUEST_ID:requestId,REVIEW_ITEM_ID:requestId,BRIEF_ID:brief.id,MERGE_SHA:merged.sha,PREPARED_SHA:head,PR_NUMBER:String(created.number)}})
  await update('PUBLISHED',live)
 } catch(error) {
  const message=/^[A-Z][A-Z0-9_:]{4,150}$/.test(error.message)?error.message:'KNOWLEDGE_EDITOR_VALIDATION_FAILED'
  await update(message.includes('MAIN_MOVED')?'RETRYABLE':'FAILED',{reason:message})
  throw Error(message)
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1})
