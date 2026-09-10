# STRONGHOLD RAW TRANSCRIPT INDEX

Status: **PARTIAL / BACKFILL REQUIRED / COLD ARCHIVE / NOT BOOT INPUT**

이 디렉터리는 《생존일기》 STRONGHOLD 장기 세계선에서 실제 사용자와 GM이 주고받은 **공개 원문 전체**를 장기 IP 자산으로 보존하기 위한 Cold Archive다.

목표 흐름:

> **RAW PLAY → ROOM/ARC SUMMARY → CANON / LEDGER / CURRENT_STATE → IP PACKAGE**

- RAW TRANSCRIPT: 당시 실제 입력·출력 전체의 1차 원재료
- ROOM/ARC ARCHIVE: 사건·선택·결과를 압축한 운영용 2차 요약
- CURRENT_STATE / LEDGER / CANON: 현재 세계 사실과 영구 변화
- FEEDBACK: 재미·운영 교정
- IP PACKAGE: 소설·웹툰·게임·영상·교육용으로 재가공하는 파생 자산

**RAW와 요약본은 반드시 둘 다 보존한다. 서로 대체하지 않는다.**
정상 플레이 부팅 때 RAW 전체를 다시 읽지는 않는다.

## 1. `아카이빙`의 기본 의미

사용자가 별도 한정을 하지 않고 `아카이빙`, `원문 보존`, `시즌 저장`을 요청하면 기본적으로 다음 두 묶음을 모두 만든다.

### A. 원문 RAW
사용자에게 실제로 표시된 게임 관련 대화를 원순서로 보존한다.

포함:
- USER 입력 전체: 숫자 선택, `ㄱ`, AUTO, 자유행동, 전략 지시, 정정, 불만, 회고
- GM/ASSISTANT 공개 출력 전체: 서술, 대사, 시간/장소 헤더, 메시지, 선택지, 결과, 공개 메타 답변
- 플레이 중 발생한 GM 실수와 사용자 교정도 삭제하지 않음
- 시즌 종료 직후의 피드백 대화도 post-arc RAW로 이어서 보존 가능

즉 `대사만`이 아니라 **실제로 주고받은 공개 글 전체**가 원문이다.

제외:
- 시스템/개발자 프롬프트
- 비공개 chain-of-thought / 내부추론
- Hidden planning
- Tool 내부 로그
- 비밀값 및 게임과 무관한 실제 민감정보

### B. 별도 요약/상태 자산
RAW와 별개로 다음을 만든다.
- `ROOM_ARCHIVE_*`: 읽기 쉬운 시즌/분기 요약
- `LEDGER*`: 영구 변화
- `CURRENT_STATE.json`: 다음 시즌 시작 상태
- `FEEDBACK_*`: 해당 시즌 평가와 보수안
- `PLAYER_FEEDBACK.md`: 이후에도 유지할 장기 취향/운영 규칙

## 2. 원문 정확성 규칙

- 실제로 문자 그대로 확인 가능한 대화만 RAW로 저장한다.
- 요약본, 기억, Canon, ROOM_ARCHIVE를 이용해 빠진 대사를 재창작하지 않는다.
- 정확한 원문에 접근할 수 없는 위치에는 `[원문 확인 불가 구간]`을 명시한다.
- 원문 오탈자, 짧은 입력, 당시 GM의 실수도 역사자료이므로 임의로 고치지 않는다.
- RAW가 일부만 있으면 반드시 `PARTIAL / BACKFILL REQUIRED`로 표시한다.

## 3. Rolling RAW — 신규 시즌 기본 방식

긴 채팅은 종료 시점 전에 과거 원문이 압축될 수 있으므로 **시즌 마지막에 한 번 몰아서 저장하지 않는다.**

신규 시즌부터:
- 약 6~10개 USER↔GM 왕복 또는 큰 장면 하나가 끝날 때 아직 저장하지 않은 원문을 PART 파일로 자동 저장한다.
- 큰 시간점프, 중요 관계 전환, 큰 자산 취득/상실, 방 이동 전에는 즉시 저장한다.
- 파일 예: `RAW_<기간>_PART_01.md`, `PART_02.md` ...
- 사용자에게 저장 작업을 매번 보고하여 몰입을 깨지 않는다.
- 시즌 종료 때 마지막 미저장 구간을 Final Flush한다.

따라서 앞으로는 사용자가 매 시즌 `원문 저장해줘`라고 별도로 말하지 않아도 된다.

## 4. 현재 보존 상태

### A. 2031-02 이전 STRONGHOLD 장기 연대기
**GitHub RAW 완전성 미확인 / BACKFILL REQUIRED**

세계 사실은 CANON/LEDGER/상태문서로 이어지지만 원문 전체 Cold Archive는 미완료다.
정확한 원 채팅/export에 접근할 수 있을 때 방 단위로 backfill한다.

### B. 2031-02 ~ 2031-03 정전·침입 장
**RAW 미완료 / BACKFILL REQUIRED**

운영용 요약:
- `../ROOM_ARCHIVE_2031_02_TO_2031_03.md`

### C. 2031-03 ~ 2032-01 산불 및 후일담 장
**RAW 미완료 / BACKFILL REQUIRED**

운영용 요약:
- `../ROOM_ARCHIVE_2031_03_TO_2032_01.md`
- `../FEEDBACK_2031_WILDFIRE_ARC.md`
- `../LEDGER_APPEND_2031_03_TO_2032_01.md`

### D. 2032-03 ~ 2032-09 산업단지 사고·폐목장·광역정전 장
**RAW PARTIAL / BACKFILL REQUIRED**

운영용 요약:
- `../ROOM_ARCHIVE_2032_03_TO_2032_09.md`

현재 RAW:
- `RAW_2032_03_TO_2032_09_PARTIAL_01.md`

이 파일은 당시 접근 가능한 USER 원문 중심이며 GM/ASSISTANT 전체 출력은 미완료다.

### E. 2032-09 ~ 2038-04 기록·신원 붕괴 / 세계 재편 / 독립 / 거점 B / 토지 매입 장
**RAW PARTIAL / BACKFILL REQUIRED**

운영용 요약:
- `../ROOM_ARCHIVE_2032_09_TO_2038_04.md`
- `../FEEDBACK_2032_09_TO_2038_04.md`
- `../LEDGER_APPEND_2032_09_TO_2038_04.md`

현재 RAW:
- `RAW_2032_09_TO_2038_04_PARTIAL_01.md`

현재 파일은 USER 입력은 보존돼 있으나 GM/ASSISTANT 공개 원문 전체가 빠져 있으므로 **완전 아카이빙으로 간주하지 않는다.**
이 구간은 원 채팅/export 접근이 가능할 때 backfill한다.

## 5. 시즌 종료 자동 루틴

`STATE_PROTOCOL.md`에 따라 시즌 종료가 결정되면 새 시즌 시작 전에 자동으로 다음을 수행한다.

1. 미저장 USER/GM 공개 원문 Final Flush
2. RAW completeness 확인 및 INDEX 갱신
3. ROOM/ARC 요약 아카이브 생성
4. LEDGER 영구 변화 기록
5. CURRENT_STATE 체크포인트
6. LIVE 비활성화 또는 새 장면으로 교체
7. 시즌 FEEDBACK 및 장기 PLAYER_FEEDBACK 반영

RAW가 COMPLETE가 아니면 그 사실을 숨기지 않는다.
운영 요약이 있다는 이유로 RAW COMPLETE라고 표시하지 않는다.

## 6. 정상 사용

이 디렉터리는 평상시 부팅 입력이 아니다.
필요한 PART만 선택적으로 읽는다.

- 소설화
- 웹툰/게임/영상 각색
- 교육용 사례 추출
- 특정 장면 복원
- 실제 플레이 대사 검증
- Canon 근거 재확인

> **원문은 충분히 저장하고, 플레이 때는 가볍게 읽는다.**
