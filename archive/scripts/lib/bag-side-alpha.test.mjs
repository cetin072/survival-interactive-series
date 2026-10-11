import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBag,validateBag,upsertItem,stockChange,removeItem,removeBatch,dashboardBag,backupText,parseBackup,MAX_BACKUP_BYTES} from '../../web/public/bag-lab/personal.mjs';
import {createDemo,currentQuantity,shortage,nextAction,prioritizedItems} from '../../web/public/bag-lab/logic.mjs';
const batch=(id,quantity,date='2027-04-30',inspection=null)=>({id,quantity,dateType:date?'consumption':'none',markedUntil:date,nextInspection:inspection});
const item=()=>({id:'food',name:'간편식',category:'food',target:6,unit:'개',orderedQuantity:0,batches:[batch('A',4),batch('B',2,'2027-12-31')]});
const bag=()=>upsertItem(emptyBag(),item());
const envelope=value=>JSON.stringify({app:'BAG-SIDE-01',formatVersion:1,exportedAt:'2026-10-11T00:00:00.000Z',bag:value});

test('personal mode starts EMPTY, never converts sample inventory to owned stock',()=>{
  assert.equal(emptyBag().items.length,0);assert.equal(emptyBag().sampleOnly,false);
  assert.throws(()=>validateBag(createDemo()));
});
test('register actual quantities and separately dated batches without mutating source',()=>{
  const original=emptyBag(),updated=upsertItem(original,item());
  assert.equal(original.items.length,0);assert.equal(currentQuantity(updated.items[0]),6);
  assert.equal(updated.items[0].batches[1].markedUntil,'2027-12-31');
});
test('consume 2 only from batch A: 6 -> 4, shortage 0 -> 2',()=>{
  const start=bag(),next=stockChange(start,'food','take',{quantity:2,batchId:'A'});
  assert.equal(currentQuantity(next.items[0]),4);assert.equal(shortage(next.items[0]),2);
  assert.deepEqual(next.items[0].batches[1],start.items[0].batches[1]);assert.equal(currentQuantity(start.items[0]),6);
});
test('ordering NEVER increases physical stock or clears shortage',()=>{
  const start=stockChange(bag(),'food','take',{quantity:2,batchId:'A'});
  const next=stockChange(start,'food','order',{quantity:2});
  assert.equal(next.items[0].orderedQuantity,2);assert.equal(currentQuantity(next.items[0]),4);assert.equal(shortage(next.items[0]),2);
});
test('physical refill adds C, preserves A/B dates and consumes outstanding order count',()=>{
  const removed=stockChange(bag(),'food','take',{quantity:2,batchId:'A'});
  const ordered=stockChange(removed,'food','order',{quantity:2});
  const next=stockChange(ordered,'food','put',{batch:batch('C',2,'2028-03-31')});
  assert.equal(currentQuantity(next.items[0]),6);assert.equal(shortage(next.items[0]),0);assert.equal(next.items[0].orderedQuantity,0);
  assert.deepEqual(next.items[0].batches.slice(0,2),ordered.items[0].batches);
});
test('reject repeated replenishment with same batch ID',()=>{
  const added=stockChange(bag(),'food','put',{batch:batch('C',2)});
  assert.throws(()=>stockChange(added,'food','put',{batch:batch('C',2)}),/중복/);
});
test('reject over-consumption, negatives, empty, fractions and Infinity',()=>{
  for(const quantity of [5,-1,0,1.5,NaN,Infinity,'2'])assert.throws(()=>stockChange(bag(),'food','take',{quantity,batchId:'A'}));
  assert.throws(()=>stockChange(bag(),'food','take',{quantity:1,batchId:'missing'}));
});
test('editing keeps item ID; duplicate product names direct users to batches',()=>{
  const start=bag(),edited=upsertItem(start,{...start.items[0],name:'간편식 수정',target:8});
  assert.equal(edited.items.length,1);assert.equal(edited.items[0].id,'food');assert.equal(shortage(edited.items[0]),2);
  assert.throws(()=>upsertItem(start,{...item(),id:'other',batches:[]}),/같은 이름/);
});
test('removing a record leaves the input unchanged',()=>{
  const start=bag();assert.equal(removeItem(start,'food').items.length,0);assert.equal(start.items.length,1);
  assert.throws(()=>removeItem(start,'missing'));
});
test('JSON backup roundtrip retains dates, types, target, order and shortages',()=>{
  const start=stockChange(stockChange(bag(),'food','take',{quantity:2,batchId:'A'}),'food','order',{quantity:2});
  assert.deepEqual(parseBackup(backupText(start)),start);
  assert.equal(shortage(parseBackup(backupText(start)).items[0]),2);
});
test('malformed/truncated JSON, wrong app, unknown versions do not validate',()=>{
  for(const raw of ['{','null','[]','{}',envelope(bag()).slice(0,-1),envelope(bag()).replace('BAG-SIDE-01','other'),envelope(bag()).replace('"formatVersion":1','"formatVersion":2')])assert.throws(()=>parseBackup(raw));
  assert.throws(()=>validateBag({...bag(),schemaVersion:2}));
});
test('oversized backup is rejected before JSON parsing',()=>{
  assert.throws(()=>parseBackup(' '.repeat(MAX_BACKUP_BYTES+1)),/1MB/);
  assert.throws(()=>parseBackup('가'.repeat(Math.ceil(MAX_BACKUP_BYTES/3)+1)),/1MB/);
});
test('unknown fields and prototype-shaped payloads fail closed',()=>{
  assert.throws(()=>parseBackup(envelope({...bag(),secret:'x'})));
  assert.throws(()=>parseBackup(envelope(bag()).replace('"schemaVersion":1','"__proto__":{"polluted":true},"schemaVersion":1')));
  assert.equal({}.polluted,undefined);
});
test('duplicate IDs across products and batches are rejected',()=>{
  const bad=bag();bad.items[0].batches[1].id='A';assert.throws(()=>validateBag(bad),/중복/);
  const bad2=bag();bad2.items[0].batches[0].id='food';assert.throws(()=>validateBag(bad2),/중복/);
});
test('strict real calendar dates including leap-year boundary',()=>{
  for(const d of ['2027-02-29','2028-02-30','2027-13-01','2027-01-32','2027-1-1','2100-01-01']){
    const bad=bag();bad.items[0].batches[0].markedUntil=d;assert.throws(()=>validateBag(bad));
  }
  const good=bag();good.items[0].batches[0].markedUntil='2028-02-29';assert.doesNotThrow(()=>validateBag(good));
});
test('label kind and actual date must agree; arrays cannot masquerade as enum strings',()=>{
  const bad=bag();bad.items[0].batches[0].dateType='none';assert.throws(()=>validateBag(bad));
  const bad2=bag();bad2.items[0].category=['food'];assert.throws(()=>validateBag(bad2));
  const bad3=bag();bad3.items[0].batches[0].dateType=['consumption'];assert.throws(()=>validateBag(bad3));
});
test('batch inspection adapter uses earliest OWNED batch, keeps storage untouched',()=>{
  const start=bag();start.items[0].batches=[batch('A',0,null,'2026-01-01'),batch('B',1,null,'2027-01-01'),batch('C',1,null,'2026-12-01')];
  const projected=dashboardBag(start);
  assert.equal(nextAction(projected.items[0]).due,'2026-12-01');
  assert.equal(Object.hasOwn(start.items[0],'nextInspection'),false);
});
test('zero-stock batches produce no expiry or inspection task',()=>{
  const start=bag();start.items[0].batches=[batch('A',0,'2026-01-01','2026-01-01')];
  assert.equal(nextAction(dashboardBag(start).items[0]),null);
});
test('existing priority/shortage calculation works for real records',()=>{
  let start=bag();start=upsertItem(start,{...item(),id:'lamp',name:'손전등',category:'equipment',target:1,batches:[batch('lampA',1,null,'2026-11-01')]});
  assert.equal(prioritizedItems(dashboardBag(start))[0].id,'lamp');
  const removed=stockChange(start,'food','take',{quantity:2,batchId:'A'});
  assert.equal(prioritizedItems(dashboardBag(removed))[0].id,'food');
});
test('export timestamp must be real; legacy/future backup never silently migrated',()=>{
  assert.throws(()=>parseBackup(envelope(bag()).replace('2026-10-11T00:00:00.000Z','2026-02-30T00:00:00.000Z')));
  assert.throws(()=>parseBackup(JSON.stringify(createDemo())));
});
test('capacity limits reject before persistent write',()=>{
  const bad=bag();bad.items[0].batches[0].quantity=10000;assert.throws(()=>validateBag(bad));
  const bad2=bag();bad2.rotationLeadDays=366;assert.throws(()=>validateBag(bad2));
  const bad3=bag();bad3.items[0].target=0;assert.throws(()=>validateBag(bad3));
});
test('returned validated bag is an independent copy',()=>{
  const start=bag(),checked=validateBag(start);checked.items[0].name='별도';assert.equal(start.items[0].name,'간편식');
});

test('refill matches EXACT expiry/type/inspection and adds quantity instead of creating another batch',()=>{
  const original=stockChange(bag(),'food','take',{quantity:2,batchId:'A'});
  const next=stockChange(original,'food','put',{batch:batch('C',2,'2027-04-30')});
  assert.equal(next.items[0].batches.length,2,'identical metadata must not multiply batches');
  assert.deepEqual(next.items[0].batches.map(b=>[b.id,b.quantity,b.markedUntil]),[['A',4,'2027-04-30'],['B',2,'2027-12-31']]);
  assert.equal(currentQuantity(next.items[0]),6);
  assert.equal(currentQuantity(original.items[0]),4,'pure function never mutates source');
  assert.deepEqual(parseBackup(backupText(next)),next,'merged records preserve backup V1 schema');
});
test('different expiration date or inspection date stays a separate batch with old dates preserved',()=>{
  const original=bag();
  const incoming=batch('C',1,'2027-04-30','2027-02-01');
  const result=stockChange(original,'food','put',{batch:incoming});
  assert.equal(result.items[0].batches.length,3);
  assert.deepEqual(result.items[0].batches.slice(0,2),original.items[0].batches);
  const other=stockChange(original,'food','put',{batch:batch('D',1,'2028-05-01')});
  assert.equal(other.items[0].batches.length,3);
});
test('user may keep physically distinct batches with identical dates when explicitly chosen',()=>{
  const start=bag();
  const next=stockChange(start,'food','put',{batch:batch('new',1,'2027-04-30'),separate:true});
  assert.equal(next.items[0].batches.length,3);
  assert.equal(next.items[0].batches[0].quantity,4);
  assert.equal(next.items[0].batches[2].quantity,1);
});
test('undated refills merge only when inspection date also matches',()=>{
  const original=bag();original.items[0].batches=[batch('A',1,null,null)];
  const merged=stockChange(original,'food','put',{batch:batch('new',2,null,null)});
  assert.equal(merged.items[0].batches.length,1);
  assert.equal(merged.items[0].batches[0].quantity,3);
  const other=stockChange(original,'food','put',{batch:batch('new',2,null,'2027-01-01')});
  assert.equal(other.items[0].batches.length,2);
});
test('no invalid record or ID collision can be hidden by merging into a matching batch',()=>{
  const original=bag(),before=JSON.stringify(original);
  assert.throws(()=>stockChange(original,'food','put',{batch:{...batch('incoming',1,'2027-04-30'),unsafe:'extra'}}),/지원하지/);
  assert.throws(()=>stockChange(original,'food','put',{batch:batch('A',1,'2027-04-30')}),/중복/);
  assert.throws(()=>stockChange(original,'food','put',{batch:{...batch('X',1,'2027-04-30'),dateType:'none'}}),/표시기한/);
  assert.throws(()=>stockChange(original,'food','put',{batch:batch('X',1,'2027-02-30')}),/달력/);
  assert.throws(()=>stockChange(original,'food','put',{batch:batch('X',1,'2027-04-30'),separate:'false'}),/선택/);
  const almost=bag();almost.items[0].batches[0].quantity=9998;almost.items[0].batches[1].quantity=1;
  assert.throws(()=>stockChange(almost,'food','put',{batch:batch('X',1,'2027-04-30')}),/총 가방 수량/);
  assert.equal(JSON.stringify(original),before,'failed refills must not mutate original data');
});
test('delete one batch only, preserving other batches, goal and outstanding order',()=>{
  const start=stockChange(bag(),'food','order',{quantity:2});
  const after=removeBatch(start,'food','A');
  assert.equal(after.items.length,1);
  assert.equal(after.items[0].batches.length,1);
  assert.equal(after.items[0].batches[0].id,'B');
  assert.equal(after.items[0].target,6);
  assert.equal(after.items[0].orderedQuantity,2);
  assert.equal(currentQuantity(after.items[0]),2);
  assert.equal(shortage(after.items[0]),4);
  assert.equal(currentQuantity(start.items[0]),6);
  assert.deepEqual(parseBackup(backupText(after)),after);
  const last=removeBatch(after,'food','B');
  assert.equal(last.items[0].batches.length,0);
  assert.equal(currentQuantity(last.items[0]),0);
  assert.equal(shortage(last.items[0]),6);
  assert.equal(last.items[0].name,'간편식','removing final batch never deletes parent item');
  assert.throws(()=>removeBatch(last,'food','B'),/찾지 못/);
  assert.throws(()=>removeBatch(start,'missing','A'),/물품/);
});
