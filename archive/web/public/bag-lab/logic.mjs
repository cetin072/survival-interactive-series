// BAG-SIDE-01: sample-only model and deterministic urgency helpers. No personal data or remote calls.
const BASE={
  sampleOnly:true,bagName:"나의 생존가방",rotationLeadDays:90,
  items:[
    {id:"food",name:"간편식",icon:"🥣",target:6,unit:"개",
      batches:[{id:"food-A",quantity:4,markedUntil:"2027-04-30"},{id:"food-B",quantity:2,markedUntil:"2027-12-31"}]},
    {id:"water",name:"생수",icon:"💧",target:2,unit:"병",
      batches:[{id:"water-A",quantity:2,markedUntil:"2027-05-31"}]},
    {id:"light",name:"손전등",icon:"🔦",target:1,unit:"개",nextInspection:"2026-11-01",
      batches:[{id:"light-A",quantity:1}]},
    {id:"power",name:"보조배터리",icon:"🔋",target:1,unit:"개",nextInspection:"2026-11-15",
      batches:[{id:"power-A",quantity:1}]},
    {id:"wipes",name:"위생티슈",icon:"🧻",target:2,unit:"개",
      batches:[{id:"wipes-A",quantity:2,markedUntil:"2027-07-01"}]}
  ],
  steps:{removed:false,ordered:false,replenished:false,snoozed:false},
  lastAction:"샘플 가방의 품목 5종을 보고 있어요."
};
const DAY=24*60*60*1000;
const isoUTC=s=>Date.parse(s+"T00:00:00Z");
export const createDemo=()=>JSON.parse(JSON.stringify(BASE));
export const currentQuantity=item=>item.batches.reduce((sum,b)=>sum+b.quantity,0);
export const shortage=item=>Math.max(0,item.target-currentQuantity(item));
export function dayDifference(dateIso,todayIso){return Math.round((isoUTC(dateIso)-isoUTC(todayIso))/DAY);}
export function minusDays(dateIso,days){return new Date(isoUTC(dateIso)-days*DAY).toISOString().slice(0,10);}
export function localToday(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
export function nextAction(item,leadDays=90){
  const tasks=[];
  if(item.nextInspection){
    tasks.push({kind:"inspection",due:item.nextInspection,description:"작동·충전 점검",markedUntil:null});
  }
  for(const batch of item.batches){
    if(batch.quantity>0 && batch.markedUntil){
      tasks.push({kind:"rotation",due:minusDays(batch.markedUntil,leadDays),description:"교체·순환 검토",markedUntil:batch.markedUntil,batch:batch.id});
    }
  }
  tasks.sort((a,b)=>a.due.localeCompare(b.due)||a.kind.localeCompare(b.kind));
  return tasks[0]??null;
}
export function prioritizedItems(state){
  return [...state.items].sort((a,b)=>{
    const gapDiff=Number(shortage(b)>0)-Number(shortage(a)>0);
    if(gapDiff)return gapDiff;
    const aNext=nextAction(a,state.rotationLeadDays);
    const bNext=nextAction(b,state.rotationLeadDays);
    return (aNext?.due??"9999-12-31").localeCompare(bNext?.due??"9999-12-31")||a.name.localeCompare(b.name);
  });
}
export function dashboardSummary(state,todayIso=localToday()){
  const tasks=state.items.map(item=>({item,task:nextAction(item,state.rotationLeadDays)}))
    .filter(x=>x.task).sort((a,b)=>a.task.due.localeCompare(b.task.due));
  return {
    items:state.items.length,
    shortages:state.items.filter(item=>shortage(item)>0).length,
    shortageUnits:state.items.reduce((s,item)=>s+shortage(item),0),
    soonCount:tasks.filter(x=>dayDifference(x.task.due,todayIso)<=30).length,
    overdueCount:tasks.filter(x=>dayDifference(x.task.due,todayIso)<0).length,
    next:tasks[0]??null,
    tasks
  };
}
export const summary=state=>({
  items:state.items.length,
  shortages:state.items.filter(item=>shortage(item)>0).length,
  shortageUnits:state.items.reduce((s,item)=>s+shortage(item),0)
});
export function changeDemo(state,action){
  if(action==="reset")return createDemo();
  const next=JSON.parse(JSON.stringify(state));
  const food=next.items.find(item=>item.id==="food");
  if(action==="remove-two"){
    if(next.steps.removed)return state;
    const batch=food.batches.find(x=>x.id==="food-A");
    if(!batch||batch.quantity<2)return state;
    batch.quantity-=2;
    next.steps.removed=true;
    next.lastAction="간편식 2개를 꺼냈어요. 부족한 2개를 실제 가방에 채워야 합니다.";
  }else if(action==="ordered-two"){
    if(!next.steps.removed||next.steps.ordered||next.steps.replenished)return state;
    next.steps.ordered=true;
    next.lastAction="주문은 했지만 아직 가방에 넣지 않았어요. 부족 수량은 그대로입니다.";
  }else if(action==="put-two"){
    if(!next.steps.removed||next.steps.replenished)return state;
    food.batches.push({id:"food-C",quantity:2,markedUntil:"2028-03-31"});
    next.steps.replenished=true;
    next.lastAction="가방에 새 물품 2개를 넣었다고 기록했어요. 부족 표시가 없어졌습니다.";
  }else if(action==="snooze"){
    if(next.steps.snoozed)return state;
    next.steps.snoozed=true;
    next.lastAction="알림 미루기를 가상 시연했어요. 실제 알림 예약이나 표시기한·수량은 바뀌지 않습니다.";
  }else return state;
  return next;
}
