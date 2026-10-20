import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { OperatorBagKnowledgeInbox } from './OperatorBagKnowledgeInbox'
import { BAG_QUEUE_PATH, checkedDraftFile, decodeGithubText, githubContentUrl, fetchGithubDraft,
  joinBagReviewStates, parseBagDraft, readBagDraftQueue, readBagDraftDirectory, bagDraftLabel } from './bagKnowledgeDraftInbox'
const sha='a'.repeat(40), hash='b'.repeat(64)
const file='GUIDE_08_DRAFT_V01.md'
const dir=(blob=sha)=>readBagDraftDirectory([{type:'file',name:file,sha:blob}])
const queue=(approved=false)=>readBagDraftQueue(JSON.stringify({catalogTotal:49,articles:{'guide-08':{
  file,state:approved?'USER_APPROVED_FOR_PUBLICATION':'PENDING_INDEPENDENT_REVIEW',
  approvedAt:'2026-10-13',approvalEvidence:'Explicit user approval',sourceSha256:hash,
}}}))
afterEach(()=>vi.unstubAllGlobals())
describe('read-only manuscript inventory and publication boundary',()=>{
 it('decodes Unicode and restricts IDs, filenames and refs',()=>{
  const content=btoa(String.fromCharCode(...new TextEncoder().encode('한글 원고')))
  expect(decodeGithubText({type:'file',encoding:'base64',content})).toBe('한글 원고')
  expect(()=>decodeGithubText({type:'dir',encoding:'base64',content})).toThrow()
  expect(checkedDraftFile('guide-43','GUIDE_43_FLASHLIGHT_DRAFT_V01.md')).toContain('FLASHLIGHT')
  for(const [id,f] of [['guide-50','GUIDE_50_DRAFT_V01.md'],['guide-09',file],['guide-08','../'+file]]) expect(()=>checkedDraftFile(id,f)).toThrow()
  expect(()=>githubContentUrl('../.env')).toThrow()
  expect(()=>githubContentUrl(BAG_QUEUE_PATH,'other')).toThrow()
 })
 it('counts real files instead of a stale queue and exposes missing IDs without fabricating slugs',()=>{
  const result=joinBagReviewStates(queue(),queue(),dir(),[])
  expect(result).toHaveLength(49)
  expect(result.filter(i=>i.file)).toHaveLength(1)
  expect(result.find(i=>i.id==='guide-08')?.name).toBe('여벌 속옷')
  expect(result.find(i=>i.id==='guide-49')).toMatchObject({file:null,state:'SOURCE_NOT_RECEIVED',approved:false})
  expect(bagDraftLabel('SOURCE_NOT_RECEIVED')).toBe('원문 미확보')
 })
 it('requires main approval evidence and identical bytes, not a filename or working state',()=>{
  expect(joinBagReviewStates(queue(true),queue(),dir(),dir()).find(i=>i.id==='guide-08')?.approved).toBe(false)
  expect(joinBagReviewStates(queue(),queue(true),dir(),dir('c'.repeat(40))).find(i=>i.id==='guide-08')?.approved).toBe(false)
  expect(joinBagReviewStates(queue(),queue(true),dir(),dir()).find(i=>i.id==='guide-08')?.approved).toBe(true)
  const q=queue(true);q.articles['guide-08'].approvalEvidence=''
  expect(joinBagReviewStates(queue(),q,dir(),dir()).find(i=>i.id==='guide-08')?.approved).toBe(false)
 })
 it('separates actual Production SHA proof from Preview, stale and missing evidence',()=>{
  const listed=[{id:'guide-08',href:'/knowledge/bag/spare-underwear/',sourceSha256:hash}]
  const item=(production:boolean,rows=listed)=>joinBagReviewStates(queue(),queue(true),dir(),dir(),{production,listed:rows}).find(i=>i.id==='guide-08')!
  expect(item(false).publication).toBe('BUILD_ONLY')
  expect(item(true).publication).toBe('VERIFIED')
  expect(item(true,[{...listed[0],sourceSha256:'d'.repeat(64)}]).publication).toBe('UNKNOWN')
  expect(item(true,[]).publication).toBe('UNKNOWN')
 })
 it('does not double count a Library source after synchronization',()=>{
  const receipts={articles:{'guide-08':{file,blob:sha,sha256:hash,origin:'LIBRARY' as const}}}
  const result=joinBagReviewStates(queue(),queue(),dir(),[],undefined,receipts)
  expect(result.filter(i=>i.file)).toHaveLength(1)
  expect(result.find(i=>i.id==='guide-08')?.origin).toBe('LIBRARY')
 })
 it('rejects duplicate IDs, metadata spoofing, malformed UTF-8 and a read changed since listing',async()=>{
  expect(()=>readBagDraftDirectory([{type:'file',name:file,sha},{type:'file',name:'GUIDE_08_OTHER_DRAFT_V01.md',sha}])).toThrow('DUPLICATE')
  expect(()=>readBagDraftDirectory([{type:'file',name:file}])).toThrow('BLOB')
  const raw='---\ncontentType: bag-item-knowledge\ncatalogId: guide-08\ncatalogName: 여벌 속옷\ngroup: clothing\ncategory: other\nslug: spare-underwear\ntitle: 여벌 속옷\n---\n# 원고'
  expect(parseBagDraft(raw,'guide-08').title).toBe('여벌 속옷')
  expect(()=>parseBagDraft(raw.replace('category: other','category: water'),'guide-08')).toThrow('CATALOG')
  expect(()=>parseBagDraft(raw.replace('catalogId: guide-08','catalogId: guide-08\ncatalogId: guide-09'),'guide-08')).toThrow()
  expect(()=>decodeGithubText({type:'file',encoding:'base64',content:'/w=='})).toThrow('ENCODING')
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({sha:'c'.repeat(40)})}))
  await expect(fetchGithubDraft('docs/bunker_os/bag_knowledge/'+file,undefined,sha)).rejects.toThrow('CHANGED')
 })
 it('renders an Operator shelf with four distinct stages and no mutation buttons',()=>{
  const html=renderToStaticMarkup(createElement(OperatorBagKnowledgeInbox))
  for(const label of ['생존가방 원고 보관함','작성됨','검수·승인 대기','발행 승인','정식 게시','읽기 전용'])expect(html).toContain(label)
  expect(html).not.toContain('게시 승인하기')
  expect(html).not.toContain('USER_APPROVED_FOR_PUBLICATION')
 })
})
