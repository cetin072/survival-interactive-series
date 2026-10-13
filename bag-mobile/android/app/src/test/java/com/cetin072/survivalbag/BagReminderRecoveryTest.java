package com.cetin072.survivalbag;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.UserManager;
import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;
import com.getcapacitor.JSObject;
import java.lang.reflect.Method;
import java.time.ZoneId;
import java.util.Collections;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.shadow.api.Shadow;
import org.robolectric.shadows.ShadowAlarmManager;
import org.robolectric.shadows.ShadowBroadcastPendingResult;
import org.robolectric.shadows.ShadowPendingIntent;
import org.robolectric.util.ReflectionHelpers;
import org.robolectric.util.ReflectionHelpers.ClassParameter;

/** Host Android simulation: never evidence of physical delivery, Doze or actual reboot. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {24, 30, 31, 35, 36}, shadows = BagReminderRecoveryTest.RecordingPendingIntent.class)
public class BagReminderRecoveryTest {
    @Implements(PendingIntent.class)
    public static class RecordingPendingIntent extends ShadowPendingIntent {
        static int lastFlags;
        @Implementation protected static PendingIntent getBroadcast(Context context, int id, Intent intent, int flags) {
            lastFlags = flags;
            return ShadowPendingIntent.getBroadcast(context, id, intent, flags);
        }
    }
    private Context context;
    private AlarmManager alarms;
    private NotificationStorage storage;

    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        alarms = context.getSystemService(AlarmManager.class);
        storage = new NotificationStorage(context);
        shadowOf(context.getSystemService(UserManager.class)).setUserUnlocked(true);
    }

    // Exactly the creation/lookup contract of the locked Local Notifications 8.3.1.
    private int mutableFlag() { return Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0; }
    private PendingIntent timer(int id, boolean create) {
        return PendingIntent.getBroadcast(context, id, new Intent(context, TimedNotificationPublisher.class),
            (create ? PendingIntent.FLAG_CANCEL_CURRENT : PendingIntent.FLAG_NO_CREATE) | mutableFlag());
    }
    private PendingIntent arm(int id) {
        PendingIntent pending = timer(id, true);
        alarms.set(AlarmManager.RTC, System.currentTimeMillis() + 86400000L, pending);
        return pending;
    }
    private void cancel(int id) throws Exception {
        Method method = BagReminderRecovery.class.getDeclaredMethod("cancelTimer", Context.class, int.class);
        method.setAccessible(true);
        method.invoke(null, context, id);
        assertEquals("8.3.1 cancellation flags at API " + Build.VERSION.SDK_INT,
            PendingIntent.FLAG_NO_CREATE | mutableFlag(), RecordingPendingIntent.lastFlags);
    }

    @Test public void cancellationUsesPluginIdentityAndLeavesOtherAlarm() throws Exception {
        PendingIntent target = arm(101);
        PendingIntent unrelated = arm(102);
        cancel(101);
        assertTrue(shadowOf(target).isCanceled());
        assertNull(timer(101, false));
        assertFalse(shadowOf(unrelated).isCanceled());
        assertEquals(1, shadowOf(alarms).getScheduledAlarms().size());
        assertEquals(unrelated, shadowOf(alarms).peekNextScheduledAlarm().operation);
        cancel(101); // repeated cancellation does not create a token or alarm
        assertEquals(1, shadowOf(alarms).getScheduledAlarms().size());
    }

    @Test public void absentCancellationDoesNotCreatePendingIntent() throws Exception {
        cancel(999);
        assertNull(timer(999, false));
        assertTrue(shadowOf(alarms).getScheduledAlarms().isEmpty());
    }

    private void save(int id, String due, String at, boolean cancelled, String owner) throws Exception {
        JSObject source = new JSObject();
        source.put("id", id); source.put("title", "가상 점검"); source.put("body", "QA only");
        source.put("isExactNotification", false);
        source.put("cancelled", cancelled);
        JSObject schedule = new JSObject(); schedule.put("at", at); source.put("schedule", schedule);
        JSObject extra = new JSObject();
        extra.put("owner", owner); extra.put("due", due); extra.put("localTime", "09:00");
        extra.put("itemId", "synthetic-item"); source.put("extra", extra);
        storage.appendNotifications(Collections.singletonList(LocalNotification.Companion.buildNotificationFromJSObject(source)));
    }
    private void broadcast(String action) throws Exception {
        BagReminderRecovery receiver = new BagReminderRecovery();
        // Invoke only this receiver. Robolectric's dependency-manifest discovery does not
        // implement tools:node="remove" and would also run the excluded stock restore receiver.
        Method factory = ShadowBroadcastPendingResult.class.getDeclaredMethod("create", int.class, String.class, Bundle.class, boolean.class);
        factory.setAccessible(true);
        BroadcastReceiver.PendingResult pending = (BroadcastReceiver.PendingResult) factory.invoke(null, 0, null, null, false);
        ReflectionHelpers.callInstanceMethod(receiver, "setPendingResult", ClassParameter.from(BroadcastReceiver.PendingResult.class, pending));
        receiver.onReceive(context, new Intent(action));
        if (shadowOf(receiver).wentAsync()) {
            ShadowBroadcastPendingResult result = Shadow.extract(pending);
            result.getFuture().get(10, TimeUnit.SECONDS);
        }
    }

    @Test public void rebootReplayCancelsStaleTimersWithoutResurrectingPastOrCancelled() throws Exception {
        String owner = "bag-side.schedule-reminder.v3";
        save(201, "2099-06-01", "2098-06-01T00:00:00.000Z", false, owner);
        save(202, "2099-06-01", "2098-06-01T00:00:00.000Z", true, owner);
        save(203, "2000-06-01", "2000-06-01T00:00:00.000Z", false, owner); // triggered
        save(204, "2000-06-01", "2098-06-01T00:00:00.000Z", false, owner); // stale wall date
        save(205, "2099-06-01", "2098-06-01T00:00:00.000Z", false, "other-owner");
        PendingIntent[] old = {arm(201), arm(202), arm(203), arm(204), arm(205)};
        String foreign = storage.getSavedNotification("205").getSource();
        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"));
            broadcast(Intent.ACTION_BOOT_COMPLETED);
            for (int i = 0; i < 4; i++) assertTrue("stale timer " + i, shadowOf(old[i]).isCanceled());
            assertFalse(shadowOf(old[4]).isCanceled());
            assertNull(timer(202, false)); assertNull(timer(203, false)); assertNull(timer(204, false));
            assertNull(storage.getSavedNotification("204"));
            assertEquals(foreign, storage.getSavedNotification("205").getSource());
            assertFutureAlarm();
            broadcast(Intent.ACTION_BOOT_COMPLETED); // same store replay is idempotent
            assertFutureAlarm();
            TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
            broadcast(Intent.ACTION_TIMEZONE_CHANGED);
            assertFutureAlarm(); // local 09:00 recomputed; old PendingIntent cancelled
            broadcast(Intent.ACTION_TIME_CHANGED);
            assertFutureAlarm();
        } finally { TimeZone.setDefault(original); }
    }
    private void assertFutureAlarm() {
        assertEquals(2, shadowOf(alarms).getScheduledAlarms().size()); // BAG future + foreign timer
        long expected = BagReminderTime.future("2099-06-01", "09:00", ZoneId.systemDefault(), System.currentTimeMillis());
        ShadowAlarmManager.ScheduledAlarm alarm = shadowOf(alarms).getScheduledAlarms().stream()
            .filter(a -> shadowOf(a.operation).getRequestCode() == 201).findFirst().orElseThrow();
        assertEquals(expected, alarm.getTriggerAtMs());
        assertEquals(BagReminderTime.iso(expected), storage.getSavedNotificationAsJSObject("201").getJSObject("extra").getString("triggerAt"));
    }

    @Test public void lockedBootDefersUntilUnlock() throws Exception {
        save(301, "2099-06-01", "2098-06-01T00:00:00.000Z", false, "bag-side.schedule-reminder.v3");
        shadowOf(context.getSystemService(UserManager.class)).setUserUnlocked(false);
        broadcast(Intent.ACTION_BOOT_COMPLETED);
        assertTrue(shadowOf(alarms).getScheduledAlarms().isEmpty());
        shadowOf(context.getSystemService(UserManager.class)).setUserUnlocked(true);
        broadcast(Intent.ACTION_USER_UNLOCKED);
        assertNotNull(timer(301, false));
        assertEquals(1, shadowOf(alarms).getScheduledAlarms().size());
    }
}
