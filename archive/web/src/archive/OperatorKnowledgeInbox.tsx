import {useCallback,useEffect,useMemo,useState,useRef} from 'react'
import {supabaseClient} from './supabaseClient'
import {OperatorKnowledgeSources} from './OperatorKnowledgeSources'
import {formatOperatorTime} from './operatorSystemStatus'
import {editorialError} from './knowledgeEditorialModel'
import {emptyKnowledgeInbox,knowledgeBucketFor,knowledgeBucketLabel,type KnowledgeFilter,type KnowledgeInbox} from './knowledgeOperatorModel'
export function OperatorKnowledgeInbox({email,busy:parentBusy,onSignOut}:{email?:string|null;busy:boolean;onSignOut:()=>void}) {
 const [inbox,setInbox]=useState<KnowledgeInbox>(emptyKnowledgeInbox)
 const query=new URLSearchParams(window.location.search)
 const [filter,setFilter]=useState<KnowledgeFilter>((['REVIEW','APPROVED','PUBLISHED','HELD','ALL'].includes(query.get('filter')??'')?query.get('filter'):'REVIEW') as KnowledgeFilter)
 const [search,setSearch]=useState(query.get('q')??''),[page,setPage]=useState(Math.max(1,Number(query.get('page'))||1))
 const scrollRestored=useRef(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [available,setAvailable]=useState(false)
 const refresh=useCallback(async()=>{
  if(!supabaseClient)return
  setBusy(true);setError('');setAvailable(false)
  try {
   const response=await supabaseClient.rpc('archive_operator_knowledge_editor_inbox').abortSignal(AbortSignal.timeout(15000))
   if(response.error||!response.data||!Array.isArray(response.data.items))throw Error('unavailable')
   const next=response.data as KnowledgeInbox
   try {
    const result=await fetch('https://survival-diary-archive.netlify.app/knowledge/',{cache:'no-store',signal:AbortSignal.timeout(10000)})
    const html=result.ok?await result.text():''
    next.items=next.items.map(i=>({...i,published_on_site:!!i.slug&&html.includes('/knowledge/'+i.slug+'/')}))
   }catch{next.items=next.items.map(i=>({...i,published_on_site:false}))}
   setInbox(next);setAvailable(true)
  }catch{setInbox(emptyKnowledgeInbox);setError('글 목록을 불러오지 못했습니다. 다시 시도해 주세요.')}
  finally{setBusy(false)}
 },[])
 useEffect(()=>{void refresh()},[refresh])
 useEffect(()=>{const q=new URLSearchParams();q.set('filter',filter);if(search)q.set('q',search);if(page>1)q.set('page',String(page));const suffix='?'+q;history.replaceState(null,'',suffix);sessionStorage.setItem('knowledge-list-query',suffix)},[filter,search,page])
 useEffect(()=>{if(!busy&&inbox.items.length&&!scrollRestored.current){scrollRestored.current=true;window.scrollTo(0,Number(sessionStorage.getItem('knowledge-list-scroll'))||0)}},[busy,inbox.items.length])
 const visible=useMemo(()=>inbox.items.filter(i=>(filter==='ALL'||knowledgeBucketFor(i)===filter||(filter==='REVIEW'&&knowledgeBucketFor(i)==='WORKING'))&&[i.title,i.note,i.brief_id].some(v=>v?.toLowerCase().includes(search.toLowerCase()))),[inbox.items,filter,search])
 const counts=(bucket:KnowledgeFilter)=>inbox.items.filter(i=>knowledgeBucketFor(i)===bucket||(bucket==='REVIEW'&&knowledgeBucketFor(i)==='WORKING')).length
 return <section className="operator-page"><header className="operator-heading"><div><h1>생존지식 글 관리</h1><p>멈춘 이유를 확인하고, 글을 수정한 뒤 발행하세요.</p></div><nav><a href="/operator/">대시보드</a> <button className="operator-secondary" disabled={busy||parentBusy} onClick={onSignOut}>로그아웃</button></nav></header>
  {error&&<p role="alert" className="operator-error">{error}</p>}
  <section className="operator-panel"><nav className="operator-heading-actions" aria-label="글 상태">{(['REVIEW','APPROVED','PUBLISHED','HELD'] as const).map(v=><button className="operator-secondary" aria-pressed={filter===v} key={v} onClick={()=>{setFilter(v);setPage(1)}}>{knowledgeBucketLabel[v]} {available?counts(v):'조회 불가'}</button>)}</nav><label>글 검색<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="제목이나 내용으로 찾기" /></label><button className="operator-secondary" onClick={()=>void refresh()} disabled={busy}>새로고침</button> <button className="operator-secondary" onClick={()=>{setFilter('ALL');setPage(1)}}>전체 보기</button></section>
  <section className="operator-panel"><h2>{filter==='ALL'?'전체 글':knowledgeBucketLabel[filter]} · {available?`${visible.length}편`:'조회 불가'}</h2>{busy&&<p role="status">불러오는 중…</p>}{available&&!visible.length&&!busy&&<p>이 목록에 글이 없습니다.</p>}<ul className="operator-inbox">{visible.slice((page-1)*15,page*15).map(item=>{const bucket=knowledgeBucketFor(item),reason=item.editor_request?.result?.reason,failed=reason||item.status==='BLOCKED';return <li key={item.job_id}><a href={'/operator/knowledge/'+item.job_id+'/'} onClick={()=>sessionStorage.setItem('knowledge-list-scroll',String(window.scrollY))}><span><b>{failed?'처리 필요':item.status==='PUBLISHED'&&!item.published_on_site&&!item.public_record?'공개 확인 대기':knowledgeBucketLabel[bucket]}</b>{item.has_body===false&&<b>원고 미작성</b>}</span><strong>{item.title||'보관된 글감 · 원고 미작성'}</strong><p>{reason?editorialError(reason):item.status==='BLOCKED'?editorialError(item.code??'VALIDATION'):item.note??(bucket==='APPROVED'?'검사 후 실제 공개 여부를 확인하고 있습니다.':'본문과 근거를 확인하세요.')}</p><small>마지막 변경 {formatOperatorTime(item.updated_at??item.prepared_at)}</small><em>{bucket==='HELD'?'보관 이유 확인 · 복원 →':bucket==='PUBLISHED'?'공개본 보기 · 수정 →':failed?'문제 확인 · 수정 →':'글 열기 →'}</em></a></li>})}</ul>{visible.length>15&&<nav aria-label="목록 페이지"><button disabled={page===1} onClick={()=>setPage(v=>v-1)}>이전</button> {page} / {Math.ceil(visible.length/15)} <button disabled={page*15>=visible.length} onClick={()=>setPage(v=>v+1)}>다음</button></nav>}</section>
  <details className="operator-panel"><summary>참고자료 보관함</summary><OperatorKnowledgeSources/></details><details><summary>기술 정보</summary><p>로그인 계정 {email}. 목록은 원고 작업의 식별자로 구분하며 프로그램의 실행 로그를 별도 글로 추가하지 않습니다.</p></details>
 </section>
}
