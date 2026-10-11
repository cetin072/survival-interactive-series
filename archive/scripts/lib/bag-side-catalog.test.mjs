import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPS,CATALOG,targetFor,seedFor,findOwned,entryStatus,catalogProgress} from '../../web/public/bag-lab/catalog.mjs';
import {emptyBag,CATEGORIES,upsertItem,stockChange,validateBag,backupText,parseBackup} from '../../web/public/bag-lab/personal.mjs';

const emptyBatch=(id='catalog-batch',quantity=0)=>({id,quantity,dateType:'none',markedUntil:null,nextInspection:null});
const own=(bag,entry,quantity=0,target=seedFor(entry).target)=>upsertItem(bag,{
  id:'owned-'+entry.id,...seedFor(entry),target,orderedQuantity:0,batches:[emptyBatch('batch-'+entry.id,quantity)]
});
const byName=name=>CATALOG.find(entry=>entry.name===name);

test('catalog has eight original categories and unique, valid, editable Korean entries',()=>{
  assert.equal(GROUPS.length,8);
  assert.equal(new Set(GROUPS.map(group=>group.id)).size,8);
  assert.ok(CATALOG.length>=40);
  assert.equal(new Set(CATALOG.map(entry=>entry.id)).size,CATALOG.length);
  assert.equal(new Set(CATALOG.map(entry=>entry.name.toLowerCase())).size,CATALOG.length);
  for(const group of GROUPS)assert.ok(CATALOG.some(entry=>entry.group===group.id));
  for(const entry of CATALOG){
    assert.ok(GROUPS.some(group=>group.id===entry.group));
    assert.ok(Object.hasOwn(CATEGORIES,entry.category));
    assert.ok(entry.name.length<=80&&entry.unit.length<=12&&entry.note.length>0);
    assert.ok(['shared','person'].includes(entry.scope));
    assert.ok(Number.isSafeInteger(entry.exampleTarget)&&entry.exampleTarget>0);
    assert.ok(targetFor(entry,8)<=9999);
  }
});

test('recommended catalog never creates personal stock, readiness or changes backup schema',()=>{
  const empty=emptyBag(),total=catalogProgress(empty);
  assert.equal(empty.items.length,0);
  assert.ok(total.total>=20);
  assert.equal(total.registered,0);assert.equal(total.ready,0);
  const water=byName('생수');
  assert.equal(seedFor(water).target,1);
  assert.equal(findOwned(water,empty),null);
  assert.deepEqual(validateBag(empty),empty);
  assert.deepEqual(parseBackup(backupText(empty)),empty);
});

test('family size only alters new suggestions, shared gear stays one, stored target remains intact',()=>{
  const water=byName('생수'),radio=byName('휴대용 라디오');
  assert.equal(targetFor(water,3),3);assert.equal(targetFor(radio,3),1);
  assert.equal(targetFor(byName('간편식'),3),9);
  for(const people of [0,-1,9,1.5,'2',null])assert.throws(()=>targetFor(water,people));
  const saved=own(emptyBag(),water,1,5);
  const original=JSON.stringify(saved);
  assert.equal(entryStatus(water,saved).item.target,5);
  seedFor(water,8);
  assert.equal(JSON.stringify(saved),original);
});

test('one-click suggestion must still be explicitly saved: 0 quantity is not ready',()=>{
  const food=byName('간편식'),empty=emptyBag();
  const seed=seedFor(food,2);
  assert.equal(seed.target,6);
  assert.equal(empty.items.length,0);
  const registered=own(empty,food,0,seed.target);
  assert.equal(entryStatus(food,registered).registered,true);
  assert.equal(entryStatus(food,registered).meetsOwnTarget,false);
  assert.equal(catalogProgress(registered).registered,1);
  assert.equal(catalogProgress(registered).ready,0);
  assert.equal(empty.items.length,0);
});

test('only physically stocked quantity reaches own target; ordering cannot satisfy the progress bar',()=>{
  const whistle=byName('호루라기');
  let bag=own(emptyBag(),whistle,0);
  bag=stockChange(bag,bag.items[0].id,'order',{quantity:1});
  assert.equal(entryStatus(whistle,bag).meetsOwnTarget,false);
  assert.equal(catalogProgress(bag).ready,0);
  bag=stockChange(bag,bag.items[0].id,'put',{batch:emptyBatch('new-whistle',1)});
  assert.equal(entryStatus(whistle,bag).meetsOwnTarget,true);
  assert.equal(catalogProgress(bag).ready,1);
  bag=stockChange(bag,bag.items[0].id,'take',{quantity:1,batchId:'new-whistle'});
  assert.equal(catalogProgress(bag).ready,0);
});

test('optional entries do not inflate the basic-item denominator',()=>{
  const optional=CATALOG.find(entry=>!entry.basic);
  const before=catalogProgress(emptyBag());
  const after=catalogProgress(own(emptyBag(),optional,99));
  assert.equal(after.total,before.total);assert.equal(after.ready,0);assert.equal(after.registered,0);
});

test('existing item names match without duplication and personal categories stay unchanged',()=>{
  const lamp=byName('손전등'),bag=own(emptyBag(),lamp,1);
  assert.equal(findOwned(lamp,bag)?.id,'owned-'+lamp.id);
  assert.equal(entryStatus(lamp,bag).meetsOwnTarget,true);
  const backup=parseBackup(backupText(bag));
  assert.deepEqual(backup,bag);
  assert.equal(backup.schemaVersion,1);
  assert.equal(backup.items[0].category,'equipment');
});
