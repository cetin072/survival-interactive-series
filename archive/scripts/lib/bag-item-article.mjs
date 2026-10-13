// A deliberately narrow renderer for the approved ITEM_ARTICLE_TEMPLATE_V1.
// Raw editor sections/front matter never become page body; fail closed on drift.
import {CATALOG} from '../../web/public/bag-lab/catalog.mjs';
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const previewBuildAllowed=env=>env.CONTEXT==='deploy-preview'||(env.CONTEXT==='branch-deploy'&&env.BRANCH==='qa-bag-side')||(!env.CONTEXT&&env.BAG_KNOWLEDGE_PREVIEW==='1');
const headings=['언제, 어떻게 사용할까?','어떤 제품을 준비하면 좋을까?','가방에는 어떻게 넣고 관리할까?','놓치기 쉬운 점','지금 30초 점검','이어서 읽기','근거 자료와 업데이트'];
export function safeLink(url){
  if(/^\/knowledge\/[a-z0-9/-]*$/.test(url))return url;
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error('Unsafe article link');
  return parsed.href;
}
export function links(text){return [...text.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/g)].map(([,title,url])=>({title,url:safeLink(url)}));}
function inline(s){
  let result='',start=0;
  for(const match of s.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/g)){
    result+=esc(s.slice(start,match.index));const url=safeLink(match[2]);
    result+=`<a href="${esc(url)}"${url.startsWith('https:')?' target="_blank" rel="noopener noreferrer"':''}>${esc(match[1])}</a>`;start=match.index+match[0].length;
  }
  return (result+esc(s.slice(start))).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
}
function body(text){return text.trim().split(/\n\s*\n/).map(block=>{
  const lines=block.split('\n');
  if(lines.every(line=>line.startsWith('- ')))return '<ul>'+lines.map(line=>'<li>'+inline(line.replace(/^- (?:\[ \] )?/,''))+'</li>').join('')+'</ul>';
  return '<p>'+inline(lines.join(' '))+'</p>';
}).join('\n');}
export function articleFromDraft(raw,id){
  raw=raw.replaceAll('\r\n','\n');
  const match=raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if(!match)throw new Error('Article front matter missing');
  const field=key=>match[1].match(new RegExp('^'+key+': (.+)$','m'))?.[1];
  const entry=CATALOG.find(e=>e.id===id),slug=field('slug');
  if(!entry||field('catalogId')!==id||field('catalogName')!==entry.name||field('group')!==entry.group||!/^[a-z0-9-]+$/.test(slug))throw new Error('Article/catalog mismatch');
  const text=match[2].trimStart(),title=text.match(/^# (.+)$/m)?.[1];
  const sections=[...text.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  if(JSON.stringify(sections.map(s=>s[1]))!==JSON.stringify(headings))throw new Error('Approved article template changed: '+id);
  const opening=text.slice(text.indexOf('\n')+1,text.indexOf('## '));
  const main=body(opening)+sections.slice(0,5).map(s=>`<section><h2>${esc(s[1])}</h2>${body(s[2])}</section>`).join('');
  const internal=links(sections[5][2]).filter(l=>l.url.startsWith('/knowledge/'));
  const sources=links(sections[6][2]).filter(l=>l.url.startsWith('https:'));
  if(!internal.length||!sources.length)throw new Error('Article links missing');
  const scope=sections[6][2].split(/\n\s*\n/).find(p=>p.startsWith('**출처 범위:**'));
  const renderLinks=(text,external)=>'<ul>'+text.split('\n').filter(line=>links(line).some(l=>l.url.startsWith(external?'https:':'/knowledge/'))).map(line=>`<li>${inline(line.replace(/^[-→]\s*/,''))}</li>`).join('')+'</ul>';
  const content=main+`<section><h2>이어서 읽기</h2>${renderLinks(sections[5][2],false)}</section><section><h2>근거 자료</h2>${renderLinks(sections[6][2],true)}${scope?body(scope):''}</section>`;
  if(/DRAFT|reviewedAt|guide-\d|게시 후 연결|Automation C|앱 연결|변경 이력|자료·링크 확인/.test(content))throw new Error('Editorial metadata escaped projection');
  return {id,slug,title,content,internal,sources};
}
export function articlePage(article,{published=false}={}){
  const path='/knowledge/bag/'+article.slug+'/';
  const canonical='https://survival-diary-archive.netlify.app'+path;
  const description=article.title+' 준비와 선택, 보관·관리, 30초 점검을 확인하세요.';
  const seo=published?[
    '<link rel="canonical" href="'+esc(canonical)+'">',
    '<meta name="description" content="'+esc(description)+'">',
    '<meta property="og:type" content="article">',
    '<meta property="og:locale" content="ko_KR">',
    '<meta property="og:title" content="'+esc(article.title+' | 생존일기')+'">',
    '<meta property="og:description" content="'+esc(description)+'">',
    '<meta property="og:url" content="'+esc(canonical)+'">',
    '<meta property="og:site_name" content="생존일기">',
    '<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:article.title,description,mainEntityOfPage:canonical,inLanguage:'ko',author:{'@type':'Organization',name:'생존일기'}}).replace(/</g,'\\u003c')+'</script>'
  ].join('\n'):'';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="'+(published?'index,follow':'noindex,nofollow,noarchive')+'">'
    +'<title>'+esc(article.title)+' | 생존일기</title>'
    +seo
    +'<link rel="stylesheet" href="/knowledge/knowledge.css">'
    +'<link rel="stylesheet" href="/bag/article.css"></head><body>'
    +'<div class="knowledge-shell"><header class="knowledge-header">'
    +'<a class="knowledge-brand" href="/">생존일기</a>'
    +'<nav><a href="/knowledge/">생존 지식</a> · <a href="/knowledge/bag/">물품별 가이드</a></nav></header>'
    +'<main class="bag-article"><nav class="bag-article-crumb" aria-label="현재 위치"><a href="/knowledge/">생존 지식</a> › <a href="/knowledge/bag/">물품별 생존지식</a></nav>'
    +'<h1>'+esc(article.title)+'</h1>'+article.content
    +'<section class="bag-article-cta" aria-labelledby="bag-item-cta"><h2 id="bag-item-cta">이 물품을 직접 준비하고 관리하려면?</h2>'
    +'<p>《나의 생존가방》에서 '+esc(CATALOG.find(entry=>entry.id===article.id)?.name??'이 물품')+'의 준비 여부와 수량, 점검일을 기록할 수 있습니다.</p>'
    +'<a href="/bag-lab/alpha.html?catalog='+article.id+'">생존가방에서 이 물품 확인하기 →</a></section>'
    +'</main>'
    +(published?'<section class="knowledge-share" aria-labelledby="knowledge-share-heading" data-knowledge-share>'
       +'<h2 id="knowledge-share-heading">이 글 공유하기</h2><p>가이드를 링크로 공유할 수 있습니다.</p>'
       +'<div class="knowledge-share-actions" data-knowledge-share-actions hidden>'
       +'<button type="button" data-knowledge-native-share hidden>기기 공유</button><button type="button" class="knowledge-share-copy" data-knowledge-copy>링크 복사</button>'
       +'<a data-knowledge-naver-share target="_blank" rel="noopener noreferrer">네이버</a>'
       +'<a data-knowledge-x-share target="_blank" rel="noopener noreferrer">X</a>'
       +'<a data-knowledge-facebook-share target="_blank" rel="noopener noreferrer">Facebook</a></div>'
       +'<label for="knowledge-share-url">공식 글 주소</label><input id="knowledge-share-url" type="url" readonly spellcheck="false" value="'+esc(canonical)+'">'
       +'<p class="knowledge-share-status" role="status" aria-live="polite" data-knowledge-share-status></p></section>':'')
    +'</div>'+(published?'<script defer src="/knowledge/share.js"></script>':'')+'</body></html>';
}
