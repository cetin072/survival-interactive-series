# Thin Engine Web Game v0.1

상태: IMPLEMENTATION-READY DESIGN
목적: Thin Engine v0.1을 **인터넷만 연결되면 PC·모바일 브라우저에서 바로 플레이할 수 있는 개인용 웹게임**으로 구현한다.

상위 기준:
- `docs/THIN_ENGINE_SPEC_V0_1.md`
- `runtime/GM_KERNEL.md`
- `core/PERSISTENT_CANON.md`

---

## 1. 제품 목표

v0.1의 목표는 게임을 상용 제품으로 만드는 것이 아니다.

핵심:
> **플레이어는 URL만 열어 쉽게 게임하고, 프로그램은 기억·상태·검증·MUD 표현을 담당하며, AI GM은 세계·인물·사건·반응에 집중한다.**

성공한 v0.1은 다음을 만족한다.
- 별도 프로그램 설치 없이 웹브라우저에서 실행
- PC와 모바일 모두 사용 가능
- 숫자 버튼 + 키보드 숫자 + 자유입력 모두 지원
- 다른 기기에서도 같은 개인 세이브를 이어갈 수 있음
- 현재 위치·가족·차량·시간 등 사실관계를 프로그램이 관리
- AI GM의 상태 변경은 Validator 승인 후에만 반영
- MUD 상태판은 Renderer가 자동 표시
- GitHub는 실시간 DB가 아니라 장기 Canon/회고 저장소로 유지

---

## 2. v0.1 사용자 범위

### 포함
- 사용자 1명
- 개인용 단일 플레이
- 하나의 Active Save
- 필요 시 최근 Checkpoint 몇 개
- PC/모바일 브라우저 접속

### 제외
- 회원가입
- 다중 사용자 계정
- 공개 서비스
- 친구 초대
- 멀티플레이
- 관리자 CMS
- 결제
- 랭킹
- 커뮤니티

**개인 취미 보조도구라는 경계를 유지한다.**

---

## 3. 권장 기술 구조

### Frontend
- React
- TypeScript
- Vite
- 모바일 우선 반응형 UI

### Hosting / Backend
- Netlify 정적 배포
- Netlify Functions — AI 호출, 저장/불러오기, 세션 처리
- Netlify Blobs — 개인 Active Save와 Checkpoint 저장

### AI
- OpenAI API
- 서버 Function에서만 호출
- 구조화 출력(JSON Schema)을 사용해 Narrative / Choices / State Proposal을 분리

### 장기 기록
- GitHub `cetin072/survival-interactive-series`

구조:

```text
PLAYER
  ↓
WEB BROWSER
  ├─ MUD Renderer
  ├─ Choice Buttons
  └─ Free Input
  ↓
NETLIFY FUNCTION /api/game-turn
  ├─ Input Parser
  ├─ Game Controller
  ├─ Validator
  ├─ AI GM Call
  └─ State Commit
  ↓
NETLIFY BLOBS
  ├─ Active Public Live State
  ├─ Hidden Live State
  └─ Checkpoints

GitHub
  └─ Canon / Season Final / Design / Retrospective
```

---

## 4. 중요한 보안/상태 분리

### Browser에 있어도 되는 것
- 플레이어에게 이미 공개된 Live State
- 현재 장면
- 선택지
- 공개 로그
- UI 표시용 상태

### Browser에 보내면 안 되는 것
- 미래 이벤트
- 재난의 실제 숨은 원인
- 미확인 도로/시설 실제 상태
- 가족/인물의 숨은 우선순위
- pending consequences
- GM 판정용 Hidden State
- OpenAI API Key

Hidden State는 서버 측 저장소에서만 읽고 AI GM Function으로 전달한다.

핵심:
`플레이어 화면용 Public State`와 `GM용 Hidden State`를 물리적으로 분리한다.

---

## 5. 개인 접속 방식

v0.1에서는 정식 계정 시스템을 만들지 않는다.

권장:
1. 게임 URL 접속
2. 개인 접근코드 입력
3. 서버가 접근코드를 확인
4. 성공하면 세션 쿠키 발급
5. 이후 같은 브라우저에서는 바로 게임 진입

접근코드 원문을 저장소에 커밋하지 않는다.
서버 환경변수/배포 환경에서만 관리한다.

목적은 상용 수준 계정 보안이 아니라 **개인 세이브를 아무 방문자나 수정하지 못하게 하는 최소 보호**다.

---

## 6. 클라우드 세이브

웹게임의 실질적인 편의를 위해 v0.1부터 Cloud Save를 포함한다.

### Active Save
항상 최신 플레이 상태 1개.

서버 저장 예:
```text
store: survival-game
key: active/public
key: active/hidden
```

### Checkpoint
의미 있는 변화에서만 생성.
예:
```text
checkpoint/S06/P1-001/public
checkpoint/S06/P1-001/hidden
```

### 저장 시점
- 매 행동 후 Active Live State 저장
- Phase 전환
- 가족 큰 분리/합류
- 주요 거점/관계/자산 변화
- 세션 종료
에는 Checkpoint 생성 가능

### GitHub와 차이
Netlify 저장 = 실제 플레이 중 빠른 현재 상태.
GitHub = 장기 Canon과 시즌 결과.

매 턴 GitHub commit은 하지 않는다.

---

## 7. Live State v0.1 — Public

최소 권장 구조:

```json
{
  "version": 1,
  "season_id": "S06",
  "scene_id": "scene_001",
  "clock": {
    "day": 1,
    "date": "YYYY-MM-DD",
    "time": "17:40",
    "phase": "P1"
  },
  "player_location": "회사",
  "party": {
    "player": {"location": "회사", "status": "normal"},
    "wife": {"location": "도심 아파트", "status": "normal"},
    "son": {"location": "학교", "status": "normal"},
    "father": {"location": "외곽거점", "status": "normal"}
  },
  "vehicles": {},
  "bases": {},
  "resources": {},
  "institutions": {},
  "routes_known": {},
  "active_actions": [],
  "completed_actions": [],
  "public_world": {},
  "last_change": {},
  "renderer_flags": {}
}
```

원칙:
- 현재 선택에 필요하지 않은 세부 수치를 만들지 않는다.
- 동일 사실을 여러 곳에 중복 저장하지 않는다.
- 위치/소유권/동행 등 오류가 자주 발생했던 값은 구조화한다.

---

## 8. Hidden Live State v0.1

기존 시즌 `GM_STATE.json`을 런타임에 맞게 읽어 사용하는 서버 전용 상태다.

최소 범위:
```text
world_truth
external_pressures
future_events
route_truth
institution_truth
hidden_character_state
pending_consequences
intel_truth_map
phase_transition_conditions
```

모든 과거 시즌 이야기를 넣지 않는다.
현재 시즌 판정에 필요한 숨은 사실만 유지한다.

---

## 9. 웹 화면 구조

### 기본 원칙
- 한 화면에서 장면과 선택이 바로 읽혀야 함
- 휴대폰 한 손 조작 가능
- 전체 HUD를 매턴 반복하지 않음
- 텍스트 게임의 빠른 템포 유지

### 화면

```text
┌─────────────────────────┐
│ DAY 01 · 17:40          │
│ 회사 · 도심             │
├─────────────────────────┤
│                         │
│ 장면 본문               │
│ AI GM의 사건/대사       │
│                         │
├─────────────────────────┤
│ FAMILY / RESOURCE       │ ← 필요할 때만
├─────────────────────────┤
│ 1. ...                  │
│ 2. ...                  │
│ 3. ...                  │
│ 4. ...                  │
├─────────────────────────┤
│ 자유행동 입력...   [전송]│
└─────────────────────────┘
```

### 데스크톱
- 중앙 게임 칼럼
- 최대 폭을 제한해 긴 문장이 과도하게 늘어지지 않게 함
- 과거 로그는 위로 스크롤

### 모바일
- 선택 버튼 크게
- 자유입력창 하단 고정 또는 장면 바로 아래 유지
- 핵심 상태만 압축 표시
- 메뉴 탐색 없이 바로 플레이 가능

---

## 10. MUD Presentation Layer

Renderer는 AI GM이 직접 레이아웃을 만드는 것을 최소화한다.

### 자동 표시
- Scene Header
- 필요 시 Family
- 필요 시 Resource
- AUTO
- EVENT
- PHASE CHANGE
- Change Log
- 정보 출처 태그

### 노출 조건
- 가족 분산/위치 변화가 현재 결정에 중요 → FAMILY
- 자원 단계 변화/임계점 → RESOURCE
- 긴 시간점프 → AUTO
- 중요한 외생사건 → EVENT
- Phase 변경 → PHASE CHANGE
- 큰 결과 → CHANGE LOG

### 시각 스타일
- 현대적인 터미널/MUD 느낌
- 과도한 장식 없음
- 글자 가독성 최우선
- 아이콘은 물/전력/연료/통신/차량 등 핵심 상태에만 제한적으로 사용
- 실제 AI 삽화는 v0.1 범위 밖

---

## 11. 입력 UX

### 버튼
AI GM이 만든 3~4개 선택을 큰 버튼으로 표시.

### 숫자키
PC에서는 `1`, `2`, `3`, `4` 키로 즉시 선택 가능.

### 복수선택
UI에서도 순서를 만들 수 있지만 처음부터 복잡한 드래그 UI를 만들지 않는다.

v0.1 기본:
- 자유입력으로 `3 → 2 → 1`
- 또는 선택 버튼을 `추가 선택` 방식으로 큐에 넣는 최소 UI

### 자유행동
항상 가능.
선택지에 없는 행동을 자연어로 입력 가능.

핵심:
`버튼은 편의 기능이고 자유행동은 게임의 핵심 능력이다.`

---

## 12. AI GM API Contract

서버가 AI GM에 전달:
- Runtime Kernel 요약
- Persistent Canon Snapshot
- Public Live State
- Hidden Live State
- 최근 장면 요약
- 플레이어 입력

AI GM의 구조화 출력:

```json
{
  "narrative": "...",
  "dialogue": [],
  "choices": [
    {
      "id": 1,
      "label": "...",
      "action_intent": {}
    }
  ],
  "state_proposal": {},
  "world_proposal": {},
  "event_type": "normal"
}
```

중요:
- AI는 Live State를 직접 commit하지 않는다.
- AI 선택지도 플레이어에게 보이기 전에 Validator 검사를 받을 수 있다.
- 구조가 맞지 않거나 상태 충돌이면 재생성 또는 최소 조정한다.

---

## 13. 한 턴 처리 순서

```text
1. 플레이어 입력
2. Input Parser
3. 기존 Action Queue 확인
4. 현재 Public/Hidden State 로드
5. AI GM 호출
6. AI Narrative + Choice + State Proposal 수신
7. Validator 검사
8. 충돌이면 재계획/조정
9. 승인된 State만 Commit
10. Cloud Active Save 저장
11. Renderer가 화면 구성
12. 플레이어에게 출력
```

복수행동이면 각 행동 사이에 4~10 과정을 필요한 수준으로 반복한다.

---

## 14. Validator v0.1 우선순위

S01~S05 실제 오류를 우선 차단한다.

P0 — 반드시 막기:
1. 가족 위치 모순
2. 동행 관계 모순
3. 차량 위치/사용자 모순
4. 시간 역행
5. 완료 행동 반복
6. 진행 행동과 새 행동 충돌
7. 기관 권한 오류
8. Canon 소유권/거점 능력 임의 변경
9. 복수행동 후속 행동 가능 여부 미재검사
10. AI State Proposal의 `from` 값 불일치

창작 품질은 Validator가 평가하지 않는다.

---

## 15. 구현 Milestone

### M0 — Web Shell
- React/Vite/TypeScript
- 모바일/PC MUD 화면
- 가짜 장면 데이터
- 선택버튼 + 자유입력

성공조건:
URL에서 열었을 때 실제 게임처럼 보임.

### M1 — State Engine
- Public Live State schema
- 상태 갱신 함수
- 시간/위치/차량
- Local test fixture

성공조건:
AI 없이도 버튼 선택으로 상태가 일관되게 변함.

### M2 — Validator
- P0 검사 10개
- 자동 테스트

성공조건:
의도적으로 잘못된 상태변경을 차단.

### M3 — Cloud Save + Personal Access
- Netlify Functions
- Netlify Blobs
- 개인 접근코드
- Active Save 저장/불러오기

성공조건:
PC에서 저장한 상태를 모바일에서도 이어서 불러올 수 있음.

### M4 — MUD Renderer
- 조건부 FAMILY/RESOURCE
- AUTO/EVENT/PHASE CHANGE
- Change Log

성공조건:
AI가 상태창을 직접 쓰지 않아도 현재 상태가 읽힘.

### M5 — AI GM Integration
- OpenAI API 서버 호출
- Structured Output
- State Proposal
- Validator → Commit 루프

성공조건:
자유행동과 AI 선택지가 실제 State Engine과 연결됨.

### M6 — S01 Regression Test
- S01 「불길」 일부 장면 재현
- 위치/합류/차량/복수행동 테스트
- 기존 ChatGPT 플레이에서 났던 종류의 오류 재검사

성공조건:
핵심 상태 오류 없이 여러 장면 진행 가능.

### M7 — New Season Trial
- S06 또는 다음 신규 시즌 일부를 실제 웹엔진에서 플레이

성공조건:
엔진이 GM의 창작 부담을 줄이고 플레이 재미를 해치지 않음.

---

## 16. 구현 폴더 권장

현재 저장소 안에 둔다.

```text
engine/
  web/
    src/
      components/
      renderer/
      state/
      input/
      api/
  core/
    schemas/
    validator/
    controller/
    tests/
  netlify/
    functions/
```

기존 `core/`, `runtime/`, `seasons/`, `players/`와 역할을 섞지 않는다.

---

## 17. v0.1에서 하지 않을 것

- 정식 회원가입
- 멀티유저
- 공개 게임서비스
- 결제
- AI 이미지 생성
- 2D/3D 지도
- 정밀 인벤토리
- 캐릭터 능력치 RPG
- 복잡한 전투 시스템
- 앱 설치형 클라이언트
- 관리자 도구
- GitHub 매턴 commit

필요가 증명되기 전에는 만들지 않는다.

---

## 18. 최종 개발 원칙

> **프로그램은 기억·검사·표현을 한다.**
>
> **AI는 세계·사람·사건을 만든다.**
>
> **플레이어는 판단한다.**

웹엔진은 AI GM을 대체하는 것이 아니다.
AI GM이 기억과 UI 작업에 에너지를 쓰지 않고 재미있는 세계반응에 집중하도록 만드는 보조 시스템이다.

v0.1 성공 후에도 자동으로 제품화하지 않는다.
`재미 증가 / 오류 감소 / 조작 편의`가 실제 플레이에서 확인됐을 때만 다음 단계를 검토한다.
