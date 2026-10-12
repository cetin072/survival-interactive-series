import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBag,backupText,parseBackup} from '../../web/public/bag-lab/personal.mjs';
import {applyPreset,previewPreset} from '../../web/public/bag-lab/presets.mjs';
import {bagReminderPlan} from '../../web/public/bag-lab/reminder-plan.mjs';
import {createBagReminderCoordinator} from '../../web/public/bag-lab/reminder-coordinator.mjs';
import {REMINDER_OWNER} from '../../web/public/bag-lab/reused/schedule-reminder-service.mjs';
import {createAndroidNotificationDriver} from '../../../bag-mobile/src/native-adapter.mjs';
const NOW=Date.parse('2030-01-01T00:00:00Z'),settings={enabled:true,time:'09:00'};
function bag(){return {...emptyBag(),rotationLeadDays:0,items:[{id:'light',name:'시험 손전등',category:'equipment',target:1,unit:'개',orderedQuantity:0,batches:[{id:'batch-a',quantity:1,dateType:'none',markedUntil:null,nextInspection:'2030-01-03'}]}]};}
function harness(){
  let record={revision:1,bag:bag()},options={...settings},allowed=true,id=0,fail=null,clock=NOW;
  const disk=new Map(),os=new Map(),calls=[];
  let gate=Promise.resolve();const lock=run=>{const task=gate.then(run);gate=task.catch(()=>{});return task;};
  const storage={getItem:async k=>disk.get(k)??null,updateItem:async(k,fn)=>{const next=fn(disk.get(k)??null);disk.set(k,next);return next;}};
  const driver={permission:async request=>{calls.push(['permission',request]);return allowed;},list:async()=>structuredClone([...os.values()]),
    schedule:async(r,sid)=>{calls.push(['schedule',r.identifier]);os.set(r.identifier,{identifier:r.identifier,content:{body:r.title,data:{owner:REMINDER_OWNER,target:'schedule',scheduleId:sid,offsetMinutes:0,triggerAt:r.triggerAt}}});if(fail)throw Error('lost acknowledgement');return r.identifier;},
    cancel:async id=>{calls.push(['cancel',id]);os.delete(id);}};
  const deps={storage,driver,readBag:async()=>structuredClone(record),readSettings:async()=>({...options}),newId:()=>String(++id),now:()=>clock,lock};
  return {coordinator:createBagReminderCoordinator(deps),deps,os,calls,
    setBag:next=>{record={revision:record.revision+1,bag:next};},record:()=>record,settings:next=>options=next,permission:v=>allowed=v,fail:v=>fail=v,clock:v=>clock=v};
}
test('physical quantities only; presets/ordered stock do not schedule',()=>{
 const b=bag();b.items[0].batches[0].quantity=0;b.items[0].orderedQuantity=10;
 assert.deepEqual(bagReminderPlan(b,settings,new Date(NOW)),[]);
 const rows=previewPreset(emptyBag(),'light','2030-01-01');
 const draft=applyPreset(emptyBag(),'light',rows.map(r=>({catalogId:r.entry.id,target:r.target,inspection:r.inspection})),{today:'2030-01-01',packed:false});
 assert.deepEqual(bagReminderPlan(draft,settings,new Date(NOW)),[]);
});
test('same item+date groups batches and inspection/rotation; separate due dates remain distinct',()=>{
 const b=bag();b.items[0].batches.push({...b.items[0].batches[0],id:'batch-b'});
 b.items[0].batches[0].dateType='use';b.items[0].batches[0].markedUntil='2030-01-03';
 let plan=bagReminderPlan(b,settings,new Date(NOW));assert.equal(plan.length,1);assert.equal(plan[0].batchIds.length,2);assert.equal(plan[0].kinds.length,2);
 b.items[0].batches[1].nextInspection='2030-01-05';plan=bagReminderPlan(b,settings,new Date(NOW));assert.equal(plan.length,2);
 assert.equal(parseBackup(backupText(b)).items[0].batches[0].markedUntil,'2030-01-03');
});
test('permission denied/not yet granted never schedules or prompts automatically',async()=>{
 const h=harness();h.permission(false);const result=await h.coordinator.synchronize();assert.equal(result.permission,false);assert.equal(h.os.size,0);assert.ok(h.calls.every(c=>c[0]!=='permission'||c[1]===false));
 h.permission(true);await h.coordinator.synchronize();assert.equal(h.os.size,1);
});
test('dedup, date/time edits cancel old reservations BEFORE replacements',async()=>{
 const h=harness();await h.coordinator.synchronize();await h.coordinator.synchronize();assert.equal(h.os.size,1);assert.equal(h.calls.filter(c=>c[0]==='schedule').length,1);
 const b=bag();b.items[0].batches[0].nextInspection='2030-01-04';h.setBag(b);h.calls.length=0;
 await h.coordinator.synchronize();assert.equal(h.os.size,1);assert.equal(h.calls.filter(c=>c[0]==='cancel'||c[0]==='schedule')[0][0],'cancel');
 h.settings({enabled:true,time:'10:30'});await h.coordinator.synchronize();assert.equal(h.os.size,1);assert.match([...h.os.values()][0].content.data.triggerAt,/T10:30:00/);
});
test('zero stock, batch/item deletion, JSON restore and disable remove obsolete reservations',async()=>{
 for(const mutate of [b=>b.items[0].batches[0].quantity=0,b=>b.items[0].batches=[],b=>b.items=[]]){
  const h=harness();await h.coordinator.synchronize();const b=bag();mutate(b);h.setBag(b);await h.coordinator.synchronize();assert.equal(h.os.size,0);
 }
 const h=harness();await h.coordinator.synchronize();h.setBag(parseBackup(backupText(emptyBag())));await h.coordinator.synchronize();assert.equal(h.os.size,0);
 h.setBag(bag());await h.coordinator.synchronize();h.settings({enabled:false,time:'09:00'});await h.coordinator.synchronize();assert.equal(h.os.size,0);
});
test('failed bag save has no notification side effects; committed save reports OS failure separately',async()=>{
 const h=harness();await h.coordinator.synchronize();h.calls.length=0;
 await assert.rejects(h.coordinator.afterSave(async()=>{throw Error('STALE or disk quota');}));assert.deepEqual(h.calls,[]);assert.equal(h.os.size,1);
 h.fail(true);const b=bag();b.items[0].batches[0].nextInspection='2030-01-04';
 const result=await h.coordinator.afterSave(async()=>{h.setBag(b);return h.record();});assert.equal(result.record.bag.items[0].batches[0].nextInspection,'2030-01-04');assert.ok(result.reminderError);
});
test('app restart/lost acknowledgement converges; deleted or edited pending intents do not resurrect',async()=>{
 for(const mutation of ['same','delete','edit']){
  const h=harness();h.fail(true);await assert.rejects(h.coordinator.synchronize());assert.equal(h.os.size,1);h.fail(false);
  const b=bag();if(mutation==='delete')b.items=[];if(mutation==='edit')b.items[0].batches[0].nextInspection='2030-01-05';h.setBag(b);
  const restarted=createBagReminderCoordinator(h.deps);await restarted.synchronize();assert.equal(h.os.size,mutation==='delete'?0:1);
  if(mutation==='edit')assert.match([...h.os.values()][0].content.data.triggerAt,/2030-01-05/);
 }
});
test('two owners/tabs serialize entire reread+OS mutation; stale saves cannot reschedule',async()=>{
 const h=harness(),other=createBagReminderCoordinator(h.deps);await Promise.all([h.coordinator.synchronize(),other.synchronize()]);assert.equal(h.os.size,1);
 await assert.rejects(other.afterSave(async()=>{throw Error('STALE');}));assert.equal(h.os.size,1);
});
test('missed dates resurface, never shift forward or fire immediately',async()=>{
 const h=harness();await h.coordinator.synchronize();h.clock(Date.parse('2030-01-06T00:00:00Z'));const result=await h.coordinator.synchronize();assert.equal(h.os.size,0);assert.equal(result.rows[0].due,'2030-01-03');assert.equal(result.rows[0].needsAttention,true);
});
test('timezone changes preserve date/local clock and reschedule instant, DST gap stays unreserved',()=>{
 const original=process.env.TZ;try{
  process.env.TZ='Asia/Seoul';const seoul=bagReminderPlan(bag(),settings,new Date(NOW))[0];
  process.env.TZ='America/New_York';const ny=bagReminderPlan(bag(),settings,new Date(NOW))[0];assert.equal(ny.due,seoul.due);assert.notEqual(ny.triggerAt,seoul.triggerAt);
  const b=bag();b.items[0].batches[0].nextInspection='2030-03-10';const gap=bagReminderPlan(b,{enabled:true,time:'02:30'},new Date(NOW))[0];assert.equal(gap.schedulable,false);assert.equal(gap.triggerAt,null);
 }finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
test('native adapter preserves requested IDs/ownership, settings and click target; no cross-app mapping',async()=>{
 let pending=[],click,permission='denied',opened=false;
 const n={checkPermissions:async()=>({display:permission}),requestPermissions:async()=>({display:permission='granted'}),createChannel:async channel=>assert.equal(channel.id,'bag-side-inspections'),
  schedule:async({notifications})=>{pending=notifications;return {notifications:notifications.map(n=>({id:n.id}))};},getPending:async()=>({notifications:pending}),cancel:async()=>pending=[],addListener:async(_,fn)=>{click=fn;}};
 const driver=createAndroidNotificationDriver({notifications:n,settings:{open:async()=>opened=true},now:()=>NOW});
 assert.equal(await driver.permission(),false);assert.equal(await driver.requestPermission(),'granted');
 const id='bag-side.reminder.v3.123';assert.equal(await driver.schedule({identifier:id,triggerAt:'2030-01-03T09:00:00.000Z',title:'시험'},'["light","2030-01-03"]'),id);
 assert.equal((await driver.list())[0].identifier,id);assert.equal(pending[0].extra.owner,REMINDER_OWNER);assert.equal(pending[0].extra.itemId,'light');
 let target;globalThis.history={replaceState:(_,__,url)=>target=url};await driver.onClick(id=>target+='|'+id);click({notification:pending[0]});assert.match(target,/item=light\|light/);delete globalThis.history;
 await driver.openSettings();assert.equal(opened,true);await driver.cancel(id);assert.deepEqual(await driver.list(),[]);
});
