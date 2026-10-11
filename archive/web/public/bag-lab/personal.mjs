// BAG-SIDE-01 personal Alpha: pure validation, stock changes and portable backup.
// No storage, network, recommendation quantities or automatic expiry assumptions.
export const APP_ID = 'BAG-SIDE-01';
export const MAX_BACKUP_BYTES = 1024 * 1024;
export const CATEGORIES = {food:'식품', water:'물', equipment:'장비', hygiene:'위생', medicine:'의약품', documents:'서류', other:'기타'};
export const DATE_TYPES = {none:'날짜 없음', consumption:'소비기한', distribution:'유통기한', use:'사용기한', other:'기타 표시기한'};
export const emptyBag = () => ({schemaVersion:1, sampleOnly:false, bagName:'나의 생존가방', rotationLeadDays:90, items:[]});
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label}: 객체 형식이 아닙니다.`);
  if (Object.keys(value).some(key => !keys.includes(key))) fail(`${label}: 지원하지 않는 항목이 있습니다.`);
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${label}: 공백·길이·문자를 확인하세요.`);
}
function number(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label}: ${min}~${max} 사이 정수를 입력하세요.`);
}
function id(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) fail('물품·묶음 ID가 올바르지 않습니다.');
}
function date(value) {
  if (value === null) return;
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail('날짜는 2000~2099년의 YYYY-MM-DD 형식이어야 합니다.');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) fail('달력에 없는 날짜입니다.');
}
export function validateBag(value) {
  object(value, ['schemaVersion','sampleOnly','bagName','rotationLeadDays','items'], '가방');
  if (value.schemaVersion !== 1 || value.sampleOnly !== false) fail('지원하는 개인 가방 형식이 아닙니다. 샘플 또는 다른 버전은 가져올 수 없습니다.');
  text(value.bagName,60,'가방 이름'); number(value.rotationLeadDays,0,365,'관리 여유일');
  if (!Array.isArray(value.items) || value.items.length > 200) fail('물품은 최대 200종까지 기록할 수 있습니다.');
  const ids = new Set(), names = new Set();
  const uniqueId = value => { id(value); if (ids.has(value)) fail('중복된 물품·묶음 ID가 있습니다.'); ids.add(value); };
  for (const item of value.items) {
    object(item, ['id','name','category','target','unit','orderedQuantity','batches'], '물품');
    uniqueId(item.id); text(item.name,80,'물품 이름'); text(item.unit,12,'단위');
    if (typeof item.category !== 'string' || !Object.hasOwn(CATEGORIES,item.category)) fail('물품 분류가 올바르지 않습니다.');
    const name = item.name.normalize('NFC').toLowerCase();
    if (names.has(name)) fail('같은 이름의 물품이 있습니다. 기존 물품에 묶음을 추가하세요.'); names.add(name);
    number(item.target,1,9999,'목표 수량'); number(item.orderedQuantity,0,9999,'주문 수량');
    if (!Array.isArray(item.batches) || item.batches.length > 100) fail('물품별 묶음은 최대 100개까지 기록할 수 있습니다.');
    let total = 0;
    for (const batch of item.batches) {
      object(batch, ['id','quantity','dateType','markedUntil','nextInspection'], '묶음');
      uniqueId(batch.id); number(batch.quantity,0,9999,'가방 속 수량'); total += batch.quantity;
      date(batch.markedUntil); date(batch.nextInspection);
      if (typeof batch.dateType !== 'string' || !Object.hasOwn(DATE_TYPES,batch.dateType) || ((batch.dateType === 'none') !== (batch.markedUntil === null))) fail('표시기한 종류와 날짜를 함께 확인하세요.');
    }
    number(total,0,9999,'물품의 총 가방 수량');
  }
  if (new TextEncoder().encode(JSON.stringify(value,null,2)).length > 256*1024) fail('가방 기록은 256KB 이하여야 합니다. 백업 가능한 크기를 초과했습니다.');
  return copy(value);
}
export function newId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return 'b' + [...bytes].map(x => x.toString(16).padStart(2,'0')).join('');
}
export const newBatch = (quantity=0) => ({id:newId(),quantity,dateType:'none',markedUntil:null,nextInspection:null});
export function upsertItem(bag,item) {
  const next=validateBag(bag), index=next.items.findIndex(x=>x.id===item.id);
  if(index<0) next.items.push(copy(item)); else next.items[index]=copy(item);
  return validateBag(next);
}
export function removeItem(bag,itemId) {
  const next=validateBag(bag);
  if(!next.items.some(x=>x.id===itemId)) fail('물품을 찾지 못했습니다.');
  next.items=next.items.filter(x=>x.id!==itemId);
  return next;
}
export function removeBatch(bag,itemId,batchId) {
  const next=validateBag(bag), item=next.items.find(x=>x.id===itemId);
  if(!item) fail('물품을 찾지 못했습니다.');
  if(!item.batches.some(batch=>batch.id===batchId)) fail('삭제할 묶음 기록을 찾지 못했습니다.');
  item.batches=item.batches.filter(batch=>batch.id!==batchId);
  // Even the last batch can be removed; the parent item and its target remain.
  return validateBag(next);
}
export function stockChange(bag,itemId,action,{quantity,batchId,batch,separate=false}={}) {
  const next=validateBag(bag), item=next.items.find(x=>x.id===itemId);
  if(!item) fail('물품을 찾지 못했습니다.');
  if(action==='put') {
    number(batch?.quantity,1,9999,'실제로 넣은 수량');
    if(typeof separate!=='boolean') fail('별도 묶음 선택이 올바르지 않습니다.');
    // Validate the incoming record BEFORE matching, so a malformed date, ID or
    // unsupported field cannot be silently swallowed by an existing batch.
    const probe=copy(next), probeItem=probe.items.find(x=>x.id===itemId);
    probeItem.batches=[copy(batch)];
    validateBag(probe);
    if(item.batches.some(existing=>existing.id===batch.id)) fail('중복된 물품·묶음 ID가 있습니다.');
    const existing=separate?null:item.batches.find(current=>
      current.dateType===batch.dateType &&
      current.markedUntil===batch.markedUntil &&
      current.nextInspection===batch.nextInspection
    );
    if(existing) existing.quantity+=batch.quantity;
    else item.batches.push(copy(batch));
    item.orderedQuantity=Math.max(0,item.orderedQuantity-batch.quantity);
  } else {
    number(quantity,1,9999,'수량');
    if(action==='take') {
      const chosen=item.batches.find(x=>x.id===batchId);
      if(!chosen || chosen.quantity<quantity) fail('선택한 묶음의 실제 수량보다 많이 꺼낼 수 없습니다.');
      chosen.quantity-=quantity;
    } else if(action==='order') item.orderedQuantity+=quantity;
    else fail('지원하지 않는 재고 작업입니다.');
  }
  return validateBag(next);
}
// Adapt per-batch inspection dates to the already verified demo model.
// Stored data remains batch-specific; zero-quantity batches create no tasks.
export function dashboardBag(bag) {
  return {...bag,items:bag.items.map(item=>{
    const inspections=item.batches.filter(b=>b.quantity>0&&b.nextInspection).map(b=>b.nextInspection).sort();
    return {...item,nextInspection:inspections[0]??null};
  })};
}
export function backupText(bag,now=new Date()) {
  return JSON.stringify({app:APP_ID,formatVersion:1,exportedAt:now.toISOString(),bag:validateBag(bag)},null,2);
}
export function parseBackup(raw) {
  if(typeof raw!=='string' || new TextEncoder().encode(raw).length>MAX_BACKUP_BYTES) fail('백업은 1MB 이하의 JSON 파일이어야 합니다.');
  let parsed;
  try { parsed=JSON.parse(raw); } catch { fail('JSON 파일을 읽을 수 없습니다. 기존 가방은 변경하지 않았습니다.'); }
  object(parsed,['app','formatVersion','exportedAt','bag'],'백업');
  if(parsed.app!==APP_ID || parsed.formatVersion!==1) fail('BAG-SIDE-01 백업 버전 1만 복원할 수 있습니다.');
  if(typeof parsed.exportedAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed.exportedAt) || !Number.isFinite(Date.parse(parsed.exportedAt)) || new Date(parsed.exportedAt).toISOString()!==parsed.exportedAt) fail('백업 생성 시간이 올바르지 않습니다.');
  return validateBag(parsed.bag);
}
