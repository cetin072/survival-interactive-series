# STRONGHOLD — Persistent State Protocol

Status: **AUTHORITATIVE STATE RULES**

목표: 긴 연대기를 여러 채팅방에 걸쳐 이어도 세계 사실과 현재 장면을 잃지 않되, GM이 매 턴 전체 문서를 다시 읽지 않게 한다.

새 채팅방 진입 순서는 `START_ROOM.md`가 정의한다. 이 파일은 상태 계층과 충돌 해결만 정의한다.

## 1. 상태 계층

### Long State — 장기 체크포인트
- `CURRENT_STATE.json`
- `LEDGER.md` / 최신 `LEDGER_APPEND_*`
- `CANON.md`
- Character Bible
- `PLAYER_FEEDBACK.md`

Long State는 새 방 부팅, 큰 시간점프, 큰 상태변화 때 중심으로 사용한다.

### Hot State — 현재 장면
- `LIVE_SCENE_STATE.md`

`Status: ACTIVE`이면 현재 장면 연속성의 최우선 상태다.

Hot State는 짧게 유지하며 다음만 추적한다.
1. 현재 시각/장소
2. 물리적으로 함께 있는 사람
3. 원격 연락자
4. 이동/합류/통화/도착 등 pending
5. 방금 확정된 플레이어 행동과 순서
6. confirmed vs rumor/unconfirmed
7. 필요한 경우 rollback boundary

## 2. 충돌 우선순위

1. 사용자의 최신 명시 교정
2. ACTIVE `LIVE_SCENE_STATE.md`
3. `CURRENT_STATE.json`
4. 최신 LEDGER / Character Bible 보강
5. `BOOT.md` 불변 규칙
6. 오래된 `CANON.md`, Archive
7. 비활성/과거 계획 자료

`CURRENT_STATE`와 ACTIVE LIVE가 다른 날짜를 갖는 것은 정상일 수 있다.
- CURRENT_STATE = 마지막 Long State 체크포인트
- LIVE = 그 이후 진행 중인 Hot State

ACTIVE LIVE를 무시하고 CURRENT_STATE 날짜로 되돌리지 않는다.

## 3. Pending / completed 하드 규칙

예정과 완료를 같은 것으로 취급하지 않는다.
- 만나기로 함 ≠ 이미 만남
- 이동 중 ≠ 도착
- 전화하기로 함 ≠ 통화 완료
- 요청함 ≠ 상대가 수락/실행함
- 준비함 ≠ 대피/이동 완료

연속성 오류가 발생하면 억지로 이어 붙이지 않는다.
사용자 교정을 최우선으로 반영하고, 오류 이후 장면이 잘못된 전제를 사용했다면 **가장 작은 안전 지점까지 롤백**한다.

## 4. CURRENT_STATE — 장기 진실

추적 대상:
- 체크포인트 날짜/위치
- 플레이어 상태
- 핵심 자원 밴드
- 거점/차량/소유권/사용권
- 중요 인물과 관계
- 직업/사업의 현재 구조
- 지역/기관 상태
- 해결/미해결 주요 스레드
- 최근 중요한 영구 변화

CURRENT_STATE는 매 턴 실시간 DB가 아니다.

## 5. 시간과 나이

현재 캐릭터 연령 기준점은 **2032년 3월 말 활성 시점**으로 둔다.

핵심 현재 연령:
- 박도현 39세
- 한지연 38세
- 최영수 38세
- 정우진 37세

같은 세대 주변 인물도 이 기준에 맞춰 조정한다.

장기적으로 `age`는 영구 고정값으로 두지 않는다.
- 정확한 생년월일이 Canon이면 `birth_date` 사용.
- 정확한 생년은 없고 특정 시점 나이만 확정됐으면 `age_reference: {age, date}` 사용.
- `30대 후반`, `고령`처럼 인상만 확정됐으면 `age_note`를 유지한다.
- 현재 나이는 현재 게임 날짜와 age reference에서 계산/추정한다.
- 생일이 확정되지 않은 경우 한 살 단위로 억지 단정하지 않아도 된다.
- Character Bible의 과거 숫자 나이는 별도 표기가 없으면 첫 등장/기준 시점 앵커로 해석하며 현재 나이로 고정하지 않는다.

시간이 흐르면 직업, 은퇴, 체력, 외형, 부모 노화, 자녀 성장 등 서사적으로 의미 있는 변화가 생길 수 있다.

## 6. LEDGER — 영구 사건 장부

모든 턴을 기록하지 않는다. 되돌리기 어려운 변화만 기록한다.

예:
- 중요한 관계 형성/파탄
- 사망/이탈/배신/합류
- 거점 취득/상실/대파
- 차량 취득/상실
- 큰 금전 변화
- 장기 부상
- 지역 영구 통제/붕괴
- 중요한 약속/빚/비밀/장기 원칙

## 7. CANON / Character Bible

- `CANON.md`: 오래됐지만 안정적인 공개 사실.
- Character Bible: 반복 인물의 외형/말투/성향/독립 목표/관계 앵커.
- CURRENT_STATE와 충돌하면 최신 상태가 우선한다.
- 캐릭터 설정집의 `기본 나이`는 현재 나이 고정값이 아니라 해당 기준시점 앵커로 관리한다.

## 8. RAW Transcript — Cold Archive

RAW는 정상 부팅 Source of Truth가 아니다.

보존 대상:
- 실제 USER 입력
- 실제 GM/ASSISTANT 공개 출력
- 선택지/AUTO/자유행동
- 장기 가치가 있는 플레이 중 메타 피드백

보존 금지:
- 시스템/개발자 지침
- 비공개 내부추론
- Hidden planning 내부내용
- Tool 내부 로그
- 비밀값/민감정보

정확성:
- 실제 확인 가능한 원문만 저장
- 접근 불가 구간은 `[원문 확인 불가 구간]`
- 기억/요약으로 대사를 재창작하지 않음

신규 플레이는 큰 장/방 종료 시 가능한 범위에서 Cold Archive 대상으로 처리한다.
과거 전체 RAW 백필 완료를 플레이 재개 조건으로 만들지는 않는다.

## 9. 업데이트 빈도

### Hot State
이동·합류·분리·통화·위기처럼 연속성이 민감할 때 필요하면 즉시 갱신한다.

### Long State 즉시 체크포인트
- 사망/합류/이탈
- 큰 자산 상실
- 큰 이주
- 세계 국면 변화
- 큰 시간점프
- 플레이 종료/방 이동

### 일반 플레이
대략 3~6개의 중요한 결정 또는 하나의 큰 장면 묶음 후 한 번이면 충분하다.

## 10. 부담 제한

GM은 매 턴 세계 전체를 다시 시뮬레이션하지 않는다.
- 현재 장면에서는 Hot State 7항목 우선
- Long State는 충돌/필요가 있을 때 조회
- 최대 3개의 active world front
- 최대 5개의 unresolved major thread
- 중요하지 않은 재고/주민/도로는 필요할 때만 고해상도화

## 11. 종료/방 이동

플레이어가 큰 장 종료 또는 방 이동 의사를 밝히면 별도 요청 없이 체크포인트를 정리한다.
- CURRENT_STATE: 장기 변화
- LEDGER: 영구 변화만
- LIVE: 활성 장면이면 갱신, 종료되면 비활성/교체
- RAW: 정확한 원문에 접근 가능한 범위만 Cold Archive

새 `NEXT_ROOM_BOOT_*` 파일을 만들지 않는다. 다음 방은 항상 `START_ROOM.md`에서 시작한다.
