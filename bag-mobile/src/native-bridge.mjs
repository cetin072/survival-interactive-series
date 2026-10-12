import {Capacitor,registerPlugin} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import {createAndroidNotificationDriver} from './native-adapter.mjs';
if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'){
  const settings=registerPlugin('BagReminderSettings');
  document.addEventListener('click',event=>{
    const anchor=event.target.closest('a');if(!anchor)return;
    const url=new URL(anchor.href,location.href);
    if(url.origin===location.origin&&url.pathname.startsWith('/knowledge/')){
      event.preventDefault();settings.openKnowledge({path:url.pathname+url.search+url.hash}).catch(error=>alert(error.message));
    }
  });
  globalThis.BagAndroidFileExport=(content,name)=>settings.exportJson({content,name});
  globalThis.BagAndroidNotificationDriver=createAndroidNotificationDriver({notifications:LocalNotifications,settings});
}
