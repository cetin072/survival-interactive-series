# AFTERFALL S02 공유 채팅 원문 복구

Status: **VERIFIED PARTIAL RECOVERY / COLD ARCHIVE / NOT BOOT INPUT**

## Source

- Shared conversation: <https://chatgpt.com/share/6abd160b-2cf4-83ee-b4d0-98c7ede8dc3e?ogimg=plain>
- Conversation title: **진우 시즌 2 04 (종료)**
- Worldline: **AFTERFALL / 서진우 / S02**
- Canon propagation: **NO**

## Recovery target

기존 Supabase rolling RAW에서 `SESSION_004`는 USER 1개만 남고 GM 상대 메시지가 누락된
`PARTIAL_CAPTURE_INCOMPLETE_PAIRING` 상태다.

- Existing USER: `../SESSION_004/PART_001.md`
- Existing game time: **2027-01-16 09:28**
- Existing scene: `S02_NORTH_ROUTE_MIGRATION_RECONFIGURATION`
- Existing save version: **216**
- Next verified atomic session: `SESSION_005`, **2027-01-16 10:18**

공유 대화에서 그 USER 입력 직후의 GM 답변 시작부와 후속 문장 일부가 다시 확인되어
`PART_RECOVERY_001.md`에 보존했다. 전체 답변을 완전히 회수한 것은 아니므로
`SESSION_004` 자체를 완전한 USER→GM pair로 승격하지 않는다.

## Preservation rule

- 직접 확인된 공개 GM 문자열만 기록한다.
- 기존 `SESSION_005` 이후의 완전한 USER→GM 원문은 중복 저장하지 않는다.
- 확인되지 않은 중간은 `[원문 확인 불가 구간]`으로 유지한다.
- Supabase event summary는 연속성 검증에만 사용하며 대화 원문으로 변환하지 않는다.
- 이 복구 조각은 RAW Vault에만 공개하며 Reader Edition 서사 원문에는 자동 편입하지 않는다.

## Files

1. `PART_RECOVERY_001.md`
2. `SOURCE_MANIFEST.json`
