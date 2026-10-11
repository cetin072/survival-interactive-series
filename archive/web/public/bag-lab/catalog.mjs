// BAG-SIDE-01 Korean first-bag starter catalog. Guidance only, never owned inventory.
// Independently authored short labels and tips. Compare official Korean disaster advice;
// do not copy foreign recommendations or imply these example quantities guarantee 72 hours.
export const GROUPS = Object.freeze([
  {id:'documents',label:'서류·연락',help:'연락이 끊겨도 신원을 확인하고 가족과 다시 만날 준비'},
  {id:'clothing',label:'의류·보온',help:'계절과 이동 여건에 맞춰 가볍게 챙길 물품'},
  {id:'medical',label:'응급·건강',help:'사용법을 아는 기본 용품과 개인 필요품'},
  {id:'tools',label:'안전·도구',help:'소통·이동·소규모 수리에 필요한 도구'},
  {id:'food',label:'물·식품',help:'실제 보관 방법과 무게·기한을 함께 확인할 물품'},
  {id:'hygiene',label:'위생',help:'오염과 감염 위험을 낮추는 개인 생활 물품'},
  {id:'sleep',label:'휴식·수면',help:'계절별 체온 유지와 휴식에 필요한 물품'},
  {id:'power',label:'전원·통신',help:'정전과 통신 두절을 대비하는 기기 및 전원'}
]);
const rows=[
  // group, name, stored category, unit, example target, scope, basic, original guidance
  ['documents','방수 서류 파우치','documents','개',1,'shared',true,'서류는 젖지 않게 넣고 신상정보를 앱에는 적지 마세요.'],
  ['documents','신분증 사본','documents','부',1,'person',true,'실제 휴대 여부와 재발급 경로를 확인하세요.'],
  ['documents','가족 비상연락처 메모','documents','장',1,'shared',true,'휴대전화가 꺼져도 확인할 수 있는 종이 연락망.'],
  ['documents','소액권 현금','other','묶음',1,'shared',true,'결제망이 멈췄을 때를 대비하고 금액은 앱에 적지 마세요.'],
  ['documents','중요 서류 사본','documents','묶음',1,'shared',false,'보험·진료 관련 서류는 민감정보 유출에 주의하세요.'],
  ['documents','여분 열쇠','other','세트',1,'shared',false,'휴대 필요성을 따져 분실·도난에 주의하세요.'],
  ['clothing','우의','equipment','벌',1,'person',true,'계절과 체형에 맞는 방수 의류.'],
  ['clothing','여벌 속옷','other','벌',1,'person',true,'개인 여건에 맞게 충분한 양을 직접 정하세요.'],
  ['clothing','여벌 양말','other','켤레',1,'person',true,'젖은 양말을 갈아 신을 수 있도록 준비하세요.'],
  ['clothing','계절용 보온 의류','other','벌',1,'person',true,'기온이 바뀌면 실제 옷을 교체해야 합니다.'],
  ['clothing','모자·장갑','other','세트',1,'person',false,'폭염·한파 등 계절에 맞추어 선택하세요.'],
  ['clothing','편한 여벌 신발','other','켤레',1,'person',false,'이동에 익숙한 신발인지 확인하세요.'],
  ['medical','구급함','medicine','개',1,'shared',true,'사용법을 익힌 응급처치 용품을 점검하세요.'],
  ['medical','개인 상비약','medicine','묶음',1,'person',true,'표시기한·보관 조건을 확인하세요. 복용 지시가 아닙니다.'],
  ['medical','밴드·거즈','medicine','세트',1,'shared',true,'포장 손상과 오염 여부를 확인하세요.'],
  ['medical','마스크','hygiene','개',1,'person',true,'용도에 맞는 제품과 착용 상태를 확인하세요.'],
  ['medical','의료 보조기기 예비품','equipment','개',1,'person',false,'필요한 사람만 준비하고 기기별 점검방법을 따르세요.'],
  ['medical','처방약 예비품','medicine','묶음',1,'person',false,'개인별 약사·의사 지침에 따르고 약품명·용량을 앱에 적을 필요는 없습니다.'],
  ['tools','호루라기','equipment','개',1,'person',true,'큰 소리를 내기 어려울 때 신호를 보내는 용도.'],
  ['tools','종이 지도','documents','부',1,'shared',true,'휴대전화 없이도 대피 경로를 확인할 수 있도록.'],
  ['tools','다목적 도구','equipment','개',1,'shared',true,'평소 사용법을 알고 법률·장소별 휴대 제한을 지키세요.'],
  ['tools','방수 비닐봉투','hygiene','묶음',1,'shared',true,'젖지 않게 보관하거나 쓰레기를 분리하는 용도.'],
  ['tools','작은 수리 테이프','equipment','개',1,'shared',false,'파손된 물품의 간단한 임시 수리에 사용.'],
  ['tools','고무장갑','hygiene','켤레',1,'person',false,'오염물 접촉 시 쓰임새와 한계를 확인하세요.'],
  ['food','생수','water','L',1,'person',true,'1L는 입력 예시일 뿐 필요한 식수량이 아닙니다. 휴대 중량·계절·보급 조건에 맞춰 목표를 직접 정하세요.'],
  ['food','간편식','food','개',3,'person',true,'3개는 등록 예시이며 3일분을 뜻하지 않습니다. 실제 섭취량·조리 필요 여부를 확인하세요.'],
  ['food','고열량 간식','food','봉',1,'person',true,'알레르기·표시기한·보관온도를 확인하세요.'],
  ['food','통조림','food','캔',1,'person',false,'내용물과 개봉 방법, 무게를 함께 고려하세요.'],
  ['food','식수 정화 도구','equipment','개',1,'shared',false,'제품 사용범위와 필터 수명을 확인하세요.'],
  ['food','수동 캔따개','equipment','개',1,'shared',false,'캔을 선택했다면 전원이 없어도 열 수 있도록.'],
  ['food','휴대용 식기','equipment','세트',1,'person',false,'세척 가능성과 위생을 함께 고려하세요.'],
  ['hygiene','화장지','hygiene','롤',1,'shared',true,'물에 젖지 않도록 소분·보관하세요.'],
  ['hygiene','물티슈','hygiene','팩',1,'shared',true,'개봉 여부와 건조·표시기한을 확인하세요.'],
  ['hygiene','손소독제','hygiene','개',1,'shared',true,'사용법·유효기한·화기 주변 보관을 확인하세요.'],
  ['hygiene','칫솔·치약','hygiene','세트',1,'person',false,'개인 위생을 유지할 소형 제품.'],
  ['hygiene','수건','hygiene','장',1,'person',false,'잘 마르고 소형인 제품이 휴대에 유리합니다.'],
  ['hygiene','개인 위생용품','hygiene','묶음',1,'person',false,'생리·피부 관리 등 개인 필요에 맞춰 선택하세요.'],
  ['hygiene','아기용 위생용품','hygiene','묶음',1,'person',false,'기저귀·수유 관련 필요품은 보호자가 직접 정하세요.'],
  ['sleep','담요','equipment','개',1,'person',true,'보온 상태와 젖었을 때의 한계를 확인하세요.'],
  ['sleep','단열 매트','equipment','개',1,'person',false,'바닥의 한기를 줄이기 위한 용도.'],
  ['sleep','침낭','equipment','개',1,'person',false,'사용 계절과 체온 유지 성능을 확인하세요.'],
  ['sleep','작은 방수포','equipment','개',1,'shared',false,'비바람·습기 차단 등 실제 용도를 고려하세요.'],
  ['power','손전등','equipment','개',1,'person',true,'작동 여부, 광원과 전지 상태를 주기적으로 점검하세요.'],
  ['power','휴대용 라디오','equipment','개',1,'shared',true,'인터넷 없이 공식 재난 안내를 듣기 위한 수단.'],
  ['power','보조배터리','equipment','개',1,'shared',true,'충전 상태와 발열·팽창 여부를 점검하세요.'],
  ['power','충전 케이블','equipment','개',1,'shared',true,'보유 기기의 단자와 일치하는지 확인하세요.'],
  ['power','예비 건전지','equipment','세트',1,'shared',true,'기기 규격과 누액·사용기한을 점검하세요.'],
  ['power','충전 어댑터','equipment','개',1,'shared',false,'콘센트를 사용할 수 있을 때를 대비한 보조품.'],
  ['power','휴대용 태양광 패널','equipment','개',1,'shared',false,'무게·날씨·충전 효율을 확인한 뒤 선택하세요.']
];
export const CATALOG=Object.freeze(rows.map(([group,name,category,unit,exampleTarget,scope,basic,note],i)=>
  Object.freeze({id:'guide-'+String(i+1).padStart(2,'0'),group,name,category,unit,exampleTarget,scope,basic,note})));
export function targetFor(entry,people=1){
  if(!Number.isSafeInteger(people)||people<1||people>8)throw new RangeError('참고 인원은 1~8명입니다.');
  return entry.exampleTarget*(entry.scope==='person'?people:1);
}
export function seedFor(entry,people=1){
  return {name:entry.name,category:entry.category,unit:entry.unit,target:targetFor(entry,people)};
}
export function findOwned(entry,bag){
  return bag.items.find(item=>item.name.normalize('NFC').toLowerCase()===entry.name.normalize('NFC').toLowerCase())??null;
}
export function entryStatus(entry,bag){
  const item=findOwned(entry,bag);
  const quantity=item?.batches.reduce((total,batch)=>total+batch.quantity,0)??0;
  return {item,quantity,registered:!!item,meetsOwnTarget:!!item&&quantity>=item.target};
}
export function catalogProgress(bag){
  const basic=CATALOG.filter(entry=>entry.basic);
  return {total:basic.length,registered:basic.filter(entry=>entryStatus(entry,bag).registered).length,
    ready:basic.filter(entry=>entryStatus(entry,bag).meetsOwnTarget).length};
}
