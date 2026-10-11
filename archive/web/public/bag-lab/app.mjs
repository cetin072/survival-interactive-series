import { createDemo, changeDemo, currentQuantity, shortage, summary } from "./logic.mjs";
let state = createDemo();
let filter = "all";
const $ = id => document.getElementById(id);
function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function draw() {
  const totals=summary(state);
  $("item-count").textContent=String(totals.items);
  $("needs-count").textContent=String(totals.shortages);
  $("filter-count").textContent=String(totals.shortages);
  $("needs-copy").textContent=totals.shortages ? "가방에 " + totals.shortageUnits + "개를 보충해야 합니다" : "부족 수량은 현재 없습니다";
  const items=state.items.filter(item=>filter!=="short" || shortage(item)>0);
  $("item-list").innerHTML=items.length ? items.map(item=>{
    const qty=currentQuantity(item);
    const gap=shortage(item);
    const dates=item.batches.filter(b=>b.markedUntil).map(b=>b.markedUntil.slice(2).replace(/-/g,".")).join(" · ");
    const detail=dates ? "표시기한 " + dates : "작동 점검 일정 " + (item.nextInspection||"미등록");
    return '<article class="item"><span class="item-icon" aria-hidden="true">'+esc(item.icon)+'</span>'+
      '<div class="item-main"><h3 class="item-name">'+esc(item.name)+'</h3><div class="item-sub">'+esc(detail)+'</div></div>'+
      '<div class="item-number"><strong>'+qty+'<span> / '+item.target+esc(item.unit)+'</span></strong></div>'+
      '<span class="item-tag'+(gap?' short':'')+'">'+(gap?'보충 '+gap+esc(item.unit):'수량 기록됨')+'</span></article>';
  }).join("") : '<div class="items-empty">지금 부족하다고 기록된 물품은 없습니다.</div>';
  const food=state.items.find(item=>item.id==="food");
  const gap=shortage(food);
  $("flow-qty").textContent=currentQuantity(food)+" / "+food.target+"개";
  $("flow-label").textContent=gap ? "간편식 "+gap+"개 보충 필요" : state.steps.replenished?"새 물품까지 기록했어요":"가방에 6개가 들어 있어요";
  $("demo-message").textContent=state.lastAction;
  document.querySelector('[data-action="remove-two"]').disabled=state.steps.removed;
  document.querySelector('[data-action="ordered-two"]').disabled=!state.steps.removed||state.steps.ordered||state.steps.replenished;
  document.querySelector('[data-action="put-two"]').disabled=!state.steps.removed||state.steps.replenished;
  $("snooze-button").disabled=state.steps.snoozed;
  document.querySelectorAll("[data-filter]").forEach(btn=>{
    const on=btn.dataset.filter===filter;
    btn.classList.toggle("selected",on);
    btn.setAttribute("aria-pressed",String(on));
  });
}
document.addEventListener("click",event=>{
  const target=event.target.closest("button");
  if(!target) return;
  if(target.dataset.filter){
    filter=target.dataset.filter;
    draw();
    return;
  }
  const action=target.dataset.action || (target.id==="reset-top" ? "reset" : null);
  if(!action) return;
  const next=changeDemo(state,action);
  if(next!==state){
    state=next;
    if(action==="reset") filter="all";
    draw();
  }
});
draw();
