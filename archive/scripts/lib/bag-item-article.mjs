// A deliberately narrow renderer for the approved ITEM_ARTICLE_TEMPLATE_V1.
// Raw editor sections/front matter never become page body; fail closed on drift.
const CATALOG=[{id:'guide-01',name:'방수 서류 파우치',group:'documents'}];
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
  const main=body(opening)+sections.slice(0,5).map(s=>`<section class="article-section"><h2>${esc(s[1])}</h2>${body(s[2])}</section>`).join('');
  const internal=links(sections[5][2]).filter(l=>l.url.startsWith('/knowledge/'));
  const sources=links(sections[6][2]).filter(l=>l.url.startsWith('https:'));
  if(!internal.length||!sources.length)throw new Error('Article links missing');
  const scope=sections[6][2].split(/\n\s*\n/).find(p=>p.startsWith('**출처 범위:**'));
  const renderLinks=(text,external)=>'<ul>'+text.split('\n').filter(line=>links(line).some(l=>l.url.startsWith(external?'https:':'/knowledge/'))).map(line=>`<li>${inline(line.replace(/^[-→]\s*/,''))}</li>`).join('')+'</ul>';
  const content=main+`<section class="article-section"><h2>이어서 읽기</h2>${renderLinks(sections[5][2],false)}</section><section class="article-section"><h2>근거 자료</h2>${renderLinks(sections[6][2],true)}${scope?body(scope):''}</section>`;
  if(/DRAFT|reviewedAt|guide-\d|게시 후 연결|Automation C|앱 연결|변경 이력|자료·링크 확인/.test(content))throw new Error('Editorial metadata escaped projection');
  return {id,slug,title,content,internal,sources};
}

export function articlePage(article){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${esc(article.title)} | 생존일기</title><link rel="stylesheet" href="/knowledge/knowledge.css"></head><body><div class="knowledge-shell"><header class="knowledge-header"><a class="knowledge-brand" href="/">생존일기</a><nav class="knowledge-nav"><a href="/knowledge/">생존 지식</a></nav></header><main class="article-shell"><p class="article-note">미공개 미리보기 · 정식 발행 전 화면입니다. 이 주소는 인터넷에서 열릴 수 있습니다.</p><header class="article-header"><h1>${esc(article.title)}</h1></header>${article.content}<footer class="knowledge-footer">자료 확인일: 2026-10-12</footer></main></div></body></html>`;
}
