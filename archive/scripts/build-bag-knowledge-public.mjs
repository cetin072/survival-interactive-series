// Produce only explicitly approved bag-item Knowledge in the website build output.
// Public article files and sitemap entries are derived; no draft or operator data.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {approvedBagArticles} from './lib/bag-item-publication.mjs';
import {articlePage,esc} from './lib/bag-item-article.mjs';

const root=new URL('../../',import.meta.url);
const dist=new URL('archive/web/dist/',root);
const origin='https://survival-diary-archive.netlify.app';
const items=await approvedBagArticles();
const titleLink=(item)=>'<article><div class="knowledge-library-meta"><span>물품별 생존지식</span><small>선택·사용·점검 가이드</small></div>'
  +'<h3><a href="'+esc(item.href)+'">'+esc(item.title)+'</a></h3>'
  +'<p>'+esc(item.summary)+'</p><div class="knowledge-library-footer"><span>생활 속 비상대비 물품</span>'
  +'<a href="'+esc(item.href)+'">글 읽기 →</a></div></article>';
const cards=items.map(titleLink).join('');
if(items.length){
  const articleFolder=new URL('knowledge/bag/',dist);
  await mkdir(articleFolder,{recursive:true});
  for(const item of items){
    for(const link of item.article.internal)await access(new URL('archive/web/public'+link.url+'index.html',root));
    const target=new URL(item.slug+'/index.html',articleFolder);
    await mkdir(new URL(item.slug+'/',articleFolder),{recursive:true});
    await writeFile(target,articlePage(item.article,{published:true}),'utf8');
  }
  const listing='<!doctype html><html lang="ko"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="index,follow">'
    +'<title>비상대비 물품별 생존지식 | 생존일기</title>'
    +'<meta name="description" content="방수 서류 파우치, 손전등, 우의 등 비상대비 물품의 필요성과 사용·관리법을 알아보세요.">'
    +'<link rel="canonical" href="'+origin+'/knowledge/bag/">'
    +'<link rel="stylesheet" href="/knowledge/knowledge.css">'
    +'<link rel="stylesheet" href="/bag/article.css"></head><body>'
    +'<div class="knowledge-shell"><header class="knowledge-header"><a class="knowledge-brand" href="/">생존일기</a>'
    +'<nav><a href="/knowledge/">생존 지식</a></nav></header>'
    +'<main class="bag-article"><h1>비상대비 물품별 생존지식</h1>'
    +'<p>어떤 상황에서 필요하고 어떻게 사용·보관할지, 물품별로 하나씩 확인해 보세요.</p>'
    +'<div class="knowledge-library-list"><div>'+cards+'</div></div>'
    +'<p><a href="/knowledge/">모든 생존지식 보기 →</a></p>'
    +'</main></div></body></html>';
  await writeFile(new URL('index.html',articleFolder),listing,'utf8');
  await writeFile(new URL('index.json',articleFolder),JSON.stringify(items.map(({id,title,summary,href,sourceSha256})=>({id,title,summary,href,sourceSha256})),null,2)+'\n','utf8');
  const indexPath=new URL('knowledge/index.html',dist);
  const current=await readFile(indexPath,'utf8');
  const terminator='</div></main>';
  if(current.split(terminator).length!==2||current.includes('id="knowledge-bag-items"'))throw new Error('BAG_PUBLIC_KNOWLEDGE_INDEX_DRIFT');
  const section='<section id="knowledge-bag-items" data-knowledge-category="bag-items" class="knowledge-library-list" aria-label="물품별 생존지식">'
    +'<div class="wiki-section-heading"><h2>물품별 생존지식</h2><span>'+items.length+'편</span></div>'
    +'<div>'+cards+'</div></section>';
  await writeFile(indexPath,current.replace(terminator,section+terminator),'utf8');
  const sitemapPath=new URL('sitemap.xml',dist);
  const sitemap=await readFile(sitemapPath,'utf8');
  if(sitemap.split('</urlset>').length!==2||sitemap.includes(origin+'/knowledge/bag/'))throw new Error('BAG_PUBLIC_KNOWLEDGE_SITEMAP_DRIFT');
  const urls=['/knowledge/bag/',...items.map(item=>item.href)].map(href=>'  <url><loc>'+esc(origin+href)+'</loc></url>').join('\n');
  await writeFile(sitemapPath,sitemap.replace('</urlset>',urls+'\n</urlset>'),'utf8');
}
console.log('PASS BAG public knowledge',items.length,'approved articles; search/index/sitemap projection');
