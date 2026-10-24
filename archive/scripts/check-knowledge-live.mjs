// Read-only Production observation. Uses the served commit, never current main,
// as the body baseline. No Auth, DB credentials, release hook or mutation.
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {verifyPublicArticle} from './knowledge-human-reviewed-release.mjs'
const origin='https://survival-diary-archive.netlify.app'
const read=async url=>fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)})
const response=await read(origin+'/deploy-meta.json')
if(response.status!==200)throw Error('LIVE_META_HTTP_'+response.status)
const meta=await response.json()
if(meta.context!=='production'||!/^[a-f0-9]{40}$/.test(meta.commit_ref??''))throw Error('LIVE_META_INVALID')
const results=[]
for(const id of ['K-015','K-040','K-041','K-045','K-046']) {
 const baseline=await read('https://raw.githubusercontent.com/cetin072/survival-interactive-series/'+meta.commit_ref+'/knowledge/content/briefs/'+id+'.json')
 if(baseline.status===404){results.push({id,status:'NOT_IN_PRODUCTION_SNAPSHOT'});continue}
 if(baseline.status!==200)throw Error('LIVE_BASELINE_HTTP_'+baseline.status)
 const brief=await baseline.json()
 if(brief.id!==id)throw Error('LIVE_BASELINE_ID_MISMATCH')
 if(brief.status!=='PUBLISHED'){results.push({id,status:'NOT_PUBLISHED_IN_PRODUCTION_SNAPSHOT'});continue}
 const path=await verifyPublicArticle({payload:{merge_sha:meta.commit_ref},brief,fetcher:read})
 results.push({id,status:'LIVE_VERIFIED',http:200,url:origin+path})
}
const finalResponse=await read(origin+'/deploy-meta.json')
if(finalResponse.status!==200||(await finalResponse.json()).commit_ref!==meta.commit_ref)throw Error('LIVE_DEPLOY_CHANGED_DURING_CHECK')
const report={mode:'READ_ONLY_PRODUCTION',production_sha:meta.commit_ref,checked_at:new Date().toISOString(),results}
if(process.argv[2]){const directory=resolve(process.argv[2]);await mkdir(directory,{recursive:true});await writeFile(join(directory,'knowledge-live.json'),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify(report))
