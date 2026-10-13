import {validateBag} from './personal.mjs';
import {nextAction,localToday,dayDifference} from './logic.mjs';
import {validateReminderSettings} from './reminder-storage.mjs';
// Adapt BAG batches to existing nextAction: no new expiry/stock judgement engine.
export function bagReminderPlan(raw,settings,now=new Date()){
  const bag=validateBag(raw),options=validateReminderSettings(settings),groups=new Map();
  for(const item of bag.items)for(const batch of item.batches){
    if(batch.quantity===0)continue; // Includes presets: draft never means physical stock.
    const one={...item,batches:[batch],nextInspection:batch.nextInspection};
    const rotation=nextAction({...one,nextInspection:null},bag.rotationLeadDays);
    const inspection=nextAction({...one,batches:[]},bag.rotationLeadDays);
    for(const task of [inspection,rotation].filter(Boolean)){
      const key=JSON.stringify([item.id,task.due]);
      if(!groups.has(key))groups.set(key,{scheduleId:key,itemId:item.id,name:item.name,due:task.due,batchIds:[],kinds:[]});
      const group=groups.get(key);
      if(!group.batchIds.includes(batch.id))group.batchIds.push(batch.id);
      if(!group.kinds.includes(task.kind))group.kinds.push(task.kind);
    }
  }
  return [...groups.values()].sort((a,b)=>a.due.localeCompare(b.due)||a.itemId.localeCompare(b.itemId)).map(group=>{
    const trigger=new Date(`${group.due}T${options.time}:00`);
    // DST gaps are never silently promoted to a different clock time/date.
    const valid=localToday(trigger)===group.due&&`${String(trigger.getHours()).padStart(2,'0')}:${String(trigger.getMinutes()).padStart(2,'0')}`===options.time;
    const missed=dayDifference(group.due,localToday(now))<0||trigger.getTime()<=now.getTime();
    return {...group,title:`${group.name} · ${group.kinds.includes('rotation')?'교체·보관 검토':'점검'} (안전기한 아님)`,
      triggerAt:valid?trigger.toISOString():null,needsAttention:missed||!valid,schedulable:options.enabled&&valid&&!missed};
  });
}
