import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {collectLegacySource,legacyBriefIds,legacyOrigin,verifyLegacySnapshot} from './knowledge-legacy-source.mjs'
import {evaluateEditorialSnapshot} from './knowledge-editor-review.mjs'
import {prepareEditorialFiles,publicBaselineSha,verifyEditorialPublicBaseline} from '../knowledge-editor-request.mjs'
import {checkHumanApprovedRelease} from './knowledge-release.mjs'
import {loadKnowledge} from './knowledge-content.mjs'
const root=resolve(import.meta.dirname,'../../..')
const git=(base,...args)=>execFileSync('git',args,{cwd:base,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
const commit=git(root,'rev-parse','HEAD')
const snapshot=id=>{const source=collectLegacySource(root,commit,id),brief=JSON.parse(source.brief_text),evidence=JSON.parse(source.evidence_text);return {document_id:'11111111-1111-4111-8111-111111111111',legacy_source:source,brief,review:{claims:evidence.claims,resolutions:[]}}}
test('six exact public snapshots bind original bytes without semantic jobs or invented Candidates',()=>{
 for(const id of legacyBriefIds){const s=snapshot(id);assert.equal(verifyLegacySnapshot(s,root).brief_id,id);assert.equal(publicBaselineSha(s),commit);assert.equal(s.job,undefined)}
 assert.throws(()=>collectLegacySource(root,commit,'K-004'),/IDENTITY_INVALID/)
 const s=snapshot('K-002');s.legacy_source.brief_text+=' ';assert.throws(()=>verifyLegacySnapshot(s,root),/SOURCE_CHANGED/)
 const forged=snapshot('K-003');forged.job={job_id:'fake'};assert.throws(()=>verifyLegacySnapshot(forged,root),/IDENTITY_INVALID/)
})
test('old public exceptions are not current rights clearance, approval or provenance of new claims',()=>{
 const s=snapshot('K-002');const result=evaluateEditorialSnapshot(s,{sourceVerified:true})
 assert.ok(result.issues.some(i=>i.key==='rights'))
 assert.equal(JSON.parse(s.legacy_source.evidence_text).story_source_status,'UNVERIFIED_NO_LINK')
 assert.equal(result.evidence.story_source_status,'LEGACY_PUBLIC_SNAPSHOT')
 assert.equal(result.evidence.editorial_review.original_result_sha256,undefined)
 assert.deepEqual(result.evidence.legacy_origin,legacyOrigin(s.legacy_source))
 s.brief.lead='직접 220 V 작업을 합니다.'
 assert.ok(evaluateEditorialSnapshot(s,{sourceVerified:true,rightsVerified:true}).issues.some(i=>i.key==='safety-specific'))
})
test('legacy worker projects only rechecked edits in isolation, keeps Candidates unchanged and fails closed on unresolved claims',async()=>{
 const base=await mkdtemp(join(tmpdir(),'knowledge-legacy-worker-'))
 try {
  git(root,'clone','--shared','--quiet',root,base)
  const baseline=snapshot('K-002'), evidencePath=join(base,'knowledge/content/evidence/K-002.json')
  await verifyEditorialPublicBaseline(baseline,base)
  const evidenceBytes=await readFile(evidencePath,'utf8')
  await writeFile(evidencePath,evidenceBytes.replace('CLEAR','UNREVIEWED'))
  await assert.rejects(verifyEditorialPublicBaseline(baseline,base),/PUBLIC_VERSION_CONFLICT/)
  await writeFile(evidencePath,evidenceBytes)
  for(const id of legacyBriefIds) {
   const s=snapshot(id),before=git(base,'diff','--','knowledge/content/candidates')
   s.brief.summary+=' 격리 검증용 수정입니다.'
   const r=await prepareEditorialFiles({snapshot:s,base,rightsVerifier:async()=>true,sourceVerifier:async()=>assert.fail('legacy is not a semantic job')})
   if(id==='K-008'){assert.ok(r.issues.some(i=>i.key==='claim:4'));continue}
   assert.deepEqual(r.issues,[]);assert.equal(r.candidate_id,null)
   assert.equal(git(base,'diff','--','knowledge/content/candidates'),before)
   const data=await loadKnowledge(base),pack=data.evidence.get(id)
   const gate=await checkHumanApprovedRelease(data,{base,briefIds:[id],changedFiles:['knowledge/content/briefs/'+id+'.json','knowledge/content/evidence/'+id+'.json']})
   assert.equal(gate.decision,'HUMAN_APPROVED_ELIGIBLE',JSON.stringify(gate.reasons))
   pack.legacy_origin.brief_sha256='0'.repeat(64)
   const denied=await checkHumanApprovedRelease(data,{base,briefIds:[id],changedFiles:['knowledge/content/briefs/'+id+'.json']})
   assert.ok(denied.reasons.includes('LEGACY_SOURCE_NOT_VERIFIED:'+id))
   assert.equal(await readFile(join(root,'knowledge/content/briefs/'+id+'.json'),'utf8'),s.legacy_source.brief_text)
  }
 } finally {await rm(base,{recursive:true,force:true})}
})
