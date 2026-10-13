import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {articleFromDraft,articlePage,safeLink,previewBuildAllowed} from './bag-item-article.mjs';
import {approvedBagArticles} from './bag-item-publication.mjs';
import {CATALOG} from '../../web/public/bag-lab/catalog.mjs';
import {PUBLISHED_ITEMS,knowledgeFor,publishedKnowledgeForItem} from '../../web/public/bag-lab/knowledge-links.mjs';
const root=new URL('../../../',import.meta.url);
const queue=JSON.parse(await readFile(new URL('docs/bunker_os/bag_knowledge/DRAFT_QUEUE_V1.json',root),'utf8'));

test('all eight user-approved published items have exact catalog identity and clean public reader projection',async()=>{
 const approved=await approvedBagArticles();
 assert.ok(approved.length>=8);
 const approvedIds=['guide-01','guide-02','guide-03','guide-04','guide-05','guide-06','guide-07','guide-43'];
 for(const id of approvedIds)assert.ok(approved.some(article=>article.id===id),id);
 for(const item of approved){
   const raw=await readFile(new URL('docs/bunker_os/bag_knowledge/'+queue.articles[item.id].file,root),'utf8');
   const article=articleFromDraft(raw,item.id);
   assert.ok(article.content.includes('지금 30초 점검'));
   assert.ok(!/DRAFT|reviewedAt|guide-\d|게시 후 연결|Automation C|앱 연결|변경 이력|자료·링크 확인/.test(article.content));
   const page=articlePage(article,{published:true});
   assert.ok(page.includes('이 물품을 직접 준비하고 관리하려면?'));
   assert.ok(page.includes('<meta name="robots" content="index,follow">'));
   assert.ok(page.includes('rel="canonical" href="https://survival-diary-archive.netlify.app'+item.href+'"'));
   assert.ok(page.includes('src="/knowledge/share.js"'));
   assert.ok(!page.includes('사용자 발행 승인 대기'));
   assert.equal(PUBLISHED_ITEMS[item.id],item.href);
   for(const link of article.internal)await access(new URL('archive/web/public'+link.url+'index.html',root));
   assert.throws(()=>articleFromDraft(raw,item.id==='guide-01'?'guide-02':'guide-01'));
 }
});
test('approved article list maps the eight catalog items; unapproved items retain existing public fallback',async()=>{
 assert.ok(Object.keys(PUBLISHED_ITEMS).length>=8);
 assert.equal(knowledgeFor(CATALOG.find(e=>e.id==='guide-43')),'/knowledge/bag/flashlight/');
 for(const entry of CATALOG){
   if(!PUBLISHED_ITEMS[entry.id])await access(new URL('archive/web/public'+knowledgeFor(entry)+'index.html',root));
   else assert.equal(knowledgeFor(entry),PUBLISHED_ITEMS[entry.id]);
 }
 assert.equal(publishedKnowledgeForItem({id:'catalog-guide-43',name:'손전등'}),'/knowledge/bag/flashlight/');
 assert.equal(publishedKnowledgeForItem({id:'custom-1',name:'우의'}),'/knowledge/bag/raincoat/');
 assert.equal(publishedKnowledgeForItem({id:'custom-2',name:'맞춤 손전등'}),null);
 assert.equal(publishedKnowledgeForItem({id:'custom-3',name:'보조배터리'}),null);
});
test('preview/publication gates reject unsupported origins and unsafe links',()=>{
 for(const env of [{CONTEXT:'production',BAG_KNOWLEDGE_PREVIEW:'1'},{CONTEXT:'branch-deploy',BRANCH:'qa-preview'},{}])
   assert.equal(previewBuildAllowed(env),false);
 for(const env of [{CONTEXT:'deploy-preview'},{CONTEXT:'branch-deploy',BRANCH:'qa-bag-side'},{BAG_KNOWLEDGE_PREVIEW:'1'}])
   assert.equal(previewBuildAllowed(env),true);
 for(const bad of ['javascript:alert(1)','//evil.example/','http://example.com','/operator/'])assert.throws(()=>safeLink(bad));
});
