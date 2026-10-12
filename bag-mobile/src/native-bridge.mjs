import {Capacitor,registerPlugin} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import {createAndroidNotificationDriver} from './native-adapter.mjs';
if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'){
  const settings=registerPlugin('BagReminderSettings');
  globalThis.BagAndroidFileExport=(content,name)=>settings.exportJson({content,name});
  globalThis.BagAndroidNotificationDriver=createAndroidNotificationDriver({notifications:LocalNotifications,settings});
}
