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
  const preview=panel.querySelector('[data-bag-share-preview]');
  if(preview)preview.hidden=location.origin==='https://survival-diary-archive.netlify.app'||native;
  const manual=()=>{
    input.focus();input.select();
    status.textContent='소개 페이지 주소를 선택했습니다. 직접 복사해 주세요.';
  };
  share.addEventListener('click',async()=>{
    // The existing Android shell has no Native Share plugin. Copy the public
    // URL instead of navigating the WebView or pretending an OS share worked.
    if(native||typeof navigator.share!=='function'){
      status.textContent='이 환경에서는 링크 복사를 이용해 주세요.';return;
    }
    share.disabled=true;
    try{
      await navigator.share({...BAG_PUBLIC_SHARE});
      status.textContent='공유 요청을 마쳤습니다.';
    }catch(error){
      status.textContent=error?.name==='AbortError'?'공유를 취소했습니다.':'공유하지 못했습니다. 링크 복사를 이용해 주세요.';
    }finally{share.disabled=false;}
  });
  copy.addEventListener('click',async()=>{
    copy.disabled=true;
    try{
      if(typeof navigator.clipboard?.writeText!=='function')throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(BAG_PUBLIC_SHARE.url);
      status.textContent='소개 페이지 링크를 복사했습니다.';
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
    installStatus.textContent='이 브라우저에서 앱 설치를 요청할 수 있습니다.';
  });
  install.addEventListener('click',async()=>{
    if(!pending)return;
    const prompt=pending;pending=null;install.hidden=true;
    try{
      const result=await prompt.prompt();
      const choice=result||await prompt.userChoice;
      installStatus.textContent=choice?.outcome==='accepted'?'설치를 요청했습니다. 홈 화면 아이콘을 확인해 주세요.':'설치를 취소했습니다. 아래 방법으로 나중에 설치할 수 있습니다.';
    }catch{installStatus.textContent='설치 창을 열지 못했습니다. 아래 브라우저 메뉴 안내를 이용해 주세요.';}
  });
  window.addEventListener('appinstalled',()=>{
    pending=null;install.hidden=true;installStatus.textContent='브라우저에서 앱 설치를 확인했습니다.';
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
  if(!registration.waiting)status.textContent=registration.active?'오프라인 앱 준비됨':'오프라인 앱 설치 중';
  return registration;
}

if(typeof document!=='undefined')initializeInstallShare();
