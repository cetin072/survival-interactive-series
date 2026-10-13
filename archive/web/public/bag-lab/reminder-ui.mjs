import {readBag,saveBag} from './storage.mjs';
import {reminderStorage,readReminderSettings,saveReminderSettings} from './reminder-storage.mjs';
import {bagReminderPlan} from './reminder-plan.mjs';
import {createBagReminderCoordinator,browserReminderLock} from './reminder-coordinator.mjs';
import {webNotificationStatus,requestWebNotificationPermission,testWebNotification} from './web-notifications.mjs';
const $=id=>document.getElementById(id);
let coordinator=null,driver=null,active=false;
const permissionLabel=p=>({granted:'권한 허용됨',denied:'권한 거부됨',prompt:'권한 필요',default:'권한 필요',unsupported:'지원하지 않음'}[p]??'확인 필요');
const fault=error=>{$('reminder-status').textContent='확인 필요 · '+error.message;};
export async function refreshBagReminders(){
  try{
    const [record,settings]=await Promise.all([readBag(),readReminderSettings()]);
    const permission=driver?await driver.status():webNotificationStatus();
    $('reminder-enabled').checked=settings.enabled;
    $('reminder-time').value=settings.time;
    $('reminder-permission').textContent=permissionLabel(permission.permission);
    $('reminder-enabled').disabled=!permission.supported;
    $('reminder-test').disabled=!permission.supported||!settings.enabled||permission.permission!=='granted';
    const plan=bagReminderPlan(record.bag,settings);
    const due=plan.filter(x=>x.needsAttention);
    $('reminder-attention').replaceChildren();
    for(const row of due){const button=document.createElement('button');button.type='button';button.className='quiet-button';button.dataset.focus=row.itemId;button.textContent=`확인 필요 · ${row.name} · ${row.due}`;$('reminder-attention').append(button);}
    if(!due.length)$('reminder-attention').textContent='지난 점검·교체 검토 기록 없음';
    if(driver){
      const result=await coordinator.synchronize();
      $('reminder-count').textContent=result.permission?`예약된 점검 알림 ${result.scheduled}개`:'권한 없음 · 실제 전달 불가';
      $('reminder-status').textContent=result.recovery.failed||result.pending||result.cleanupPending?'확인 필요 · 예약 또는 취소가 남아 있습니다.':'Android 알림을 확인했어요. 기기 설정에 따라 표시가 늦어질 수 있습니다.';
    }else{
      $('reminder-count').textContent='예약된 점검 알림 0개 · 웹은 앱 종료 후 날짜 예약을 지원하지 않습니다.';
      $('reminder-status').textContent=permission.permission==='granted'&&settings.enabled?'웹 테스트 알림 사용 · 점검은 앱을 열 때 확인하세요.':'알림 사용 안 함 · 앱 안에서 점검할 물품은 계속 표시합니다.';
    }
  }catch(error){fault(error);}
}
export async function saveBagWithReminders(candidate,revision){
  if(!coordinator){const record=await saveBag(candidate,revision);void refreshBagReminders();return record;}
  const result=await coordinator.afterSave(()=>saveBag(candidate,revision));
  if(result.reminderError)fault(result.reminderError);else void refreshBagReminders();
  return result.record;
}
export async function initializeBagReminders(){
  if(active)return;active=true;
  driver=globalThis.BagAndroidNotificationDriver??null;
  if(driver){
    coordinator=createBagReminderCoordinator({storage:reminderStorage,driver,readBag,readSettings:readReminderSettings,newId:driver.newId,lock:browserReminderLock});
    $('reminder-platform').textContent='Android · 기기 알림';
    $('reminder-time-label').hidden=false;$('reminder-settings').hidden=false;
    driver.onClick(itemId=>document.dispatchEvent(new CustomEvent('bag-open-item',{detail:{itemId}})));
  }else $('reminder-platform').textContent='웹/PWA · 앱 내 점검 및 테스트 알림';
  $('reminder-enabled').addEventListener('change',async()=>{
    const enabled=$('reminder-enabled').checked;
    $('reminder-enabled').disabled=true;
    try{
      if(enabled){const permission=driver?await driver.requestPermission():await requestWebNotificationPermission();if(permission!=='granted')throw new Error('알림 권한을 허용하지 않아 알림 사용을 켜지 않았습니다.');}
      const save=async()=>saveReminderSettings({...await readReminderSettings(),enabled});
      if(driver)await browserReminderLock(save);else await save();
      await refreshBagReminders();
    }catch(error){await refreshBagReminders();fault(error);}
  });
  $('reminder-time').addEventListener('change',async()=>{
    try{await browserReminderLock(async()=>saveReminderSettings({...await readReminderSettings(),time:$('reminder-time').value}));await refreshBagReminders();}catch(error){fault(error);}
  });
  $('reminder-test').addEventListener('click',async()=>{
    try{if(driver)await driver.test();else await testWebNotification();$('reminder-status').textContent=driver?'10초 뒤 테스트 알림을 예약했어요. 기기에서 표시되는지 확인해 주세요.':'테스트 알림을 확인해 주세요. 웹앱을 닫은 뒤 날짜별 자동 알림은 아닙니다.';}catch(error){fault(error);}
  });
  $('reminder-refresh').addEventListener('click',()=>refreshBagReminders());
  $('reminder-settings').addEventListener('click',()=>driver?.openSettings().catch(fault));
  window.addEventListener('focus',()=>refreshBagReminders());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshBagReminders();});
  await refreshBagReminders();
}
