import {currentQuantity,shortage,dashboardSummary,prioritizedItems,nextAction,dayDifference,localToday} from './logic.mjs';
import {CATEGORIES,DATE_TYPES,MAX_BACKUP_BYTES,newId,newBatch,upsertItem,removeItem,removeBatch,stockChange,dashboardBag,backupText,parseBackup,validateBag} from './personal.mjs';
import {readBag,saveBag,readPreviousBag,readRawRecord} from './storage.mjs';
import {GROUPS,CATALOG,targetFor,seedFor,entryStatus,catalogProgress} from './catalog.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let record=null, screen='bag', filter='all', busy=false, editBase=null, mode=null, itemId=null, activeBatchId=null, replacement=null;
let catalogGroup='food',familyCount=1; // ephemeral guidance only; NEVER modifies recorded inventory
function message(text,failed=false){$('save-status').textContent=text;$('save-status').classList.toggle('failure',failed);}
function readiness(){document.querySelectorAll('[data-ready]').forEach(el=>{el.disabled=!record||busy||(el.id==='family-less'&&familyCount===1)||(el.id==='family-more'&&familyCount===8);});$('submit').disabled=busy;$('cancel').disabled=busy;}
function showScreen(next){
  screen=next;
  document.querySelectorAll('[data-screen]').forEach(el=>{el.hidden=el.dataset.screen!==next;});
  document.querySelectorAll('[data-nav]').forEach(el=>{const active=el.dataset.nav===next;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;});
  window.scrollTo({top:0,behavior:'instant'});
}
function schedule(item,bag){
  const task=nextAction(item,bag.rotationLeadDays);
  if(!task)return '관리 일정 미등록';
  if(task.kind==='inspection')return `점검 ${task.due}`;
  const label=['food','water'].includes(item.category)?'순환·교체 검토':'교체·보관 확인';
  return `${label} ${task.due} · 표시기한 ${task.markedUntil}`;
}
function drawCatalog(bag){
  const stats=catalogProgress(bag);
  $('catalog-ready-count').textContent=`${stats.ready} / ${stats.total}`;
  $('catalog-progress').value=stats.total?Math.round(stats.ready/stats.total*100):0;
  $('family-count').textContent=`${familyCount}명`;
  $('family-less').disabled=busy||!record||familyCount<=1;
  $('family-more').disabled=busy||!record||familyCount>=8;
  $('catalog-groups').innerHTML=GROUPS.map(group=>
    `<button type="button" data-guide-group="${esc(group.id)}" data-ready aria-pressed="${String(group.id===catalogGroup)}">${esc(group.label)}</button>`).join('');
  const active=GROUPS.find(group=>group.id===catalogGroup)??GROUPS[0];
  const entries=CATALOG.filter(entry=>entry.group===active.id);
  $('catalog-group-intro').textContent=`${active.help} · 기본 ${entries.filter(entry=>entry.basic).length}종 / 선택 ${entries.filter(entry=>!entry.basic).length}종`;
  $('catalog-items').innerHTML=entries.map(entry=>{
    const status=entryStatus(entry,bag);
    const note=status.registered?`실제 ${status.quantity}${status.item.unit} / 내 목표 ${status.item.target}${status.item.unit} · ${status.meetsOwnTarget?'개인 목표 충족':'부족 또는 확인 필요'}`:
      `등록할 때 참고: ${targetFor(entry,familyCount)}${entry.unit} · 실제 보유량 0부터 시작`;
    const action=status.registered?
      `data-guide-focus="${esc(status.item.id)}" class="view-existing"`:
      `data-guide-add="${esc(entry.id)}"`;
    return `<article class="catalog-entry"><div><h4>${esc(entry.name)}<span class="catalog-badge ${entry.basic?'':'optional'}">${entry.basic?'기본':'선택'}</span></h4><p>${esc(entry.note)}</p><p class="catalog-meta">${esc(note)}</p></div><button type="button" ${action} data-ready>${status.registered?'내 기록 보기':'등록하기 +'}</button></article>`;
  }).join('');
}
function draw(){
  if(!record)return;
  const bag=dashboardBag(record.bag), totals=dashboardSummary(bag), ordered=prioritizedItems(bag), today=localToday();
  $('bag-name').textContent=bag.bagName;
  $('item-count').textContent=totals.items;$('needs-count').textContent=totals.shortages;$('soon-count').textContent=totals.soonCount;
  $('next-check').textContent=totals.next?`가장 가까운 일정 · ${totals.next.item.name} · ${totals.next.task.due}`:bag.items.length?'관리 일정이 아직 없습니다. 물품별 날짜를 확인하세요.':'아직 등록한 물품이 없습니다. 내 물품부터 하나씩 기록하세요.';
  drawCatalog(record.bag);
  $('lead-note').textContent=`표시기한 ${bag.rotationLeadDays}일 전을 교체·순환 검토일로 계산합니다. 이는 관리 설정이며 식품 안전기준이 아닙니다. 날짜만으로 섭취 가능 여부를 판단하지 마세요.`;
  $('upcoming-list').innerHTML=ordered.slice(0,4).map((item,index)=>`<button type="button" class="upcoming-row" data-focus="${esc(item.id)}"><span class="upcoming-index">${index+1}</span><span class="upcoming-copy"><strong>${esc(item.name)}</strong><small>${esc(schedule(item,bag))}</small></span><span class="upcoming-chip ${shortage(item)?'short':''}">${shortage(item)?`보충 ${shortage(item)}${esc(item.unit)}`:'물품 확인 →'}</span></button>`).join('')||'<div class="items-empty">빈 가방에서 시작합니다. 샘플 물품을 자동으로 넣지 않습니다.</div>';
  const chosen=ordered.filter(item=>filter==='short'?shortage(item)>0:filter==='soon'?(nextAction(item,bag.rotationLeadDays)&&dayDifference(nextAction(item,bag.rotationLeadDays).due,today)<=30):true);
  $('item-list').innerHTML=chosen.map(item=>{
    const gap=shortage(item);
    const batches=item.batches.map((b,i)=>`<div class="batch-row"><span>묶음 ${i+1} · ${b.quantity}${esc(item.unit)} · ${b.markedUntil?esc(DATE_TYPES[b.dateType])+' '+b.markedUntil:'표시기한 없음'}${b.nextInspection?' · 점검 '+b.nextInspection:''}</span><button type="button" class="quiet-button batch-remove" data-mode="delete-batch" data-item="${esc(item.id)}" data-batch-id="${esc(b.id)}" data-ready>이 묶음 기록 삭제</button></div>`).join('');
    return `<article class="item personal-item" id="item-${esc(item.id)}" tabindex="-1"><div class="item-head"><div><h3>${esc(item.name)}</h3><span class="item-tag ${gap?'short':''}">${gap?`보충 ${gap}${esc(item.unit)}`:'기록상 수량 충족'}</span></div><div class="item-number"><strong>${currentQuantity(item)} <span>/ ${item.target}${esc(item.unit)}</span></strong></div></div><p class="item-sub">${esc(schedule(item,bag))} · 주문 중 ${item.orderedQuantity}${esc(item.unit)} (가방 제외)</p><details class="batch-list"><summary>묶음 ${item.batches.length}개 · 날짜·수량 확인</summary>${batches||'<p>실물 묶음이 없습니다.</p>'}</details><div class="actions">${[['take','꺼냈어요'],['order','주문했어요'],['put','실제로 넣었어요'],['edit','수정'],['delete','삭제']].map(([action,label])=>`<button type="button" class="${action==='put'?'action confirm-action':'quiet-button'}" data-mode="${action}" data-item="${esc(item.id)}" data-ready ${action==='take'&&currentQuantity(item)===0?'data-empty disabled':''}>${label}</button>`).join('')}</div></article>`;
  }).join('')||'<div class="items-empty">해당하는 물품이 없습니다.</div>';
  document.querySelectorAll('.filters [data-filter]').forEach(el=>{const active=el.dataset.filter===filter;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
  readiness();document.querySelectorAll('[data-empty]').forEach(el=>{el.disabled=true;});
}
function options(values,current){return Object.entries(values).map(([key,value])=>`<option value="${esc(key)}" ${key===current?'selected':''}>${esc(value)}</option>`).join('');}
function field(label,name,type,value,extra=''){return `<label class="field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value??'')}" ${extra}></label>`;}
function batchFields(batch,index,removable=false){
  return `<fieldset class="batch-fields" data-batch="${esc(batch.id)}"><legend>묶음 ${index+1}</legend><div class="form-grid">${field('실제 가방 속 수량','quantity','number',batch.quantity,'required min="0" max="9999" step="1"')}<label class="field">표시기한 종류<select name="dateType">${options(DATE_TYPES,batch.dateType)}</select></label>${field('제품에 적힌 표시기한','markedUntil','date',batch.markedUntil,'min="2000-01-01" max="2099-12-31"')}${field('다음 점검일 (선택)','nextInspection','date',batch.nextInspection,'min="2000-01-01" max="2099-12-31"')}</div>${removable?'<button type="button" class="quiet-button" data-command="remove-draft">등록 전 묶음 삭제</button>':''}</fieldset>`;
}
function readBatches(){
  return [...$('editor-body').querySelectorAll('[data-batch]')].map(row=>({id:row.dataset.batch,quantity:Number(row.querySelector('[name="quantity"]').value),dateType:row.querySelector('[name="dateType"]').value,markedUntil:row.querySelector('[name="markedUntil"]').value||null,nextInspection:row.querySelector('[name="nextInspection"]').value||null}));
}
function openEditor(nextMode,id=null,bag=null,base=record,seed=null,batchId=null){
  if(!base||busy)return;
  mode=nextMode;itemId=id;activeBatchId=batchId;editBase=base;replacement=bag;
  const item=base.bag.items.find(x=>x.id===id);
  if(['edit','take','order','put','delete','delete-batch'].includes(mode)&&!item)throw new Error('물품을 찾지 못했습니다.');
  $('editor-error').hidden=true;
  let title,body,submit='저장';
  if(mode==='add'||mode==='edit'){
    const draft=item??{id:newId(),...(seed??{name:'',category:'other',target:1,unit:'개'}),orderedQuantity:0,batches:[newBatch(0)]};itemId=draft.id;
    title=mode==='add'?'내 물품 등록':'물품 수정';submit=mode==='add'?'가방에 등록':'변경 저장';
    body=`<div class="form-grid">${field('물품 이름','name','text',draft.name,'required maxlength="80" autofocus')}<label class="field">분류<select name="category">${options(CATEGORIES,draft.category)}</select></label>${field('내 목표 수량','target','number',draft.target,'required min="1" max="9999" step="1"')}${field('단위','unit','text',draft.unit,'required maxlength="12"')}${field('주문 중 수량 (가방 제외)','orderedQuantity','number',draft.orderedQuantity,'required min="0" max="9999" step="1"')}</div><p class="form-help">실제 가방 안을 확인하고 입력하세요. 아직 없는 물품은 가방 속 수량을 0으로 기록합니다. 같은 제품도 기한이 다르면 묶음을 나눕니다.${seed?' 추천 기본 수량은 예시일 뿐입니다. 충분한 생존 물자량이 아니므로 목표 수량을 직접 조정하세요.':''}</p><div id="batch-fields">${draft.batches.map((b,i)=>batchFields(b,i,mode==='add')).join('')}</div><button type="button" class="quiet-button" data-command="add-batch">＋ 기한이 다른 묶음 추가</button>`;
  }else if(mode==='take'){
    title=`${item.name} · 꺼냈어요`;submit='꺼낸 수량 반영';
    const choices=item.batches.map((b,i)=>[b,i]).filter(([b])=>b.quantity>0);
    body=`<label class="field">꺼낸 묶음<select name="batchId">${choices.map(([b,i])=>`<option value="${esc(b.id)}">묶음 ${i+1} · ${b.quantity}${esc(item.unit)} · ${b.markedUntil??'기한 없음'}</option>`).join('')}</select></label>${field('실제로 꺼낸 수량','quantity','number',1,'required min="1" max="9999" step="1"')}<p class="form-help">선택한 묶음에서만 차감합니다. 부족 수량은 실제 보충 전까지 남습니다.</p>`;
  }else if(mode==='order'){
    title=`${item.name} · 주문했어요`;submit='주문 기록';
    body=field('주문한 수량','quantity','number',1,'required min="1" max="9999" step="1"')+'<p class="form-help">주문 기록만 추가합니다. 실제 가방 수량과 부족량은 바뀌지 않습니다.</p>';
  }else if(mode==='put'){
    title=`${item.name} · 실제로 넣었어요`;submit='가방 보충 반영';
    body='<p class="form-help">실제로 넣은 수량만 기록하세요. 표시기한 종류·날짜·점검일이 모두 같으면 기존 묶음에 합산하고, 다르면 새 묶음으로 관리합니다. 이전 묶음의 날짜는 바뀌지 않습니다.</p>'+batchFields(newBatch(1),item.batches.length)+'<label class="confirm-check"><input name="separate" type="checkbox"> 같은 날짜여도 따로 관리할 묶음입니다</label>';
  }else if(mode==='delete-batch'){
    const index=item.batches.findIndex(batch=>batch.id===activeBatchId);
    if(index<0)throw new Error('삭제할 묶음 기록을 찾지 못했습니다.');
    const batch=item.batches[index];
    title=`${item.name} · 묶음 ${index+1} 삭제`;submit='확인하고 묶음 삭제';
    body=`<p><strong>묶음 ${index+1}</strong> · ${batch.quantity}${esc(item.unit)} · ${batch.markedUntil?esc(DATE_TYPES[batch.dateType])+' '+batch.markedUntil:'표시기한 없음'}${batch.nextInspection?' · 점검 '+batch.nextInspection:''}</p><p>이 묶음의 수량·날짜 기록만 삭제합니다. 다른 묶음과 물품의 목표 수량은 유지됩니다. 실제 물품을 버리라는 뜻은 아닙니다. 삭제 전 기록은 '이전 저장 복원'으로 되돌릴 수 있습니다.</p><label class="confirm-check"><input name="confirm" type="checkbox" required>이 묶음 기록만 삭제하겠습니다.</label>`;
  }else if(mode==='delete'){
    title=`${item.name} · 기록 삭제`;submit='확인하고 삭제';
    body=`<p>이 물품과 묶음 ${item.batches.length}개의 기록을 삭제합니다. 실물을 버리라는 뜻은 아닙니다. 삭제 직전 기록은 이전 저장 복원으로 되돌릴 수 있습니다.</p><label class="confirm-check"><input name="confirm" type="checkbox" required>이 물품의 기록을 삭제하겠습니다.</label>`;
  }else if(mode==='restore'||mode==='undo'){
    title=mode==='restore'?'JSON 백업 복원':'이전 저장 복원';submit='확인하고 전체 교체';
    body=`<p>현재 <strong>${base.bag.items.length}종</strong> → 복원할 가방 <strong>${bag.items.length}종</strong></p><p>가방 이름: <strong>${esc(bag.bagName)}</strong></p><p>현재 기록에 합치지 않고 전체 교체합니다. 적용 직전 기록 1개는 이 브라우저에 남깁니다. 중요한 기록은 먼저 JSON 파일로 백업하세요.</p><label class="confirm-check"><input name="confirm" type="checkbox" required>현재 가방을 위 기록으로 교체하겠습니다.</label>`;
  }else if(mode==='settings'){
    title='가방 설정';
    body=`<div class="form-grid">${field('가방 이름','bagName','text',base.bag.bagName,'required maxlength="60"')}${field('표시기한 며칠 전부터 관리할까요?','rotationLeadDays','number',base.bag.rotationLeadDays,'required min="0" max="365" step="1"')}</div><p class="form-help">여유일은 사용자가 정하는 관리 시점입니다. 식품 안전기준이나 섭취 가능 기간이 아닙니다.</p>`;
  }else return;
  $('editor-title').textContent=title;$('editor-body').innerHTML=body;$('submit').textContent=submit;
  $('editor').showModal();
}
function candidate(){
  const form=$('editor-form'), value=name=>form.elements.namedItem(name).value;
  if(mode==='add'||mode==='edit')return upsertItem(editBase.bag,{id:itemId,name:value('name').trim(),category:value('category'),target:Number(value('target')),unit:value('unit').trim(),orderedQuantity:Number(value('orderedQuantity')),batches:readBatches()});
  if(mode==='take')return stockChange(editBase.bag,itemId,'take',{quantity:Number(value('quantity')),batchId:value('batchId')});
  if(mode==='order')return stockChange(editBase.bag,itemId,'order',{quantity:Number(value('quantity'))});
  if(mode==='put')return stockChange(editBase.bag,itemId,'put',{batch:readBatches()[0],separate:form.elements.namedItem('separate').checked});
  if(mode==='delete-batch')return removeBatch(editBase.bag,itemId,activeBatchId);
  if(mode==='delete')return removeItem(editBase.bag,itemId);
  if(mode==='restore'||mode==='undo')return validateBag(replacement);
  if(mode==='settings')return validateBag({...editBase.bag,bagName:value('bagName').trim(),rotationLeadDays:Number(value('rotationLeadDays'))});
  throw new Error('저장할 작업이 없습니다.');
}
$('editor-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!$('editor-form').reportValidity())return;
  busy=true;readiness();$('editor-error').hidden=true;message('기기에 저장 중입니다. 창을 닫지 마세요.');
  try{
    const next=candidate();record=await saveBag(next,editBase.revision);
    const copy=mode==='add'?'내 생존가방 관리가 시작됐어요.':mode==='order'?'주문을 기록했어요. 실제 가방 수량은 그대로입니다.':'변경 내용을 기록했어요.';
    $('editor').close();filter='all';showScreen('inventory');draw();message(record.revision===editBase.revision?'변경 사항이 없어 기존 기록을 유지했습니다.':copy+' 이 브라우저에 저장됨 · 버전 '+record.revision);
  }catch(error){$('editor-error').hidden=false;$('editor-error').textContent=error.message;message('저장하지 못했습니다. 기존 기록을 유지했습니다. '+error.message,true);}
  finally{busy=false;readiness();document.querySelectorAll('[data-empty]').forEach(el=>{el.disabled=true;});}
});
$('cancel').addEventListener('click',()=>{if(!busy)$('editor').close();});
$('editor').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
function download(content,name){
  const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function refresh(){
  if(busy)return;
  record=null;readiness();message('저장된 가방을 읽는 중입니다.');
  try{record=await readBag();$('load-error').hidden=true;draw();message(record.revision?'이 브라우저에 저장됨 · 버전 '+record.revision:'빈 가방입니다. 실제 물품을 직접 등록하면 이 브라우저에 저장합니다.');}
  catch(error){$('load-error').hidden=false;['item-count','needs-count','soon-count'].forEach(id=>{$(id).textContent='—';});message('기록을 읽지 못했습니다. '+error.message,true);}
  readiness();document.querySelectorAll('[data-empty]').forEach(el=>{el.disabled=true;});
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled||busy)return;
  try{
    if(button.dataset.nav){showScreen(button.dataset.nav);return;}
    if(button.id==='reload'||button.dataset.command==='refresh'){await refresh();return;}
    if(button.id==='raw-export'){
      const raw=await readRawRecord();if(raw===undefined)throw new Error('내보낼 저장 원본이 없습니다.');
      download(JSON.stringify(raw,null,2),'bag-side-01-storage-original.json');message('저장 원본의 다운로드를 요청했습니다. 일반 백업 형식이 아니며 복구 검토용입니다.');return;
    }
    if(!record)return;
    if(button.dataset.command==='catalog'){showScreen('inventory');$('catalog-panel').open=true;$('catalog-panel').scrollIntoView({block:'start'});return;}
    if(button.dataset.guideGroup){catalogGroup=button.dataset.guideGroup;draw();return;}
    if(button.id==='family-less'||button.id==='family-more'){familyCount=Math.max(1,Math.min(8,familyCount+(button.id==='family-more'?1:-1)));draw();return;}
    if(button.dataset.guideAdd){
      const entry=CATALOG.find(x=>x.id===button.dataset.guideAdd);
      if(!entry)throw new Error('추천 항목을 찾지 못했습니다.');
      const status=entryStatus(entry,record.bag);
      if(status.registered)throw new Error('이미 등록한 이름입니다. 기존 기록에서 수량을 수정하세요.');
      openEditor('add',null,null,record,seedFor(entry,familyCount));return;
    }
    if(button.dataset.guideFocus){
      filter='all';showScreen('inventory');draw();
      const target=$('item-'+button.dataset.guideFocus);target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});return;
    }
    if(button.dataset.filter){filter=button.dataset.filter;showScreen('inventory');draw();return;}
    if(button.dataset.focus){filter='all';showScreen('inventory');draw();const target=$('item-'+button.dataset.focus);target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});return;}
    if(button.dataset.mode){openEditor(button.dataset.mode,button.dataset.item,null,record,null,button.dataset.batchId??null);return;}
    if(button.dataset.command==='add'){openEditor('add');return;}
    if(button.dataset.command==='settings'){openEditor('settings');return;}
    if(button.dataset.command==='backup'){showScreen('inventory');$('backup-panel').open=true;$('backup-panel').scrollIntoView({block:'start'});return;}
    if(button.dataset.command==='add-batch'){
      const count=$('batch-fields').children.length;if(count>=100)throw new Error('묶음은 물품당 최대 100개입니다.');
      $('batch-fields').insertAdjacentHTML('beforeend',batchFields(newBatch(),count,true));return;
    }
    if(button.dataset.command==='remove-draft'){button.closest('[data-batch]').remove();return;}
    if(button.id==='export'){
      const latest=await readBag();download(backupText(latest.bag),`bag-side-01-${localToday()}.json`);record=latest;draw();message('JSON 백업 다운로드를 요청했습니다. 다운로드 폴더에 파일이 저장됐는지 확인하세요.');return;
    }
    if(button.id==='undo'){
      const base=record,previous=await readPreviousBag();if(!previous)throw new Error('되돌릴 이전 저장 기록이 없습니다.');openEditor('undo',null,previous.bag,base);
    }
  }catch(error){if($('editor').open){$('editor-error').textContent=error.message;$('editor-error').hidden=false;}else message(error.message,true);}
});
$('import').addEventListener('change',async event=>{
  const file=event.target.files?.[0],base=record;event.target.value='';if(!file||busy||!base)return;
  try{if(file.size>MAX_BACKUP_BYTES)throw new Error('백업 파일은 1MB 이하여야 합니다.');const bag=parseBackup(await file.text());openEditor('restore',null,bag,base);}
  catch(error){message('복원하지 않았습니다. '+error.message,true);}
});
document.querySelector('.bag-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...document.querySelectorAll('[data-nav]')],index=tabs.findIndex(x=>x.dataset.nav===screen);
  const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:-1)+3)%3;
  event.preventDefault();showScreen(tabs[next].dataset.nav);tabs[next].focus();
});
refresh();
