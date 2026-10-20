// Generate/check the editorial 49-slot registry. Missing sources are explicit, not fabricated slugs.
import {readFile,writeFile} from 'node:fs/promises';
import {manuscriptRegistry,draftDirectory} from './lib/bag-item-registry.mjs';
const registry=await manuscriptRegistry();
const target=new URL('ARTICLE_REGISTRY_V1.json',draftDirectory),text=JSON.stringify(registry,null,2)+'\n';
if(process.argv.includes('--check')){
  if(await readFile(target,'utf8')!==text)throw new Error('BAG_REGISTRY_STALE');
}else await writeFile(target,text);
console.log(JSON.stringify({catalog:registry.catalogTotal,available:registry.available,missing:registry.missing}));
if(process.argv.includes('--require-complete')&&registry.missing.length)throw new Error('BAG_REGISTRY_SOURCE_NOT_RECEIVED');
