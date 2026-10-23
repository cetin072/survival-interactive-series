// Editorial revalidation evaluates the exact working copy. Original Evidence is
// retained separately; human judgments are attributed, never labelled AI findings.
import { createHash } from 'node:crypto'
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string' && value.trim().length > 0
export const issueKey = (kind, value) => kind + ':' + hash(value).slice(0, 24)
export function manuscriptText(brief) {
  return [brief.title,brief.summary,brief.meta_description,brief.lead,brief.label,brief.scope,brief.basis,brief.footer,brief.editorial_note,
    ...(brief.sources??[]).flatMap(s=>[s.title,s.note,s.url]),
    ...(brief.tools??[]).flatMap(t=>typeof t==='string'?[t]:[t.title,t.description,t.label]),
    ...(brief.sections ?? []).flatMap(s => [s.heading,...(s.blocks ?? []).flatMap(b =>
      [b.text,b.alt,b.caption,b.title,...(b.items ?? []),...(b.headers ?? []),...(b.rows ?? []).flat()])])].filter(text).join('\n')
}
// Anchors are exact quotes plus field identity, never keyword-ranked paragraphs.
// Ambiguous/deleted/moved quotes are not silently attached to a different paragraph.
export function locateQuote(brief, quote) {
  if (!text(quote)) return {kind:'GLOBAL'}
  const locations=[]
  for (const f of ['title','summary','lead','scope','basis','footer']) for(let i=0;i<String(brief[f]??'').split(quote).length-1;i++)locations.push({field:f})
  brief.sections?.forEach((s,si)=>s.blocks?.forEach((b,bi)=>{
    if (typeof b.text==='string') for(let i=0;i<b.text.split(quote).length-1;i++)locations.push({section:si,block:bi})
    b.items?.forEach((v,ii)=>{for(let i=0;i<v.split(quote).length-1;i++)locations.push({section:si,block:bi,item:ii})})
  }))
  return locations.length===1 ? {kind:'EXACT',...locations[0]} : {kind:locations.length?'AMBIGUOUS':'MISSING'}
}
export function reviewIssues(original, brief, review={}) {
  const evidence=original?.evidence??{}
  return ['unknowns','conflicts'].flatMap(kind=>(Array.isArray(evidence[kind])?evidence[kind]:[]).map(value=>{
    const key=issueKey(kind,value), resolution=review.resolutions?.find(r=>r.key===key)
    return {key,kind,reason:typeof value==='string'?value:JSON.stringify(value),resolution,
      location:locateQuote(brief,plain(value)?value.quote:resolution?.quote),
      location_label:'글 전체의 적용 범위 확인'}
  }))
}
const official = url => {
  try {const u=new URL(url); return u.protocol==='https:' && !u.username && !u.password && (u.hostname.endsWith('.gov')||u.hostname.endsWith('.go.kr')||u.hostname.endsWith('.gov.kr')||u.hostname==='who.int'||u.hostname.endsWith('.who.int'))}catch{return false}
}
export function evaluateEditorialSnapshot(snapshot, { sourceVerified = false, rightsVerified = false } = {}) {
  const {brief,review={},job}=snapshot, original=job?.semantic_result??{}, ev=original.evidence??{}
  const issues=[], add=(key,message,action='본문과 근거를 수정하고 다시 검사하세요.')=>issues.push({key,message,action})
  if (!plain(brief) || !job?.job_id) return {status:'NEEDS_CHANGES',issues:[{key:'draft',message:'원고가 없습니다.',action:'초안을 작성하세요.'}]}
  if(job.result_decision==='HOLD'&&(!text(review.duplicate_note)||review.duplicate_note.length<40))add('duplicate','기존 글과 다른 질문과 추가할 내용을 구체적으로 기록하세요.','관련 기존 글을 확인하거나 계속 보관하세요.')
  const body=manuscriptText(brief), originalBody=manuscriptText(original.brief??{})
  for(const f of ['title','summary','meta_description','lead','scope','basis','footer','editorial_note']) if(!text(brief[f])) add(f,({title:'제목',summary:'요약',meta_description:'검색 설명',lead:'도입',scope:'적용 범위',basis:'근거 설명',footer:'주의문',editorial_note:'편집 메모'})[f]+'을 입력하세요.')
  if (!Array.isArray(brief.sections)||!brief.sections.length||brief.sections.some(s=>!text(s.heading)||!s.blocks?.length)) add('sections','제목과 본문이 있는 문단이 필요합니다.')
  for(const [si,s] of (brief.sections??[]).entries()) for(const [bi,b] of (s.blocks??[]).entries()) {
    if (['prose','note'].includes(b.type)&&!text(b.text)) add(`section:${si}:${bi}`,'빈 문단은 삭제하거나 작성하세요.')
    if (b.type?.endsWith('list')&&(!b.items?.length||b.items.some(v=>!text(v))))add(`section:${si}:${bi}`,'빈 목록 항목은 삭제하거나 작성하세요.')
  }
  const byId=new Map((brief.sources??[]).map(s=>[s.id,s]))
  for(const [index,tool] of (brief.tools??[]).entries()) {
    if(!plain(tool)||!['title','path','description','label'].every(field=>text(tool[field]))||!String(tool.path).startsWith('/')||tool.availability!=='AVAILABLE')add('tools:'+index,'자료 연결 형식을 확인하세요. 자료 이름만으로는 다운로드를 제공할 수 없습니다.','실제 파일이 있는 자료 연결을 작성하거나 본문 편집의 자료 연결 목록에서 삭제하세요.')
  }
  if(!byId.size) add('sources','근거 출처를 추가하세요.')
  const claims=Array.isArray(review.claims)?review.claims:[]
  if(!claims.length) add('claims','본문의 핵심 주장과 출처·확인 범위를 연결하세요.')
  const narrative=[]
  for(const [i,c] of claims.entries()) {
    if(c.role==='NARRATIVE') {
      const prior=ev.claims?.find(p=>p.claim===c.claim&&p.context===c.context&&p.limitation===c.limitation&&JSON.stringify(p.source_ids)===JSON.stringify(c.source_ids))
      const knownNarrative=prior&&/허구|서사|fiction|narrative/i.test(c.context)&&/허구|서사|fiction|narrative/i.test(c.limitation)&&c.source_ids.every(id=>ev.sources?.some(s=>s.id===id&&s.source_type==='NARRATIVE_PROVENANCE'))
      if(knownNarrative){narrative.push(c);continue}
      add('claim:'+i,'현실 주장을 작품 속 출발점으로 바꿔 검증을 우회할 수 없습니다.');continue
    }
    if(!text(c.claim)||!text(c.context)||!text(c.limitation)||!c.source_ids?.length||!c.source_ids.every(id=>byId.has(id))||(!c.source_ids.some(id=>official(byId.get(id)?.url))&&!(c.source_ids.every(id=>byId.get(id)?.url?.startsWith('https://survival-diary-archive.netlify.app/'))&&/허구|서사|fiction|narrative/i.test(c.context)&&/허구|서사|fiction|narrative/i.test(c.limitation)))) add(`claim:${i}`,'주장마다 공식 출처와 확인 범위·한계를 기록하세요.')
  }
  // A reasoned, evidence-linked editorial judgment is not an expert certificate.
  // Dangerous specifics cannot use the condition/limitation route.
  const dangerous=/안전거리|허가\s*정원|복용량|투약|전압|농도|인화점|소유권|저작권|개인정보|개인\s*정보|서명|보관기간|법적|유독가스|안전\s*수치/
  if(/\b\d+(?:\.\d+)?\s*(?:m|km|mg|ml|V|ppm|미터|밀리그램|볼트)\b/i.test(body))add('safety-specific','안전 수치·전문 작업 지침이 포함돼 있습니다. 일반 한계 설명만으로 확인할 수 없습니다.','해당 수치를 삭제하거나 별도의 전문 검증을 받으세요.')
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|01[016789][- ]?\d{3,4}[- ]?\d{4}/i.test(body))add('privacy','공개 본문에 개인 연락처가 포함될 수 있습니다.','개인정보를 제거하고 다시 검사하세요.')
  const resolved=[]
  for(const issue of reviewIssues(original,brief,review)) {
    const r=issue.resolution
    let ok=plain(r)&&text(r.reason)&&r.reason.trim().length>=20
    const sourceIds=r?.source_ids??[]
    if(r?.method==='REMOVED') ok=ok&&text(r.quote)&&originalBody.includes(r.quote)&&!body.includes(r.quote)&&r.quote.length>=15
    else if(r?.method==='SUPPORTED') ok=ok&&text(r.quote)&&body.includes(r.quote)&&sourceIds.length>0&&sourceIds.every(id=>official(byId.get(id)?.url))&&claims.some(c=>c.claim===r.quote&&sourceIds.every(id=>c.source_ids?.includes(id)))
    else if(['SITE_CONDITION','STATED_LIMIT'].includes(r?.method)) {
      ok=ok&&issue.kind==='unknowns'&&text(r.quote)&&r.quote.length>=20&&body.includes(r.quote)
        && /현장|관할|기관|전문가|지역|상황|조건|확인|판단|제외|한계/.test(r.quote)
        && sourceIds.length>0&&sourceIds.every(id=>official(byId.get(id)?.url))
      // Unverified legal/privacy/safety facts require removing the claim or
      // specific source support; a generic disclaimer cannot clear them.
      if(dangerous.test(issue.reason)&&r.method!=='STATED_LIMIT') ok=false
      if(dangerous.test(issue.reason)&&r.method==='STATED_LIMIT') ok=ok&&/판단하지|확정하지|제시하지|다루지|제외|담당|맡|확인해야|확인할/.test(r.quote)
    } else ok=false
    if(ok)resolved.push(issue.key)
    else add(issue.key,issue.reason,'해당 주장 수정·삭제, 공식 근거 보강 또는 본문의 적용 한계를 근거와 함께 기록하세요.')
  }
  if(claims.length&&claims.every(c=>narrative.includes(c)))add('claims','현실 안내를 뒷받침하는 공식 근거가 필요합니다.')
  // Rights/source enums are NOT changed by an operator checkbox. Historical
  // nonstandard values remain blockers until verifiable source/rights evidence.
  if(!rightsVerified && (ev.copyright_status!=='CLEAR' || JSON.stringify(brief.sources)!==JSON.stringify(original.brief?.sources))) add('rights','출처의 재사용 권한을 검증해야 합니다.','이용조건의 원문 주소와 허용 범위를 보강하세요. 원본 판정은 유지됩니다.')
  if(!sourceVerified && !['VERIFIED_PUBLIC_READER_BACKFILL','VERIFIED_PUBLIC_ARCHIVE','USER_REPORTED_EXPERIENCE'].includes(ev.story_source_status)) add('provenance','원본 연결을 다시 검증해야 합니다.','출처 진단 후 다시 시도하세요. 서사를 현실 근거로 바꾸지 않습니다.')
  const evidence={brief_id:brief.id,question:brief.title,claims:structuredClone(claims.filter(c=>!narrative.includes(c))),
    unknowns:(ev.unknowns??[]).filter(v=>!resolved.includes(issueKey('unknowns',v))),
    conflicts:(ev.conflicts??[]).filter(v=>!resolved.includes(issueKey('conflicts',v))),
    risk_notes:Array.isArray(ev.risk_notes)?ev.risk_notes:text(ev.risk_notes)?[ev.risk_notes]:[],
    copyright_status:rightsVerified?'CLEAR':ev.copyright_status,
    story_source_status:sourceVerified?({PUBLIC_READER:'VERIFIED_PUBLIC_READER_BACKFILL',PUBLIC_ARCHIVE:'VERIFIED_PUBLIC_ARCHIVE',USER_REPORTED_EXPERIENCE:'USER_REPORTED_EXPERIENCE'})[job.source_kind]:ev.story_source_status,
    ...(ev.experience_provenance?{experience_provenance:structuredClone(ev.experience_provenance)}:{}),
    // Human notes and removed text stay in the private DB, never in public Git.
    editorial_review:{version:1,original_result_sha256:job.semantic_result_sha256,resolved,
      decision_sha256:hash(review.resolutions??[]),narrative_count:narrative.length}}
  return {status:issues.length?'NEEDS_CHANGES':'STRUCTURE_CHECKED',issues,evidence}
}

// Fetch only public official HTTPS pages, reject redirects and bound response
// size/time. Never call arbitrary source URLs through a privileged network.
export async function verifyEditorialRights(brief, review, {fetcher=fetch,trustedSources=[]}={}) {
  if(!brief.sources?.length) return false
  for(const source of brief.sources) {
    if(trustedSources.some(trusted=>JSON.stringify(trusted)===JSON.stringify(source)))continue
    const proof=review.rights?.find(p=>p.source_id===source.id)
    if(!proof||!official(proof.url)||!text(proof.quote)||proof.quote.length<30||!official(source.url)) return false
    const sourceHost=new URL(source.url).hostname,termsHost=new URL(proof.url).hostname
    if(sourceHost!==termsHost&&!sourceHost.endsWith('.'+termsHost)&&!termsHost.endsWith('.'+sourceHost))return false
    const response=await fetcher(proof.url,{redirect:'error',signal:AbortSignal.timeout(15000)})
    if(!response.ok||Number(response.headers.get('content-length')??0)>524288) return false
    const reader=response.body.getReader(); let size=0, chunks=[]
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>524288)return false;chunks.push(value)}} finally {await reader.cancel().catch(()=>{})}
    const joined=Buffer.concat(chunks).toString('utf8').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
    if(!joined.includes(proof.quote.replace(/\s+/g,' '))||!/public domain|not subject to copyright|공공누리\s*제?\s*1\s*유형|상업적\s*이용.*변경\s*가능/i.test(proof.quote)||/non-commercial|no derivatives|상업적\s*이용\s*금지|변경\s*금지/i.test(proof.quote)) return false
  }
  return true
}
