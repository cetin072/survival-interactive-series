# 《생존일기》 Conversational AI-Native IP Production System
## External AI Audit Brief

Status: **AUDIT INPUT / CRITIQUE REQUEST**
Audience: 외부 AI, AI 시스템 설계자, 인터랙티브 픽션/게임 설계자, 지식관리·RAG·상태관리 설계자, IP 제작 파이프라인 설계자
Snapshot date: 2026-09-24
Primary repository: `cetin072/survival-interactive-series`
Current deep-play worldline: `AFTERFALL`
Current protagonist: `서진우` — 《생존일기》 Chronicle 03
Current AFTERFALL runtime game time: `2026-11-26 09:12`

---

# 0. 이 문서를 읽는 외부 AI에게

이 문서는 우리가 만든 방식을 자랑하거나 정당화하기 위한 문서가 아니다.

목적은 반대다.

> **현재 구조를 최대한 정확히 노출하고, 외부 AI가 “이 정도까지 해놓고 왜 더 좋은 이 방법을 안 쓰고 있지?”라고 공격적으로 지적할 수 있게 만드는 것**이 목적이다.

특히 다음 종류의 피드백을 원한다.

- 우리가 당연하다고 생각한 구조가 사실 불필요하게 복잡한가?
- 문서를 너무 많이 만들고 있는가?
- 반대로 구조화해야 할 것을 Markdown과 자연어에 너무 많이 맡기고 있는가?
- Supabase JSONB 한 행에 너무 많은 책임을 몰아넣고 있는가?
- Event sourcing, snapshot, schema validation, graph model, RAG, embedding, state machine, ECS, rules engine, workflow engine 등 더 맞는 구조가 있는가?
- LLM에게 직접 상태변경 권한을 주는 현재 방식이 위험한가?
- “AI GM의 창작 자유”와 “결정론적 상태 엔진”의 경계를 더 잘 나눌 수 있는가?
- 장기 IP를 만들면서 Canon drift, character drift, world drift, branch drift를 더 싸고 확실하게 막을 방법이 있는가?
- 대화 자체가 게임이면서 동시에 IP 제작실인 이 방식에서 아직 활용하지 못하는 AI-native 제작법이 있는가?
- 시즌 수십 개, 주인공 수십 명, 세계선 수십 개가 되어도 이 구조가 버틸 수 있는가?
- 향후 웹소설·웹툰·게임·영상으로 확장할 때 지금부터 다른 형태로 데이터를 남겨야 하는가?
- 테스트, 평가, 품질측정, 회귀검증을 더 자동화할 수 있는가?
- 우리가 설계한 Thin Engine을 실제로 만드는 것이 맞는가, 아니면 지금 Conversation + DB 방식이 더 좋은가?
- “굳이 직접 개발하지 말고 이미 존재하는 도구/패턴을 쓰면 되는 것”이 무엇인가?

**칭찬보다 누락된 선택지를 원한다.**
현재 시스템을 전제로 미세 개선만 하지 말고, 필요하면 구조 자체를 갈아엎는 대안도 제시해 달라.

---

# 1. 프로젝트를 한 문장으로 설명하면

《생존일기》는 단순한 ChatGPT 역할극이 아니다.

현재 우리가 시도하는 것은:

> **사용자와 AI가 장기간 대화형 생존 RPG를 실제로 플레이하면서, 그 플레이에서 세계관·캐릭터·사건·관계·시스템 규칙을 발견하고, 동시에 그 결과를 장기 Canon과 재사용 가능한 IP 자산으로 축적하는 Conversational AI-Native IP Production 방식**이다.

즉 한 번의 대화가 동시에 다음 역할을 한다.

1. 게임 플레이
2. 즉흥 서사 생성
3. 장기 캐릭터 개발
4. 세계관 개발
5. 플레이테스트
6. 게임 시스템 테스트
7. 사용자 취향 발견
8. Canon 확정
9. 시즌 아카이브
10. 차후 웹소설/웹툰/게임/영상용 IP 소재 생성

전통적인 순서는 보통:

`기획 → 설정집 → 시나리오 → 제작 → 플레이테스트`

인데, 우리는 상당 부분을 뒤집고 있다.

`최소 세계골격 → 실제 플레이 → 발견 → 검증 → Canon 승격 → IP 자산화`

를 반복한다.

핵심 문장:

> **세계는 먼저 존재하고, 이야기는 플레이로 생긴다.**

그리고:

> **설정은 먼저 전부 쓰지 않고, 플레이에서 가치가 증명된 것만 장기 정본으로 승격한다.**

---

# 2. IP 전체 구조

현재 확인된 주인공 연대기는 다음과 같다.

| Chronicle | Protagonist | Runtime / Worldline | 비고 |
|---|---|---|---|
| 01 | 한준호 | Legacy / 가족 기반 Chronicle | 아내·아들·아버지와 가족 파티 |
| 02 | 박도현 | STRONGHOLD | 독립 worldline |
| 03 | 서진우 | AFTERFALL | 현재 가장 깊게 플레이 중인 독립 worldline |

최상위 정체성 registry:

`SURVIVAL_DIARY_IP_BIBLE.md`

Worldline routing:

`WORLDLINE_ROUTER.md`

우리는 주인공마다 현재 상태가 섞이는 것을 가장 큰 장기 리스크 중 하나로 봤고, 명시적인 worldline / branch / boot routing을 만들었다.

---

# 3. 현재 실제 플레이 방식

현재 AFTERFALL은 별도의 완성 웹게임이나 전통적인 게임 클라이언트가 아니다.

**실제 운영 스택은 다음 세 층이다.**

```text
PLAYER
  ↕ natural language / numeric choices
ChatGPT
  ├─ GM / narrator
  ├─ world simulator
  ├─ NPC actor
  ├─ rules interpreter
  ├─ continuity checker
  ├─ archive / canon editor
  └─ tool operator
       ↕
Supabase Runtime State
       ↕
GitHub Canon / Design / Archive
```

### 플레이어 입력

입력 문법은 일부러 단순하게 유지한다.

- 숫자 선택: `2`
- 순차 복수선택: `3 → 5 → 1`
- 자유행동 자연어
- 역할분담 자연어
- `ㄱ` 같은 진행 명령

기본 원칙:

> **복잡한 세계, 단순한 입력**

플레이어에게 명령어 문법, 캐릭터별 세부 메뉴, 대형 인벤토리 UI를 요구하지 않는다.

### 출력

기본 시각층은 텍스트 MUD다.

필요할 때만:
- Scene Header
- WORLD STATE
- RESOURCE
- EVENT
- AUTO
- PHASE CHANGE
- 정보원 태그

를 사용한다.

모든 상태를 매 턴 HUD처럼 노출하지 않는다.

---

# 4. 게임의 핵심 디자인 원칙

## 4.1 세계는 플레이어를 기다리지 않는다

재난, 도로, 행정, 병원, 물류, 날씨, 타 집단은 플레이어가 행동하지 않아도 움직인다.

좋은 플레이는:
- 피해를 줄이고
- 시간을 벌고
- 선택지를 늘리고
- 사람을 구할 여유를 만든다.

하지만 좋은 플레이가 세계의 메인 거시사건 자체를 삭제하지는 않는다.

반대로 난이도 보정을 위해 이미 획득한 태양광, 식량, 관계, 거점 등을 임의 고장내는 것도 금지한다.

핵심:

> **준비는 보상받고, 세계는 계속 움직인다.**

## 4.2 강제 실패보다 강제 비용

좋은 선택을 했다는 이유로 모든 것을 공짜로 얻지 않는다.

시간, 거리, 피로, 물자, 기회, 관계가 비용이다.

순차 복수선택은 단순한 “좋은 선택 전부 실행”이 아니라 행동 큐다.

## 4.3 해결된 하위 문제는 자동화한다

초기:
- 물 몇 L
- 식량 며칠분
- 연료 몇 단위

가 중요할 수 있다.

하지만 공급망과 담당자가 만들어지면 같은 계산을 매 턴 반복하지 않는다.

Resource resolution:

- SCARCITY
- MANAGED
- STABLE

로 해상도를 바꾼다.

안정된 문제는 AUTO로 내려가고, 새로운 병목만 다시 확대한다.

## 4.4 반복 장면을 압축한다

첫 경험은 자세히.
두 번째는 차이와 학습.
세 번째 이후 새 정보가 없으면 압축.

예:
- 첫 거래: 직접 장면
- 거래망 형성: 변화 확인
- 반복 거래: AUTO
- 공급망 붕괴: 다시 직접 플레이

## 4.5 무료 정답 없음

중요 선택은 가능한 한:

- 좋은 것 A를 선택하면 좋은 것 B의 비용이 생기거나
- 안전을 선택하면 영향력을 잃거나
- 사람을 받으면 소비와 보안부담이 늘거나
- 거점을 숨기면 정보와 네트워크가 줄어드는

구조를 선호한다.

---

# 5. Hidden World Seed 방식

우리는 완성 대본을 미리 쓰지 않는다.

시즌 시작 전 AI GM이 비공개로 최소한만 잠근다.

예:
- 재난의 실제 성격
- 시작 인프라 상태
- 핵심 외생압력 2~3개
- 주요 장소의 실제 상태
- 일부 NPC의 독립 목표
- 조건부 사건
- Phase 전환 조건
- 정보원별 실제 진실

하지만 다음은 미리 확정하지 않는다.

- 정답 루트
- 반드시 거쳐야 하는 장면 순서
- 확정 클라이맥스
- 확정 엔딩
- 특정 인물의 확정 사망 목록
- 플레이어 선택을 무시하는 강제 손실 목록

따라서 Story Script보다 **World State + Pressure + Conditional Consequence**를 먼저 만든다.

---

# 6. AFTERFALL의 현재 세계 엔진

AFTERFALL은 Chronicle 03, 서진우 worldline이다.

핵심 세계 명제:

> **문명은 한순간 사라지는 것이 아니라 조각난다.**

행정, 소방, 의료, 전력, 통신, 화폐, 도로는 서로 다른 속도로 망가진다.

현재 세계는 완전 무정부가 아니지만, 장기 장르 방향은:

1. 정상사회 균열
2. 지역별 Patchwork Response
3. 유지되는 듯한 국가기능
4. 국가기능의 급격한 실효성 붕괴
5. 주민이 체감하는 사실상 무정부
6. 지역별 새 질서
7. Post-Apocalypse Local Order Era

로 설계되어 있다.

정확한 촉발사건·날짜·피해는 GM-only이며 플레이 전에 공개하거나 완성대본으로 잠그지 않는다.

---

# 7. World Pressure Engine

현재 AFTERFALL에는 8개 Pressure Track을 사용한다.

```text
FOOD
WATER
POWER
FUEL
HEALTH
ORDER
MIGRATION
TRUST
```

단계:

`0 STABLE → 1 UNEASY → 2 PRESSURE → 3 SEVERE → 4 FAILURE`

현재 snapshot:

| Track | Level |
|---|---:|
| FOOD | 2 |
| WATER | 2 |
| POWER | 3 |
| FUEL | 3 |
| HEALTH | 2 |
| ORDER | 2 |
| MIGRATION | 3 |
| TRUST | 2 |

Pressure는 서로 연결된다.

예:

```text
POWER ↓
 → WATER ↓
 → HEALTH ↓
 → MIGRATION ↑
 → ORDER ↓
 → TRUST ↓
```

겨울은 별도 이벤트가 아니라 여러 Pressure를 동시에 흔드는 multiplier처럼 사용한다.

현재 major scene 기본식:

> **2+ WORLD PRESSURES + 1 NPC INTERNAL CONFLICT + 1 RELATIONSHIP/REPUTATION CONSEQUENCE + NO FREE OPTIMAL SOLUTION**

---

# 8. 캐릭터 생성/운영 방식

## 8.1 플레이어 캐릭터

AFTERFALL의 서진우는 사용자가 직접 플레이한다.

따라서 GM이 다음을 고정하지 않는다.

- 성격
- 도덕관
- 연애성향
- 정치적 입장
- 특정 인물에 대한 호감
- 위험을 대하는 고정 태도

고정하는 것은:
- 이름
- 나이
- 직업
- 외형
- 이미 실제 플레이에서 한 행동
- 획득한 능력·관계·평판

이다.

이를 `PLAYER_AUTHORED`로 본다.

## 8.2 NPC Character Engine

반복 NPC 행동 공식:

```text
DESIRE
+ FEAR
+ CONTRADICTION
+ ACTIVE TRAITS
+ RELATIONSHIP LENS
+ CURRENT PRESSURE
→ BEHAVIOR
```

NPC에게 다음을 둔다.

- Core Desire
- Core Fear
- Contradiction
- Active Strength
- Active Shadow
- Stress Response
- Boundary
- Tell
- Private Life
- Relationship Lens
- Arc State

### Strength / Shadow

처음에는 “장점 3 / 단점 2”를 검토했지만 현재는 **전체 인격 수치가 아니라 active slot**으로 사용한다.

CORE:
- Strength 3
- Shadow 2

Major recurring:
- Strength 2~3
- Shadow 1~2

숫자 자체보다 “현재 장면에서 GM이 기억해야 하는 성향의 수”가 핵심이다.

Shadow는 단순 악성 단점이 아니다.

예:
- 책임감 → 혼자 떠안음
- 용기 → 철수 지연
- 계획성 → 통제욕
- 공감 → 사람을 못 버림

이라는 식으로 강점이 압박 속에서 비용을 만들 수 있다.

### NPC 독립성

진우가 없는 곳에서도 NPC끼리:
- 친해짐
- 갈등
- 화해
- 호감
- 연애감정
- 거리두기
- 독립행동

이 가능하다.

단 자동커플, 자동배신, 자동영입, 확정 관계결과는 금지한다.

---

# 9. 현재 캐릭터 데이터의 두 층

### GitHub

`worldlines/AFTERFALL/CHARACTER_BIBLE.md`

사람이 읽는 장기 정본.

### Supabase

`state.character_bible`

런타임에서 장면 전에 읽기 쉬운 구조화 데이터.

또 별도:

`state.known_characters`

에는 현재까지 플레이에서 실제 확인된 역할, 외모 anchor, 관계 메모 등이 들어 있다.

즉 현재는:

```text
Character Bible = relatively stable psychology/design
Known Characters = discovered/current factual profile
Events = how relationship/history changed
```

를 분리하려고 한다.

---

# 10. 현재 Runtime 데이터 저장 구조

Supabase project:

`taejang-phase1-staging`

Schema:

`survival_rpg`

현재 핵심 table은 2개다.

## 10.1 saves

Primary key:

`worldline_id`

AFTERFALL은 현재 한 행의 JSONB snapshot으로 관리된다.

현재 Save version:

`201`

현재 주요 `state` top-level keys:

```text
bases
body
character_bible
factions
flags
gear
known_characters
known_world
learned_principles
party
player
quests
recent_events
resource_resolution
runtime_preferences
season
status
supplies
vehicles
villains
world_bible
world_phase
worldline
```

## 10.2 gm_state

플레이어에게 직접 노출하면 안 되는 상태.

현재 주요 keys:

```text
current_scene
hidden_flags
narrative_constraints
npcs
pending_consequences
season_status
season2_hidden_design_policy
world_engine_v1
world_seed
```

## 10.3 events

중요 사건을 append-style history로 기록.

현재 AFTERFALL event count snapshot:

`252`

Events는 현재 상태의 Source of Truth가 아니다.

역할:

- 중요한 역사
- state_delta
- continuity correction
- meta canon update
- season event
- 관계/세계 변화 근거

현재 상태는 `saves`, 역사는 `events`라는 구분이다.

---

# 11. 현재 실제 Runtime 처리 흐름

대략 다음과 같다.

```text
1. User input
2. Worldline routing
3. Boot documents load
4. Supabase current Save read
5. User intent interpretation
6. Current world + NPC + resource constraints evaluation
7. Narrative result generation
8. Choice gate or natural continuation
9. Meaningful delta 판단
10. Supabase Save update
11. 중요하면 Event append
12. 장기 변화면 GitHub Canon / Checkpoint 동기화
```

중요:

현재 실제 운영에서는 **AI가 tool을 이용해 Supabase를 직접 읽고 쓰는 구조**다.

아래 Thin Engine 목표처럼 독립 Validator가 모든 state transition을 승인하는 구조는 아직 아니다.

---

# 12. Source of Truth 계층

AFTERFALL에서 의도하는 현재 우선순위:

```text
사용자 최신 명시교정
  >
Supabase current Save
  >
현재 턴에서 확정된 Delta
  >
Current Checkpoint
  >
Persistent Canon / Character Bible / World Bible
  >
Season Archive
  >
오래된 Design / Planning
  >
AI 기억
```

Worldline routing은 별도로:

```text
SURVIVAL_DIARY_IP_BIBLE
→ WORLDLINE_ROUTER
→ worldline branch
→ START_ROOM / BOOT
→ CURRENT_STATE
→ current checkpoint
→ Supabase
```

을 사용한다.

---

# 13. GitHub 문서 구조

## Root / IP level

### `SURVIVAL_DIARY_IP_BIBLE.md`
전체 주인공 Chronicle registry.

### `WORLDLINE_ROUTER.md`
잘못된 worldline fallback 방지.

### `START_HERE.md`
Legacy/default runtime의 기본 부팅.

## AFTERFALL branch

Branch:

`worldline/afterfall-rpg`

Root:

`worldlines/AFTERFALL/`

핵심:

```text
START_ROOM.md
BOOT.md
RPG_DESIGN_V1.md
CHARACTER_BIBLE.md
WORLD_BIBLE.md
PERSISTENT_CANON.md
SAVE_SCHEMA_V1.md
CURRENT_STATE.json
CHARACTER_VISUAL_RULE_V1.md
EMERGENT_SURVIVAL_LEARNING_V1.md
ADAPTIVE_RESOURCE_RESOLUTION_V1.md
NARRATIVE_PACING_ESCALATION_V1.md
NEXT_CHAT_PROMPT.md
```

시즌:

```text
seasons/
  S01/
    ARC_ARCHIVE.md
    END_STATE.json
    FEEDBACK.md
    IP_PACKAGE.md
    RETROSPECTIVE.md
    SURVIVAL_DEBRIEF.md
    raw_transcript/
      INDEX.md

  S02/
    START_HANDOFF.md
    START_STATE.json
    CURRENT_CHECKPOINT.md
```

현재 branch snapshot은 main과 diverged 상태이며, 감사 시점 기준:

- AFTERFALL branch: main보다 56 commits ahead
- 3 commits behind

이다.

이 branch divergence 자체도 감사 대상이다.

---

# 14. 문서를 모두 읽지 않는 방식

이 프로젝트는 문서가 많아질수록 “정확성을 위해 전부 읽는 것”이 오히려 실패한다고 본다.

그래서 **Load Map / Boot Budget** 개념을 쓴다.

원칙:

> **필요한 최소 정본만 읽고 플레이를 시작한다.**

예를 들어 AFTERFALL current continuation은:

```text
START_ROOM
BOOT
RPG_DESIGN
CHARACTER_BIBLE
WORLD_BIBLE
CURRENT_STATE
CURRENT_CHECKPOINT
Supabase Save
필요 시 recent Events
```

정도로 제한한다.

RAW Transcript 전체는 정상 부팅에 읽지 않는다.

오래된 Season Archive도 현재 상태로 사용하지 않는다.

이유:
- context 비용
- 오래된 사실의 현재값 오염
- AI가 과거 계획을 현재 Canon으로 착각하는 문제
- 모든 문서를 읽을수록 중요도 구분이 흐려지는 문제

---

# 15. CURRENT_STATE의 역할

GitHub의 `CURRENT_STATE.json`은 런타임 복제본이 아니다.

현재는 **Boot Pointer / Index** 역할이다.

예:
- current protagonist
- season
- current checkpoint path
- character bible path
- world bible path
- Supabase source location

실시간 동적 상태는 Supabase에서 읽는다.

이렇게 한 이유는 같은 현재 상태를 GitHub와 DB에 이중으로 계속 수정하면서 drift하는 것을 줄이기 위해서다.

---

# 16. 시즌 종료 파이프라인

시즌이 끝나면 대화 전체를 하나의 요약문으로 뭉개지 않는다.

정보를 목적별로 나눈다.

## RAW Transcript

실제 user / GM 원문.

Cold Archive.

정상 boot 입력이 아니다.

접근 불가능한 원문은 AI 기억으로 재구성하지 않는다.

현재 AFTERFALL S01은 초반 원문 일부가 완전하지 않아서:

`BACKFILL REQUIRED`

상태를 명시적으로 유지한다.

## ARC / Playthrough Canon

실제로 일어난 사건을 압축.

## END_STATE

구조화된 종료 상태.

## PERSISTENT_CANON

다음 시즌까지 살아남는 지속 사실만.

## SURVIVAL_DEBRIEF

현실 생존 관점 복기.

## RETROSPECTIVE

게임 디자인 / GM 품질 복기.

## FEEDBACK

사용자의 플레이 피드백.

## IP_PACKAGE

- 로그라인
- 강한 장면
- 캐릭터 아크
- 재사용 가능한 사건 원형
- 웹소설/웹툰/게임/영상 각색 가치

## START_HANDOFF / START_STATE

다음 시즌이 과거 전체 로그를 읽지 않고 시작할 수 있게 하는 인수인계.

핵심 철학:

> **원문은 보존하고, Canon은 압축하고, 다음 시즌은 가볍게 시작한다.**

---

# 17. 대화 자체를 IP 제작실로 쓰는 방법

이 시스템의 중요한 특징은 플레이와 제작회의가 분리되어 있지 않다는 것이다.

플레이 중 사용자에게 다음과 같은 피드백이 자연스럽게 나온다.

예:
- NPC 말투가 관계와 맞지 않는다.
- 아포칼립스 강도가 약하다.
- 파밍이 반복된다.
- 정부가 너무 잘 버틴다.
- 이 NPC는 기능만 있고 사람이 아니다.
- 이 그림 분위기가 좋다.
- 이런 선택은 너무 정답형이다.
- 주인공 행동을 GM이 강제하면 안 된다.

이 피드백을 단순 채팅 취향으로 소비하지 않고 단계적으로 처리한다.

```text
User feedback
→ bug / preference / canon / design issue 분류
→ 현재 장면 즉시 수정
→ 반복될 문제인지 판단
→ 필요 시 Runtime Rule 승격
→ 필요 시 Character / World Bible 승격
→ 필요 시 Supabase State / Event 기록
→ 시즌 종료 시 Retrospective / IP Package로 압축
```

즉 사용자는 단순 플레이어가 아니라 동시에:
- 편집자
- 기획자
- 감독
- 플레이테스터
- IP 소유자

역할을 한다.

AI는:
- GM
- 즉흥 작가
- 시뮬레이터
- continuity editor
- data operator
- archive assistant

역할을 동시에 수행한다.

---

# 18. “플레이에서 발견된 규칙”을 승격하는 방식

우리는 처음부터 모든 규칙을 설계하지 않는다.

예를 들어 실제 플레이에서:
- 쌀은 조리연료가 많이 들어 비효율적인가?
- 거점이 안정되면 매일 kcal를 계산해야 하는가?
- 반복 정기접촉을 계속 장면화해야 하는가?
- NPC가 진우 없을 때도 관계가 변해야 하는가?

같은 문제가 실제로 발생했다.

그때 검증한 결론을:

- `learned_principles`
- `ADAPTIVE_RESOURCE_RESOLUTION`
- `NARRATIVE_PACING_ESCALATION`
- `CHARACTER_BIBLE`

등으로 승격했다.

이 접근은 “설계자가 상상으로 만든 규칙”보다 실제 플레이에서 필요성이 확인된 규칙을 우선한다.

---

# 19. 현실 생존 학습 축

본편을 교육게임처럼 만들고 싶지는 않다.

그래서:

> **설명하지 말고 문제를 준다.**
>
> **정답을 주지 말고 검증하게 한다.**
>
> **배운 것을 저장하고 나중에 다시 써먹게 한다.**

를 원칙으로 한다.

예:
- 물은 확보량보다 운반·정수·재오염이 병목일 수 있음.
- 전력은 발전량보다 부하우선순위가 중요할 수 있음.
- 식량은 kcal뿐 아니라 저장밀도·조리연료·회전율이 중요.
- 의료는 치료가능성뿐 아니라 자원·감염·이송 문제가 존재.
- 조직은 유능한 1인보다 대체담당과 체크리스트가 생존성을 높일 수 있음.

플레이 중 강의하지 않고 사건과 선택으로 발견하게 한다.

---

# 20. IP 재사용 구조

우리는 플레이 로그를 최종 결과물이라고 보지 않는다.

흐름:

```text
RAW PLAY
↓
PLAYTHROUGH / ARC CANON
↓
CHARACTER & WORLD CANON
↓
IP PACKAGE
↓
반복적으로 가치가 증명된 사건 원형 / 캐릭터 / 세계 규칙
↓
Novel / Webtoon / Game / Video / Interactive adaptation
```

현재 AFTERFALL S01 IP Package에는 이미:
- 병원 이탈
- 핵심 4인 형성
- 공공급수 협상
- 두 거점 연합
- 통행관리조의 정당성
- 산림교육원 접촉
- 백운생활관 내부정치 불개입
- 동천교 응급면제

같은 장면 원형이 추출돼 있다.

---

# 21. 현재 구현과 Thin Engine 설계의 차이

이 부분은 외부 감사에서 특히 중요하다.

## 현재 실제 구현

```text
User
→ ChatGPT
→ ChatGPT가 상태 읽기
→ ChatGPT가 판단
→ ChatGPT가 narrative 생성
→ ChatGPT가 필요 시 Supabase 직접 UPDATE / INSERT
```

즉 LLM이 상당한 권한을 갖는다.

## 과거 설계한 Thin Engine v0.1

목표는:

```text
PLAYER
↓
INPUT PARSER
↓
ACTION QUEUE
↓
LIVE STATE
↓
AI GM
↓
STATE CHANGE PROPOSAL
↓
VALIDATOR
↓
COMMIT
↓
MUD RENDERER
```

핵심:

> **AI proposes, engine commits.**

예정 책임분리:

### Program
- current state
- action queue
- time/location
- ownership
- state transition validation
- MUD rendering
- save/load

### AI
- 사건
- 인물
- 대사
- 의미 있는 선택
- 자유행동 해석
- narrative

### Player
- 판단

### GitHub
- long-term canon / design / archive

---

# 22. Thin Engine의 기술 설계 상태

기존 문서에는 아래 기술 구성이 제안되어 있다.

- React
- TypeScript
- Vite
- Netlify Hosting
- Netlify Functions
- Netlify Blobs
- OpenAI API
- JSON Schema structured output

실제 main repository에는 `engine/web/` 구현 코드가 존재한다.

확인된 예:
- `engine/web/package.json` — React/Vite/Vitest 기반 웹 프로젝트
- `engine/web/netlify/functions/gm.ts` — GM transport server boundary
- `engine/web/src/runtime/gmProposal.ts` — GM proposal shape validation
- `engine/web/src/runtime/invariantValidator.ts`
- `engine/web/src/runtime/consistencyValidator.ts`
- `engine/web/src/runtime/stateCompiler.ts`
- `engine/web/src/validator/validateAction.ts`

다만 현재 구현은 주로 Chronicle 01 가족 runtime을 전제로 하며 actor가 `player / wife / son / father`로 고정된 부분이 있다. 또한 `gm.ts`의 현재 기본 backend는 synthetic fixture만 허용하고 real Canon AI GM backend를 활성화하지 않는다.

즉:

> **Thin Engine은 “코드가 없는 설계안”이 아니다. 이미 상당한 validator/runtime 코드가 구현되어 있으나, 현재 AFTERFALL ChatGPT+Supabase 라이브 플레이 경로와 연결되지 않은 별도 runtime 계층이다.**

따라서 감사 핵심 질문은 “Thin Engine을 새로 만들 것인가?”보다 **“이미 만든 validator/runtime을 AFTERFALL의 실제 state mutation 경로와 어떻게 통합하거나 재사용할 것인가?”**다.

외부 감사자는 다음을 평가해 달라.

- 이 엔진을 정말 구현할 가치가 있는가?
- 구현한다면 이 스택이 맞는가?
- Supabase를 이미 사용하는 현재 구조에서 Netlify Blobs는 불필요하지 않은가?
- 별도 엔진 없이 DB constraints + RPC + JSON Schema만으로 충분한가?
- Temporal / XState / event sourcing / Postgres functions / workflow engine 같은 다른 선택이 더 나은가?
- AI의 state proposal을 검증하는 가장 가벼운 방법은 무엇인가?

---

# 23. 현재 우리가 좋다고 생각하는 점

이 부분은 감사자가 동의할 필요가 없다.

현재 내부에서 가치가 있다고 느끼는 부분:

1. **게임과 IP 제작이 같은 데이터에서 시작한다.**
2. 장기 기억을 AI 대화 기억에만 맡기지 않는다.
3. 현재 상태와 과거 역사를 구분한다.
4. Player-visible / Hidden state를 개념적으로 분리한다.
5. 시즌 전체 RAW를 매번 로드하지 않는다.
6. 새로운 worldline이 생겨도 routing이 가능하다.
7. 해결된 생존문제를 AUTO로 내리며 스케일을 키울 수 있다.
8. 사용자 피드백을 실제 시스템 규칙으로 승격할 수 있다.
9. NPC를 역할이 아니라 욕구와 모순으로 움직이게 개선 중이다.
10. 이야기보다 세계 상태를 먼저 만들기 때문에 자유행동 대응력이 높다.
11. 좋은 플레이를 보상하면서도 세계가 자동 우상향하는 것을 막는 구조를 만들 수 있다.
12. 시즌 종료물이 향후 IP 자산으로 직접 연결된다.

외부 감사에서는 이 장점보다 **이 장점을 더 싸고 안정적으로 달성하는 다른 방법**이 있는지 알려달라.

---

# 24. 현재 우리가 이미 알고 있는 약점 / 의심점

아래는 방어하지 않는다.
오히려 더 큰 문제가 있는지 찾아달라.

## 24.1 문서 부채

플레이가 빠르게 진행되면:
- Router
- Current State
- Handoff
- Canon

중 하나가 뒤처질 수 있었다.

최근 AFTERFALL은 한 차례 크게 정리했지만, 구조적으로 다시 발생할 수 있다.

질문:
- 자동 generated index를 만들어야 하는가?
- 문서 front matter / schema를 두어 자동 stale detection 해야 하는가?
- hand-maintained Markdown을 줄여야 하는가?

## 24.2 Branch drift

현재 worldline 전용 branch가 main과 diverged되어 있다.

독립 worldline에 branch를 주는 전략이:
- isolation에는 좋지만
- 공통 rule update 전파
- merge conflict
- 오래된 router
- 공통 tooling 공유

에 부담을 만든다.

질문:
- branch보다 directory isolation이 더 나은가?
- monorepo main-only + worldline folders가 더 나은가?
- worldline branch를 release/archive 용도로만 써야 하는가?

## 24.3 Supabase JSONB 비대화

AFTERFALL Save는 한 row 안에 많은 JSONB state를 가진다.

장점:
- 한 번에 snapshot load
- 자유로운 schema evolution

단점 가능성:
- 부분 update 실수
- 구조적 validation 약함
- 너무 큰 prompt
- 특정 character 조회 비효율
- diff/provenance 불명확
- 동일 field 의미 drift

질문:
- character / relationship / world pressure / quest를 정규화해야 하는가?
- snapshot + normalized tables hybrid가 더 맞는가?
- jsonschema validation을 DB RPC에 넣어야 하는가?

## 24.4 LLM direct write

현재 AI가 직접 SQL UPDATE를 할 수 있다.

위험:
- 잘못된 key overwrite
- mass replacement
- stale read 후 write
- hidden/public 혼합
- event와 snapshot 불일치
- validation 부족

질문:
- 모든 update를 RPC로 제한해야 하는가?
- optimistic concurrency / expected save_version을 강제해야 하는가?
- state proposal queue가 필요한가?
- DB trigger로 event와 snapshot을 atomic하게 묶어야 하는가?

## 24.5 현재 Snapshot과 Event history의 정합성

현재:
- Save = authority
- Events = history

하지만 event를 replay해 Save를 재구성하는 완전한 event sourcing은 아니다.

질문:
- 이 하이브리드가 장기적으로 가장 실용적인가?
- event schema를 강화해야 하는가?
- snapshot corruption recovery 방법이 부족한가?

## 24.6 Canon field provenance 부족

현재 한 설정이:
- 사용자가 직접 확정했는지
- 실제 플레이에서 발생했는지
- AI가 추론해 만들었는지
- meta design에서 추가됐는지

항상 field level로 명확하지는 않다.

질문:
- provenance / confidence / source_event_id / authored_by를 붙여야 하는가?
- 모든 field에 붙이면 오히려 무거운가?

## 24.7 자동 검증/테스트 부족

현재 문서 규칙은 많지만 자동 테스트는 제한적이다.

필요 가능성:
- protagonist/worldline mismatch
- old alias 등장
- dead/absent character 재등장
- current checkpoint가 CURRENT_STATE와 다름
- core four speech regression
- duplicated expert role
- hidden information leaked into public state
- save version stale update
- impossible location

질문:
- 어떤 10개 테스트부터 만드는 것이 ROI가 가장 높은가?
- LLM eval과 deterministic validation을 어떻게 나눌 것인가?

## 24.8 Retrieval / RAG 전략이 아직 수동

현재 boot file path를 명시적으로 읽고 필요한 event를 query한다.

장점:
- 예측 가능
- context contamination 적음

하지만 세계가 커지면:
- 수천 NPC
- 수백 지역
- 수십 시즌
- 수만 event

가 생길 수 있다.

질문:
- vector RAG가 필요한 시점은 언제인가?
- Graph retrieval이 더 맞는가?
- canonical facts에는 semantic search보다 deterministic key lookup이 더 맞는가?
- “RAG를 쓰지 않는 것이 오히려 맞는 영역”은 무엇인가?

## 24.9 Character relationship graph 부재

현재 Relationship Lens는 캐릭터 profile 안에 부분적으로 들어간다.

수십 명이 되면:
- A가 B를 어떻게 보는지
- B가 A를 어떻게 보는지
- 관계 변화 시점
- off-screen contact frequency

를 관리하기 어렵다.

질문:
- relation table / graph DB가 필요한가?
- Postgres edge table이면 충분한가?
- 관계는 수치보다 event-derived view가 나은가?

## 24.10 RAW Transcript 완전성

현재 AFTERFALL S01 일부 원문은 완전 확보되지 않았다.
기억으로 복구하지 않고 누락 표시했다.

질문:
- 앞으로 대화 원문을 자동 export/append 하는 더 좋은 방식이 있는가?
- 개인정보/비공개 tool log 분리를 자동화할 수 있는가?
- RAW를 꼭 GitHub에 둘 필요가 있는가?

## 24.11 Canon과 Design의 경계

Character Bible / World Bible / Persistent Canon / Runtime Preferences가 서로 인접한 책임을 가진다.

질문:
- 현재 계층이 너무 많은가?
- “Design rule”과 “in-world fact”를 더 엄격히 분리해야 하는가?
- 하나의 typed knowledge graph로 통합할 수 있는가?

## 24.12 AI의 역할 과부하

현재 AI는:
- GM
- writer
- simulator
- continuity checker
- database operator
- archivist
- game designer

를 동시에 한다.

질문:
- agent를 분리해야 하는가?
- 분리하면 context와 일관성이 오히려 나빠지는가?
- “GM Agent + State Steward + Archivist” 정도의 역할분리가 유효한가?
- 단일 모델 + deterministic tools가 더 나은가?

---

# 25. 향후 확장 가능성

우리가 염두에 둔 확장은 다음과 같다.

## 25.1 Chronicle 확장

Chronicle 04, 05... 추가.

각 주인공:
- 독립 worldline
- 독립 current state
- 독립 캐릭터/세계 canon overlay
- IP-level registry에 등록

## 25.2 장기 세계선

AFTERFALL은:
- Apocalypse
- De facto anarchy
- Post-Apocalypse
- Local Order
- Faction
- New Order

까지 긴 시간축으로 확장 가능하다.

## 25.3 웹게임

ChatGPT 안에서 검증된 UX를 Thin Engine으로 옮길 수 있다.

## 25.4 IP adaptation

같은 Canon에서:
- 웹소설
- 웹툰
- 영상
- interactive game

용 패키지 생성.

## 25.5 캐릭터 자산화

Character Bible에서:
- visual sheet
- dialogue guide
- relationship graph
- arc candidates
- adaptation casting brief

등으로 확장.

## 25.6 World simulation

Pressure Track, faction goal, resource route를 더 구조화하면 플레이어가 관찰하지 않는 지역도 저해상도로 계속 움직이게 할 수 있다.

---

# 26. 우리가 특히 외부 AI에게 묻고 싶은 것

## A. 시스템 아키텍처

1. 현재 `ChatGPT + Supabase + GitHub` 삼층 구조는 합리적인가?
2. 더 단순하게 같은 목표를 달성할 구조가 있는가?
3. Supabase Save 1-row JSONB snapshot 구조는 언제 한계가 오는가?
4. Snapshot + Event hybrid를 어떻게 개선할 것인가?
5. State mutation은 어떤 방식으로 제한하는 것이 좋은가?
6. DB schema를 worldline마다 공유하는 것이 맞는가?
7. Branch-per-worldline 전략을 유지할 가치가 있는가?

## B. LLM Context / Memory

1. 현재 explicit boot path 방식이 좋은가?
2. RAG를 어느 지점부터 도입해야 하는가?
3. Vector DB보다 relational/graph lookup이 더 적합한 부분은?
4. context window가 커져도 “많이 읽지 않는 것”을 유지해야 하는가?
5. long-term character continuity에 가장 좋은 representation은?

## C. Game Design

1. World Pressure 8개는 적절한가?
2. NPC Strength/Shadow active slot 방식은 충분한가?
3. 세계의 독립성과 플레이어 agency 균형이 맞는가?
4. emergent story를 더 강하게 만드는 simulation primitive가 있는가?
5. 선택지가 “합리적 최적해”로 수렴하는 문제를 더 잘 막을 방법은?
6. off-screen NPC 관계를 과도한 soap opera 없이 어떻게 시뮬레이션할 것인가?

## D. IP Production

1. RAW → Canon → IP Package 구조가 적절한가?
2. adaptation을 생각하면 지금 추가로 남겨야 할 metadata는?
3. Story beat / scene / character arc를 별도 구조화해야 하는가?
4. 세계선별로 theme / motif / visual identity 데이터를 분리해야 하는가?
5. 나중에 작가/PD/웹툰 콘티 AI가 재사용하기 좋은 형태는 무엇인가?

## E. 개발 우선순위

1. Thin Engine을 지금 만들어야 하는가?
2. 만든다면 최소 기능 3개는 무엇인가?
3. 만들지 않는다면 ChatGPT + Supabase만으로 어떤 validation을 추가해야 하는가?
4. 우리가 절대로 만들지 말아야 할 과설계는 무엇인가?
5. 가장 ROI 높은 자동화는 무엇인가?

---

# 27. 외부 감사자가 반드시 검토했으면 하는 파일

## IP / Routing

- `SURVIVAL_DIARY_IP_BIBLE.md`
- `WORLDLINE_ROUTER.md`
- `START_HERE.md`

## Legacy design philosophy / runtime

- `core/GAME_BIBLE.md`
- `runtime/GM_KERNEL.md`
- `runtime/LOAD_MAP.md`
- `docs/WORLD_SEED_PROTOCOL.md`
- `docs/NPC_DESIGN_V2.md`
- `docs/AUTOSAVE_POLICY.md`
- `docs/SEASON_COMPLETION_PIPELINE.md`
- `docs/TEXT_VISUAL_GRAMMAR.md`

## Thin Engine design

- `docs/THIN_ENGINE_SPEC_V0_1.md`
- `docs/THIN_ENGINE_WEB_GAME_V0_1.md`

## AFTERFALL

Branch:

`worldline/afterfall-rpg`

Files:

- `worldlines/AFTERFALL/START_ROOM.md`
- `worldlines/AFTERFALL/BOOT.md`
- `worldlines/AFTERFALL/RPG_DESIGN_V1.md`
- `worldlines/AFTERFALL/CHARACTER_BIBLE.md`
- `worldlines/AFTERFALL/WORLD_BIBLE.md`
- `worldlines/AFTERFALL/PERSISTENT_CANON.md`
- `worldlines/AFTERFALL/SAVE_SCHEMA_V1.md`
- `worldlines/AFTERFALL/ADAPTIVE_RESOURCE_RESOLUTION_V1.md`
- `worldlines/AFTERFALL/EMERGENT_SURVIVAL_LEARNING_V1.md`
- `worldlines/AFTERFALL/NARRATIVE_PACING_ESCALATION_V1.md`
- `worldlines/AFTERFALL/CURRENT_STATE.json`
- `worldlines/AFTERFALL/seasons/S02/CURRENT_CHECKPOINT.md`

Season assetization example:

- `worldlines/AFTERFALL/seasons/S01/ARC_ARCHIVE.md`
- `worldlines/AFTERFALL/seasons/S01/FEEDBACK.md`
- `worldlines/AFTERFALL/seasons/S01/RETROSPECTIVE.md`
- `worldlines/AFTERFALL/seasons/S01/IP_PACKAGE.md`
- `worldlines/AFTERFALL/seasons/S01/raw_transcript/INDEX.md`

---

# 28. Supabase를 볼 수 있는 감사자라면

Project:
`taejang-phase1-staging`

Schema:
`survival_rpg`

Tables:
- `saves`
- `events`

Target:
`worldline_id = 'AFTERFALL'`

검토할 것:

1. `state` JSONB 크기와 구조
2. `gm_state` private state 분리
3. `save_version`
4. `known_characters`
5. `character_bible`
6. `world_bible`
7. `known_world`
8. `runtime_preferences`
9. recent `events`
10. snapshot/event consistency

감사자는 데이터를 수정하지 말고 read-only로 보는 것을 권장한다.

---

# 29. 외부 AI에게 원하는 최종 답변 형식

가능하면 다음 형식으로 답해 달라.

## 1. 한 문장 평가
이 방식이 무엇을 잘하고 무엇이 가장 위험한지.

## 2. 가장 좋은 점 5개
기술/게임/IP 관점에서.

## 3. “왜 이걸 아직 안 하지?” Top 10
가장 중요한 누락 순서대로.

각 항목:
- 문제
- 추천 대안
- 기대효과
- 구현 난이도
- 지금 할지 / 나중에 할지

## 4. 버릴 것 5개
현재 구조에서 과한 것, 중복, 문서부채를 만드는 것.

## 5. 데이터 아키텍처 제안
현재 방식 유지 / 부분 수정 / 재설계 중 하나를 명확히 선택.

필요하다면:
- table schema
- event model
- graph model
- validator
- versioning
- provenance

까지 구체적으로.

## 6. LLM orchestration 제안
- single agent
- multi-agent
- RAG
- deterministic tools
- validator
- context loading

의 역할을 구분해서 제안.

## 7. Game design 제안
Emergent story와 NPC autonomy를 더 강하게 만들 방법.

## 8. IP production 제안
플레이 결과가 소설/웹툰/영상/게임 자산으로 더 잘 이어지게 만드는 방법.

## 9. 30 / 90 / 180일 로드맵
과설계하지 말고 ROI 순서.

## 10. 하지 말아야 할 것
기술적으로 멋져 보여도 이 프로젝트에는 독이 될 기능.

---

# 30. 감사자가 지켜줬으면 하는 태도

다음 방식의 피드백은 가치가 낮다.

- “잘 정리되어 있다.”
- “흥미로운 프로젝트다.”
- “RAG를 써보세요.”
- “멀티에이전트를 고려하세요.”
- “벡터DB를 쓰면 좋습니다.”

이런 추상 조언보다:

> 어떤 문제에,
> 지금 구조의 무엇을 없애거나 바꾸고,
> 어떤 데이터 모델/도구/프로세스로,
> 어느 시점에,
> 왜 바꾸는가

를 구체적으로 말해 달라.

우리가 가장 듣고 싶은 말은:

> **“현재 구조라면 이 문제는 곧 터진다. 이미 널리 쓰이는 더 단순한 방법이 있는데 왜 안 쓰고 있는가?”**

이다.

---

# 31. 마지막 요약

현재 우리는 ChatGPT를 단순 콘텐츠 생성기로 쓰고 있지 않다.

ChatGPT를:
- 장기 GM
- 즉흥 작가
- 세계 시뮬레이터
- NPC actor
- 플레이테스트 파트너
- Canon editor
- archive operator
- IP development partner

로 사용하고 있다.

Supabase는 현재 살아 있는 세계상태를 맡고,
GitHub는 장기 Canon과 제작기억을 맡는다.

그리고 실제 플레이가:
- 설정을 만든다.
- 캐릭터를 만든다.
- 시스템 규칙을 만든다.
- 제작 피드백을 만든다.
- IP 자산을 만든다.

현재 목표는 **AI가 이야기를 잘 써주는 게임**보다 더 크다.

> **사용자와 AI가 수개월~수년 동안 함께 플레이하면서, 플레이 자체가 장기 IP 제작 과정이 되는 구조**를 만들고 싶다.

이 목표에 비해 현재 우리가 놓친 가장 큰 구조적 아이디어가 무엇인지 감사해 달라.
