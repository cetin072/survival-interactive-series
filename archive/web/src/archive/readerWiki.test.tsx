import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildReaderWikiDocuments, readerWikiDocuments, type ReaderWikiSeed } from './readerWiki'
import { WikiShellPreview } from './WikiShellPreview'
import type { ReaderChapter } from './storyData'
const fixture = (id: string) => {
  const evidence = { chapterId: 'chapter-shared', quote: 'A fictional chapter records Mira at the northern gate.' }
  const seed: ReaderWikiSeed = {chronicleId:id,notice:'Fixture only',nodes:[
    {id:'char-mira',type:'character',title:'Mira '+id,subtitle:'Fixture',facts:[{text:'Mira waits.',kind:'RECORDED',evidence}]},
    {id:'loc-gate',type:'location',title:'Gate '+id,subtitle:'Fixture',facts:[{text:'Northern gate.',kind:'RECORDED',evidence}]},
  ],relations:[{from:'char-mira',to:'loc-gate',label:'waits at',evidence}]}
  const chapter = {id:'chapter-shared',chronicleId:id,chapterNumber:1,title:'Chapter '+id,sourceRefs:['original/'+id+'.md','original/'+id+'-second.md'],archiveSourceRefs:['public/'+id+'.md','public/'+id+'-second.md']} as ReaderChapter
  const parts = [{id:'part-one',title:'RAW '+id,source:'original/'+id+'.md'},{id:'part-two',title:'Second RAW '+id,source:'original/'+id+'-second.md'}]
  return {seed,chapter,parts}
}
describe('Reader Wiki shared contract and source identity',()=>{
  it('keeps colliding C04/C05 IDs and all chapter RAW links within their own work',()=>{
    const a=fixture('C04-FIXTURE'),b=fixture('C05-FIXTURE')
    const chapters=[a.chapter,b.chapter]
    const da=buildReaderWikiDocuments(a.seed,chapters,a.parts)[0]
    const db=buildReaderWikiDocuments(b.seed,chapters,b.parts)[0]
    expect(da.id).toBe(db.id)
    expect(da.chronicleId).not.toBe(db.chronicleId)
    expect(da.sources).toHaveLength(2)
    expect(da.sources.every(source=>source.partTitle.includes('C04'))).toBe(true)
    expect(db.relations[0].title).toBe('Gate C05-FIXTURE')
    expect(da.quotes?.some(record=>record.kind==='관계의 기록 근거')).toBe(true)
    expect(da.history).toEqual([])
    expect(da.anchor.saveVersion).toBeUndefined()
    expect(()=>buildReaderWikiDocuments(a.seed,[b.chapter],a.parts)).toThrow(/scope mismatch/)
    expect(()=>buildReaderWikiDocuments(a.seed,chapters,[])).toThrow(/RAW link missing/)
  })
  it('renders real C01 facts, relation evidence, Reader and RAW without fabricated state or images',()=>{
    const document=readerWikiDocuments('C01-HAN-JUNHO').find(item=>item.id==='char-junho')!
    const markup=renderToStaticMarkup(createElement(WikiShellPreview,{chronicleId:'C01-HAN-JUNHO',nodeId:document.id}))
    expect(markup).toContain('한준호')
    expect(markup).toContain('위키 검수 후보')
    expect(markup).toContain('관계의 기록 근거')
    expect(markup).toContain('chronicle=C01-HAN-JUNHO&amp;chapter=c01-han-junho-chapter-01')
    expect(markup).toContain('chronicle=C01-HAN-JUNHO&amp;part=')
    expect(markup).toContain('node=char-seoyun&amp;chronicle=C01-HAN-JUNHO')
    expect(markup).not.toContain('save undefined')
    expect(markup).not.toContain('공개 Graph ·')
    expect(markup).not.toContain('wiki-infobox-cover')
    expect(markup).not.toContain('wiki-visuals')
    expect(markup).not.toContain('node=char-jinwoo')
    expect(renderToStaticMarkup(createElement(WikiShellPreview,{chronicleId:'C02-STRONGHOLD',nodeId:'char-junho'}))).toContain('세계관 문서를 찾을 수 없습니다')
  })
})

 it('links both actual C02 chapter-one RAW parts using canonical source mapping',()=>{
   const document=readerWikiDocuments('C02-STRONGHOLD').find(item=>item.id==='char-dohyun')!;
   const sources=document.sources.filter(s=>s.chapterId==='c02-stronghold-chapter-01');
   expect(sources).toHaveLength(2); expect(new Set(sources.map(s=>s.partId)).size).toBe(2);
   const markup=renderToStaticMarkup(createElement(WikiShellPreview,{chronicleId:'C02-STRONGHOLD',nodeId:document.id}));
   expect(markup).toContain('chronicle=C02-STRONGHOLD&amp;chapter=c02-stronghold-chapter-01');
   expect(markup).toContain('chronicle=C02-STRONGHOLD&amp;part=');
   expect(markup).not.toContain('node=char-jinwoo'); expect(markup).not.toContain('wiki-visuals');
 });
