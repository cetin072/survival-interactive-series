package com.cetin072.survivalbag;
import java.time.Instant;
import java.time.ZoneId;
public class BagReminderTimeTest {
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    public static void main(String[] args) {
        long now = Instant.parse("2030-01-01T00:00:00Z").toEpochMilli();
        long seoul = BagReminderTime.future("2030-01-03", "09:00", ZoneId.of("Asia/Seoul"), now);
        long ny = BagReminderTime.future("2030-01-03", "09:00", ZoneId.of("America/New_York"), now);
        check(seoul != ny);
        check(BagReminderTime.iso(seoul).equals("2030-01-03T00:00:00.000Z"));
        check(Instant.ofEpochMilli(seoul).toString().equals("2030-01-03T00:00:00Z"));
        check(BagReminderTime.future("2029-12-31", "09:00", ZoneId.of("Asia/Seoul"), now) == -1);
        check(BagReminderTime.future("2030-03-10", "02:30", ZoneId.of("America/New_York"), now) == -1);
        check(BagReminderTime.future("2030-01-03", "09:00", ZoneId.of("Asia/Seoul"), seoul) == -1);
        System.out.println("PASS native wall-clock timezone/reboot future-only/DST-gap policy (JVM; not OS delivery)");
    }
}
