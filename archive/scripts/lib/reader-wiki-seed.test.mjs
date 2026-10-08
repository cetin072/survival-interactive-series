import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { byteHash } from './publication-graph.mjs'
import { validateReaderWikiSeed, loadReaderWikiSeeds, readerWikiProjection } from './reader-wiki-seed.mjs'
const body = 'A fictional fixture records Mira waiting beside the northern gate.'
function fixture(chronicleId = 'C04-FIXTURE') {
  const book = { chronicleId, worldlineId: chronicleId, chapters: [{
    id: 'chapter-one', sourceKind: 'VERIFIED_GM_NARRATIVE', body,
    archiveSourceRefs: ['public/' + chronicleId + '.md'], sourceRefs: ['public/' + chronicleId + '.md'], sourceHashes: [byteHash(body)],
  }] }
  const bytes = Buffer.from(JSON.stringify(book))
  const evidence = { chapterId: 'chapter-one', bodySha256: byteHash(body), quote: body }
  const seed = { version:'reader-wiki-seed-v1', chronicleId, worldlineId:chronicleId, publication:'PREVIEW_ONLY',
    coverage:'ALL_AVAILABLE_CHAPTERS', notice:'Fictional test fixture, never a public work.', bookSha256:byteHash(bytes),
    chapters:[{chapterId:'chapter-one',bodySha256:byteHash(body),status:'REVIEWED',note:'Fixture only.'}],
    nodes:[
      {id:'char-mira',type:'character',title:'Mira',subtitle:'Fixture',facts:[{text:'Mira waits at the gate.',kind:'RECORDED',evidence}]},
      {id:'loc-gate',type:'location',title:'Gate',subtitle:'Fixture',facts:[{text:'The gate is northern.',kind:'RECORDED',evidence}]},
    ], relations:[{from:'char-mira',to:'loc-gate',label:'waiting at',evidence}],
  }
  return {book,bytes,seed}
}
test('strict evidence, coverage and approval boundaries fail closed', () => {
  const f=fixture()
  assert.equal(validateReaderWikiSeed(f.seed,f.book,f.bytes),f.seed)
  const mutations=[
    [s=>s.chronicleId='C05-FIXTURE','SCOPE'],
    [s=>s.publication='HUMAN_APPROVED','REVIEW'],
    [s=>s.bookSha256='0'.repeat(64),'BOOK_CHANGED'],
    [s=>s.chapters=[],'COVERAGE'],
    [s=>s.chapters[0].status='HELD','UNVERIFIED_CHAPTER'],
    [s=>s.nodes[0].facts[0].evidence.bodySha256='0'.repeat(64),'SOURCE_CHANGED'],
    [s=>s.nodes[0].facts[0].evidence.quote='An unsupported fictional event.','QUOTE'],
    [s=>s.nodes[0].facts[0].evidence.chapterId='other-world-chapter','UNVERIFIED_CHAPTER'],
    [s=>s.relations[0].to='char-absent','RELATION'],
    [s=>s.nodes[0].type='location','NODE_TYPE'],
    [s=>s.nodes[0].privateSource='secret','NODE_FIELDS'],
  ]
  for(const [mutate,code] of mutations) {
    const seed=structuredClone(f.seed);mutate(seed)
    assert.throws(()=>validateReaderWikiSeed(seed,f.book,f.bytes),new RegExp('READER_WIKI_'+code))
  }
  const changed=structuredClone(f.book);changed.chapters[0].sourceKind='EDITORIAL_CANON_BRIDGE'
  assert.throws(()=>validateReaderWikiSeed(f.seed,changed,f.bytes),/SOURCE_CHANGED/)
})
test('build validates RAW scope and bytes; production excludes all candidates; colliding IDs stay scoped', async () => {
  const base=await mkdtemp(resolve(tmpdir(),'reader-wiki-'))
  const catalog={}
  try {
    for(const id of ['C04-FIXTURE','C05-FIXTURE']) {
      const f=fixture(id);catalog[id]=[{archivePath:f.book.chapters[0].archiveSourceRefs[0]}]
      await mkdir(resolve(base,'archive/content/wiki',id),{recursive:true})
      await mkdir(resolve(base,'archive/content/stories',id),{recursive:true})
      await mkdir(resolve(base,'public'),{recursive:true})
      await writeFile(resolve(base,'archive/content/wiki',id,'SEED.json'),JSON.stringify(f.seed))
      await writeFile(resolve(base,'archive/content/stories',id,'BOOK.json'),f.bytes)
      await writeFile(resolve(base,f.book.chapters[0].archiveSourceRefs[0]),body)
    }
    const loaded=await loadReaderWikiSeeds(base,{allowPreview:true,catalog})
    assert.deepEqual(loaded.map(s=>s.chronicleId),['C04-FIXTURE','C05-FIXTURE'])
    assert.equal(loaded[0].nodes[0].id,loaded[1].nodes[0].id)
    assert.deepEqual(await loadReaderWikiSeeds(base,{allowPreview:false,catalog}),[])
    const projected=JSON.stringify(readerWikiProjection(loaded))
    for(const field of ['bookSha256','bodySha256','sourceHashes','worldlineId','REVIEWED']) assert.ok(!projected.includes(field))
    await assert.rejects(loadReaderWikiSeeds(base,{catalog:{}}),/RAW_SCOPE/)
    await writeFile(resolve(base,'public/C05-FIXTURE.md'),'changed bytes')
    await assert.rejects(loadReaderWikiSeeds(base,{catalog}),/RAW_CHANGED/)
  } finally {await rm(base,{recursive:true,force:true})}
})
test('actual snapshots validate in Preview and never enter Production',async()=>{
  const seeds=await loadReaderWikiSeeds(undefined,{allowPreview:true})
  assert.ok(seeds.some(s=>s.chronicleId==='C01-HAN-JUNHO'))
  assert.deepEqual(await loadReaderWikiSeeds(undefined,{allowPreview:false}),[])
})
