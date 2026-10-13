import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {articleFromDraft,articlePage,safeLink,previewBuildAllowed} from './bag-item-article.mjs';
import {CATALOG} from '../../web/public/bag-lab/catalog.mjs';
import {PUBLISHED_ITEMS,knowledgeFor} from '../../web/public/bag-lab/knowledge-links.mjs';
const root=new URL('../../../',import.meta.url),folder=new URL('docs/bunker_os/bag_knowledge/',root);
const queue=JSON.parse(await readFile(new URL('DRAFT_QUEUE_V1.json',folder),'utf8'));
test('8 review-passed manuscripts have exact catalog identity; public prose excludes all editorial data',async()=>{
 assert.equal(Object.keys(queue.articles).length,8);
 for(const [id,item]of Object.entries(queue.articles)){
  assert.ok(item.state.endsWith('USER_PENDING'));
  const raw=await readFile(new URL(item.file,folder),'utf8'),article=articleFromDraft(raw,id);
  assert.ok(article.content.includes('지금 30초 점검'));
  assert.ok(!article.content.includes('# '+article.title),'source title must not repeat inside the body');
  assert.ok(!/DRAFT|reviewedAt|guide-\d|게시 후 연결|Automation C|앱 연결|변경 이력|자료·링크 확인/.test(article.content));
  assert.ok(articlePage(article).includes('noindex,nofollow,noarchive'));
  for(const link of article.internal)await access(new URL('archive/web/public'+link.url+'index.html',root));
  assert.throws(()=>articleFromDraft(raw,id==='guide-01'?'guide-02':'guide-01'));
 }
});
test('pending manuscripts never activate app links; all 49 entries have existing public fallback',async()=>{
 assert.equal(Object.keys(PUBLISHED_ITEMS).length,0);
 for(const entry of CATALOG)await access(new URL('archive/web/public'+knowledgeFor(entry)+'index.html',root));
 assert.equal(knowledgeFor(CATALOG.find(e=>e.id==='guide-03')),'/knowledge/family-emergency-contact-plan/');
});
test('preview output requires exact build context, production cannot be opted in',()=>{
 for(const env of [{CONTEXT:'production',BAG_KNOWLEDGE_PREVIEW:'1'},{CONTEXT:'branch-deploy',BRANCH:'qa-preview'},{}])assert.equal(previewBuildAllowed(env),false);
 for(const env of [{CONTEXT:'deploy-preview'},{CONTEXT:'branch-deploy',BRANCH:'qa-bag-side'},{BAG_KNOWLEDGE_PREVIEW:'1'}])assert.equal(previewBuildAllowed(env),true);
 for(const bad of ['javascript:alert(1)','//evil.example/','http://example.com','/operator/'])assert.throws(()=>safeLink(bad));
});
