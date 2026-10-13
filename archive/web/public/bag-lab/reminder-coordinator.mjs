import {createScheduleReminderService} from './reused/schedule-reminder-service.mjs';
import {bagReminderPlan} from './reminder-plan.mjs';
// Worklog post-save contract: only reread the committed source, never form drafts.
// Whole reconciliation is serialized across tabs; without Web Locks native fails closed.
export function createBagReminderCoordinator({storage,driver,readBag,readSettings,newId,now=()=>Date.now(),lock}){
  const service=createScheduleReminderService({storage,driver,newId,now});
  let tail=Promise.resolve();
  const serial=run=>{const job=tail.then(()=>lock(run));tail=job.catch(()=>{});return job;};
  async function synchronize(){
    const record=await readBag(),settings=await readSettings();
    const rows=bagReminderPlan(record.bag,settings,new Date(now())),wanted=new Map(rows.filter(x=>x.schedulable).map(x=>[x.scheduleId,x]));
    // Supersede obsolete intents BEFORE recovery, or deleted items could be resurrected.
    for(const id of await service.listTrackedReminderScheduleIds()){
      const target=wanted.get(id),old=[...await service.listScheduleReminders(id),...await service.listPendingScheduleReminders(id)];
      if(!target||old.some(r=>r.triggerAt!==target.triggerAt||r.title!==target.title))await service.cancelAllScheduleReminders(id);
    }
    const permission=await driver.permission(false);
    // Explicit user enable grants permission; background recovery never prompts.
    if(permission)for(const row of wanted.values())await service.scheduleReminder({scheduleId:row.scheduleId,title:row.title,scheduleStartsAt:row.triggerAt,offsetMinutes:0});
    const recovery=await service.reconcileScheduleReminders(),status=await service.getScheduleReminderStatus();
    return {revision:record.revision,permission,rows,...status,recovery};
  }
  return {synchronize:()=>serial(synchronize),
    // If save fails, no new reservation side effects. A committed save stays committed
    // even if OS reconciliation fails; the caller reports the two results separately.
    afterSave:save=>serial(async()=>{const record=await save();try{return {record,reminders:await synchronize()};}catch(error){return {record,reminderError:error};}})};
}
export function browserReminderLock(run){
  if(!globalThis.navigator?.locks)throw new Error('이 환경에서 안전한 알림 동기화를 지원하지 않습니다.');
  return navigator.locks.request('bag-side-01-inventory-reminders',run);
}
