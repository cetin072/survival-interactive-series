// Editable adult-one-person examples. Budgets are references, never measured totals.
// Existing V1 item/batch IDs retain catalog identity and draft provenance without
// adding fields that older tabs cannot validate. No expiry dates are inferred.
import {CATALOG,findOwned,seedFor} from './catalog.mjs';
import {validateBag,newBatch} from './personal.mjs';
import {localToday,minusDays} from './logic.mjs';
const light=[1,2,3,7,13,15,16,19,20,22,25,26,27,39,43,44,45,46,47];
const standard=[...light,8,9,10,21,32,33,34,35,36,37];
const expanded=[...standard,6,11,23,28,30,31,40,41,42,48];
export const PRESETS=Object.freeze([
  {id:'light',name:'경량형',budget:10,note:'필수 물품 위주',numbers:light},
  {id:'standard',name:'표준형',budget:15,note:'의류·위생 보강',numbers:standard},
  {id:'expanded',name:'확장형',budget:18,note:'휴식·예비품 추가',numbers:expanded}
].map(({numbers,...preset})=>Object.freeze({...preset,items:Object.freeze(numbers.map(n=>Object.freeze({catalogId:`guide-${String(n).padStart(2,'0')}`,target:CATALOG[n-1].exampleTarget})))})));
export function inspectionDays(entry){
  if(entry.category==='medicine')return 0;
  if(['clothing','sleep'].includes(entry.group))return 90;
  if(['water','food','hygiene'].includes(entry.category)||entry.group==='power')return 30;
  return 180;
}
export function previewPreset(bag,presetId,today=localToday()){
  validateBag(bag);
  const preset=PRESETS.find(p=>p.id===presetId);
  if(!preset)throw new Error('프리셋을 찾지 못했습니다.');
  // Reuse strict calendar validation even when an injected date has no items.
  validateBag({...bag,items:[{id:'date-probe',name:'date probe',category:'other',unit:'개',target:1,orderedQuantity:0,batches:[{id:'date-batch',quantity:0,dateType:'none',markedUntil:null,nextInspection:today}]}]});
  return preset.items.map(({catalogId,target})=>{
    const entry=CATALOG.find(e=>e.id===catalogId),existing=findOwned(entry,bag);
    const inspection=minusDays(today,-inspectionDays(entry));
    if(!/^20\d{2}-/.test(inspection))throw new Error('점검일은 2000~2099년 범위여야 합니다.');
    return {entry,target,existing,inspection};
  });
}
export function applyPreset(bag,presetId,selection,{today=localToday(),packed=false}={}){
  if(typeof packed!=='boolean'||!Array.isArray(selection))throw new Error('프리셋 선택 형식이 올바르지 않습니다.');
  const next=validateBag(bag),rows=previewPreset(bag,presetId,today),seen=new Set();
  for(const choice of selection){
    if(!choice||Object.keys(choice).some(k=>!['catalogId','target','inspection'].includes(k))||seen.has(choice.catalogId))throw new Error('중복되거나 잘못된 프리셋 항목입니다.');
    seen.add(choice.catalogId);
    const row=rows.find(r=>r.entry.id===choice.catalogId);
    if(!row)throw new Error('프리셋에 없는 물품입니다.');
    // Existing records, including targets, orders, batches and dates, are immutable.
    if(row.existing)continue;
    const batch={...newBatch(packed?choice.target:0),nextInspection:choice.inspection};
    batch.id='draft-'+batch.id;
    next.items.push({id:'catalog-'+row.entry.id,...seedFor(row.entry),target:choice.target,orderedQuantity:0,batches:[batch]});
  }
  return validateBag(next);
}
export const isDraftBatch=batch=>batch.id.startsWith('draft-');
