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

The directory number is chronological within S02, not a claim that either
source room was complete. Each session keeps its original `SOURCE_INDEX.md`
(and, where supplied, `SOURCE_MANIFEST.json`) beside byte-preserved PART files.

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

## Coverage and gaps

- `SESSION_001`: everything before its first directly visible USER turn is
  `MISSING_TRANSCRIPT`.
- `SESSION_002`: everything before its first directly visible USER turn is
  `MISSING_TRANSCRIPT`.
- The archive-operation replies after each source's preservation request are
  outside that source's stated cutoff, not reconstructed as a missing play turn.

The complete S02 history remains **PARTIAL**. Future backfill requires an
original ChatGPT conversation/export or another independently verifiable raw
source.

## Reading order

1. `SESSION_001/PART_001.md` through `PART_004.md`
2. `SESSION_002/PART_001.md` through `PART_004.md`

This cold archive is not a normal game boot input.

## Rolling RAW extension — 2026-09-26 season closeout

시즌 종료 후 Supabase append-only rolling RAW를 durable Cold Archive로 승격했다.
아래 세션은 `public_safe=true`로 실제 저장된 행만 보존하며, 누락된 USER/GM 상대 메시지를 Canon·checkpoint·기억으로 복원하지 않는다.

| Session | Source | Captured game-time range | USER | GM | Verdict |
| --- | --- | --- | ---: | ---: | --- |
| `SESSION_003` | Supabase rolling RAW | 2027-01-16 07:30 → 2027-01-16 09:28 | 0 | 1 | PARTIAL capture / incomplete pair |
| `SESSION_004` | Supabase rolling RAW | 2027-01-16 09:28 → unknown | 1 | 0 | PARTIAL capture / incomplete pair |
| `SESSION_005` | Supabase rolling RAW | 2027-01-16 10:18 → 2027-01-21 18:10 | 3 | 3 | VERIFIED DB span |
| `SESSION_006` | Supabase rolling RAW | 2027-01-21 18:10 → 2027-02-05 22:10 | 17 | 17 | VERIFIED DB span |
| `SESSION_007` | Supabase rolling RAW | 2027-02-06 17:40 → 2027-02-07 13:40 | 3 | 3 | PARTIAL capture / incomplete pair |
| `SESSION_008` | Supabase rolling RAW | 2027-02-07 13:40 → 2027-02-07 13:40 | 1 | 1 | PARTIAL capture / incomplete pair |
| `SESSION_009` | Supabase rolling RAW | 2027-02-07 13:40 → 2027-03-23 17:50 | 10 | 10 | PARTIAL capture / incomplete pair |

- `SESSION_003`과 `SESSION_004`는 atomic turn-pair 도입 초기의 불완전 캡처를 그대로 보존한다.
- `SESSION_005`~`SESSION_009`는 저장된 범위에서 연속 USER→GM pair가 검증되었다.
- 마지막 rolling RAW 세션은 **2027-03-23 17:50 / save 253 / S02 season finale**까지 도달한다.
- 이것으로 시즌 후반부의 durable 원본 보존 범위는 크게 늘었지만, S02 전체가 완전한 원문이라는 뜻은 아니다. 기존 missing 구간은 계속 `MISSING_TRANSCRIPT`다.

### Extended reading order

기존:
1. `SESSION_001`
2. `SESSION_002`

추가:
3. `SESSION_003`
4. `SESSION_004`
5. `SESSION_005`
6. `SESSION_006`
7. `SESSION_007`
8. `SESSION_008`
9. `SESSION_009`

