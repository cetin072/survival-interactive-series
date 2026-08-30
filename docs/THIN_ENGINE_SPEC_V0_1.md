# Thin Engine v0.1 Specification

상태: DESIGN BASELINE
목적: ChatGPT GM의 창작 자유는 유지하면서 기억·상태 계산·모순 검사·반복적인 MUD 화면 구성을 프로그램으로 분리한다.

---

## 1. 목표
Thin Engine v0.1은 완성형 게임엔진이 아니다.

핵심 목표:
> **프로그램은 기억하고 계산하고 보여주며, AI GM은 세계를 만들고 반응한다.**

현재 ChatGPT GM이 동시에 담당하는 다음 업무 중 일부를 프로그램으로 이전한다.
- 현재 시간/위치/동행관계 기억
- 차량·거점·자원 상태 기억
- 진행 중 행동과 완료 행동 관리
- 복수행동 순차 처리
- Canon/현재 상태 모순 검사
- 반복 MUD 화면 렌더링

AI GM에 남길 것:
- 세계 상황과 사건 생성
- 인물의 대사·감정·자율행동
- 선택지의 의미와 긴장 설계
- 자유행동 해석
- 결과의 서사화
- Hidden World Seed의 창의적 설계

---

## 2. 제품 경계
### v0.1에 포함
1. Live Game State
2. Persistent Canon 참조
3. Action Queue
4. Validator
5. MUD Renderer / Presentation Layer
6. AI GM Contract
7. 체크포인트 저장/불러오기
8. S01 일부 회귀테스트

### v0.1에 포함하지 않음
- 회원가입/멀티유저
- 결제/랭킹/커뮤니티
- 정밀 HP·갈증·칼로리 시뮬레이션
- 대형 인벤토리
- 2D/3D 월드맵
- 시나리오 에디터
- 운영자 CMS
- 자동 AI 삽화 생성
- 캐릭터 애니메이션
- 앱스토어 배포
- 복잡한 게임 서버

개발이 플레이 재미를 잡아먹기 시작하면 범위를 확대하지 않는다.

---

## 3. 전체 구조

```text
PLAYER
  ↓
WEB UI
  ↓
INPUT PARSER
  ↓
ACTION QUEUE / GAME CONTROLLER
  ↓
LIVE GAME STATE ← PERSISTENT CANON
  ↓                 ↑
AI GM             VALIDATOR
  ↓                 ↑
STATE CHANGE PROPOSAL
  ↓
VALIDATOR
  ↓
COMMIT STATE
  ↓
MUD RENDERER
  ↓
PLAYER
```

GitHub 역할:
- 장기 Canon
- 시즌 결과
- 설계/회고
- 중요한 체크포인트

실시간 한 턴마다 GitHub API를 호출하지 않는다.
런타임 Live State는 로컬/앱 저장소 또는 경량 DB가 담당하고, 의미 있는 체크포인트에서 GitHub Source of Truth와 동기화한다.

---

## 4. 데이터 계층

### A. Persistent Canon
시즌을 넘어 지속되는 현재 사실.
현재 기준 Source of Truth:
- `core/CHARACTERS.json`
- `core/PERSISTENT_CANON.md`

예:
- 가족 기본 관계와 역할
- 외곽거점이 가진 검증된 능력
- 최씨와의 협력관계
- 장기 차량/자산 원칙

Persistent Canon은 과거 시즌 전체 이야기를 매턴 로드하는 구조가 아니다.
현재 살아 있는 결과만 압축한다.

### B. Live Game State
현재 이 순간의 사실.

권장 최소 구조:
```json
{
  "clock": {
    "day": 1,
    "date": null,
    "time": "17:40",
    "phase": "P1"
  },
  "party": {
    "player": {"location": "회사", "with": [], "status": "normal"},
    "wife": {"location": "도심 아파트", "with": [], "status": "normal"},
    "son": {"location": "학교", "with": [], "status": "normal"},
    "father": {"location": "외곽거점", "with": [], "status": "normal"}
  },
  "vehicles": {},
  "bases": {},
  "resources": {},
  "institutions": {},
  "routes": {},
  "active_actions": [],
  "completed_actions": [],
  "public_world": {},
  "season_id": "Sxx"
}
```

v0.1에서는 세부 수량보다 현재 선택에 필요한 상태를 우선한다.

### C. Hidden State
AI GM과 엔진이 알고 플레이어는 모르는 상태.

예:
- 재난 실제 진행방향
- 미래 외생압력
- 도로/시설의 아직 미확인 상태
- 일부 인물의 숨은 우선순위
- 조건부 사건
- pending consequences

기존 `GM_STATE.json`을 기반으로 유지한다.

---

## 5. 기존 저장구조와의 관계

현재 저장소의:
- `schemas/save.schema.json`
- `schemas/gm_state.schema.json`

을 폐기하지 않는다.

역할 재정의:
- `SAVE_STATE.json` = 플레이어에게 공개 가능한 장기 체크포인트/재개 상태
- `GM_STATE.json` = 시즌 Hidden State와 장기 판정 상태
- `LIVE_STATE` = 실제 웹 런타임에서 매 행동 갱신되는 현재 순간 상태

v0.1은 `LIVE_STATE`용 별도 스키마를 추가하는 방향을 기본으로 한다.

---

## 6. 플레이어 입력

지원 입력은 기존 MUD UX를 그대로 유지한다.

### 단일선택
`2`

### 순차 복수선택
`3 → 5 → 1`

### 가족 역할분담
`나 2 / 아내 4 / 아버지 6`

### 자연어 자유행동
`아내에게 물을 받아두라고 하고 나는 학교로 간다`

웹 UI는 버튼 입력과 자유입력을 함께 제공한다.
버튼이 자유행동을 대체해서는 안 된다.

---

## 7. Action Queue

복수선택 비용을 AI 기억에 맡기지 않는다.

`3 → 5 → 1` 처리:
1. Action 3 실행 가능성 검사
2. 실행
3. 시간·위치·자원·세계 상태 갱신
4. 외생 이벤트/조건 변화 적용
5. Action 5 재검사
6. 가능하면 실행, 아니면 지연/실패/기회상실 처리
7. 다시 상태 갱신
8. Action 1 재검사

가능 결과:
- success
- partial_success
- delayed
- blocked
- opportunity_lost
- cancelled_by_state_change

핵심:
`복수선택 = 행동 큐`이지 `좋은 선택 묶음 무료 획득`이 아니다.

---

## 8. AI GM Contract

AI GM은 장면을 생성하면서 Live State를 직접 임의 수정하지 않는다.

AI 출력은 개념적으로 두 층을 가진다.

### A. Narrative Output
플레이어에게 보이는 것:
- 사건 설명
- 대사
- 인물 반응
- 선택지
- 자유행동 결과의 서사

### B. State Change Proposal
프로그램에게 보내는 구조화 제안.

예:
```json
{
  "time_delta_min": 25,
  "moves": [
    {"entity": "player", "from": "회사", "to": "학교"},
    {"entity": "vehicle_a", "from": "회사", "to": "학교"}
  ],
  "resource_changes": [
    {"resource": "fuel", "change": "down_one_band"}
  ],
  "completed_actions": ["go_to_school"]
}
```

Validator 승인 후에만 실제 Live State를 변경한다.

AI GM은 프로그램의 현재 상태 snapshot을 매 장면 입력으로 받는다.
과거 시즌 전체 문서를 기억에 의존해서 재구성하지 않는다.

---

## 9. Validator v0.1

첫 버전은 실제 플레이에서 자주 발생했던 오류를 우선 차단한다.

### 필수 검사
1. 한 인물이 동시에 두 장소에 존재할 수 없음
2. 함께 있는 가족에게 `합류하러 간다` 같은 모순 행동 차단
3. 차량의 현재 위치와 운전자/이용자의 위치 모순 차단
4. 이미 완료된 행동을 새 행동처럼 반복하지 않음
5. 진행 중 행동과 물리적으로 충돌하는 행동 검사
6. 앞선 복수행동 때문에 뒤 행동이 불가능해졌는지 재검사
7. Canon상 플레이어 권한이 없는 기관 정책 결정을 플레이어 행동으로 확정하지 않음
8. 기존 장기 능력/소유관계를 이유 없이 변경하지 않음
9. 시간 역행 금지
10. 상태 변경 제안의 `from`이 현재 Live State와 다르면 충돌 처리

### Validator 결과
- ACCEPT
- ACCEPT_WITH_ADJUSTMENT
- REJECT_STATE_CONFLICT
- NEED_GM_REPLAN

Validator는 창작을 평가하지 않는다.
사실·물리·권한·상태 정합성만 검사한다.

---

## 10. MUD Renderer / Presentation Layer

MUD 화면의 반복적인 배치는 프로그램이 담당한다.
AI GM은 매 턴 상태창 서식을 직접 만들 필요가 없다.

### 자동 Scene Header
```text
DAY 04 · 18:35
도심 아파트
폭우 7시간째
```

### Family
가족 분산 또는 위치가 중요한 장면에서 자동 표시.

```text
가족
준호   도심
서윤   병원
민석   학교
정호   외곽
```

### Resource / World Warning
현재 결정에 관계되거나 상태 단계가 변할 때만 표시.

```text
💧 물      충분
⛽ 연료    위험선 접근
📡 통신    불안정
```

### Change Log
큰 변화가 있을 때만.

```text
변화
+ 이동시간 확보
- 현금 여유
! 외곽도로 통제 시작
```

### AUTO / EVENT / PHASE CHANGE
```text
━━ AUTO · 3일 경과 ━━
```

```text
⚠ EVENT
도심 진입도로 일부 통제
```

```text
━━ PHASE CHANGE ━━
공급 차질 → 지역 이동 제한
```

### Renderer 자동 노출 원칙
- 가족 분산 → FAMILY 표시
- 자원 단계 변화/임계상태 → 관련 RESOURCE 표시
- 긴 시간 점프 → AUTO 표시
- Phase 변경 → PHASE CHANGE 표시
- 관련 없는 전체 HUD → 숨김

Renderer는 새로운 게임 상태를 만들지 않는다.
이미 존재하는 상태를 읽기 쉽게 보여주는 역할만 한다.

---

## 11. UI v0.1

최초 웹 화면은 한 화면 MUD 구조를 유지한다.

필수:
- Scene Header
- 사건 본문
- 필요 시 상태 패널
- 3~4개 선택 버튼
- 자유입력창
- 이전 로그 스크롤
- 저장/재개 최소 기능

선택 버튼은 숫자 입력의 시각적 편의 기능이다.
키보드 숫자 입력과 자유 자연어 입력도 계속 허용한다.

모바일에서도 한 손으로 조작 가능한 단순성을 우선한다.

---

## 12. 저장 전략

### 매 턴
Live State만 경량 저장.
GitHub 호출하지 않음.

### 체크포인트
다음 때 장기 Save 생성:
- Phase 전환
- 가족 큰 분리/합류/역할변화
- 중요한 자산·거점·관계 변화
- 중대한 손실/획득
- 세션 종료
- 시즌 종료

### 시즌 종료
- 플레이 Canon
- Retrospective
- Persistent Canon 변경분
- 최종 SAVE_STATE
- 필요 시 GM_STATE 정리
을 GitHub에 반영.

---

## 13. S01 회귀테스트

첫 구현을 신규 S06 전체에 바로 적용하지 않는다.
이미 결과를 아는 S01 「불길」의 일부 상황을 재현해 엔진을 검증한다.

우선 테스트:
1. 가족 분산 위치 정확성
2. 차량 위치와 합류 처리
3. 이동 후 시간 경과
4. `3 → 5 → 1` 중 후속 행동 가능성 변화
5. 가족 분산 시 FAMILY 자동표시
6. 자원/도로 상태 변화 시 Renderer 표시
7. 이미 완료된 합류 행동 재제안 차단
8. AI State Proposal과 Validator 충돌 시 재계획

회귀테스트 목적은 원래 S01 이야기를 똑같이 재생하는 것이 아니라 **정합성 오류가 줄어드는지 확인하는 것**이다.

---

## 14. 성공 조건

Thin Engine v0.1 성공 판정:
- 가족/차량/위치 착각이 명확히 감소
- 완료 행동 반복 오류 감소
- 복수행동 순서 비용이 일관되게 적용
- AI GM이 HUD/상태표 서식 작성에 신경 쓸 필요 감소
- MUD 화면이 더 일관되고 빠르게 읽힘
- 자유행동의 유연성이 현재 ChatGPT 플레이 수준으로 유지
- AI GM의 창작과 반응 속도가 상태관리 때문에 무거워지지 않음

성공하지 못하면 기능을 늘리기보다 구조를 단순화한다.

---

## 15. 구현 원칙

1. **State before Story**
   - 현재 상태를 먼저 확정한 뒤 AI가 장면을 만든다.

2. **AI proposes, engine commits**
   - AI는 상태 변경을 제안하고 프로그램이 검증·반영한다.

3. **Renderer reads state**
   - 화면은 상태에서 자동 생성한다.

4. **GitHub is durable memory, not turn database**
   - GitHub는 장기 기록용이다.

5. **Do not productize early**
   - v0.1 성공 전 계정·멀티유저·결제·대형 콘텐츠 시스템으로 확대하지 않는다.

6. **Protect the hobby**
   - 엔진 개발의 목적은 게임 플레이 부담을 줄이는 것이다.
   - 개발 자체가 플레이보다 더 큰 프로젝트가 되면 기능 확대를 중단한다.

---

## 16. 다음 구현 단계

### Milestone 0 — 설계 고정
- 본 문서 확정
- Live State 최소 스키마 확정
- AI GM 입출력 JSON 계약 확정

### Milestone 1 — Local State Prototype
- AI 없이 상태 생성/저장/불러오기
- 위치·시간·차량 변경
- Validator 기본 규칙

### Milestone 2 — MUD Renderer
- Live State → Scene Header/FAMILY/RESOURCE/AUTO/PHASE 화면 자동 생성
- 선택 버튼 + 자유입력 UI

### Milestone 3 — AI GM 연결
- 현재 상태 snapshot → AI GM
- Narrative + State Change Proposal 수신
- Validator → commit/replan

### Milestone 4 — S01 Regression
- 실제 S01 일부 상황 재현
- 위치/시간/복수선택/상태표 오류 검사

### Milestone 5 — New Season Pilot
- 검증 후 신규 시즌에 제한 적용
- 기존 ChatGPT-only 플레이와 재미·오류율 비교

Milestone 5 이전에는 대형 제품화 기능을 추가하지 않는다.
