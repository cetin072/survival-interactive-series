// Notification metadata is separate from inventory and portable backup v1.
// IndexedDB gives the atomic updateItem contract the reused service needs.
const DB='bag-side-01-reminders';
function open(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>req.result.createObjectStore('metadata');
  req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('알림 저장소가 다른 창에 의해 막혔습니다.'));
  req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
});}
async function access(key,update){
  const db=await open();
  return new Promise((resolve,reject)=>{
    let value=null,failure;
    const tx=db.transaction('metadata',update?'readwrite':'readonly'),store=tx.objectStore('metadata');
    store.get(key).onsuccess=e=>{try{value=e.target.result??null;if(update){value=update(value);if(value===null)store.delete(key);else store.put(value,key);}}catch(error){failure=error;tx.abort();}};
    tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=()=>{db.close();reject(failure??tx.error);};
  });
}
export const reminderStorage={getItem:key=>access(key),updateItem:(key,update)=>access(key,update)};
export const DEFAULT_SETTINGS=Object.freeze({enabled:false,time:'09:00'});
export function validateReminderSettings(settings){
  if(!settings||typeof settings.enabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time))throw new Error('알림 시각은 00:00~23:59 사이로 입력하세요.');
  return {enabled:settings.enabled,time:settings.time};
}
export async function readReminderSettings(){const raw=await reminderStorage.getItem('settings');return raw===null?{...DEFAULT_SETTINGS}:validateReminderSettings(JSON.parse(raw));}
export async function saveReminderSettings(settings){const next=validateReminderSettings(settings);await reminderStorage.updateItem('settings',()=>JSON.stringify(next));return next;}
