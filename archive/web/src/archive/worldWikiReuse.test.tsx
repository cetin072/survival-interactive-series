import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('./chronicleRegistry', async importOriginal => {
  const actual = await importOriginal<typeof import('./chronicleRegistry')>()
  const fixtures = ['C04-FIXTURE','C05-FIXTURE','C06-EMPTY'].map((id,index) => ({
    ...actual.chronicleRegistry[0], id, number:4+index, title:'Fixture '+id,
    protagonist:'Mira', readerAvailable:false, status:'PLANNED' as const,
  }))
  const registry = [...actual.chronicleRegistry, ...fixtures]
  return {...actual, chronicleRegistry:registry,
    getChronicle:(id:string)=>{const item=registry.find(c=>c.id===id);if(!item)throw Error('Unknown Chronicle');return item}}
})
vi.mock('./readerWiki', async importOriginal => {
  const actual = await importOriginal<typeof import('./readerWiki')>()
  const {readerChapters} = await import('./storyData')
  const docs = ['C04-FIXTURE','C05-FIXTURE'].flatMap(id => {
    const evidence={chapterId:'fixture-shared',quote:'A fictional fixture records Mira beside her own gate.'}
    const seed={chronicleId:id,notice:'Test-only candidate',nodes:[
      ...Array.from({length:7},(_,i)=>({id:i===0?'char-seojin':'char-mira-'+i,
        type:'character' as const,title:'Mira '+id+' '+i,subtitle:'Own '+id,
        facts:[{text:'Own fact '+id,kind:'RECORDED',evidence}]})),
      {id:'loc-gate',type:'location' as const,title:'Gate '+id,subtitle:'Own gate',
        facts:[{text:'Own gate '+id,kind:'RECORDED',evidence}]},
      {id:'event-wait',type:'event' as const,title:'Wait '+id,subtitle:'Own event',
        facts:[{text:'Own event '+id,kind:'RECORDED',evidence}]},
    ],relations:[{from:'char-seojin',to:'loc-gate',label:'waits at',evidence}]}
    const chapter={...readerChapters[0],id:'fixture-shared',chronicleId:id,
      title:'Chapter '+id,sourceRefs:['original/'+id],archiveSourceRefs:['public/'+id]}
    return actual.buildReaderWikiDocuments(seed,[chapter],
      [{id:'part-shared',title:'RAW '+id,source:'original/'+id}])
  })
  return {...actual, readerWikiChronicleIds:[...actual.readerWikiChronicleIds,'C04-FIXTURE','C05-FIXTURE'],
    allReaderWikiDocuments:[...actual.allReaderWikiDocuments,...docs],
    readerWikiDocuments:(id:string)=>docs.filter(d=>d.chronicleId===id).length
      ?docs.filter(d=>d.chronicleId===id):actual.readerWikiDocuments(id)}
})
import { WikiShellPreview } from './WikiShellPreview'
import { WikiWorldLobby } from './WikiWorldLobby'
import { publicSearchIndex } from './wikiSearch'
describe('future-work reuse with test-only registries and source-bound adapters',()=>{
  it('renders both colliding fixture worlds, scoped relations and Reader/RAW links without images',()=>{
    for(const id of ['C04-FIXTURE','C05-FIXTURE']){
      const other=id==='C04-FIXTURE'?'C05-FIXTURE':'C04-FIXTURE'
      const html=renderToStaticMarkup(createElement(WikiShellPreview,{chronicleId:id,nodeId:'char-seojin'}))
      expect(html).toContain('Mira '+id)
      expect(html).toContain('node=loc-gate&amp;chronicle='+id)
      expect(html).toContain('chronicle='+id+'&amp;chapter=fixture-shared')
      expect(html).toContain('chronicle='+id+'&amp;part=part-shared')
      expect(html).not.toContain('Mira '+other)
      expect(html).not.toContain('서진우')
      expect(html).not.toContain('wiki-visuals')
      const world=renderToStaticMarkup(createElement(WikiShellPreview,{chronicleId:id,page:'world'}))
      const section=world.slice(world.indexOf('id="characters"'),world.indexOf('id="locations"'))
      expect((section.split('<details')[0].match(/href=/g)??[]).length).toBe(6)
      expect(section).toContain('나머지 1명 더 보기')
    }
  })
  it('distinguishes registry-only empty worlds and scoped search collision entries',()=>{
    const html=renderToStaticMarkup(createElement(WikiWorldLobby))
    expect(html).toContain('page=world&amp;chronicle=C04-FIXTURE')
    expect(html).not.toContain('page=world&amp;chronicle=C06-EMPTY')
    const empty=renderToStaticMarkup(createElement(WikiShellPreview,{chronicleId:'C06-EMPTY',page:'world'}))
    expect(empty).toContain('세계관 문서 준비 중')
    const collision=publicSearchIndex.filter(e=>e.id.endsWith(':char-seojin'))
    expect(collision.filter(e=>e.chronicleId?.includes('FIXTURE'))).toHaveLength(2)
    expect(new Set(collision.map(e=>e.id)).size).toBe(collision.length)
    expect(collision.every(e=>e.href.includes('chronicle='+e.chronicleId))).toBe(true)
    expect(renderToStaticMarkup(createElement(WikiShellPreview,{chronicleId:'C04-FIXTURE',nodeId:'char-jinwoo'}))).toContain('세계관 문서를 찾을 수 없습니다')
  })
})
