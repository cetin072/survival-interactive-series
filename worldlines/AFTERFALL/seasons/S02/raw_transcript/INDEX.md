# AFTERFALL S02 — Unified RAW Transcript Index

Status: **PARTIAL / COLD ARCHIVE / NOT BOOT INPUT**

- Chronicle: **03**
- Worldline: **AFTERFALL**
- Protagonist: **서진우**
- Season: **S02**
- Preservation rule: only public USER↔GM text directly verified in each source
  room is retained. No Canon, checkpoint, summary, memory, system/developer
  instruction, tool result, or private reasoning is reconstructed as dialogue.

## Session registry

| Session | Source | Verified chronological range | USER | GM public blocks | Verdict |
| --- | --- | --- | ---: | ---: | --- |
| `SESSION_001` | PR #84 / `archive/afterfall-chronicle03-s02-room-20260925` | 2026-11-22 industrial-fire response through the archive-request cutoff | 31 | 89 | VERIFIED span, PARTIAL room |
| `SESSION_002` | PR #83 / `archive/afterfall-s02-raw-room-20260925` | 2027-01-04 first-winter discussion through the archive-request cutoff | 13 | 16 | VERIFIED span, PARTIAL room |
| `SESSION_MISSING_20260925T0934KST_02` | current ChatGPT room identity audit | No AFTERFALL verbatim range verified; directly visible text belongs to C02 / STRONGHOLD / 박도현 | 0 archived | 0 archived | MISSING |

The directory number is chronological within S02 for verified sessions, not a claim that either
source room was complete. Each verified session keeps its original `SOURCE_INDEX.md`
(and, where supplied, `SOURCE_MANIFEST.json`) beside byte-preserved PART files.

`SESSION_MISSING_20260925T0934KST_02` is an audit-only marker. It contains no transcript PART because copying the directly visible C02 / STRONGHOLD material into C03 / AFTERFALL would violate identity isolation.

## Overlap decision

PR #83 and #84 collide on the old flat `PART_001.md`–`PART_004.md` filenames,
but they are not alternate copies of one transcript.

- Exact USER block comparison found two shared message values (three records
  because one shared short input repeats within its source).
- Exact GM public block comparison found no shared block.
- Their first verified USER messages differ, and their verified ranges are
  chronologically distinct.

They are therefore preserved as separate ChatGPT sessions. No PART content is
overwritten or deduplicated across sessions; a repeated public input remains a
fact of its originating room.

The identity-audit session contains no AFTERFALL transcript content, so transcript overlap is not applicable to it.

## Coverage and gaps

- `SESSION_001`: everything before its first directly visible USER turn is
  `MISSING_TRANSCRIPT`.
- `SESSION_002`: everything before its first directly visible USER turn is
  `MISSING_TRANSCRIPT`.
- `SESSION_MISSING_20260925T0934KST_02`: `[원문 확인 불가 구간]` — the claimed C03 / AFTERFALL / 서진우 S02 transcript is not directly accessible in the current room context. The visible pre-cutoff public conversation belongs to C02 / STRONGHOLD / 박도현 and is intentionally excluded.
- The archive-operation replies after each source's preservation request are
  outside that source's stated cutoff, not reconstructed as a missing play turn.

The complete S02 history remains **PARTIAL**. Future backfill requires an
original ChatGPT conversation/export or another independently verifiable raw
source.

## Reading order

1. `SESSION_001/PART_001.md` through `PART_004.md`
2. `SESSION_002/PART_001.md` through `PART_004.md`
3. `SESSION_MISSING_20260925T0934KST_02/INDEX.md` for the current-room identity audit only; no transcript PART exists

This cold archive is not a normal game boot input.
