import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,previewPreset,applyPreset,inspectionDays} from '../../web/public/bag-lab/presets.mjs';
import {emptyBag,validateBag,backupText,parseBackup,dashboardBag} from '../../web/public/bag-lab/personal.mjs';
import {localToday,dashboardSummary} from '../../web/public/bag-lab/logic.mjs';
import {CATALOG} from '../../web/public/bag-lab/catalog.mjs';
const today='2026-10-12';
const selection=rows=>rows.map(r=>({catalogId:r.entry.id,target:r.target,inspection:r.inspection}));
const apply=(bag,id,options={})=>applyPreset(bag,id,selection(previewPreset(bag,id,options.today??today)),{today,...options});
for(const preset of PRESETS){
  test(`${preset.name}: preview is pure, bulk apply defaults to zero stock and no expiry`,()=>{
    const bag=emptyBag(),original=structuredClone(bag),rows=previewPreset(bag,preset.id,today);
    assert.deepEqual(bag,original);
    assert.equal(new Set(rows.map(r=>r.entry.id)).size,preset.items.length);
    const next=apply(bag,preset.id);
    assert.equal(next.items.length,preset.items.length);
    assert.deepEqual(validateBag(next),next);
    for(const item of next.items){assert.equal(item.batches.length,1);assert.equal(item.batches[0].quantity,0);assert.equal(item.batches[0].markedUntil,null);assert.equal(item.batches[0].dateType,'none');assert.ok(item.batches[0].nextInspection);}
    assert.equal(dashboardSummary(dashboardBag(next),today).soonCount,0);
    assert.deepEqual(parseBackup(backupText(next)),next);
    assert.deepEqual(apply(next,preset.id,{today:'2027-01-01',packed:true}),next);
    assert.deepEqual(bag,original);
  });
}
test('packed confirmation only affects newly added items; expanded and smaller presets preserve all existing bytes',()=>{
  const bag=apply(emptyBag(),'light',{packed:true});
  bag.items[0].name='내가 바꾼 긴 이름';bag.items[0].target=99;bag.items[0].orderedQuantity=7;
  bag.items[0].batches[0].markedUntil='2028-02-29';bag.items[0].batches[0].dateType='use';
  const expanded=apply(bag,'expanded');
  assert.deepEqual(expanded.items.slice(0,bag.items.length),bag.items);
  assert.ok(expanded.items.slice(bag.items.length).every(i=>i.batches[0].quantity===0));
  assert.deepEqual(apply(expanded,'light'),expanded);
});
test('exact normalized existing name is preserved; similar distinct names are not merged',()=>{
  const old={id:'old',name:'생수',category:'water',unit:'병',target:9,orderedQuantity:3,batches:[]};
  const bag={...emptyBag(),items:[old,{...old,id:'other',name:'생수 다른 제품'}]};
  assert.deepEqual(apply(bag,'light').items.slice(0,2),bag.items);
  assert.equal(previewPreset(bag,'light',today).filter(r=>r.existing).length,1);
});
test('unchecked choices stay absent; editable quantities and inspection dates are validated atomically',()=>{
  const bag=emptyBag(),rows=selection(previewPreset(bag,'light',today)).slice(0,2);
  rows[0].target=5;rows[0].inspection='2026-12-31';
  const next=applyPreset(bag,'light',rows,{today});
  assert.equal(next.items.length,2);assert.equal(next.items[0].target,5);assert.equal(next.items[0].batches[0].nextInspection,'2026-12-31');
  for(const invalid of [{target:0},{target:1.5},{inspection:'2027-02-29'},{expiry:'2027-01-01'}]){
    assert.throws(()=>applyPreset(bag,'light',[rows[0],{...rows[1],...invalid}],{today}));assert.deepEqual(bag,emptyBag());
  }
  assert.throws(()=>applyPreset(bag,'light',[rows[0],rows[0]],{today}));
  assert.deepEqual(applyPreset(bag,'light',[],{today}),bag);
});
test('management intervals are settings, dates respect leap/year boundaries and local day',()=>{
  const water=CATALOG.find(e=>e.name==='생수'),med=CATALOG.find(e=>e.name==='구급함');
  assert.equal(inspectionDays(med),0);
  assert.equal(previewPreset(emptyBag(),'light','2024-01-30').find(r=>r.entry.id===water.id).inspection,'2024-02-29');
  assert.equal(previewPreset(emptyBag(),'light','2026-12-31').find(r=>r.entry.id===water.id).inspection,'2027-01-30');
  assert.equal(previewPreset(emptyBag(),'light',today).find(r=>r.entry.id===med.id).inspection,today);
  assert.equal(localToday(new Date(2026,9,12,0,1)),'2026-10-12');
  for(const date of ['2026-02-29','invalid','2099-12-31'])assert.throws(()=>previewPreset(emptyBag(),'light',date));
});
test('old V1 backups still roundtrip, unknown fields remain rejected',()=>{
  const bag=emptyBag();assert.deepEqual(parseBackup(backupText(bag)),bag);
  assert.throws(()=>validateBag({...bag,unknown:true}));
  const next=apply(bag,'light');assert.throws(()=>validateBag({...next,items:[{...next.items[0],unknown:true}]}));
});
