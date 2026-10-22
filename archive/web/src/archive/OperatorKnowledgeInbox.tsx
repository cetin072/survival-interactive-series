import {useCallback,useEffect,useMemo,useState} from 'react'
import {supabaseClient} from './supabaseClient'
import {OperatorKnowledgeSources} from './OperatorKnowledgeSources'
import {formatOperatorTime} from './operatorSystemStatus'
import {editorialError} from './knowledgeEditorialModel'
import {emptyKnowledgeInbox,knowledgeBucketFor,knowledgeBucketLabel,type KnowledgeFilter,type KnowledgeInbox} from './knowledgeOperatorModel'
export function OperatorKnowledgeInbox({email,busy:parentBusy,onSignOut}:{email?:string|null;busy:boolean;onSignOut:()=>void}) {
 const [inbox,setInbox]=useState<KnowledgeInbox>(emptyKnowledgeInbox)
 const query=new URLSearchParams(window.location.search)
 const [filter,setFilter]=useState<KnowledgeFilter>((['REVIEW','APPROVED','PUBLISHED','HELD','ALL'].includes(query.get('filter')??'')?query.get('filter'):'REVIEW') as KnowledgeFilter)
 const [search,setSearch]=useState(query.get('q')??''),[page,setPage]=useState(1)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const refresh=useCallback(async()=>{if(!supabaseClient)return;setBusy(true);setError('');const response=await supabaseClient.rpc('archive_operator_knowledge_editor_inbox');if(response.error)setError('글 목록을 불러오지 못했습니다. 다시 시도해 주세요.');else setInbox(response.data as KnowledgeInbox);setBusy(false)},[])
 useEffect(()=>{void refresh()},[refresh])
 useEffect(()=>{const q=new URLSearchParams();q.set('filter',filter);if(search)q.set('q',search);const suffix='?'+q;history.replaceState(null,'',suffix);sessionStorage.setItem('knowledge-list-query',suffix)},[filter,search])
 const visible=useMemo(()=>inbox.items.filter(i=>(filter==='ALL'||knowledgeBucketFor(i)===filter||(filter==='REVIEW'&&knowledgeBucketFor(i)==='WORKING'))&&[i.title,i.note,i.brief_id].some(v=>v?.toLowerCase().includes(search.toLowerCase()))),[inbox.items,filter,search])
 const counts=(bucket:KnowledgeFilter)=>inbox.items.filter(i=>knowledgeBucketFor(i)===bucket||(bucket==='REVIEW'&&knowledgeBucketFor(i)==='WORKING')).length
 return <section className="operator-page"><header className="operator-heading"><div><h1>생존지식 글 관리</h1><p>멈춘 이유를 확인하고, 글을 수정한 뒤 발행하세요.</p></div><nav><a href="/operator/">대시보드</a> <button className="operator-secondary" disabled={busy||parentBusy} onClick={onSignOut}>로그아웃</button></nav></header>
  {error&&<p role="alert" className="operator-error">{error}</p>}
  <section className="operator-panel"><nav className="operator-heading-actions" aria-label="글 상태">{(['REVIEW','APPROVED','PUBLISHED','HELD'] as const).map(v=><button className="operator-secondary" aria-pressed={filter===v} key={v} onClick={()=>{setFilter(v);setPage(1)}}>{knowledgeBucketLabel[v]} {counts(v)}</button>)}</nav><label>글 검색<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="제목이나 내용으로 찾기" /></label><button className="operator-secondary" onClick={()=>void refresh()} disabled={busy}>새로고침</button> <button className="operator-secondary" onClick={()=>{setFilter('ALL');setPage(1)}}>전체 보기</button></section>
  <section className="operator-panel"><h2>{filter==='ALL'?'전체 글':knowledgeBucketLabel[filter]} · {visible.length}편</h2>{busy&&<p role="status">불러오는 중…</p>}{!visible.length&&!busy&&<p>이 목록에 글이 없습니다.</p>}<ul className="operator-inbox">{visible.slice((page-1)*15,page*15).map(item=>{const bucket=knowledgeBucketFor(item),reason=item.editor_request?.result?.reason,failed=reason||item.status==='BLOCKED';return <li key={item.job_id}><a href={'/operator/knowledge/'+item.job_id+'/'} onClick={()=>sessionStorage.setItem('knowledge-list-scroll',String(window.scrollY))}><span><b>{failed?'처리 필요':knowledgeBucketLabel[bucket]}</b>{item.has_body===false&&<b>원고 미작성</b>}</span><strong>{item.title||'보관된 글감 · 원고 미작성'}</strong><p>{reason?editorialError(reason):item.status==='BLOCKED'?editorialError(item.code??'VALIDATION'):item.note??(bucket==='APPROVED'?'검사 후 실제 공개 여부를 확인하고 있습니다.':'본문과 근거를 확인하세요.')}</p><small>마지막 변경 {formatOperatorTime(item.updated_at??item.prepared_at)}</small><em>{bucket==='HELD'?'보관 이유 확인 · 복원 →':bucket==='PUBLISHED'?'공개본 보기 · 수정 →':failed?'문제 확인 · 수정 →':'글 열기 →'}</em></a></li>})}</ul>{visible.length>15&&<nav aria-label="목록 페이지"><button disabled={page===1} onClick={()=>setPage(v=>v-1)}>이전</button> {page} / {Math.ceil(visible.length/15)} <button disabled={page*15>=visible.length} onClick={()=>setPage(v=>v+1)}>다음</button></nav>}</section>
  <details className="operator-panel"><summary>참고자료 보관함</summary><OperatorKnowledgeSources/></details><details><summary>기술 정보</summary><p>로그인 계정 {email}. 목록은 원고 작업의 식별자로 구분하며 프로그램의 실행 로그를 별도 글로 추가하지 않습니다.</p></details>
 </section>
}
