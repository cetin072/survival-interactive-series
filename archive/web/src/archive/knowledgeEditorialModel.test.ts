import {describe,it,expect} from 'vitest'
import {readableBrief,quoteLocations,editorialStatus} from './knowledgeEditorialModel'
import type {KnowledgeDraftBrief} from './KnowledgeDraftEditor'
const raw=()=>({id:'K-999',title:'검증',sections:[{heading:'확인',blocks:[{type:'prose',text:'정확한 인용 문장'}]}]} as KnowledgeDraftBrief)
describe('editorial legacy projection and current anchors',()=>{
 it('preserves Markdown and string tools in a separate working copy',()=>{
  const legacy={id:'K-998',body_md:'## 옛 제목\n옛 본문',tools:'옛 자료 위치'} as unknown as KnowledgeDraftBrief
  const before=JSON.stringify(legacy),draft=readableBrief(legacy)
  expect(draft.sections.some(s=>s.blocks.some(b=>'text' in b&&b.text.includes('옛 본문')))).toBe(true)
  expect(draft.tools).toEqual(['옛 자료 위치']);expect(JSON.stringify(legacy)).toBe(before)
 })
 it('follows moved text and rejects duplicate or deleted quotes',()=>{
  const b=readableBrief(raw()),q='정확한 인용 문장'
  expect(quoteLocations(b,q)).toBe(1)
  b.sections.unshift({heading:'추가',blocks:[{type:'prose',text:'새 문단'}]})
  expect(quoteLocations(b,q)).toBe(1)
  b.sections[1].blocks=[{type:'prose',text:q+' '+q}]
  expect(quoteLocations(b,q)).toBe(2)
  b.sections.pop();expect(quoteLocations(b,q)).toBe(0)
 })
 it('does not call a newer saved draft published',()=>{
  expect(editorialStatus({job_id:'a',revision:3,brief:null,brief_id:'K-999',archived:false,evidence_review:{claims:[],resolutions:[]},status:'HUMAN_REVIEW',history:[],public_record:{request_id:'b',revision:2,status:'PUBLISHED',publish_requested:true,updated_at:''}})).toBe('검토할 글')
 })
})
