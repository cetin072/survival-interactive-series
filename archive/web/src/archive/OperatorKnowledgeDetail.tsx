import {useCallback,useEffect,useRef,useState} from 'react'
import {KnowledgeDraftEditor,KnowledgeDraftPreview,type KnowledgeDraftBrief} from './KnowledgeDraftEditor'
import {editorialError,editorialIssues,editorialStatus,editorialTemplate,publicationActive,readableBrief,quoteLocations,type EditorialEnvelope,type EditorialIssue,type EditorialReview,type EditorialResolution} from './knowledgeEditorialModel'
import {formatOperatorTime} from './operatorSystemStatus'
import {uploadKnowledgeImage} from './knowledgeMedia'
import {supabaseClient} from './supabaseClient'
import './KnowledgeReviewFocus.css'
import './knowledgeEditorial.css'
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v))
export function OperatorKnowledgeDetail({jobId,email,busy:parentBusy,onSignOut}:{jobId:string;email?:string|null;busy:boolean;onSignOut:()=>void}) {
 const [value,setValue]=useState<EditorialEnvelope|null>(null)
 const [brief,setBrief]=useState<KnowledgeDraftBrief|null>(null)
 const [review,setReview]=useState<EditorialReview>({claims:[],resolutions:[]})
 const [issues,setIssues]=useState<EditorialIssue[]>([])
 const [preview,setPreview]=useState(false)
 const [dirty,setDirty]=useState(false)
 const dirtyRef=useRef(false), operation=useRef(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[code,setCode]=useState(''),[notice,setNotice]=useState('')
 const [recovery,setRecovery]=useState<{revision:number;brief:KnowledgeDraftBrief;review:EditorialReview}|null>(null)
 const cacheKey='knowledge-editor:'+email+':'+jobId
 const adopt=useCallback(async(next:EditorialEnvelope,content=true)=>{
  setValue(next)
  if(content&&!dirtyRef.current){setBrief(next.brief?readableBrief(next.brief):null);setReview(copy(next.evidence_review));setIssues(await editorialIssues(next.original))}
 },[])
 const load=useCallback(async(content=true)=>{
  if(!supabaseClient)return
  const response=await supabaseClient.rpc('archive_operator_knowledge_editor_get',{p_job_id:jobId})
  if(response.error)throw Error(response.error.message)
  await adopt(response.data as EditorialEnvelope,content)
 },[jobId,adopt])
 useEffect(()=>{
  dirtyRef.current=false;setDirty(false);setValue(null);setBrief(null);setBusy(true)
  void load().catch(e=>{setCode(e.message);setError(editorialError(e.message))}).finally(()=>setBusy(false))
  try{const stored=sessionStorage.getItem(cacheKey);if(stored)setRecovery(JSON.parse(stored))}catch{}
 },[load,cacheKey])
 const change=(next:KnowledgeDraftBrief,nextReview=review)=>{
  setBrief(next);setReview(nextReview);dirtyRef.current=true;setDirty(true);setNotice('수정 중 · 아직 저장되지 않았습니다.')
  try{sessionStorage.setItem(cacheKey,JSON.stringify({revision:value?.revision??0,brief:next,review:nextReview}))}catch{setNotice('이 브라우저에 복구본을 보관하지 못했습니다. 저장 버튼으로 서버에 저장하세요.')}
 }
 const changeReview=(next:EditorialReview)=>{if(brief)change(brief,next)}
 useEffect(()=>{
  if(!dirty)return
  const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)
 },[dirty])
 useEffect(()=>{
  if(!publicationActive(value?.request))return
  const timer=window.setInterval(()=>{void load(false).catch(()=>setNotice('진행 상태를 갱신하지 못했습니다. 수정본은 보존돼 있습니다.'))},8000)
  return()=>window.clearInterval(timer)
 },[value?.request?.request_id,value?.request?.status,load])
 const run=async(fn:()=>Promise<void>)=>{
  if(operation.current)return
  operation.current=true;setBusy(true);setError('');setCode('')
  try{await fn()}catch(e){const message=e instanceof Error?e.message:'';setCode(message);setError(editorialError(message))}finally{operation.current=false;setBusy(false)}
 }
 const save=async()=>{
  if(!supabaseClient||!value||!brief)throw Error('KNOWLEDGE_EDITOR_BRIEF_REQUIRED')
  const {data,error:err}=await supabaseClient.rpc('archive_operator_knowledge_editor_save',{p_job_id:jobId,p_expected_revision:value.revision,p_brief:brief,p_evidence_review:review})
  if(err)throw Error(err.message)
  dirtyRef.current=false;setDirty(false);sessionStorage.removeItem(cacheKey);setRecovery(null)
  await adopt(data as EditorialEnvelope);setNotice('저장됨');return data as EditorialEnvelope
 }
 const request=async(publish:boolean)=>{
  if(!supabaseClient||!value)return
  const saved=dirty||value.revision===0?await save():value
  const {error:err}=await supabaseClient.rpc('archive_operator_knowledge_editor_request',{p_job_id:jobId,p_expected_revision:saved.revision,p_publish:publish})
  if(err)throw Error(err.message)
  setNotice(publish?'현재 저장본으로 발행을 요청했습니다. 실제 공개 확인까지 진행 상황을 표시합니다.':'현재 수정본으로 재검사를 요청했습니다. 공개하지 않습니다.')
  await load(false)
 }
 const action=async(name:'ARCHIVE'|'RESTORE')=>{
  if(!supabaseClient)return
  if(dirty)await save()
  const {data,error:err}=await supabaseClient.rpc('archive_operator_knowledge_editor_action',{p_job_id:jobId,p_action:name})
  if(err)throw Error(err.message)
  await adopt(data as EditorialEnvelope);setNotice(name==='ARCHIVE'?'보관했습니다. 원고와 이력은 그대로 남습니다.':'편집을 위해 복원했습니다. 아직 발행되지 않았습니다.')
 }
 const active=publicationActive(value?.request), locked=busy||parentBusy||active||value?.archived
 const updateResolution=(issue:EditorialIssue,patch:Partial<EditorialResolution>)=>{
  const next=copy(review),existing=next.resolutions.find(r=>r.key===issue.key)
  if(existing)Object.assign(existing,patch)
  else next.resolutions.push({key:issue.key,method:'UNRESOLVED',quote:issue.quote??'',reason:'',source_ids:[],...patch})
  changeReview(next)
 }
 const result=value?.request?.result
 const lastError=result?.reason?editorialError(result.reason):''
 const originalBrief=value?.original?.brief as KnowledgeDraftBrief|undefined
 const unknownRights=(value?.original?.evidence as {copyright_status?:string}|undefined)?.copyright_status!=='CLEAR'
 const publicUrl=value?.public_record?.result?.public_url??result?.public_url??(value?.status==='PUBLISHED'&&brief?.slug?'https://survival-diary-archive.netlify.app/knowledge/'+brief.slug+'/':null)
 return <section className="operator-page knowledge-editor-page">
  <header className="operator-heading"><div><h1>{brief?.title||'글 관리'}</h1><p>{value?editorialStatus(value):'불러오는 중…'} · {dirty?'수정 중':value?.updated_at?'저장 '+formatOperatorTime(value.updated_at):''}</p></div><nav><a href={'/operator/knowledge/'+(sessionStorage.getItem('knowledge-list-query')??'')}>← 글 목록</a> <a href="/operator/">대시보드</a> <button className="operator-secondary" disabled={busy} onClick={onSignOut}>로그아웃</button></nav></header>
  {error&&<p role="alert" className="operator-error">{error}</p>}
  {notice&&<p role="status" className="operator-muted">{notice}</p>}
  {recovery&&<aside className="operator-panel"><p>이 브라우저에 저장하지 못한 수정 내용이 남아 있습니다. 최신 저장본을 덮어쓰지 않고 편집 화면으로 불러옵니다.</p><button disabled={!!locked} onClick={()=>{if(brief){change(recovery.brief,recovery.review);setRecovery(null)}}}>수정본 복구</button><button onClick={()=>{sessionStorage.removeItem(cacheKey);setRecovery(null)}}>닫기</button></aside>}
  {value&&<>
   <div className="knowledge-editor-actions" aria-label="글 작업">
    <button disabled={!!locked||!brief} onClick={()=>void run(async()=>{await save()})}>{busy?'처리 중…':'저장'}</button>
    <button className="operator-secondary" disabled={!brief} onClick={()=>setPreview(v=>!v)}>{preview?'편집':'미리보기'}</button>
    <button disabled={!!locked||!brief} onClick={()=>void run(()=>request(true))}>발행</button>
    {!value.archived&&<button className="operator-secondary" disabled={busy||active} onClick={()=>void run(()=>action('ARCHIVE'))}>보관</button>}
    {value.archived&&<button disabled={busy} onClick={()=>void run(()=>action('RESTORE'))}>복원</button>}
    {result&&['FAILED','RETRYABLE'].includes(value.request?.status??'')&&<button disabled={busy||dirty} onClick={()=>void run(()=>request(value.request?.publish_requested??false))}>다시 시도</button>}
   </div>
   {active&&<section className="operator-panel" aria-live="polite"><h2>{editorialStatus(value)}</h2><p>승인한 저장본을 검사하고 공개 여부를 확인하고 있습니다. 요청 접수와 검사 성공만으로 게시 완료로 표시하지 않습니다.</p><p>검증 단계에서 오류가 나면 이 화면에 수정 방법을 표시합니다.</p></section>}
   {lastError&&<section role="alert" className="operator-panel"><h2>발행을 완료하지 못했습니다</h2><p>{lastError}</p><p>기존 공개본과 수정본은 유지됩니다.</p></section>}
   {publicUrl&&<section className="operator-panel"><h2>{value.request?.status==='PUBLISHED'?'게시됨':'기존 공개본'}</h2><a href={publicUrl} target="_blank" rel="noreferrer">공개 글 보기 ↗</a> <button className="operator-secondary" onClick={()=>void navigator.clipboard.writeText(publicUrl).then(()=>setNotice('주소를 복사했습니다.')).catch(()=>setNotice(publicUrl))}>주소 복사</button></section>}
   {value.archived&&<aside className="operator-panel"><h2>보관된 {brief?'원고':'글감'}</h2><p>{String(value.original?.note??'과거 처리 결과로 보관돼 있습니다. 복원하면 같은 편집기로 이어집니다.')}</p><p>복원은 편집 시작이며 공개 승인이 아닙니다.</p></aside>}
   {!brief&&<section className="operator-panel"><h2>원고 미작성</h2><p>원본과 보류 이유는 아래 기술 정보에서 확인할 수 있습니다. 새 초안은 직접 작성하며 자동 발행되지 않습니다.</p><p>{String(value.original?.note??'아직 완성 본문이 없습니다.')}</p><button disabled={busy} onClick={()=>void run(async()=>{await action('RESTORE');change(editorialTemplate(value));setNotice('새 초안입니다. 본문과 근거를 작성한 뒤 검토하세요.')})}>초안 만들기 · 직접 작성</button></section>}
   {brief&&<>
    {result?.issues?.length? <section className="operator-panel" aria-label="검사 결과"><h2>문제 {result.issues.length}개 확인</h2><ul>{result.issues.map(issue=><li key={issue.key}><a href={'#problem-'+issue.key}>{issue.message}</a>{issue.action&&<p>{issue.action}</p>}</li>)}</ul></section>:null}
    <section className="operator-panel knowledge-editor-body">
     <h2>{preview?'글 미리보기':'본문 편집'}</h2>
     {preview||value.archived?<KnowledgeDraftPreview brief={brief}/>:<KnowledgeDraftEditor brief={brief} disabled={!!locked} onChange={change} onUploadImage={supabaseClient?file=>uploadKnowledgeImage(supabaseClient!,jobId,file):undefined}/>}
    </section>
    <section className="operator-panel" aria-label="문제와 해결"><h2>확인할 부분과 해결 방법</h2><p>원본의 판단은 보존됩니다. 아래에 현재 본문과 근거를 연결해 재검사를 요청하세요. 체크만으로 사실·권한·안전 검증을 통과시키지 않습니다.</p>
     {issues.map(issue=>{const r=review.resolutions.find(v=>v.key===issue.key),quote=r?.quote??issue.quote??'',locations=quoteLocations(brief,quote);return <article className="knowledge-editor-issue" id={'problem-'+issue.key} key={issue.key}>
      <h3>{locations===1?'현재 본문에 연결된 구간':'글 전체의 적용 범위 확인'}</h3>
      {quote&&<p>{locations===1?<mark>{quote}</mark>:<>{quote} <b>— 현재 문장에 정확히 연결되지 않았습니다.</b></>}</p>}
      <strong>AI가 확인을 요청한 이유</strong><p>{issue.reason}</p>
      <p>해당 문장 수정·삭제는 위 본문에서 할 수 있습니다. 정확한 위치가 없는 과거 지적을 특정 문장의 오류로 단정하지 않습니다.</p>
      <label>해결 방법<select disabled={!!locked} value={r?.method??'UNRESOLVED'} onChange={e=>updateResolution(issue,{method:e.target.value})}><option value="UNRESOLVED">미해결 · 보류</option><option value="REMOVED">해당 주장 삭제</option><option value="SUPPORTED">공식 근거로 확인</option><option value="SITE_CONDITION">현장별 확인 조건으로 범위 제한</option><option value="STATED_LIMIT">본문에 설명한 적용 한계</option></select></label>
      <label>{r?.method==='REMOVED'?'삭제한 원문 인용':'현재 본문에 있는 정확한 문장'}<textarea disabled={!!locked} value={quote} onChange={e=>updateResolution(issue,{quote:e.target.value})}/></label>
      <label>판단 이유와 남은 한계<textarea disabled={!!locked} value={r?.reason??''} onChange={e=>updateResolution(issue,{reason:e.target.value})}/></label>
      <label>근거 출처<select multiple disabled={!!locked} value={r?.source_ids??[]} onChange={e=>updateResolution(issue,{source_ids:Array.from(e.target.selectedOptions).map(o=>o.value)})}>{(brief.sources??[]).map(s=><option key={s.id} value={s.id}>{s.title||'제목 없는 출처'}</option>)}</select></label>
      <small>{r&&r.method!=='UNRESOLVED'?'판단 기록됨 · 현재 수정본 재검사 필요':'남은 문제 · 아직 해결되지 않았습니다.'}</small>
     </article>})}
     {!issues.length&&<p>원본에 등록된 미확인·충돌 항목은 없습니다. 현재 수정본의 출처와 본문 검사는 계속 수행합니다.</p>}
     <button disabled={!!locked} onClick={()=>void run(()=>request(false))}>현재 수정본 재검사</button>
    </section>
    <section className="operator-panel" aria-label="주장과 근거"><h2>본문 주장과 근거</h2><p>공식 자료가 확인하는 내용과 한계를 기록합니다. 현실 주장에 작품 속 서사를 근거로 사용하지 않습니다.</p>
     {review.claims.map((claim,i)=><fieldset key={i}><legend>주장 {i+1}</legend>{(['claim','context','limitation'] as const).map(field=><label key={field}>{{claim:'주장 문장',context:'자료가 뒷받침하는 범위',limitation:'적용 한계'}[field]}<textarea disabled={!!locked} value={claim[field]??''} onChange={e=>{const next=copy(review);next.claims[i][field]=e.target.value;changeReview(next)}}/></label>)}<label>연결할 출처<select multiple disabled={!!locked} value={claim.source_ids??[]} onChange={e=>{const next=copy(review);next.claims[i].source_ids=Array.from(e.target.selectedOptions).map(o=>o.value);changeReview(next)}}>{(brief.sources??[]).map(s=><option key={s.id} value={s.id}>{s.title||'제목 없는 출처'}</option>)}</select></label><button disabled={!!locked} onClick={()=>{const next=copy(review);next.claims.splice(i,1);changeReview(next)}}>주장 삭제</button></fieldset>)}
     <button disabled={!!locked} onClick={()=>changeReview({...review,claims:[...review.claims,{claim:'',context:'',limitation:'',source_ids:[]}]})}>주장 추가</button>
     {unknownRights&&<><h3>출처 이용조건 확인</h3><p>이용조건 원문에서 재사용 허용 범위를 검사합니다. 이 입력만으로 저작권이 확인된 것으로 표시하지 않습니다.</p>{(brief.sources??[]).map(source=>{const proof=review.rights?.find(r=>r.source_id===source.id);const update=(field:'url'|'quote',text:string)=>{const next=copy(review);next.rights??=[];let item=next.rights.find(r=>r.source_id===source.id);if(!item){item={source_id:source.id??'',url:'',quote:''};next.rights.push(item)}item[field]=text;changeReview(next)};return <fieldset key={source.id}><legend>{source.title}</legend><label>공식 이용조건 주소<input disabled={!!locked} type="url" value={proof?.url??''} onChange={e=>update('url',e.target.value)}/></label><label>재사용 허용 범위의 정확한 원문<textarea disabled={!!locked} value={proof?.quote??''} onChange={e=>update('quote',e.target.value)}/></label></fieldset>})}</>}
    </section>
    <details className="operator-panel"><summary>원문 비교 · 수정본 복구</summary>{originalBrief&&<><h3>AI 원본</h3><KnowledgeDraftPreview brief={readableBrief(originalBrief)}/></>}<h3>저장 이력</h3>{value.history.map(version=><button key={version.revision} disabled={!!locked} onClick={()=>void run(async()=>{const response=await supabaseClient!.rpc('archive_operator_knowledge_editor_version',{p_job_id:jobId,p_revision:version.revision});if(response.error)throw Error(response.error.message);change(response.data.brief,response.data.evidence_review);setNotice('이전 저장본을 편집 화면에 불러왔습니다. 저장하면 새 수정본으로 남습니다.')})}>{formatOperatorTime(version.created_at)} 저장본 불러오기</button>)}</details>
   </>}
   <details className="operator-panel"><summary>기술 정보 · 원본과 처리 이력</summary><p>오류: {code||result?.reason||value.blocker_code||'없음'}</p><p>원본: {value.source_ref}</p><pre>{JSON.stringify({job_id:jobId,revision:value.revision,draft_sha256:value.draft_sha256,status:value.status,request:value.request,context:value.context,original:value.original},null,2)}</pre></details>
  </>}
 </section>
}
