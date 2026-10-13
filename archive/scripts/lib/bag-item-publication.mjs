// Public bag-item knowledge is approved independently of Automation C.
// The authored queue and explicit published manifest are both required.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PUBLISHED_ITEMS} from '../../web/public/bag-lab/knowledge-links.mjs';
import {CATALOG} from '../../web/public/bag-lab/catalog.mjs';
import {articleFromDraft} from './bag-item-article.mjs';

const root=new URL('../../../',import.meta.url);
const drafts=new URL('docs/bunker_os/bag_knowledge/',root);
export const publicationFiles=Object.freeze([
  new URL('DRAFT_QUEUE_V1.json',drafts),
  new URL('archive/web/public/bag-lab/knowledge-links.mjs',root),
]);

export async function approvedBagArticles(){
  const queue=JSON.parse(await readFile(publicationFiles[0],'utf8'));
  const found=new Set(),slugs=new Set(),result=[];
  for(const [id,href] of Object.entries(PUBLISHED_ITEMS)){
    if(!/^guide-(0[1-9]|[1-4][0-9])$/.test(id)||found.has(id))throw new Error('BAG_PUBLICATION_INVALID_ID:'+id);
    const item=queue.articles[id];
    if(!item||item.state!=='USER_APPROVED_FOR_PUBLICATION'||typeof item.approvalEvidence!=='string'||!item.approvalEvidence.trim()||!/^20\d{2}-\d{2}-\d{2}$/.test(item.approvedAt??''))
      throw new Error('BAG_PUBLICATION_APPROVAL_MISSING:'+id);
    if(!/^GUIDE_[A-Z0-9_]+\.md$/.test(item.file))throw new Error('BAG_PUBLICATION_INVALID_SOURCE:'+id);
    const source=new URL(item.file,drafts);
    const raw=await readFile(source,'utf8');
    const article=articleFromDraft(raw,id);
    const expected='/knowledge/bag/'+article.slug+'/';
    if(href!==expected||slugs.has(article.slug))throw new Error('BAG_PUBLICATION_WRONG_SLUG:'+id);
    const catalog=CATALOG.find(entry=>entry.id===id);
    if(!catalog)throw new Error('BAG_PUBLICATION_MISSING_CATALOG:'+id);
    const answer=raw.match(/\n\*\*([^*\n]{12,320})\*\*/)?.[1]??catalog.note;
    const summary=answer.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\s+/g,' ').trim();
    if(!summary||summary.length>320)throw new Error('BAG_PUBLICATION_INVALID_SUMMARY:'+id);
    found.add(id);slugs.add(article.slug);
    result.push({id,slug:article.slug,href,title:article.title,summary,group:catalog.group,keyword:catalog.name,
      publishedAt:item.approvedAt??'2026-10-13',article,source:fileURLToPath(source)});
  }
  for(const [id,item] of Object.entries(queue.articles)){
    if(item.state==='USER_APPROVED_FOR_PUBLICATION'&&!found.has(id))
      throw new Error('BAG_PUBLICATION_APPROVED_NOT_MAPPED:'+id);
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}
