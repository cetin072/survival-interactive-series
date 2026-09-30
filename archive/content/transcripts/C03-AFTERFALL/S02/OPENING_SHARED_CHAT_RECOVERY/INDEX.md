# AFTERFALL S02 Opening Shared Chat Recovery

Status: **VERIFIED RECOVERY / COLD ARCHIVE / NOT BOOT INPUT**

## Source

- Shared conversation: <https://chatgpt.com/share/6abd9e2b-8644-83e9-801c-ee8cba198262?ogimg=plain>
- Conversation title: **시즌2 장면 시작**
- Worldline: **AFTERFALL / 서진우 / S02**
- Canon propagation: **NO**

## Recovered range

이 공유 원본은 S02의 실제 첫 USER 요청부터 시작한다.

- First recovered public message: source linear index **3**
- Last newly recovered public message: source linear index **562**
- Recovered: **34 USER + 34 GM final = 68 public messages**
- Existing archive overlap begins at source linear index **563**
- The overlap USER text is byte-for-text equivalent after trim to the first USER block in `../SESSION_001/PART_001.md`.

따라서 이 복구본은 **시즌2 시작부터 기존 SESSION_001 첫 USER 직전까지만** 새로 보존한다.
겹치는 SESSION_001 이후 메시지는 중복 복사하지 않는다.

## Reading order

1. `PART_OPENING_001.md`
2. `PART_OPENING_002.md`
3. `PART_OPENING_003.md`
4. `PART_OPENING_004.md`
5. Existing archive continues at `../SESSION_001/PART_001.md`

## Preservation rule

- 공유 페이지의 serialized `linear_conversation`에서 직접 확인한 문자열만 사용한다.
- USER 공개 메시지와 assistant `final` / recipient `all` / finished 메시지만 보존한다.
- 시스템·개발자·도구 호출/결과·비공개 추론·assistant commentary는 제외한다.
- 기존 Archive와 겹치는 메시지는 새로 복사하지 않는다.
- 이 역사 RAW는 현재 Canon/state를 변경하지 않는다.

`SOURCE_PUBLIC_MESSAGES.json`에는 source linear index, node/message ID, 생성시각과 원문 문자열을 함께 보관한다.
