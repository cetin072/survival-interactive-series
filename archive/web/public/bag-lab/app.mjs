import {createDemo,changeDemo,currentQuantity,shortage,dashboardSummary,prioritizedItems,nextAction,dayDifference,localToday} from "./logic.mjs";
let state=createDemo(),filter="all",focusItem=null,screen="bag";
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const displayDate=raw=>raw ? raw.slice(2).replaceAll("-",".") : "미등록";
function showScreen(next,{focusTab=false}={}){
  if(!["bag","inventory","learn"].includes(next))return;
  screen=next;
  document.querySelectorAll("[data-screen]").forEach(panel=>{panel.hidden=panel.dataset.screen!==next;});
  document.querySelectorAll("[data-nav]").forEach(button=>{
    const active=button.dataset.nav===next;
    button.classList.toggle("active",active);
    button.setAttribute("aria-selected",String(active));
    button.tabIndex=active?0:-1;
  });
  if(focusTab)document.querySelector('[data-nav="'+next+'"]').focus({preventScroll:true});
  window.scrollTo({top:0,behavior:"instant"});
}
document.querySelector(".bag-tabs").addEventListener("keydown",event=>{
  if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
  const tabs=[...document.querySelectorAll("[data-nav]")];
  const index=tabs.findIndex(x=>x.dataset.nav===screen);
  const nextIndex=event.key==="Home"?0:event.key==="End"?tabs.length-1:
    (index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
  event.preventDefault();
  showScreen(tabs[nextIndex].dataset.nav,{focusTab:true});
});
function scheduleFor(item,today){
  const action=nextAction(item,state.rotationLeadDays);
  if(!action)return {action:null,title:"확인 일정 미등록",chip:"일정 없음",css:"",info:"표시기한 또는 점검일을 확인하세요."};
  const days=dayDifference(action.due,today);
  const printedDays=action.markedUntil ? dayDifference(action.markedUntil,today):null;
  const printedExpired=printedDays!==null && printedDays<0;
  const title=action.kind==="inspection" ? "장비 점검" : "순환·교체 검토";
  const chip=printedExpired ? "표시기한 경과" : days<0 ? "관리일 경과" : days===0 ? "오늘" : "D-"+days;
  const css=(printedExpired||days<0)?"overdue":days<=30?"warn":"";
  const info=action.kind==="inspection"
    ? "점검 "+displayDate(action.due)
    : "관리 "+displayDate(action.due)+" · 표시기한 "+displayDate(action.markedUntil);
  return {action,title,chip,css,info};
}
function draw(){
  const today=localToday(),totals=dashboardSummary(state,today);
  $("item-count").textContent=String(totals.items);
  $("needs-count").textContent=String(totals.shortages);
  $("soon-count").textContent=String(totals.soonCount);
  $("all-count").textContent=String(totals.items);
  $("soon-filter-count").textContent=String(totals.soonCount);
  $("filter-count").textContent=String(totals.shortages);
  $("needs-copy").textContent=totals.shortages ? "실제로 "+totals.shortageUnits+"개 보충 필요":"부족 수량은 현재 없습니다";
  const first=totals.next;
  if(first){
    const d=dayDifference(first.task.due,today);
    const when=d<0?"관리일 경과":d===0?"오늘":("D-"+d);
    $("next-check").textContent="가장 가까운 일정 · "+first.item.name+" "+displayDate(first.task.due)+" · "+when;
  }else $("next-check").textContent="기록된 관리 일정이 아직 없어요";
  const ordered=prioritizedItems(state);
  const featured=ordered.slice(0,4);
  $("upcoming-list").innerHTML=featured.map((item,i)=>{
    const schedule=scheduleFor(item,today),gap=shortage(item);
    const chip=gap?("보충 "+gap+item.unit):schedule.chip;
    const css=gap?"short":schedule.css;
    const notes=(gap?"부족 "+gap+item.unit+" · ":"")+schedule.title+" · "+schedule.info;
    return '<button type="button" class="upcoming-row" data-focus="'+esc(item.id)+'">'+
      '<span class="upcoming-index">'+String(i+1).padStart(2,"0")+'</span>'+
      '<span class="upcoming-copy"><strong>'+esc(item.name)+'</strong><small>'+esc(notes)+'</small></span>'+
      '<span class="upcoming-chip '+esc(css)+'">'+esc(chip)+'</span><span class="upcoming-arrow" aria-hidden="true">→</span></button>';
  }).join("");
  const chosen=ordered.filter(item=>{
    if(filter==="short")return shortage(item)>0;
    if(filter==="soon"){const action=nextAction(item,state.rotationLeadDays);return !!action&&dayDifference(action.due,today)<=30;}
    return true;
  });
  $("item-list").innerHTML=chosen.length?chosen.map(item=>{
    const schedule=scheduleFor(item,today),gap=shortage(item),quantity=currentQuantity(item);
    const batches=item.batches.filter(b=>b.quantity>0&&b.markedUntil).map(b=>displayDate(b.markedUntil));
    const note=batches.length>1?" · 묶음별 표시 "+batches.join(" / "):"";
    const chip=gap?"보충 "+gap+item.unit:schedule.chip;
    const css=gap?"short":schedule.css;
    return '<article class="item'+(focusItem===item.id?' item-focus':'')+'" tabindex="-1" id="item-'+esc(item.id)+'">'+
      '<span class="item-icon" aria-hidden="true">'+esc(item.icon)+'</span>'+
      '<div class="item-main"><h3 class="item-name">'+esc(item.name)+'</h3><div class="item-sub">'+esc(schedule.info+note)+'</div></div>'+
      '<div class="item-number"><strong>'+quantity+'<span> / '+item.target+esc(item.unit)+'</span></strong></div>'+
      '<span class="item-tag '+esc(css)+'">'+esc(chip)+'</span></article>';
  }).join(""):'<div class="items-empty">해당하는 물품이 아직 없습니다.</div>';
  document.querySelectorAll(".filters [data-filter]").forEach(btn=>{
    const active=btn.dataset.filter===filter;
    btn.classList.toggle("selected",active);btn.setAttribute("aria-pressed",String(active));
  });
  const food=state.items.find(item=>item.id==="food"),gap=shortage(food);
  $("flow-qty").textContent=currentQuantity(food)+" / "+food.target+"개";
  $("flow-label").textContent=gap?"간편식 "+gap+"개 보충 필요":state.steps.replenished?"새 물품까지 기록했어요":"가방에 간편식 6개가 들어 있어요";
  $("demo-message").textContent=state.lastAction;
  document.querySelector('[data-action="remove-two"]').disabled=state.steps.removed;
  document.querySelector('[data-action="ordered-two"]').disabled=!state.steps.removed||state.steps.ordered||state.steps.replenished;
  document.querySelector('[data-action="put-two"]').disabled=!state.steps.removed||state.steps.replenished;
  $("snooze-button").disabled=state.steps.snoozed;
}
document.addEventListener("click",event=>{
  const btn=event.target.closest("button");
  if(!btn||btn.disabled)return;
  if(btn.dataset.nav){showScreen(btn.dataset.nav);return;}
  if(btn.dataset.focus){
    focusItem=btn.dataset.focus;
    filter="all";
    showScreen("inventory");
    draw();
    const target=$("item-"+focusItem);
    target?.scrollIntoView({behavior:"smooth",block:"center"});
    target?.focus({preventScroll:true});
    return;
  }
  if(btn.dataset.filter){
    focusItem=null;filter=btn.dataset.filter;
    showScreen("inventory");
    draw();
    if(btn.dataset.jump==="inventory")$("inventory").scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  const action=btn.dataset.action||(btn.id==="reset-top"?"reset":null);
  if(action){
    const next=changeDemo(state,action);
    if(next!==state){state=next;focusItem=null;if(action==="reset")filter="all";draw();}
  }
});
draw();
