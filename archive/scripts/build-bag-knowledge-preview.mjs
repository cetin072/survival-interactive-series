// Review-only output in dist, never in public/ or the app's published manifest.
import {readFile,writeFile,mkdir,rm,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {articleFromDraft,articlePage,esc,previewBuildAllowed} from './lib/bag-item-article.mjs';
import {PUBLISHED_ITEMS} from '../web/public/bag-lab/knowledge-links.mjs';
const root=new URL('../../',import.meta.url),drafts=new URL('docs/bunker_os/bag_knowledge/',root);
const output=new URL('archive/web/dist/bag-review/',root);
const queue=JSON.parse(await readFile(new URL('DRAFT_QUEUE_V1.json',drafts),'utf8'));
// Publication mapping may refer only to files already produced by normal publishing.
for(const [id,path] of Object.entries(PUBLISHED_ITEMS)){
  if(!/^guide-(0[1-9]|[1-4][0-9])$/.test(id)||!/^\/knowledge\/[a-z0-9/-]+\/$/.test(path))throw new Error('Invalid published item mapping');
  await access(new URL('archive/web/public'+path+'index.html',root));
  if(queue.articles[id]?.state.endsWith('USER_PENDING'))throw new Error('Pending article cannot be published');
}
const enabled=previewBuildAllowed(process.env);
// This exact generated directory is the only deletion target. No content source/DB/cache.
await rm(output,{recursive:true,force:true});
if(!enabled){console.log('PASS BAG manuscript previews excluded from this build');process.exit(0);}
await mkdir(output,{recursive:true});
const articles=[];
for(const [id,item] of Object.entries(queue.articles)){
  if(!['INDEPENDENT_PASS_USER_PENDING','LIGHT_REVIEW_PASS_USER_PENDING'].includes(item.state))continue;
  if(!/^GUIDE_[A-Z0-9_]+\.md$/.test(item.file))throw new Error('Invalid draft filename');
  const article=articleFromDraft(await readFile(new URL(item.file,drafts),'utf8'),id);
  for(const link of article.internal)await access(new URL('archive/web/public'+link.url+'index.html',root));
  await mkdir(new URL(article.slug+'/',output),{recursive:true});
  await writeFile(new URL(article.slug+'/index.html',output),articlePage(article));
  articles.push({...article,review:item.state.startsWith('INDEPENDENT')?'독립 검수 PASS':'간편 검수 PASS'});
}
await writeFile(new URL('index.html',output),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>물품 지식 발행 검토 | 나의 생존가방</title><link rel="stylesheet" href="/knowledge/knowledge.css"><link rel="stylesheet" href="/bag/article.css"></head><body><main class="bag-article"><h1>물품 지식 발행 검토</h1><p>8편의 독자용 화면을 확인해 주세요. 콘텐츠 검수와 별도로 모두 사용자 발행 승인 대기입니다. 앱의 공개 지식 링크에는 연결하지 않았습니다.</p><ul>${articles.map(a=>`<li><a href="./${a.slug}/">${esc(a.title)}</a><p>${a.review} · 사용자 발행 승인 대기 · 미게시</p></li>`).join('')}</ul><a href="/bag/">생존가방 보기</a></main></body></html>`);
console.log('PASS BAG review-only previews:',articles.length,fileURLToPath(output));
