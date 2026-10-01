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
| `OPENING_SHARED_CHAT_RECOVERY` | ChatGPT shared conversation `6abd9e2b-8644-83e9-801c-ee8cba198262` | 2026-11-21 season opening → immediately before SESSION_001 first USER | 34 | 34 | VERIFIED exact pre-overlap span |
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

- `SESSION_001`: its previously missing pre-span has been recovered from
  `OPENING_SHARED_CHAT_RECOVERY/PART_OPENING_001.md`–`004.md`. The shared
  source starts at the S02 opening and stops immediately before an exact duplicate
  of the first USER block in `SESSION_001/PART_001.md`.
- `SESSION_002`: everything before its first directly visible USER turn is
  `MISSING_TRANSCRIPT`.
- The archive-operation replies after each source's preservation request are
  outside that source's stated cutoff, not reconstructed as a missing play turn.

The complete S02 history remains **PARTIAL**. Future backfill requires an
original ChatGPT conversation/export or another independently verifiable raw
source.

## Reading order

1. `OPENING_SHARED_CHAT_RECOVERY/PART_OPENING_001.md` through `PART_OPENING_004.md`
2. `SESSION_001/PART_001.md` through `PART_004.md`
3. `SESSION_002/PART_001.md` through `PART_004.md`

This cold archive is not a normal game boot input.

## Rolling RAW extension — 2026-09-26 season closeout

시즌 종료 후 Supabase append-only rolling RAW를 durable Cold Archive로 승격했다.
아래 세션은 `public_safe=true`로 실제 저장된 행만 보존하며, 누락된 USER/GM 상대 메시지를 Canon·checkpoint·기억으로 복원하지 않는다.

| Session | Source | Captured game-time range | USER | GM | Verdict |
| --- | --- | --- | ---: | ---: | --- |
| `SESSION_003` | Supabase rolling RAW | 2027-01-16 09:28 → 2027-01-16 09:28 | 0 | 1 | PARTIAL capture / incomplete pair |
| `SESSION_004` | Supabase rolling RAW | 2027-01-16 09:28 → 2027-01-16 09:28 | 1 | 0 | PARTIAL capture / incomplete pair |
| `SESSION_005` | Supabase rolling RAW | 2027-01-16 10:18 → 2027-01-21 18:10 | 3 | 3 | VERIFIED DB span |
| `SESSION_006` | Supabase rolling RAW | 2027-01-21 18:10 → 2027-02-05 22:10 | 17 | 17 | VERIFIED DB span |
| `SESSION_007` | Supabase rolling RAW | 2027-02-06 21:15 → 2027-02-07 13:40 | 3 | 3 | VERIFIED DB span |
| `SESSION_008` | Supabase rolling RAW | 2027-02-07 13:40 → 2027-02-07 13:40 | 1 | 1 | VERIFIED DB span |
| `SESSION_009` | Supabase rolling RAW | 2027-02-07 13:40 → 2027-03-23 17:50 | 10 | 10 | VERIFIED DB span |

- `SESSION_003`과 `SESSION_004`는 atomic turn-pair 도입 초기의 불완전 캡처를 그대로 보존한다.
- `SESSION_005`~`SESSION_009`는 저장된 범위에서 연속 USER→GM pair가 검증되었다.
- 마지막 rolling RAW 세션은 **2027-03-23 17:50 / save 253 / S02 season finale**까지 도달한다.
- 이것으로 시즌 후반부의 durable 원본 보존 범위는 크게 늘었지만, S02 전체가 완전한 원문이라는 뜻은 아니다. 기존 missing 구간은 계속 `MISSING_TRANSCRIPT`다.

### Extended reading order

기존:
1. `OPENING_SHARED_CHAT_RECOVERY`
2. `SESSION_001`
3. `SESSION_002`

추가:
4. `SESSION_003`
5. `SESSION_004`
6. `SESSION_005`
7. `SESSION_006`
8. `SESSION_007`
9. `SESSION_008`
10. `SESSION_009`



## Shared-chat gap recovery — 2026-10-01

사용자가 제공한 ChatGPT 공유 원본 `진우 시즌 2 04 (종료)`를 기존 S02 RAW와 대조했다.

- Source: <https://chatgpt.com/share/6abd160b-2cf4-83ee-b4d0-98c7ede8dc3e?ogimg=plain>
- `SESSION_005` 이후의 신하영 합류·정보원 병렬·도로관리집단 접촉 구간은 기존 atomic RAW와 겹치므로 중복 보존하지 않았다.
- 새로 보강 가능한 지점은 `SESSION_004`의 누락 GM 상대 메시지다.
- 공유 원본에서 직접 다시 확인된 GM 문장만 `SHARED_CHAT_RECOVERY/PART_RECOVERY_001.md`에 보존했다.
- 답변 전체가 회수된 것은 아니므로 `SESSION_004`의 `PARTIAL_CAPTURE_INCOMPLETE_PAIRING` 판정은 유지한다.
- 확인되지 않은 중간은 `[원문 확인 불가 구간]`으로 남긴다.
- 복구 조각은 RAW Vault에는 공개하지만 Reader Edition 서사 본문에는 자동 편입하지 않는다.


## Opening shared-chat recovery — 2026-10-01

사용자가 제공한 `시즌2 장면 시작` 공유 원본으로 기존 `SESSION_001` 이전의 빈 구간을 복구했다.

- Source: <https://chatgpt.com/share/6abd9e2b-8644-83e9-801c-ee8cba198262?ogimg=plain>
- 공유 페이지 내부 serialized `linear_conversation`을 직접 읽어 원문 문자열을 추출했다.
- 새로 확보된 범위: source linear index **3..562**
- 메시지: **34 USER + 34 assistant final**
- source linear index **563**의 USER 문장이 기존 `SESSION_001/PART_001.md` 첫 USER와 정확히 일치한다.
- 따라서 index 563 이후는 중복 보존하지 않았다.
- 시스템·도구·비공개 추론·assistant commentary는 제외했다.
- 현재 Canon/state는 변경하지 않는다.
