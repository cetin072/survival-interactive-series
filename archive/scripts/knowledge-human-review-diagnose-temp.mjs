// One-time read-only K-015 diagnostic. GHA temporary checkout only.
// To be removed before main merge. Never call publication/decision/merge RPCs.
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { postSupabaseRpc, applySemanticPackage } from './lib/knowledge-semantic-jobs.mjs'
import { validateApprovedPackage } from './knowledge-review-revalidate.mjs'
import { verifyPins } from './knowledge-semantic-finalize.mjs'
import { loadKnowledge, validateKnowledge } from './lib/knowledge-content.mjs'
import { applyApprovedOperatorDraft } from './knowledge-operator-draft-apply.mjs'

const projectUrl=process.env.ARCHIVE_SUPABASE_URL, serviceRoleKey=process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
let stage='FETCH'
try {
  if (process.env.GITHUB_REF!=='refs/heads/fix/knowledge-immediate-human-approval-20261021') throw Error('DIAGNOSTIC_BRANCH_REQUIRED')
  const itemId='263d256d-2cf8-45cf-82fb-98aab2e52d12',date='2026-10-21T11:09:28.614861+00:00'
  const p=await postSupabaseRpc({projectUrl,serviceRoleKey,name:'archive_knowledge_review_package',args:{p_item_id:itemId,p_decided_at:date}})
  if(p.status!=='C3'||p.job?.job_id!=='c8da8c82-c60c-4dd9-9556-b3f0d08c9507')throw Error('DIAGNOSTIC_PACKAGE_CHANGED')
  const j=p.job,r=p.review,head=process.env.GITHUB_SHA
  const check={status:'REVALIDATE_PACKAGE',item_id:itemId,decided_at:date,brief_id:'K-015',
    approved_head_sha:r.payload.head_sha,expected_head_sha:r.payload.head_sha,
    pr_number:j.final_pr_number,head_ref:j.final_head_ref,current_main:head,
    c3_job_id:j.job_id,semantic_result_sha256:j.semantic_result_sha256,
    source_sha256:j.source_sha256,policy_sha256:j.policy_sha256,
    operator_job_id:r.payload.operator_job_id,operator_draft_revision:r.payload.operator_draft_revision,
    operator_draft_sha256:r.payload.operator_draft_sha256}
  stage='IDENTITY'
  validateApprovedPackage(check,p)
  stage='PIN'
  const base=resolve(import.meta.dirname,'../..')
  await verifyPins(j,base)
  stage='BASE_KNOWLEDGE'
  const data=await loadKnowledge(base)
  await validateKnowledge(data)
  if(data.briefs.some(x=>x.id==='K-015'))throw Error('DIAGNOSTIC_BRIEF_ALREADY_EXISTS')
  stage='APPLY_SEMANTIC'
  await applySemanticPackage({root:base,job:j,result:j.semantic_result,now:new Date(j.submitted_at??j.prepared_at).toISOString()})
  stage='APPLY_SAVED_DRAFT'
  await applyApprovedOperatorDraft({projectUrl,serviceRoleKey,jobId:j.job_id,
    revision:r.payload.operator_draft_revision,draftSha256:r.payload.operator_draft_sha256,briefId:'K-015',base})
  const run=(cmd,args,cwd=base)=>execFileSync(cmd,args,{cwd,stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:120000})
  const web=join(base,'archive/web')
  stage='NPM_CI'; run('npm',['ci'],web)
  stage='KNOWLEDGE_BUILD'; run('npm',['run','knowledge:build'],web)
  stage='KNOWLEDGE_TEST'; run('npm',['run','knowledge:test'],web)
  stage='KNOWLEDGE_CHECK'; run('npm',['run','knowledge:check'],web)
  stage='PUBLISH_PREPARE'; run('node',['archive/scripts/knowledge-human-approved-prepare.mjs','--brief','K-015',
    '--base','HEAD','--head','HEAD','--date','2026-10-21'],base)
  stage='WEB_TEST';run('npm',['test'],web)
  stage='WEB_BUILD';run('npm',['run','build'],web)
  stage='RELEASE_GATE';run('node',['archive/scripts/knowledge-human-approved-release-check.mjs',
    '--brief','K-015','--base','HEAD','--head','HEAD'],base)
  console.log(JSON.stringify({diagnostic:'PASS_ALL_LOCAL_STAGES'}))
} catch (e) {
  const msg=String(e?.message??'UNKNOWN')
  const reason=/^[A-Z][A-Z0-9_:.-]{3,150}$/.test(msg)?msg:'SANITIZED_EXCEPTION'
  console.log(JSON.stringify({diagnostic:'FAIL',stage,reason}))
  process.exitCode=1
}
