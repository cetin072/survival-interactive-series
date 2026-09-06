# STRONGHOLD — Arc / Season Close Protocol V1

목적: 큰 사건·분기·시즌이 끝날 때마다 사용자가 따로 `아카이빙해줘`라고 다시 지시하지 않아도, GM이 종료와 동시에 필요한 기록을 자동으로 마무리한다.

이 규칙은 플레이 세계의 사실이 아니라 **GM 운영 규칙**이다.

## 1. 자동 실행 조건

다음 중 하나가 발생하면 별도 확인 질문 없이 종료 기록 절차를 실행한다.

- 플레이어가 `시즌 종료`, `분기 종료`, `에피소드 종료`, `여기서 마무리`, `다음 채팅방으로 가자` 등 종료 의사를 명시함.
- GM과 플레이어가 특정 큰 사건이 사실상 종료됐다고 합의함.
- 새 채팅방 인수인계 파일을 만드는 시점인데 직전 장이 아직 정식 아카이브되지 않았음.

단, 플레이어가 `아직 기록하지 마`라고 명시하면 보류한다.

## 2. 종료 시 자동 체크리스트

### A. ROOM / ARC ARCHIVE 생성
최근 장의 시작~종료 범위를 하나의 `ROOM_ARCHIVE_*.md` 또는 `ARC_ARCHIVE_*.md`로 보존한다.

반드시 포함:
- 시작/종료 시점
- 사건 핵심 흐름
- 플레이어의 중요한 선택과 그 결과
- 자산의 획득/상실/파손/재설계
- 사람의 합류/이탈/새 관계
- 관계 변화
- 해결된 문제와 미해결 문제
- 세계 상태 변화
- 플레이 재미 피드백과 다음 장 적용점

운영용 Archive는 요약 기록이며 RAW 원문을 대체하지 않는다.

### B. CURRENT_STATE.json 최신화
종료 시점이 항상 권위 있는 최신 스냅샷이 되게 한다.

특히 확인:
- 게임 날짜/위치
- 플레이어 상태
- 핵심 자산
- 사람/관계
- 차량
- 거점
- 자원 밴드
- 기관/지역 상태
- unresolved major threads
- 직전 장 closed 상태
- 다음방 boot/archive/feedback 포인터

`CURRENT_STATE`가 오래된 채로 새 방으로 넘어가는 것을 금지한다.

### C. 영구 사건 장부 반영
되돌리기 어려운 변화는 `LEDGER.md`에 추가하는 것이 원칙이다.

직접 append 도구 제약 때문에 안전하게 기존 LEDGER를 수정할 수 없는 경우에는 `LEDGER_APPEND_<기간>.md`를 생성하고 `CURRENT_STATE`/다음 BOOT에서 최근 장부로 참조한다.

기록 대상:
- 거점/차량/토지권리 변화
- 큰 손실
- 중요한 새 인물
- 관계 단계 변화
- 장기 원칙
- 장기적 세계 변화

### D. CHARACTER CONTINUITY 반영
새 반복 인물 또는 외형/말투/관계 상태가 바뀐 핵심 인물이 있으면 `CHARACTER_BIBLE_V1.md`에 반영한다.

파일 전체 수정이 안전하지 않으면 `CHARACTER_BIBLE_ADDENDUM_<기간>.md`를 만들고 다음 BOOT에서 참조한다.

### E. PLAYER FEEDBACK 반영
플레이어가 재미·속도·선택지·현실성·관계·장르에 대해 피드백한 내용은 세계 사실과 섞지 않는다.

- 장기 규칙이면 `PLAYER_FEEDBACK.md`
- 특정 장 회고면 `FEEDBACK_<ARC>.md`

다음 BOOT에서 반드시 읽도록 한다.

### F. RAW TRANSCRIPT COLD ARCHIVE — mandatory
**종료 처리의 필수 단계다.** 운영용 요약 Archive만 만들고 RAW를 생략한 상태를 `완전 아카이빙 완료`라고 보고하지 않는다.

기본 흐름:

> RAW PLAY → CANON / LEDGER / CURRENT_STATE → IP PACKAGE

보존 대상:
- 실제 USER 입력 전부: 숫자 선택, `ㄱ`, AUTO, 자유행동, 수정 지시, 플레이 중 메타 피드백 포함
- 실제 GM/ASSISTANT 공개 출력 전부: 장면, 대사, 선택지, 결과, 플레이어에게 보인 운영 메타 포함
- IP 확장에 가치 있는 시즌 종료 회고·재미 피드백·설정 수정 대화

보존 금지:
- 시스템 프롬프트
- 개발자 지침
- 비공개 chain-of-thought / 내부추론
- Hidden World Seed의 비공개 내용
- Tool 내부 로그
- API key / password / token
- 게임과 무관한 실제 개인정보·민감정보. 필요 시 `[REDACTED]`

원칙:
- 실제 확인 가능한 원문만 저장한다.
- 기억, 요약, Canon, 대화 요약본을 원문처럼 재구성하지 않는다.
- 정확한 원문 접근이 끊긴 구간은 반드시 `[원문 확인 불가 구간]`으로 표시한다.
- 원문의 오탈자·짧은 입력·잘못된 GM 출력도 역사자료로 보존한다. 단, 공개 저장소 안전상 개인정보는 예외적으로 `[REDACTED]` 가능.
- RAW는 Cold Archive이며 정상 플레이 부팅 입력이 아니다.
- RAW와 Canon이 충돌할 경우 현재 세계 사실의 Source of Truth는 승인된 Canon/CURRENT_STATE다. RAW는 당시 실제 대화를 복원하는 역사자료다.

권장 경로:
`worldlines/STRONGHOLD/raw_transcript/`

권장 파일:
- `INDEX.md`
- `PART_001.md`
- `PART_002.md`
- ...

방/분기가 종료될 때 정확한 대화 원문에 직접 접근 가능한 범위는 그 종료 응답에서 최대한 Cold Archive로 저장한다.
원문 접근이 불완전한 경우 `INDEX.md`에 보존 완료 범위와 미확인 범위를 명시하고, 채팅 원문/정식 export 등 신뢰 가능한 원문 접근이 다시 가능해질 때 backfill한다.

**사용자에게 과거 대사를 기억해서 다시 입력시키지 않는다.**

세부 안전 원칙은 저장소의 `docs/RAW_TRANSCRIPT_ARCHIVE_POLICY.md`를 따른다.

### G. NEXT ROOM BOOT 생성/갱신
새 채팅방에서 전체 과거 대화를 다시 읽지 않아도 이어갈 수 있게 한다.

최소 부팅 순서:
1. BOOT
2. 최신 CURRENT_STATE
3. 최신 NEXT_ROOM_BOOT
4. PLAYER_FEEDBACK
5. 직전 장 feedback
6. pacing/character policy
7. 최근 archive/ledger
8. 필요 시 CANON
9. GM private macro file은 내부에서만 읽고 미래를 사용자에게 노출하지 않음

RAW TRANSCRIPT 전체는 정상 부팅에서 읽지 않는다.

## 3. 종료 완료 판정

종료는 다음 묶음이다.

`ROOM/ARC ARCHIVE + CURRENT_STATE + LEDGER + CHARACTER CONTINUITY + PLAYER FEEDBACK + RAW TRANSCRIPT STATUS/ARCHIVE + NEXT ROOM BOOT`

- RAW 원문이 전부 실제 확인 가능하고 저장됐으면: `RAW COMPLETE`
- 일부 원문이 현재 접근 불가해 정확히 저장할 수 없으면: `RAW PARTIAL / BACKFILL REQUIRED`

후자의 경우에도 Canon/상태 종료는 진행할 수 있지만, 사용자에게 **원본까지 완전 아카이빙 완료됐다고 말해서는 안 된다.**

## 4. 종료 후 사용자에게 보고할 항목

길게 설명하지 않고 아래 상태를 명확히 보고한다.

- 운영 Archive 완료 여부
- CURRENT_STATE 최신화 여부
- 영구 변화 장부화 여부
- 캐릭터 연속성 반영 여부
- 피드백 반영 여부
- RAW 원문 상태: COMPLETE 또는 PARTIAL/BACKFILL REQUIRED
- 다음방 BOOT 준비 여부

## 5. 다음 시즌/분기에서의 원칙

종료 아카이빙은 플레이를 멈추게 하는 별도 프로젝트가 아니다.
가능한 GitHub 작업은 종료 응답 안에서 처리한 뒤 바로 다음방 인수인계를 제공한다.

사용자에게 동일한 내용을 다시 복사해 정리시키지 않는다.

## 6. 이 규칙이 생긴 이유

2031 산불 장 종료 시 `FEEDBACK_2031_WILDFIRE_ARC.md`와 `NEXT_ROOM_BOOT_2032_01.md`는 먼저 만들어졌지만 `CURRENT_STATE`가 2031년 2월에 남아 있고 정식 종료 아카이브가 없었다.

그 뒤 상태/장부/운영 Archive를 보완했지만, 초기 종료 프로토콜에서 RAW 원문을 `가능하면` 수준으로 약하게 다뤄 기존 장기 IP 보존 정책과 어긋나는 문제가 확인됐다.

따라서 이후부터는 **다음방 부팅 파일이나 요약 Archive만 만드는 것을 종료 아카이빙 완료로 착각하지 않는다.**

원문은 장기 IP의 1차 자산이고, Canon은 현재 사실의 압축본이며, IP Package는 각색용 추출물이다.
