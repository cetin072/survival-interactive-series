// Reused public/notifications.js capability, user-gesture permission and test contract.
// No Web Push account, subscription, timer or closed-app scheduling.
export function webNotificationStatus(){
  const supported=Boolean(globalThis.isSecureContext&&'serviceWorker' in navigator&&'Notification' in globalThis&&globalThis.ServiceWorkerRegistration&&'showNotification' in ServiceWorkerRegistration.prototype);
  return {supported,permission:supported?Notification.permission:'unsupported'};
}
export async function requestWebNotificationPermission(){
  const status=webNotificationStatus();if(!status.supported)return 'unsupported';
  // Ask immediately from the user click, before awaiting SW installation.
  return status.permission==='default'?Notification.requestPermission():status.permission;
}
export async function testWebNotification(){
  if(webNotificationStatus().permission!=='granted')throw new Error('알림 권한이 필요합니다.');
  const registration=await navigator.serviceWorker.getRegistration('/bag-lab/alpha.html');
  if(!registration?.active||registration.scope!==new URL('/bag-lab/',location.origin).href)throw new Error('생존가방 오프라인 앱 준비 후 다시 시도하세요.');
  await registration.showNotification('생존가방 · 테스트 알림',{body:'테스트 요청을 보냈습니다. 기기에서 표시되는지 확인하세요.',icon:'/bag-lab/icons/bag-192.png',tag:'bag-side-test',data:{url:'/bag-lab/alpha.html'}});
}
