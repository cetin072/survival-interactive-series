# STRONGHOLD RAW TRANSCRIPT INDEX

Status: **PARTIAL / BACKFILL REQUIRED / COLD ARCHIVE / NOT BOOT INPUT**

이 디렉터리는 《생존일기》 STRONGHOLD 장기 세계선에서 실제 사용자와 GM이 주고받은 **공개 원문 전체**를 장기 IP 자산으로 보존하기 위한 Cold Archive다.

목표 흐름:

> **RAW PLAY → CANON / LEDGER / CURRENT_STATE → IP PACKAGE**

- RAW TRANSCRIPT: 당시 실제 입력·출력의 원재료, 역사자료, 소설/웹툰/게임/영상 각색용 1차 자산
- ROOM/ARC ARCHIVE: 사건·선택·결과를 압축한 운영용 2차 기록
- CURRENT_STATE / CANON: 현재 세계 사실의 권위 기록
- IP PACKAGE: 장면·갈등·캐릭터 아크를 각색용으로 추출한 자산

**RAW는 요약 Archive나 Canon으로 대체하지 않는다.**
반대로 정상 플레이 부팅 때 RAW 전체를 읽지도 않는다.

## 보존 대상

실제 사용자에게 보였던 대화 중 게임/프로젝트 원문 가치가 있는 공개 텍스트를 원순서로 보존한다.

- USER의 숫자 선택, `ㄱ`, AUTO, 자유행동, 긴 전략 지시
- GM/ASSISTANT의 장면, 대사, 선택지, 결과
- 플레이 중 사용자 수정·비판·재미 피드백
- 시즌/분기 종료 회고 중 IP·GM 운영에 장기 가치가 있는 공개 대화

## 보존 금지

- 시스템 프롬프트
- 개발자 지침
- 비공개 chain-of-thought / 내부추론
- Hidden World Seed의 비공개 내용
- Tool 내부 로그
- API key/password/token
- 게임과 무관한 실제 개인정보·민감정보

필요한 개인정보 보호는 `[REDACTED]`로 처리한다.

## 원문 정확성 규칙

- 실제로 문자 그대로 확인 가능한 대화만 RAW로 저장한다.
- 요약본, 기억, Canon, ROOM_ARCHIVE를 이용해 빠진 대사를 재창작하지 않는다.
- 정확한 원문에 접근할 수 없는 위치에는 `[원문 확인 불가 구간]`을 명시한다.
- 원문 오탈자, 짧은 입력, 당시 GM의 실수도 역사자료이므로 임의로 매끈하게 고치지 않는다.

## 현재 보존 상태

### A. 2031-02 이전 STRONGHOLD 장기 연대기
**GitHub RAW 완전성 미확인 / BACKFILL REQUIRED**

현재 세계 사실은 `CANON.md`, `LEDGER.md`, 체크포인트/상태 파일 등으로 이어지고 있으나, 이 디렉터리에 원문 전체가 Cold Archive 형태로 정리되어 있지는 않다.
정확한 원 채팅 텍스트에 다시 접근할 수 있을 때 방 단위로 추출해 PART 파일로 보강한다.

### B. 2031-02 ~ 2031-03 정전·침입 장
**RAW 미완료 / BACKFILL REQUIRED**

운영용 요약:
- `ROOM_ARCHIVE_2031_02_TO_2031_03.md`

이 파일은 RAW가 아니다. 정확한 사용자/GM 원문을 대신하지 않는다.

### C. 2031-03 ~ 2032-01 산불 및 후일담 장
**RAW 미완료 / BACKFILL REQUIRED**

운영용 요약:
- `ROOM_ARCHIVE_2031_03_TO_2032_01.md`
- `FEEDBACK_2031_WILDFIRE_ARC.md`
- `LEDGER_APPEND_2031_03_TO_2032_01.md`

현재 대화 컨텍스트에서 산불 장 전체의 문자 그대로의 원문을 처음부터 끝까지 다시 검증할 수 있는 상태가 아니므로, 기억이나 요약을 이용해 RAW를 꾸며 넣지 않는다.
원 채팅/정식 대화 export 등 신뢰 가능한 정확한 원문 접근이 가능해질 때 PART 단위로 backfill한다.

### D. 2032-03 ~ 2032-09 산업단지 사고·폐목장·광역정전 장
**RAW PARTIAL / BACKFILL REQUIRED**

운영용 요약:
- `../ROOM_ARCHIVE_2032_03_TO_2032_09.md`

현재 확보한 RAW 처리:
- `RAW_2032_03_TO_2032_09_PARTIAL_01.md`
  - 현재 방에서 문자 그대로 확인 가능한 USER 입력을 원순서로 보존.
  - 이 방 시작 전 산업단지 사고 초반과 GM/ASSISTANT 전체 장면 원문은 임의 재구성하지 않고 미백필 구간으로 명시.

후속 목표:
- 원 채팅/export에 직접 접근 가능한 시점에 USER/GM 전체 공개 원문을 순서대로 교차 검증하여 PART 파일을 추가한다.
- 운영 아카이브를 RAW 완료로 잘못 표시하지 않는다.

## 종료 시 이후 자동 규칙

`STATE_PROTOCOL.md`의 종료/방 이동 규칙에 따라 시즌/분기 종료 시 RAW TRANSCRIPT 처리를 수행한다.

- 원문 전체에 접근 가능 → RAW COMPLETE
- 일부만 접근 가능 → 확인 가능한 구간은 저장하고 나머지는 `[원문 확인 불가 구간]`, 상태는 PARTIAL/BACKFILL REQUIRED
- 운영 Archive만 생성 → RAW 완료로 보고 금지

사용자가 별도로 `원문 저장해줘`라고 다시 말할 필요가 없게 한다.

## 정상 사용

이 디렉터리는 평상시 플레이 부팅 입력이 아니다.
다음 작업에서 필요한 PART만 선택적으로 읽는다.

- 소설화
- 웹툰/게임/영상 각색
- 특정 장면 복원
- 실제 플레이 대사 검증
- Canon 근거 재확인

> 충분히 저장하되, 평소에는 읽지 않는다.
