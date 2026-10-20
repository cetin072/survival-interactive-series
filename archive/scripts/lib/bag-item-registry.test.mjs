import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {manuscriptRegistry,draftDirectory,sha256,gitBlob,verifyPublicationSource,draftMetadata} from './bag-item-registry.mjs';
import {CATALOG} from '../../web/public/bag-lab/catalog.mjs';
import {PUBLISHED_ITEMS,knowledgeFor,publishedKnowledgeForItem} from '../../web/public/bag-lab/knowledge-links.mjs';
import {approvedBagArticles} from './bag-item-publication.mjs';

test('49 explicit IDs, verified sources and unreceived slots are independent of the eight public URLs',async()=>{
  const registry=await manuscriptRegistry();
  assert.equal(Object.keys(registry.articles).length,49);
  assert.equal(registry.available+registry.missing.length,49);
  const slugs=new Set();
  for(const c of CATALOG){
    const r=registry.articles[c.id];
    for(const [a,b] of [['catalogId','id'],['catalogName','name'],['group','group'],['category','category']])assert.equal(r[a],c[b]);
    if(r.file){assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.ok(!slugs.has(r.slug));slugs.add(r.slug);}
    else{assert.equal(r.slug,null);assert.equal(r.sha256,null);assert.ok(!PUBLISHED_ITEMS[c.id]);}
    assert.equal(knowledgeFor(c),PUBLISHED_ITEMS[c.id]??'/knowledge/emergency-supplies-inventory/');
    assert.equal(publishedKnowledgeForItem({id:'catalog-'+c.id,name:'이름 수정'}),PUBLISHED_ITEMS[c.id]??null);
  }
  assert.equal(Object.keys(PUBLISHED_ITEMS).length,8);
  const published=await approvedBagArticles();assert.equal(published.length,8);
  for(const a of published)assert.equal(a.sourceSha256,registry.articles[a.id].sha256);
  assert.equal(publishedKnowledgeForItem({id:'catalog-guide-43',name:'방수 서류 파우치'}),'/knowledge/bag/flashlight/');
  assert.equal(publishedKnowledgeForItem({id:'catalog-guide-49',name:'손전등'}),null);
  assert.equal(publishedKnowledgeForItem({id:'catalog-guide-99',name:'손전등'}),null);
});
test('source admission rejects byte changes, missing receipts, duplicate IDs/slugs and category drift',async()=>{
  const path=await mkdtemp(tmpdir()+'/bag-registry-'),directory=pathToFileURL(path+'/');
  const file='GUIDE_08_DRAFT_V01.md',bytes=await readFile(new URL(file,draftDirectory));
  const receipt={origin:'GITHUB',file,commit:'a'.repeat(40),blob:gitBlob(bytes),sha256:sha256(bytes)};
  const receipts={articles:{'guide-08':receipt}};
  try{
    await writeFile(new URL(file,directory),bytes);
    assert.equal((await manuscriptRegistry({directory,receipts})).available,1);
    await assert.rejects(manuscriptRegistry({directory,receipts:{articles:{}}}),/RECEIPT/);
    await writeFile(new URL(file,directory),Buffer.concat([bytes,Buffer.from('\n')]));
    await assert.rejects(manuscriptRegistry({directory,receipts}),/RECEIPT/);
    await writeFile(new URL(file,directory),bytes);
    await copyFile(new URL(file,directory),new URL('GUIDE_08_OTHER_DRAFT_V01.md',directory));
    await assert.rejects(manuscriptRegistry({directory,receipts}),/DUPLICATE_ID/);
    await rm(new URL('GUIDE_08_OTHER_DRAFT_V01.md',directory));
    const next=(await readFile(new URL('GUIDE_09_DRAFT_V01.md',draftDirectory),'utf8')).replace('slug: spare-socks','slug: spare-underwear');
    await writeFile(new URL('GUIDE_09_DRAFT_V01.md',directory),next);
    await assert.rejects(manuscriptRegistry({directory,receipts}),/DUPLICATE_SLUG/);
    assert.throws(()=>draftMetadata(bytes.toString().replace('category: other','category: medicine'),file),/CATALOG/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('an approval applies only to the exact ID, filename and SHA, never the latest revision',()=>{
  const item={file:'GUIDE_08_DRAFT_V01.md',sourceSha256:'a'.repeat(64)};
  const record={file:item.file,sha256:item.sourceSha256};
  assert.doesNotThrow(()=>verifyPublicationSource('guide-08',item,record));
  assert.throws(()=>verifyPublicationSource('guide-08',item,{...record,sha256:'b'.repeat(64)}),/HASH/);
  assert.throws(()=>verifyPublicationSource('guide-08',{file:item.file},record),/HASH/);
  assert.throws(()=>verifyPublicationSource('guide-08',item,{...record,file:'GUIDE_09_DRAFT_V01.md'}),/HASH/);
});
