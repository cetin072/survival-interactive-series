import {REMINDER_OWNER} from '../../archive/web/public/bag-lab/reused/schedule-reminder-service.mjs';
const CHANNEL='bag-side-inspections';
const numeric=identifier=>{const id=Number(identifier.split('.').at(-1));if(!Number.isInteger(id)||id<=0||id>=2147483647)throw new Error('Android 예약 식별자가 올바르지 않습니다.');return id;};
export function createAndroidNotificationDriver({notifications,settings,now=Date.now}){
  return {
    newId:()=>{const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);return String(1+bytes[0]%2147483645);},
    status:async()=>{const permission=(await notifications.checkPermissions()).display;const channels=notifications.listChannels?await notifications.listChannels():{channels:[]};const channel=channels.channels.find(c=>c.id===CHANNEL);return {supported:true,permission:channel?.importance===0?'denied':permission};},
    permission:async()=>{if((await notifications.checkPermissions()).display!=='granted')return false;const channels=notifications.listChannels?await notifications.listChannels():{channels:[]};return channels.channels.find(c=>c.id===CHANNEL)?.importance!==0;},
    requestPermission:async()=>{
      await notifications.createChannel({id:CHANNEL,name:'생존가방 점검',importance:4,description:'실제 보유 물품의 점검·교체 검토 (안전기한 아님)'});
      const current=await notifications.checkPermissions();return current.display==='granted'?current.display:(await notifications.requestPermissions()).display;
    },
    list:async()=> (await notifications.getPending()).notifications.map(n=>({identifier:n.extra?.identifier??`native-unowned-${n.id}`,content:{body:n.body,data:n.extra}})),
    schedule:async(reminder,scheduleId)=>{
      const [itemId,due]=JSON.parse(scheduleId),date=new Date(reminder.triggerAt);
      const localTime=`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      const id=numeric(reminder.identifier);
      const result=await notifications.schedule({notifications:[{id,title:'생존가방 · 점검',body:reminder.title,channelId:CHANNEL,
        schedule:{at:date,allowWhileIdle:false},extra:{identifier:reminder.identifier,owner:REMINDER_OWNER,target:'schedule',scheduleId,offsetMinutes:0,triggerAt:reminder.triggerAt,itemId,due,localTime}}]});
      if(!result.notifications.some(n=>n.id===id))throw new Error('OS 예약 응답을 확인하지 못했습니다.');return reminder.identifier;
    },
    cancel:async identifier=>notifications.cancel({notifications:[{id:numeric(identifier)}]}),
    openSettings:()=>settings.open(),
    test:async()=>{
      if((await notifications.checkPermissions()).display!=='granted')throw new Error('알림 권한이 필요합니다.');
      await notifications.schedule({notifications:[{id:2147483646,title:'생존가방 · 테스트',body:'앱 종료 후 표시를 직접 확인하세요. 시험 중입니다.',channelId:CHANNEL,schedule:{at:new Date(now()+10000)},extra:{test:true}}]});
    },
    onClick:callback=>notifications.addListener('localNotificationActionPerformed',event=>{
      const extra=event.notification.extra;
      if(extra?.owner===REMINDER_OWNER&&typeof extra.itemId==='string'){
        // Cold starts may deliver before alpha has attached its event listener.
        history.replaceState(null,'',`/bag-lab/alpha.html?item=${encodeURIComponent(extra.itemId)}`);callback(extra.itemId);
      }
    })
  };
}
