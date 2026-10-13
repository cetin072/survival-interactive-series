// Public-link sharing follows knowledge/share.js; never read inventory or backup.
export const BAG_PUBLIC_SHARE=Object.freeze({
  title:'나의 생존가방 | 생존일기',
  text:'준비는 한 번, 관리는 계속. 필요한 물품을 고르고 수량과 점검일을 관리하는 나만의 생존가방.',
  url:'https://survival-diary-archive.netlify.app/bag/',
});

function initializeInstallShare(){
  const panel=document.querySelector('[data-bag-install-share]');
  if(!panel)return;
  const status=panel.querySelector('[data-bag-share-status]');
  const input=panel.querySelector('[data-bag-share-url]');
  const share=panel.querySelector('[data-bag-share]');
  const copy=panel.querySelector('[data-bag-copy]');
  const native=Boolean(globalThis.Capacitor?.isNativePlatform?.());
  input.value=BAG_PUBLIC_SHARE.url;
  const manual=()=>{
    input.focus();input.select();
    status.textContent='소개 링크를 선택했어요. 직접 복사해서 친구에게 보내세요.';
  };
  share.addEventListener('click',async()=>{
    // The existing Android shell has no Native Share plugin. Copy the public
    // URL instead of navigating the WebView or pretending an OS share worked.
    if(native||typeof navigator.share!=='function'){
      status.textContent='공유 메뉴 대신 링크 복사를 이용해 주세요. 카카오톡이나 문자로 보낼 수 있어요.';return;
    }
    share.disabled=true;
    try{
      await navigator.share({...BAG_PUBLIC_SHARE});
      status.textContent='선택한 앱에서 링크 전송 여부를 확인해 주세요.';
    }catch(error){
      status.textContent=error?.name==='AbortError'?'공유를 취소했어요.':'공유 창을 열지 못했어요. 링크 복사를 이용해 주세요.';
    }finally{share.disabled=false;}
  });
  copy.addEventListener('click',async()=>{
    copy.disabled=true;
    try{
      if(typeof navigator.clipboard?.writeText!=='function')throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(BAG_PUBLIC_SHARE.url);
      status.textContent='링크를 복사했어요. 카카오톡이나 문자에 붙여 넣어 보내세요.';
    }catch{manual();}finally{copy.disabled=false;}
  });

  // Merely importing this module on /bag/ does not register a worker or retain
  // an install prompt. Only the existing app, in its own scope, can do so.
  const install=panel.querySelector('[data-bag-install]');
  const installStatus=panel.querySelector('[data-bag-install-status]');
  if(!install)return;
  if(native){installStatus.textContent='Android 앱으로 실행 중입니다. 소개 페이지는 링크 복사로 공유하세요.';return;}
  let pending=null;
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
  if(standalone())installStatus.textContent='홈 화면 앱 모드로 실행 중입니다.';
  window.addEventListener('beforeinstallprompt',event=>{
    if(standalone())return;
    event.preventDefault();pending=event;install.hidden=false;
    installStatus.textContent='홈 화면에 생존가방을 추가할 수 있어요.';
  });
  install.addEventListener('click',async()=>{
    if(!pending)return;
    const prompt=pending;pending=null;install.hidden=true;
    try{
      const result=await prompt.prompt();
      const choice=result||await prompt.userChoice;
      installStatus.textContent=choice?.outcome==='accepted'?'설치 안내를 진행했어요. 홈 화면에 아이콘이 생겼는지 확인해 주세요.':'설치를 취소했어요. 필요할 때 브라우저 메뉴로 설치할 수 있어요.';
    }catch{installStatus.textContent='설치 창을 열지 못했어요. 브라우저 메뉴에서 홈 화면에 추가해 주세요.';}
  });
  window.addEventListener('appinstalled',()=>{
    pending=null;install.hidden=true;installStatus.textContent='생존가방이 홈 화면에 추가됐어요.';
  });
}

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
  if(!registration.waiting)status.textContent=registration.active?'오프라인 사용 준비됨':'오프라인 사용 준비 중';
  return registration;
}

if(typeof document!=='undefined')initializeInstallShare();
