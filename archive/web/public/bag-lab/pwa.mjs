// Worklog registration contract with explicit BAG-only ownership and opt-in update.
export async function registerBagPwa(){
  if(globalThis.Capacitor?.isNativePlatform?.())return {native:true};
  if(!globalThis.isSecureContext||!('serviceWorker' in navigator))return null;
  let wasControlled=Boolean(navigator.serviceWorker.controller);
  const registration=await navigator.serviceWorker.register('/bag-lab/sw.js',{scope:'/bag-lab/',updateViaCache:'none'});
  const button=document.getElementById('pwa-update'),status=document.getElementById('pwa-status');
  const show=()=>{if(wasControlled&&registration.waiting){button.hidden=false;status.textContent='새 버전 준비됨 · 저장한 기록은 유지됩니다.';}};
  show();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',show));
  button?.addEventListener('click',()=>{if(document.querySelector('dialog[open]')){status.textContent='입력 내용을 먼저 저장하거나 취소한 후 새 버전으로 전환하세요.';return;}registration.waiting?.postMessage({type:'BAG_ACTIVATE'});});
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    // Initial installation can transiently expose registration.waiting. It must
    // not trigger a reload while the first screen is still initializing.
    if(!wasControlled){wasControlled=true;button.hidden=true;status.textContent='오프라인 앱 준비됨';return;}
    if(!button.hidden&&!reloading&&!document.querySelector('dialog[open]')){reloading=true;location.reload();}
  });
  window.addEventListener('online',()=>registration.update().catch(()=>{}));
  await registration.update().catch(()=>{});
  if(!registration.waiting)status.textContent=registration.active?'오프라인 앱 준비됨':'오프라인 앱 설치 중';
  return registration;
}
