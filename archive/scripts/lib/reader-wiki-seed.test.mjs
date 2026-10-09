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
test('actual approved snapshots enter Production only with byte-bound human approvals',async()=>{
  const preview = await loadReaderWikiSeeds(undefined,{allowPreview:true})
  const production = await loadReaderWikiSeeds(undefined,{allowPreview:false})
  assert.deepEqual(production.map(s=>s.chronicleId),['C01-HAN-JUNHO','C02-STRONGHOLD'])
  assert.ok(production.every(s=>s.publication==='HUMAN_APPROVED'))
  assert.ok(production.every(s=>s.notice.includes('누락된 과거 기록')))
  assert.ok(preview.every(s=>s.publication==='HUMAN_APPROVED'))
  const projected=JSON.stringify(readerWikiProjection(production))
  assert.ok(projected.includes('HUMAN_APPROVED'))
  for (const secret of ['bookSha256','bodySha256','sourceHashes','approvalReference','USER_CHAT_EXPLICIT_APPROVAL','sourceMainSha'])
    assert.ok(!projected.includes(secret),secret)
})

test('a human approval publishes only its exact immutable seed and book, never a future work', async () => {
  const base = await mkdtemp(resolve(tmpdir(), 'reader-wiki-human-approval-'))
  const catalog = {}
  const manifestPath = resolve(base, 'archive/content/wiki/PUBLIC_APPROVALS.json')
  const files = new Map()
  try {
    for (const id of ['C04-FIXTURE','C05-FIXTURE']) {
      const f = fixture(id)
      const seedBytes = Buffer.from(JSON.stringify(f.seed))
      files.set(id,{...f,seedBytes})
      catalog[id] = [{archivePath:f.book.chapters[0].archiveSourceRefs[0]}]
      await mkdir(resolve(base,'archive/content/wiki',id),{recursive:true})
      await mkdir(resolve(base,'archive/content/stories',id),{recursive:true})
      await mkdir(resolve(base,'public'),{recursive:true})
      await writeFile(resolve(base,'archive/content/wiki',id,'SEED.json'),seedBytes)
      await writeFile(resolve(base,'archive/content/stories',id,'BOOK.json'),f.bytes)
      await writeFile(resolve(base,f.book.chapters[0].archiveSourceRefs[0]),body)
    }
    const approval={
      version:'reader-wiki-public-approvals-v1',scope:'INITIAL_PUBLIC_READER_WORLD_WIKI',
      approvalReference:'USER_CHAT_EXPLICIT_APPROVAL_2026-10-09',approvedOnKst:'2026-10-09',
      sourceMainSha:'a'.repeat(40),
      items:[{
        chronicleId:'C04-FIXTURE',decision:'APPROVE',
        seedSha256:byteHash(files.get('C04-FIXTURE').seedBytes),
        bookSha256:byteHash(files.get('C04-FIXTURE').bytes),
      }],
    }
    const saveApproval=()=>writeFile(manifestPath,JSON.stringify(approval))
    await saveApproval()
    assert.deepEqual((await loadReaderWikiSeeds(base,{allowPreview:false,catalog})).map(s=>s.chronicleId),['C04-FIXTURE'])
    const preview=await loadReaderWikiSeeds(base,{allowPreview:true,catalog})
    assert.equal(preview[0].publication,'HUMAN_APPROVED')
    assert.equal(preview[1].publication,'PREVIEW_ONLY')
    assert.equal(preview[1].notice,'Fictional test fixture, never a public work.')
    // A corrected subtitle still requires a renewed approval.
    const seedPath=resolve(base,'archive/content/wiki/C04-FIXTURE/SEED.json')
    const changed=structuredClone(files.get('C04-FIXTURE').seed)
    changed.nodes[0].subtitle='Corrected, but not approved'
    await writeFile(seedPath,JSON.stringify(changed))
    await assert.rejects(loadReaderWikiSeeds(base,{allowPreview:false,catalog}),/APPROVAL_SOURCE_CHANGED/)
    await writeFile(seedPath,files.get('C04-FIXTURE').seedBytes)
    approval.items[0].bookSha256='b'.repeat(64)
    await saveApproval()
    await assert.rejects(loadReaderWikiSeeds(base,{allowPreview:true,catalog}),/APPROVAL_SOURCE_CHANGED/)
    approval.items[0].bookSha256=byteHash(files.get('C04-FIXTURE').bytes)
    approval.items[0].decision='REJECT'
    await saveApproval()
    await assert.rejects(loadReaderWikiSeeds(base,{allowPreview:false,catalog}),/APPROVAL_ENTRY/)
    approval.items[0].decision='APPROVE'
    approval.items.push({...approval.items[0],chronicleId:'C06-NOT-REGISTERED'})
    await saveApproval()
    await assert.rejects(loadReaderWikiSeeds(base,{allowPreview:false,catalog}),/APPROVAL_ORPHAN/)
    approval.items.pop()
    await saveApproval()
    assert.deepEqual((await loadReaderWikiSeeds(base,{allowPreview:false,catalog})).map(s=>s.chronicleId),['C04-FIXTURE'])
  } finally { await rm(base,{recursive:true,force:true}) }
})

test('canonical source refs must match the allowed archive mapping, not an arbitrary path', async () => {
  const base=await mkdtemp(resolve(tmpdir(),'reader-wiki-mapping-')); const f=fixture();
  f.book.chapters[0].sourceRefs=['original/C04.md']; f.bytes=Buffer.from(JSON.stringify(f.book)); f.seed.bookSha256=byteHash(f.bytes);
  try {
    await mkdir(resolve(base,'archive/content/wiki',f.seed.chronicleId),{recursive:true});
    await mkdir(resolve(base,'archive/content/stories',f.seed.chronicleId),{recursive:true});
    await mkdir(resolve(base,'public'),{recursive:true});
    await writeFile(resolve(base,'archive/content/wiki',f.seed.chronicleId,'SEED.json'),JSON.stringify(f.seed));
    await writeFile(resolve(base,'archive/content/stories',f.seed.chronicleId,'BOOK.json'),f.bytes);
    await writeFile(resolve(base,f.book.chapters[0].archiveSourceRefs[0]),body);
    const catalog={ [f.seed.chronicleId]:[{archivePath:f.book.chapters[0].archiveSourceRefs[0],canonicalRef:'original/C04.md'}] };
    assert.equal((await loadReaderWikiSeeds(base,{catalog})).length,1);
    catalog[f.seed.chronicleId][0].canonicalRef='private/other-world.md';
    await assert.rejects(loadReaderWikiSeeds(base,{catalog}),/RAW_REFS/);
  } finally {await rm(base,{recursive:true,force:true})}
});
