/** Versioned Program router. C03 owns its unchanged V1 publisher; historical
 * review owns a separate additive DB ledger and never publishes in this phase. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { prepareNativeJob, consumeNativeJob, rpc } from './a-wiki-native-control.mjs'
import { loadWikiReviewSources } from './lib/wiki-review-sources.mjs'
import { byteHash, graphHash } from './lib/publication-graph.mjs'
import { enqueueReviewWork, emptyReviewLedger, verifyReviewScope,
  submitReviewExtraction, submitIndependentReview } from './lib/wiki-continuous-review.mjs'

const root = resolve(import.meta.dirname, '../..')
const insist = (ok, code) => { if (!ok) throw new Error(code) }
const pilotRef = 'docs/automation/evidence/A_WIKI_CONTINUOUS_LOCAL_E2E_20261016.json'
const activePhases = ['EXTRACTOR_READY', 'EXTRACTOR_SUBMITTED', 'REVIEW_READY', 'REVIEW_SUBMITTED']
const same = (a,b) => graphHash(a) === graphHash(b)
export function choosePendingReview(scopes, rows) {
  const seen = new Set(rows.map(r => r.scope_sha256))
  const last = id => rows.filter(r => r.chronicle_id === id).map(r => r.created_at).sort().at(-1) ?? ''
  const count = id => rows.filter(r => r.chronicle_id === id).length
  return scopes.filter(s => !seen.has(s.scope_sha256)).sort((a,b) => last(a.chronicle_id).localeCompare(last(b.chronicle_id))
    || count(a.chronicle_id)-count(b.chronicle_id) || a.chronicle_id.localeCompare(b.chronicle_id)
    || a.source_id.localeCompare(b.source_id))[0] ?? null
}
function queueScope(scope, at) {
  return enqueueReviewWork({ scopes:[scope], new_source:null }, emptyReviewLedger(), at)
}
export async function prepareContinuousJob({ requestRpc=rpc, base=root, discover=loadWikiReviewSources,
  legacyPrepare=prepareNativeJob, pilot=false, codeBase=root,
  mainSha=execFileSync('git',['rev-parse','HEAD'],{cwd:base,encoding:'utf8'}).trim(),
}={}) {
  // Never let a historical re-review preempt an actionable new C03 public source.
  const legacy = await legacyPrepare({ requestRpc, base })
  if (!['NO_JOB','HUMAN_REVIEW','REJECT'].includes(legacy.status)) return {route:'C03_V1',...legacy}
  const discovery = await discover(base)
  insist(!discovery.new_source || ['HUMAN_REVIEW','REJECT'].includes(legacy.status), 'A_WIKI_ROUTER_NEW_SOURCE_RACE')
  const snapshot = await requestRpc('archive_a_wiki_review_snapshot', {})
  let active = snapshot.active_job
  if (active) {
    const current = discovery.scopes.find(s => s.chronicle_id===active.chronicle_id && s.source_id===active.source_id)
    if (!current || current.scope_sha256!==active.scope_sha256 || !same(current,active.prepared_job.scope)) {
      const retired = await requestRpc('archive_a_wiki_review_advance', {p_job_id:active.job_id,p_expected_status:active.status,
        p_status:'SUPERSEDED',p_package:{reason:'SOURCE_OR_WIKI_CHANGED_FRESH_REVIEW_REQUIRED'}})
      insist(retired.status==='SUPERSEDED','A_WIKI_REVIEW_SUPERSESSION_FAILED'); active=null
    }
  }
  const selected = active ? null : choosePendingReview(discovery.scopes,snapshot.jobs)
  let pilotEvidence=null, pilotBytes=null
  if (pilot) {
    pilotBytes=await readFile(resolve(codeBase,pilotRef)); pilotEvidence=JSON.parse(pilotBytes)
    const s=discovery.scopes.find(s=>s.source_id===pilotEvidence.source_id && s.chronicle_id==='C01-HAN-JUNHO')
    insist(s && s.scope_sha256===pilotEvidence.scope_sha256 && s.source_sha256===pilotEvidence.source_sha256,
      'A_WIKI_PILOT_SOURCE_CHANGED')
    // Revalidate the old extraction/proposal, but NEVER import its old APPROVE.
    const q=queueScope(s,'2026-10-16T00:00:00.000Z')
    const e=submitReviewExtraction(q.ledger,q.job.job_id,s,pilotEvidence.result,pilotEvidence.extractor_execution_id,'2026-10-16T00:00:01.000Z').events.at(-1)
    insist(e.proposal_sha256===pilotEvidence.proposal_sha256 && same(e.proposal,pilotEvidence.proposal), 'A_WIKI_PILOT_PROPOSAL_CHANGED')
    insist(!active || active.job_id===q.job.job_id,'A_WIKI_PILOT_OTHER_JOB_ACTIVE')
    if (!active && snapshot.jobs.some(r=>r.job_id===q.job.job_id)) return {status:'EXISTING_JOB',job_id:q.job.job_id}
    if (!active) {
      const created=await requestRpc('archive_a_wiki_review_prepare',{p_job:q.job,p_main_sha:mainSha,
        p_origin_evidence:{kind:'REVALIDATED_LOCAL_EXTRACTION',ref:pilotRef,sha256:byteHash(pilotBytes),prior_review_imported:false}})
      insist(created.status==='EXTRACTOR_READY','A_WIKI_PILOT_PREPARE_FAILED')
      active={...created,prepared_job:q.job,status:created.status}
    }
    if(active.status==='EXTRACTOR_READY') {
      const submitted=await requestRpc('archive_a_wiki_review_submit',{p_job_id:active.job_id,p_expected_phase:'EXTRACTOR_READY',
        p_binding_sha256:active.binding_sha256,p_result:pilotEvidence.result,p_execution_id:pilotEvidence.extractor_execution_id})
      insist(['ACCEPTED','ALREADY_SUBMITTED'].includes(submitted.status),'A_WIKI_PILOT_EXTRACTION_SUBMIT_FAILED')
      active.status='EXTRACTOR_SUBMITTED'
    }
  } else if (selected) {
    const q=queueScope(selected,new Date().toISOString())
    const created=await requestRpc('archive_a_wiki_review_prepare',{p_job:q.job,p_main_sha:mainSha,p_origin_evidence:null})
    insist(['EXTRACTOR_READY','EXISTING_JOB','ACTIVE_JOB_EXISTS'].includes(created.status),'A_WIKI_REVIEW_PREPARE_FAILED')
    active={...created}
  }
  await requestRpc('archive_a_wiki_review_scan',{p_main_sha:mainSha,p_scope_count:discovery.scopes.length,
    p_next_status:active?'EXISTING_JOB':selected?'JOB_AVAILABLE':'NO_JOB'})
  return {route:'CONTINUOUS_REVIEW_V1',status:active?.status??'NO_JOB',job_id:active?.job_id??null,
    scope_count:discovery.scopes.length,prior_review_imported:false}
}

export async function consumeContinuousJob({requestRpc=rpc,base=root,discover=loadWikiReviewSources,
  legacyConsume=consumeNativeJob,includeLegacy=true}={}) {
  if(includeLegacy) {
    const old=await legacyConsume({requestRpc})
    if(old.status!=='NO_PROGRAM_JOB') return {route:'C03_V1',...old}
  }
  const snapshot=await requestRpc('archive_a_wiki_review_snapshot',{})
  const row=snapshot.active_job
  if(!row || !['EXTRACTOR_SUBMITTED','REVIEW_SUBMITTED'].includes(row.status)) return {status:'NO_PROGRAM_JOB'}
  const change=(status,payload)=>requestRpc('archive_a_wiki_review_advance',{p_job_id:row.job_id,p_expected_status:row.status,p_status:status,p_package:payload})
  const discovery=await discover(base)
  const scope=discovery.scopes.find(s=>s.chronicle_id===row.chronicle_id && s.source_id===row.source_id)
  if(!scope || scope.scope_sha256!==row.scope_sha256 || !same(scope,row.prepared_job.scope)) {
    return change('SUPERSEDED',{reason:'SOURCE_OR_WIKI_CHANGED_FRESH_REVIEW_REQUIRED'})
  }
  try {
    verifyReviewScope(scope)
    const q=queueScope(scope,row.created_at)
    insist(same(q.job,row.prepared_job),'A_WIKI_REVIEW_PREPARED_CHANGED')
    const extracted=submitReviewExtraction(q.ledger,row.job_id,scope,row.extractor_result,row.extractor_execution_id,row.extractor_submitted_at)
    const e=extracted.events.at(-1)
    if(row.status==='EXTRACTOR_SUBMITTED') {
      const reviewJob={version:'wiki-continuous-review-job-v1',job:row.prepared_job,proposal:e.proposal,proposal_sha256:e.proposal_sha256}
      return change('REVIEW_READY',{proposal:e.proposal,proposal_sha256:e.proposal_sha256,review_job:reviewJob})
    }
    insist(row.proposal_sha256===e.proposal_sha256 && same(row.proposal,e.proposal),'A_WIKI_REVIEW_PROPOSAL_CHANGED')
    const final=submitIndependentReview(extracted,row.job_id,scope,row.review_result,row.reviewer_execution_id,row.review_submitted_at).events.at(-1)
    return change(final.status,final)
  } catch(error) {
    return change('BLOCKED',{reason:/^(WIKI|A_WIKI)_[A-Z0-9_]+$/.test(error.message)?error.message:'A_WIKI_REVIEW_VALIDATION_FAILED'})
  }
}

export async function runRouter(args=process.argv.slice(2)) {
  insist(args.length===1 && ['prepare','consume','pilot','continuous-consume'].includes(args[0]),'A_WIKI_ROUTER_USAGE')
  const base=resolve(process.env.A_WIKI_SOURCE_ROOT??root)
  if(args[0]==='prepare'||args[0]==='pilot') return prepareContinuousJob({base,pilot:args[0]==='pilot'})
  return consumeContinuousJob({base,includeLegacy:args[0]==='consume'})
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runRouter().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1})
}
