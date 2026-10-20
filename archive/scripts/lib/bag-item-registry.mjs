// Editorial inventory, never a publication list. No draft bodies enter the public bundle.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CATALOG} from '../../web/public/bag-lab/catalog.mjs';
import {articleFromDraft} from './bag-item-article.mjs';

export const draftDirectory=new URL('../../../docs/bunker_os/bag_knowledge/',import.meta.url);
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const gitBlob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
export function draftMetadata(raw,file){
  const name=/^GUIDE_(\d{2})(?:_[A-Z0-9]+)*_DRAFT_V01\.md$/.exec(file);
  const front=/^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if(!name||!front)throw new Error('BAG_REGISTRY_INVALID_DRAFT:'+file);
  const fields={};
  for(const key of ['contentType','catalogId','catalogName','group','category','slug']){
    const matches=[...front[1].matchAll(new RegExp('^'+key+': (.+)$','gm'))];
    if(matches.length!==1)throw new Error('BAG_REGISTRY_INVALID_FIELD:'+file+':'+key);
    fields[key]=matches[0][1].trim();
  }
  const catalog=CATALOG.find(e=>e.id===fields.catalogId);
  if(!catalog||fields.catalogId!=='guide-'+name[1]||fields.contentType!=='bag-item-knowledge'||
    fields.catalogName!==catalog.name||fields.group!==catalog.group||fields.category!==catalog.category||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug))throw new Error('BAG_REGISTRY_CATALOG_MISMATCH:'+file);
  return fields;
}

export async function manuscriptRegistry({directory=draftDirectory,receipts}={}){
  receipts??=JSON.parse(await readFile(new URL('SOURCE_RECEIPTS_V1.json',directory),'utf8'));
  const byId=new Map(),slugs=new Set();
  for(const file of (await readdir(directory)).filter(f=>/^GUIDE_\d/.test(f)).sort()){
    const bytes=await readFile(new URL(file,directory));
    const meta=draftMetadata(bytes.toString('utf8'),file),id=meta.catalogId;
    if(byId.has(id))throw new Error('BAG_REGISTRY_DUPLICATE_ID:'+id);
    if(slugs.has(meta.slug))throw new Error('BAG_REGISTRY_DUPLICATE_SLUG:'+meta.slug);
    const hash=sha256(bytes),source=receipts.articles?.[id];
    if(!source||source.file!==file||source.sha256!==hash||source.blob!==gitBlob(bytes)||!['GITHUB','LIBRARY'].includes(source.origin))
      throw new Error('BAG_REGISTRY_SOURCE_RECEIPT_MISMATCH:'+id);
    if(source.origin==='GITHUB'&&(!/^[a-f0-9]{40}$/.test(source.commit)||!/^[a-f0-9]{40}$/.test(source.blob)))
      throw new Error('BAG_REGISTRY_GITHUB_RECEIPT_MISSING:'+id);
    if(source.origin==='LIBRARY'&&(!/^[a-f0-9]{64}$/.test(source.archiveSha256)||!/^[a-f0-9]{64}$/.test(source.manifestSha256)))
      throw new Error('BAG_REGISTRY_LIBRARY_RECEIPT_MISSING:'+id);
    let readerProjection;
    try{articleFromDraft(bytes.toString('utf8'),id);readerProjection={ready:true};}
    catch(error){readerProjection={ready:false,reason:error.message};}
    byId.set(id,{file,slug:meta.slug,sha256:hash,source,readerProjection});slugs.add(meta.slug);
  }
  for(const id of Object.keys(receipts.articles??{}))if(!byId.has(id))throw new Error('BAG_REGISTRY_SOURCE_MISSING:'+id);
  const articles=Object.fromEntries(CATALOG.map(c=>[c.id,{catalogId:c.id,catalogName:c.name,group:c.group,category:c.category,
    ...(byId.get(c.id)??{file:null,slug:null,sha256:null,source:null}),
    storage:byId.has(c.id)?'SAVED_IN_REPOSITORY':'SOURCE_NOT_RECEIVED'}]));
  return {schemaVersion:1,catalogTotal:CATALOG.length,available:byId.size,missing:CATALOG.filter(c=>!byId.has(c.id)).map(c=>c.id),articles};
}

export function verifyPublicationSource(id,item,record){
  if(!record?.file||record.file!==item.file||!item.sourceSha256||record.sha256!==item.sourceSha256)
    throw new Error('BAG_PUBLICATION_SOURCE_HASH_MISMATCH:'+id);
}
