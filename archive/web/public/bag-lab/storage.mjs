// One origin-local database, one atomic current/previous transaction.
// No localStorage mirror, server, credentials, analytics or unload-time writes.
import {emptyBag,validateBag} from './personal.mjs';
export const DB_NAME='bag-side-01-alpha';
function checkedRecord(raw) {
  if(raw===undefined) return {revision:0,bag:emptyBag()};
  if(!raw || !Number.isSafeInteger(raw.revision) || raw.revision<1 || raw.revision>=Number.MAX_SAFE_INTEGER) throw new Error('저장 기록 형식이 손상되었습니다. 원본을 덮어쓰지 않았습니다.');
  return {revision:raw.revision,bag:validateBag(raw.bag)};
}
function openDatabase() {
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB) {reject(new Error('이 브라우저에서 로컬 저장을 사용할 수 없습니다.'));return;}
    let settled=false;
    const req=globalThis.indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore('records');
    req.onblocked=()=>{settled=true;reject(new Error('다른 탭이 저장소를 사용 중입니다. 해당 탭을 닫고 다시 열어주세요.'));};
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      if(settled){req.result.close();return;}
      const db=req.result;
      db.onversionchange=()=>db.close();
      resolve(db);
    };
  });
}
export async function readRawRecord(key='current') {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    let value;
    const tx=db.transaction('records','readonly');
    tx.objectStore('records').get(key).onsuccess=e=>{value=e.target.result;};
    tx.oncomplete=()=>{db.close();resolve(value);};
    tx.onabort=()=>{db.close();reject(tx.error??new Error('저장 기록 조회가 취소됐습니다.'));};
  });
}
export async function readBag() {return checkedRecord(await readRawRecord());}
export async function readPreviousBag() {
  const raw=await readRawRecord('previous');
  return raw===undefined ? null : checkedRecord(raw);
}
export async function saveBag(candidate,expectedRevision) {
  const bag=validateBag(candidate);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0) throw new Error('저장 버전이 올바르지 않습니다.');
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    let result, failure;
    const tx=db.transaction('records','readwrite'), store=tx.objectStore('records');
    // All reads, conflict checks, recovery copy and write are in ONE transaction.
    store.get('current').onsuccess=e=>{
      try {
        const raw=e.target.result, current=checkedRecord(raw);
        if(current.revision!==expectedRevision) {
          failure=new Error('다른 탭에서 가방이 변경됐습니다. 입력 내용은 그대로입니다. 취소 후 최신 기록을 다시 읽어주세요.');
          failure.code='STALE'; tx.abort(); return;
        }
        if(JSON.stringify(current.bag)===JSON.stringify(bag)) {result=current;return;}
        result={revision:current.revision+1,bag};
        // Even the first import can be undone to an empty bag.
        store.put({revision:Math.max(1,current.revision),bag:current.bag},'previous');
        store.put(result,'current');
      } catch(error) {failure=error;tx.abort();}
    };
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onabort=()=>{db.close();reject(failure??tx.error??new Error('저장이 취소됐습니다. 기존 기록은 유지했습니다.'));};
  });
}
