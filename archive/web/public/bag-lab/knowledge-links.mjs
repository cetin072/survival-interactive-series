// Only user-approved published item pages. Generated pages/queue must match exactly.
import {CATALOG} from './catalog.mjs';
export const PUBLISHED_ITEMS=Object.freeze({
  'guide-01':'/knowledge/bag/waterproof-document-pouch/',
  'guide-02':'/knowledge/bag/identity-card-copy/',
  'guide-03':'/knowledge/bag/family-emergency-contact-note/',
  'guide-04':'/knowledge/bag/small-denomination-cash/',
  'guide-05':'/knowledge/bag/important-document-copies/',
  'guide-06':'/knowledge/bag/spare-keys/',
  'guide-07':'/knowledge/bag/raincoat/',
  'guide-43':'/knowledge/bag/flashlight/'
});
export function knowledgeFor(entry){
  return PUBLISHED_ITEMS[entry.id]??(entry.id==='guide-03'?'/knowledge/family-emergency-contact-plan/':'/knowledge/emergency-supplies-inventory/');
}
// V1 stock has no new catalogId field: recognize stable catalog-* ID or matching Korean name.
export function publishedKnowledgeForItem(item){
  if(!item||typeof item.name!=='string'||typeof item.id!=='string')return null;
  const normalized=item.name.normalize('NFC').trim().toLowerCase();
  const entry=CATALOG.find(e=>item.id==='catalog-'+e.id||e.name.normalize('NFC').toLowerCase()===normalized);
  return entry?PUBLISHED_ITEMS[entry.id]??null:null;
}
