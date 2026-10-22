import type { KnowledgeDraftBrief } from './KnowledgeDraftEditor'
export type EditorialClaim = { claim: string; source_ids: string[]; context: string; limitation: string }
export type EditorialResolution = { key: string; method: string; quote: string; reason: string; source_ids: string[] }
export type EditorialReview = { claims: EditorialClaim[]; resolutions: EditorialResolution[]; rights?: Array<{ source_id: string; url: string; quote: string }> }
export type EditorialIssue = {key:string; reason:string; kind:string; quote?:string}
export type EditorialRequest = {request_id:string; revision:number; publish_requested:boolean; status:string; updated_at:string; result?:{reason?:string;issues?:Array<{key:string;message:string;action?:string}>;public_url?:string;merge_sha?:string}}
export type EditorialEnvelope = {job_id:string;revision:number;draft_sha256?:string;brief:KnowledgeDraftBrief|null;original?:Record<string, unknown>;context?:Record<string, unknown>;archived:boolean;evidence_review:EditorialReview;status:string;blocker_code?:string;updated_at?:string;request?:EditorialRequest|null;public_record?:EditorialRequest|null;history:Array<{revision:number;draft_sha256:string;created_at:string}>;source_ref?:string;brief_id:string}
export const publicationActive = (r?:EditorialRequest|null) => !!r && ['QUEUED','CHECKING','WAITING_CI','PUBLISHING'].includes(r.status)
export function editorialStatus(value:EditorialEnvelope):string {
 const r=value.request
 if(value.public_record && value.revision<=value.public_record.revision)return '게시됨'
 if(r?.publish_requested && r.status==='PUBLISHED')return '게시됨'
 if(r?.status==='PUBLISHING')return '게시 중'
 if(publicationActive(r))return '검사 중'
 if(r && ['FAILED','RETRYABLE'].includes(r.status))return '수정 필요'
 if(value.archived)return '보관함'
 return value.status==='PUBLISHED'?'게시됨':'검토할 글'
}
export function editorialError(code?:string):string {
 if(!code)return ''
 if(/REVISION_CONFLICT|PUBLIC_VERSION_CONFLICT/.test(code))return '다른 수정본이 먼저 반영됐습니다. 입력 내용은 보존했습니다. 최신 저장본과 비교한 뒤 다시 저장하세요.'
 if(/SOURCE|PIN|PROVENANCE/.test(code))return '원본 자료의 접근 또는 연결을 확인하지 못했습니다. 원고는 보존했습니다. 출처 진단을 다시 시도하거나 원본 연결을 확인하세요.'
 if(/RELEASE_GATE|VALIDATION|EDITORIAL_CONTRACT/.test(code))return '본문·근거 검사에 통과하지 못했습니다. 빠진 항목과 적용 범위를 확인하고 다시 검사하세요.'
 if(/CI|PREVIEW/.test(code))return '게시 전 사이트 검사가 완료되지 않았습니다. 수정본은 보존했습니다. 다시 시도하면 같은 승인 내용으로 재검사합니다.'
 if(/MAIN_MOVED/.test(code))return '사이트의 다른 변경이 먼저 반영됐습니다. 다시 시도하면 최신 사이트 기준으로 검사합니다.'
 if(/RESERVED_ID|CANDIDATE_COLLISION/.test(code))return '과거 원고의 번호가 다른 글에 사용됐습니다. 기존 글을 덮어쓰지 않도록 새 원고 식별자를 준비해야 합니다.'
 if(/ACTIVE/.test(code))return '이 수정본을 처리 중입니다. 진행 결과를 확인한 뒤 다시 편집할 수 있습니다.'
 if(/DISPATCH/.test(code))return '게시 검사 요청을 전달하지 못했습니다. 수정본은 저장돼 있습니다. 다시 시도하세요.'
 return '처리를 완료하지 못했습니다. 수정 내용은 보존했습니다. 다시 시도하거나 기술 정보의 오류 내용을 확인하세요.'
}
export async function editorialIssues(original?:Record<string,unknown>):Promise<EditorialIssue[]> {
 const evidence=(original?.evidence??{}) as Record<string,unknown>
 const issues:EditorialIssue[]=[]
 for(const kind of ['unknowns','conflicts'])for(const value of (Array.isArray(evidence[kind])?evidence[kind]:[])) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))
  const key=kind+':'+Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24)
  issues.push({key,kind,reason:typeof value==='string'?value:JSON.stringify(value),quote:typeof value?.quote==='string'?value.quote:undefined})
 }
 return issues
}
export function editorialTemplate(value:EditorialEnvelope):KnowledgeDraftBrief {
 const today=new Date().toISOString().slice(0,10)
 return {id:value.brief_id,slug:'knowledge-'+value.brief_id.toLowerCase(),topic_id:'community-emergency-resource-management',content_type:'BRIEF',title:'',summary:'',meta_description:'',lead:'',label:'생존 지식',scope:'',basis:'',footer:'',editorial_note:'운영자가 보관된 글감에서 작성한 새 초안. 아직 검토·공개되지 않았습니다.',sections:[{heading:'',blocks:[{type:'prose',text:''}]}],sources:[],risk_level:'HIGH',risk_domains:['OTHER_SEVERE_HARM'],publication_policy:'HUMAN_APPROVED',semantic_qa_status:'REVIEW',status:'READY',source_checked_at:today,updated_at:today,published_at:null,ai_assisted:false,story_refs:[],related_brief_ids:[],tools:[],guide_id:null}
}
export function quoteLocations(brief:KnowledgeDraftBrief,quote:string):number {
 if(!quote.trim())return 0
 return [brief.title,brief.summary,brief.lead,brief.scope,brief.basis,brief.footer,...brief.sections.flatMap(s=>s.blocks.flatMap(b=>'text' in b?[b.text]:'items' in b?b.items:[]))].filter(v=>String(v).includes(quote)).length
}

// Lossless structural projection for old drafts; callers keep the raw original.
export function readableBrief(raw:KnowledgeDraftBrief):KnowledgeDraftBrief {
 const brief=JSON.parse(JSON.stringify(raw)) as KnowledgeDraftBrief
 brief.sections=(Array.isArray(brief.sections)?brief.sections:[]).map(section=>{
  const old=section as unknown as {body?:string;blocks?:unknown[];heading:string}
  const blocks=Array.isArray(old.blocks)?old.blocks:typeof old.body==='string'?[{type:'prose',text:old.body}]:[]
  return {heading:old.heading??'',blocks:blocks.map(b=>{const block=b as Record<string,unknown>;if(block.type==='table'&&!Array.isArray(block.headers)&&Array.isArray(block.columns))return {...block,headers:block.columns};return block})} as KnowledgeDraftBrief['sections'][number]
 })
 brief.sources=Array.isArray(brief.sources)?brief.sources:[]
 return brief
}
