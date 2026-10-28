import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
export const legacyBriefIds=Object.freeze(['K-002','K-003','K-007','K-008','K-009','K-010'])
const sha=text=>createHash('sha256').update(text).digest('hex')
const git=(base,...args)=>execFileSync('git',args,{cwd:base,encoding:'utf8',stdio:['ignore','pipe','pipe']})
export function collectLegacySource(base,commit,id) {
 if(!/^[a-f0-9]{40}$/.test(commit)||!legacyBriefIds.includes(id))throw Error('KNOWLEDGE_EDITOR_LEGACY_IDENTITY_INVALID')
 const brief_text=git(base,'show',commit+':knowledge/content/briefs/'+id+'.json')
 const evidence_text=git(base,'show',commit+':knowledge/content/evidence/'+id+'.json')
 const brief=JSON.parse(brief_text),evidence=JSON.parse(evidence_text)
 if(brief.id!==id||brief.status!=='PUBLISHED'||evidence.brief_id!==id||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(brief.slug))throw Error('KNOWLEDGE_EDITOR_LEGACY_IDENTITY_INVALID')
 return {kind:'LEGACY_PUBLIC',commit_sha:commit,brief_id:id,slug:brief.slug,brief_sha256:sha(brief_text),evidence_sha256:sha(evidence_text),brief_text,evidence_text}
}
export function legacyOrigin(source) {
 return Object.fromEntries(['kind','commit_sha','brief_id','slug','brief_sha256','evidence_sha256'].map(k=>[k,source[k]]))
}
export function verifyLegacyOrigin(origin,base,brief) {
 const source=collectLegacySource(base,origin?.commit_sha,origin?.brief_id)
 git(base,'merge-base','--is-ancestor',origin.commit_sha,'HEAD')
 if(JSON.stringify(legacyOrigin(source))!==JSON.stringify(legacyOrigin(origin))||brief.id!==source.brief_id||brief.slug!==source.slug)throw Error('KNOWLEDGE_EDITOR_LEGACY_SOURCE_CHANGED')
 return source
}
export function verifyLegacySnapshot(snapshot,base) {
 if(snapshot.job||!snapshot.document_id)throw Error('KNOWLEDGE_EDITOR_LEGACY_IDENTITY_INVALID')
 const source=verifyLegacyOrigin(snapshot.legacy_source,base,snapshot.brief)
 if(source.brief_text!==snapshot.legacy_source.brief_text||source.evidence_text!==snapshot.legacy_source.evidence_text)throw Error('KNOWLEDGE_EDITOR_LEGACY_SOURCE_CHANGED')
 return source
}
