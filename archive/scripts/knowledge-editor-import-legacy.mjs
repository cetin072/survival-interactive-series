// Read-only manifest by default. Registration is an explicit service-only action,
// never a semantic submission, approval, publication or migration application.
import {resolve} from 'node:path'
import {collectLegacySource,legacyBriefIds} from './lib/knowledge-legacy-source.mjs'
import {postSupabaseRpc} from './lib/knowledge-semantic-jobs.mjs'
import {verifyPublicArticle} from './knowledge-human-reviewed-release.mjs'
const args=process.argv.slice(2), commit=args[args.indexOf('--commit')+1]
if(!args.includes('--commit')||args.some((arg,i)=>arg!=='--commit'&&arg!=='--apply'&&args[i-1]!=='--commit'))throw Error('Usage: knowledge-editor-import-legacy.mjs --commit SHA [--apply]')
const base=resolve(import.meta.dirname,'../..'),sources=legacyBriefIds.map(id=>collectLegacySource(base,commit,id))
if(args.includes('--apply')) {
 const meta=await fetch('https://survival-diary-archive.netlify.app/deploy-meta.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('KNOWLEDGE_EDITOR_PUBLIC_READ_FAILED');return r.json()})
 if(meta.context!=='production'||meta.commit_ref!==commit)throw Error('KNOWLEDGE_EDITOR_PUBLIC_VERSION_CONFLICT')
 // Validate all six before the first registration. Retries are idempotent and
 // reject a different snapshot; no imports are overwritten on partial failure.
 for(const source of sources)await verifyPublicArticle({payload:{merge_sha:commit},brief:JSON.parse(source.brief_text)})
 for(const source of sources) {
  const id=await postSupabaseRpc({projectUrl:process.env.ARCHIVE_SUPABASE_URL,serviceRoleKey:process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY,name:'archive_worker_knowledge_editor_import_legacy',args:{p_source:source}})
  console.log(JSON.stringify({brief_id:source.brief_id,document_id:id,status:'REGISTERED_NOT_APPROVED'}))
 }
} else console.log(JSON.stringify(sources,null,2))
