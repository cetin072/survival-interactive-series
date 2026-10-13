package com.cetin072.survivalbag;

import java.time.LocalDate;
import java.time.Instant;
import java.time.format.DateTimeFormatterBuilder;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/** Date-only BAG records stay wall-clock dates, unlike absolute Worklog schedules. */
public final class BagReminderTime {
    public static long future(String date, String time, ZoneId zone, long now) {
        LocalDateTime local = LocalDateTime.of(LocalDate.parse(date), LocalTime.parse(time));
        ZonedDateTime zoned = local.atZone(zone);
        if (!zoned.toLocalDateTime().equals(local)) return -1; // DST gap: never silently move date/time.
        long instant = zoned.toInstant().toEpochMilli();
        return instant > now ? instant : -1; // Missed dates resurface in-app, never replay as new alarms.
    }
    public static String iso(long instant) { return new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.ofEpochMilli(instant)); }
    private BagReminderTime() {}
}
