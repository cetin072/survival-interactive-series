package com.cetin072.survivalbag;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.UserManager;
import android.util.Log;
import com.getcapacitor.CapConfig;
import com.getcapacitor.JSObject;
import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/** Worklog boot replay contract adapted to Capacitor's SAME native store.
 * No second scheduler. Override stock receiver: its +15s past-date replay violates BAG policy.
 */
public class BagReminderRecovery extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        UserManager users = context.getSystemService(UserManager.class);
        if (users == null || !users.isUserUnlocked()) return;
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                NotificationStorage storage = new NotificationStorage(context);
                List<LocalNotification> future = new ArrayList<>();
                for (String key : storage.getSavedNotificationIds()) {
                    LocalNotification old = storage.getSavedNotification(key);
                    if (old == null || old.getSource() == null) continue;
                    JSObject source = new JSObject(old.getSource());
                    JSObject extra = source.getJSObject("extra");
                    if (extra == null || !"bag-side.schedule-reminder.v3".equals(extra.optString("owner"))) continue;
                    // Delivered one-shot reminders must never be resurrected after clock change/reboot.
                    if (old.isTriggered() || old.getCancelled()) continue;
                    long trigger = BagReminderTime.future(extra.getString("due"), extra.getString("localTime"), ZoneId.systemDefault(), System.currentTimeMillis());
                    cancelTimer(context, old.getId());
                    if (trigger < 0) { storage.deleteNotification(key); continue; }
                    source.getJSObject("schedule").put("at", Instant.ofEpochMilli(trigger).toString());
                    extra.put("triggerAt", Instant.ofEpochMilli(trigger).toString());
                    source.put("extra", extra);
                    future.add(LocalNotification.Companion.buildNotificationFromJSObject(source));
                }
                // Uses plugin store + identifier/PendingIntent, not a custom scheduling engine.
                new LocalNotificationManager(storage, null, context, CapConfig.loadDefault(context)).schedule(null, future);
            } catch (Exception error) { Log.e("BagReminderRecovery", "Recovery needs app reconciliation", error); }
            finally { pending.finish(); }
        }, "bag-reminder-recovery").start();
    }
    private static void cancelTimer(Context context, int id) {
        Intent timer = new Intent(context, TimedNotificationPublisher.class);
        PendingIntent pending = PendingIntent.getBroadcast(context, id, timer, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_MUTABLE);
        if (pending != null) { context.getSystemService(AlarmManager.class).cancel(pending); pending.cancel(); }
    }
}
