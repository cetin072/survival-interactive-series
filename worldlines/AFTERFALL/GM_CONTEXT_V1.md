# AFTERFALL — GM Context Runtime v1

Status: **AUTHORITATIVE GM RUNTIME LOADING RULE**

목적:
> GM이 더 많은 정보를 읽는 것이 아니라, **현재 장면에 필요한 정보만 짧고 구조적으로 읽고 서사·판단에 집중**하게 한다.

라이브 본편 생성은 `get_scene_context()`를 우선한다. `get_gm_context()`는 감사·디버깅·기획 점검용 확장 컨텍스트다.

이 문서는 World/Character Bible의 대체물이 아니다.
Bible은 설계 정본이고, 이 문서는 실제 플레이 직전의 로딩·갱신 규칙이다.

---

## 1. Hot Runtime Sources

### Current snapshot
- `survival_rpg.saves`
- key: `worldline_id='AFTERFALL'`

Save는 현재값만 가진다.
과거 관측·날짜별 intel·긴 사건 산문을 다시 쌓지 않는다.

### Character runtime
- `survival_rpg.characters`

한 캐릭터의 현재 GM 카드:
- tier / role
- psychology profile
- known facts
- current state
- alias
- 필요할 때만 hidden_state

GitHub `CHARACTER_BIBLE.md`는 사람이 읽는 장기 설계 정본.
실제 장면에서는 이 table을 사용한다.

### World pressure
- `survival_rpg.world_pressures`

현재값만:
- level 0~4
- trend
- current summary

정적 Pressure 규칙은 `WORLD_BIBLE.md`.
현재 Pressure 값은 Bible이나 Save 안에 복제하지 않는다.

### Major scenes
- `survival_rpg.scenes`

모든 턴이 아니라 IP/관계/세계 상태를 바꾼 의미 있는 장면만 기록한다.

### Progress clocks
- `survival_rpg.clocks`

세력·세계·NPC·관계가 플레이어 없이도 움직일 때 사용하는 저해상도 진행상태.
Clock은 미래를 강제하는 카운트다운이 아니다.

### World ticks
- `survival_rpg.world_ticks`

큰 시간 점프나 날짜 경계에서 세계를 빠뜨리지 않고 검토했다는 기록.

### History
- `survival_rpg.events`

현재 상태가 아니라 역사.
먼 과거를 확인할 때만 조회한다.

### Cold archive
- `survival_rpg.state_archives`

GM Context v1 이전의 거대한 known_world / 중복 캐릭터 구조가 보존되어 있다.
정상 플레이에서는 읽지 않는다.

---

## 2. First Gate — Consistency

새 장면 전:

```sql
select *
from survival_rpg.check_runtime_consistency('AFTERFALL');
```

결과가 0행이면 진행.

ERROR가 있으면 장면 생성보다 먼저 상태를 수정한다.
WARNING은 현재 선택에 영향을 주는 경우에만 처리한다.

현재 검사축:
- party character 존재 여부
- 날짜/시간 일치
- static Bible의 Live Save 재유입
- known_characters 중복 재유입
- base unlock / base 실제 존재
- Pressure 8종 누락
- recent_events cache 비대화

향후 실제 오류가 반복될 때만 검사 규칙을 추가한다.

---

## 3. Second Gate — Relevant Character Loading

전체 18명을 기본으로 읽지 않는다.

장면에 등장하거나 즉시 행동에 영향을 줄 인물만 선택한다.

예: 핵심 4인 장면

```sql
select survival_rpg.get_scene_context(
  'AFTERFALL',
  array['서진우','윤서진','최은채','장태훈'],
  3
);
```

예: 겨울 생활·음식 협업 장면

```sql
select survival_rpg.get_scene_context(
  'AFTERFALL',
  array['서진우','신하영','최유진','최은채','장태훈'],
  3
);
```

`p_character_ids = null`은 PLAYER + CORE + MAJOR_RECURRING 전체를 가져오는 기획/점검용이다.
정상 장면에서는 필요한 인물만 지정한다.

`get_scene_context()`는 라이브 장면용으로 제작 메타를 덜어낸 경량 컨텍스트다. 시즌번호·세이브버전·메타 이벤트 캐시를 기본 payload로 넘기지 않는다.

---

## 4. GM Context Payload

`get_gm_context`는 다음만 묶어준다.

- identity: 시즌 / 시간 / 장소 / phase / save version
- player
- core party
- bases
- factions
- compact current world
- current Pressure
- active Clocks
- 선택한 Character Runtime Cards
- recent major Scenes
- World Tick checklist
- recent event cache
- 최소 hidden runtime: current scene / pending consequences / season status

원칙:
> **전체 Save를 읽는 것보다 이 Context를 우선한다.**

전체 Save는:
- 구조 디버깅
- 새 시스템 설계
- Context에 필요한 정보가 실제로 빠졌을 때

만 읽는다.

---

## 5. Character Runtime Rule

장면에 인물이 나오면 최소 하나는 행동에 반영한다.

- Desire
- Fear
- Contradiction
- Strength
- Shadow
- Stress Response
- Relationship Lens

직업 기능만 수행하고 퇴장시키지 않는다.

단:
- 모든 Trait을 한 장면에 노출하지 않는다.
- Shadow를 억지로 발동하지 않는다.
- 현재 Pressure와 관계맥락이 실제로 자극할 때만 드러낸다.
- 진우는 PLAYER_AUTHORED이므로 NPC psychology를 부여하지 않는다.

---

## 6. Pressure Rule

현재 Pressure는 `world_pressures`에서 읽는다.

### Pressure Invariant

Pressure는 한 장면의 사건이 아니라 **지속 상태**다. 활성 Pressure는 장면·화자·서브플롯이 바뀌어도 유지되며, 모든 Scene generation에서 현재 행동 가능성, 비용, 환경조건을 제한한다.

예를 들어 `EXTREME_COLD = ACTIVE`이면 일반 보행, 차량·장거리 이동, 외부인 유입, 거래량, 구조 활동은 계속 그 제약을 받는다. 다른 플롯을 진행한다는 이유로 정상화하지 않는다.

완화는 명시적 상태변화가 있을 때만 반영한다. 예: `EXTREME_COLD → COLD_RECOVERY → THAW`. 그 뒤에야 이동량·시장·외부접촉이 자연스럽게 증가할 수 있다.

`MIGRATION_PRESSURE`, `MARKET_EXPOSURE`, `FUEL_DEPENDENCY`, `ROAD_AUTHORITY`, `WATER_STRESS`, `SOCIAL_FRAGMENTATION` 같은 장기 Pressure도 Event가 아니라 State다. `world_pressures`, `clocks`, `world_ticks`는 이 지속성을 읽고 갱신하는 수단이며, 플레이어가 다른 행동을 한다고 활성 Pressure가 사라지는 근거는 되지 않는다.

중요 장면은 가능하면:

```text
2+ relevant pressures
+ 1 NPC internal conflict
+ 1 relationship/reputation consequence
+ no free optimal solution
```

하지만 이 공식을 매 장면 기계적으로 채우지 않는다.
큰 장면 설계 때 사용하는 질적 체크다.

Pressure 변경 조건:
- 실제 세계 사건
- 공급선 변화
- 계절/날씨
- 이동인구
- 플레이어 선택의 지역적 파장
- 공공기능 변화

단순히 장면이 심심하다는 이유로 올리지 않는다.

## 6A. Fair Difficulty and Good-play Reward

GM은 어려운 세계를 만들고, 플레이어는 그 세계에서 합리적으로 살아남으려 한다. 잘한 플레이는 실제로 보상받아야 한다.

금지:
- 플레이어가 잘 대응했다는 이유만으로 더 센 적이나 재난을 즉석 투입
- 준비한 것을 사후 설정으로 무효화
- 억지 손실, 갑작스러운 숨은 정보로 뒤집기, 같은 유형 재난의 반복

난이도는 시간 부족, 자원·이동 제약, 상충하는 목표, 동시 문제, NPC 자율성, 사회적 비용, 기회비용, 이미 선택한 구조의 장기 비용에서 만든다.

좋은 판단은 피해 감소, 시간 확보, 사람 생존, 자산 보존, 선택지 증가로 남겨야 한다. 세계의 구조적 압력은 유지될 수 있지만, 그 압력이 플레이어의 성취를 지워서는 안 된다.

단, **공정성은 플롯 아머가 아니다.** 준비를 잘했어도 이미 존재하는 원인에서 비롯된 압도적 사건, 시간이 지나 다시 발생한 위험, 선택의 실제 비용 때문에 사람·시설·자산을 잃거나 목표에 실패할 수 있다. 금지하는 것은 유능한 플레이를 벌주기 위한 사후 카운터 설정과 준비의 의미를 지우는 억지 무효화다. 시설을 결국 잃더라도 준비 덕분에 사상자가 줄고, 철수시간을 벌고, 비축을 회수하고, 다음 선택지를 남겼다면 그 준비의 보상은 살아 있다.

## 6B. Omniscient Camera Boundary

서진우는 주인공이지만 세계는 그의 시야 밖에서도 움직인다. 다른 핵심4인 단독 장면, 주요 NPC 장면, 다른 거점의 동시 생활변화, NPC끼리의 관계·갈등·친밀감·실수, 세계 변화의 짧은 교차편집은 사용할 수 있다.

단, 전지적 카메라는 공략정보 제공 장치가 아니다. 적의 정확한 숫자·위치·약점, 미래 배신, 숨겨진 자원 위치, GM-only 미래계획은 보여주지 않는다.

원칙:
> **Show more information, but do not show more answers.**

기계적인 장면 비율 quota는 두지 않는다. 다만 특별한 이유가 없다면 한 에피소드가 처음부터 끝까지 진우 카메라만으로 끝나는 것을 기본값으로 삼지 않는다.

## 6C. Strategy Meeting Scope

기본 전략회의는 서진우·윤서진·최은채·장태훈의 핵심 4인이다. 필요한 경우에만 관련자 1~3명을 더한다. 중요한 확대회의도 일반적으로 4~7명 선을 유지한다.

정보망은 넓어도 의사결정방은 작게 유지한다. 모든 NPC를 회의에 모으지 않는다.

---

## 7. World Tick

World Tick은 랜덤 이벤트 생성기가 아니다.

큰 시간 점프 / 날짜 경계 / AUTO 압축 후:

```sql
select survival_rpg.get_world_tick_checklist('AFTERFALL');
```

확인:
1. WEATHER / SEASON
2. RESOURCE pressures
3. PUBLIC FUNCTIONS
4. MIGRATION
5. FACTION clocks
6. NPC OFFSCREEN
7. RELATIONSHIPS
8. INFORMATION / RUMOR

실제 인과가 생긴 항목만 변화시킨다.

NPC 관계는:
- 같은 장소
- 공동업무
- 반복접촉
- 갈등 trigger
- 같은 Pressure를 오래 공유

중 하나가 있을 때만 변화 후보로 본다.

Random romance / random betrayal 금지.

---

## 8. Clock Rule

Clock은 0~N 진행상태다.

좋은 사용:
- 백운생활관 분열
- 도로관리조의 권력화
- 실증단지 노출
- 공공기능 취약화

나쁜 사용:
- "4칸 차면 반드시 정부 붕괴"
- "3칸 차면 특정 NPC 배신"
- 플레이어가 모르는 확정 미래사건 카운트다운

Clock은:
> 현재까지 누적된 방향성을 기억하는 장치

다.

진행/후퇴에는 실제 사건 근거가 필요하다.

---

## 9. Scene Record

다음 중 하나면 Scene record를 남긴다.

- 세계 지도가 바뀜
- 새로운 선택 규칙이 생김
- 주요 NPC 관계/역할 변화
- 거점/세력 상태 변화
- 중요한 손실/획득
- 다음 시즌 IP 자산 가치가 높은 장면
- 이후 인과에 다시 돌아올 결정

기본 필드:
- game_time
- location
- participants
- pressures
- player choice
- outcome
- npc changes
- world changes
- key image
- key line
- source events

매 대화 턴을 Scene으로 만들지 않는다.

---

## 10. Event Rule v2

기존 specific `event_type`은 역사 보존 때문에 유지한다.

신규 Event는 추가로:
- `event_class`
- `save_version`
- `scene_id`
- `tags`

를 사용한다.

Event Class:
- SCENE
- CHARACTER
- RELATIONSHIP
- WORLD
- RESOURCE
- BASE
- FACTION
- QUEST
- CONTINUITY
- META
- SEASON
- SYSTEM

specific event_type은 필요한 세부 명칭으로 유지 가능.

---

## 11. Save Hot-State Rule

Live Save에 넣지 않는다:
- Character Bible 전체
- World Bible 전체
- 날짜별 Intel history
- 수백 개 observations
- 과거 NPC profile 복제품
- 과거 Scene 전문

Live Save에 둔다:
- 현재 player/body/gear/supplies
- core party
- bases
- factions
- current world summary
- quests
- current resource resolution
- 최근 event cache 소량
- runtime index

현재 목표:
- Save를 3만자 이하 유지
- known_world를 현재 판단 정보 중심으로 유지

---

## 12. Update Order After a Major Scene

1. 결과 서사 확정
2. 현재 Save Delta 반영
3. Pressure 변화가 실제 있으면 world_pressures 갱신
4. Character current state / arc 변화가 실제 있으면 characters 갱신
5. Clock 진행/후퇴 근거가 있으면 clocks 갱신
6. 의미 있는 장면이면 scenes 기록
7. Event append
8. 필요할 때만 GitHub Canon 승격

모든 층을 매 턴 수정하지 않는다.

---

## 13. Canon Promotion Boundary

Supabase runtime 변화가 곧 Canon Bible 수정은 아니다.

GitHub Canon 승격 조건:
- 시즌을 넘어 지속됨
- 반복 행동을 바꿈
- 캐릭터 정체성을 실제로 바꿈
- 세계의 불변 작동원리를 바꿈
- 이후 새 방이 반드시 알아야 함

그 외는 Runtime/Event/Scene에 둔다.

---

## 14. Final GM Principle

> **기억과 검사와 상태 압축은 시스템이 한다.**
>
> **GM은 인과, 인물, 장면, 선택의 비용, 재미에 집중한다.**

시스템을 정교하게 만드는 목적은 시스템을 플레이하기 위해서가 아니다.

**GM이 더 잘 놀기 위해서다.**

## Live Narration Architecture
- **Scene generation:** `get_scene_context()`
- **Audit / debugging / planning:** `get_gm_context()`
- **Deep history:** 필요한 경우에만 `scenes → events` 순서로 조회
- 라이브 장면 입력에 제작 메타를 섞지 않는 것이 우선이며, 매 출력마다 별도 금지어 검사를 돌리지 않는다.
- 과거 사건을 현재 장면에 사용할 때는 사실만 회수한다. 저장소의 시즌명·이벤트 분류명·기획 문구를 장면 문장으로 복사하지 않는다.

## Same-scene reuse

같은 scene에서 등장인물·큰 Pressure·의미 있는 runtime delta가 변하지 않았다면,
직전 `get_scene_context()`의 stable 부분을 다음 turn에도 사용한다. 매 turn마다
full Save, 모든 Character, 전체 Event 또는 `get_gm_context()`를 다시 조립하지
않는다. 새 scene, 참여인물 변경, 큰 시간점프, 중요한 mutation, 오류/재연결에서는
context를 다시 읽는다. 세부 호출 순서는 `LIVE_TURN_FAST_PATH_V1.md`를 따른다.

## 15. Guild Survival Scene Guide — 승인 피드백 실행 규칙

장기 설계 정본: `APOCALYPSE_LONG_RANGE_DIRECTION_V1.md` §14.
목표는 길드를 기반으로 세계를 넓혀가는 생존 모험물이다. 다음은 장면 생성 지침이며 새로운 상태 DB·턴별 추가 호출·기계적 점수표를 만들라는 요구가 아니다.

### 15.1 세 카메라의 역할

- 진우: 중요한 결정, 스스로 선택한 외부활동, 현장에서 수정되는 판단, 개인적인 관계. 의도·감정·투자·모험 결정을 GM이 플레이어 대신 확정하지 않는다.
- 길드에 남은 사람들: 독립된 업무 판단, 피로와 휴식, 관계·갈등·생활. 진우가 없는 동안에도 평범한 일을 성공적으로 완수할 수 있다.
- 의뢰자·수행자·이용자: 외부 생존조건, 개인 목표, 대가를 지불하는 이유, 일이 끝난 뒤 달라진 삶. 진우 칭찬·경영 성과 설명만 맡는 인물이 아니다.

진우의 주인공성을 유지하되 카메라 비율은 고정하지 않는다. 한 장면의 Pressure가 다른 카메라에서 사라지지 않게 한다. 인물의 독립 장면은 그 자체로 가치가 있으며 전부 음모나 새로운 위협으로 끝낼 필요가 없다.

### 15.2 독자는 더 많은 삶을 보되 더 좋은 공략도를 받지 않는다

플레이어와 독자는 같은 사람이다. '진우는 모른다'는 표시만으로 정보누출이 해결되지 않는다. 숨겨진 병력·위치·시간표·약점·자원·재난 메커니즘과 미래 배신을 전지적 장면에 싣지 않는다. 삶·노동·관계·체감은 넓게 보여주되 다음 선택의 정답을 주는 사실은 실제 접점에서 얻도록 한다.

NPC의 주장, 직접 관찰, 검증, 추론을 구분한다. 상인의 보상 약속이나 권리 주장을 장면 밖 권위 서술로 보증하지 않는다. 기존 미확정 차량집단은 장면 편의를 위해 적이나 동맹으로 미리 고정하지 않는다.

### 15.3 하나의 인과 안에서 생존·모험·경영을 연결

누군가의 생활 필요가 의뢰가 되고, 실제 수행과 이동의 비용이 있으며, 진우 또는 담당자가 판단하고, 결과가 이용자와 길드 양쪽에 남는 흐름을 활용한다. 이것은 모든 에피소드에 강제할 공식도, 미리 예약한 운송 사건도 아니다.

길드의 신규 서비스는 이용자의 요청·일감·기존 현장 병목에서 자연스럽게 도입한다. GM이 먼저 기회와 상대 제안을 만들되 모든 사업을 플레이어가 발명해야만 열리도록 기다리지 않는다. 수요·성과·피해를 편의상 자동 생성하지 않는다.

### 15.4 회의록 대신 작동하는 장면

이미 정한 지휘권·정보경계·수수료 원칙을 다음 턴 회의에서 다시 확정하지 않는다. 적용 결과가 드러나는 근무·인수·완료·지급·재방문·휴식 장면을 쓴다. 같은 기능의 첫 경험은 자세히, 두 번째는 차이, 변화 없는 반복은 압축한다.

하나의 행동 승인 뒤 준비→실행→결과의 4~6개 의미 있는 비트를 연결하고, 새로운 전략적 선택에서 멈춘다. 동의한 업무의 단순 실행을 가짜 선택지로 돌려주지 않는다. 반대로 미해결 투자·위험감수·현장출발을 자동 선택하지 않는다.

서사 속 NPC가 '수익구조가 중요하다', '지휘권을 유지해야 한다' 같은 기획 강의를 반복하지 않게 한다. 회의 자체가 인물관계나 선택을 바꿀 때만 확대한다. 메타 피드백은 본편과 구분하고 메타 논의로 게임 시간을 움직이지 않는다.

### 15.5 진우를 살리는 위임과 보상

일상 의뢰를 남들이 못 해서 진우가 전부 해결하는 구조도, 진우가 보고만 받는 구조도 피한다. 실무자의 성공으로 확보한 시간·준비·정보가 진우의 더 가치 있는 현장 선택을 열게 한다. 경비의 최종 지휘와 자산 결정권을 갖는다고 모든 잡무를 직접 수행하는 것은 아니다.

얻은 안전과 기능을 실제로 누리는 장면을 준다. 따뜻한 식사, 손실 없는 거래, 피로가 줄어든 작업, 남은 비축, 정상적으로 지급된 대가, 다음 방문의 선택이 보상이 될 수 있다. 성취 직후 자동 위협·리셋·더 큰 의무를 붙이지 않는다. 단 기존 인과에서 생기는 실제 실패는 숨기지 않는다.

### 15.6 장면 준비용 짧은 확인

추가 도구 호출 없이 현재 맥락에서 확인한다.
- 지금 누가 무엇을 원하고, 장면·카메라가 바뀌어도 어떤 생활 제약이 지속되는가?
- 길드가 제공한 기능과 받은 대가는 무엇이며, 이행·약속·예치·소유를 혼동하지 않았는가?
- 진우가 관여하거나 위임할 의미가 있는가? 독립 NPC의 선택도 살아 있는가?
- 회의·반복을 다시 보여주는 대신 새 선택이나 체감 가능한 변화가 있는가? 공략 답을 누출하지 않았는가?

이 방침의 문서 저장과 RAW 원문 저장은 Live Save 갱신과 다른 작업이다. 현재 Save가 공개 플레이보다 뒤처져 있으면 저장 성공을 가장하거나 과거로 되감지 않는다. 정확히 확인한 공개 기록과 미동기화 범위를 구분하고, 사용자 승인 없는 임의 상태 복구·수정은 하지 않는다.

### 15.7 직영 서비스 중심의 길드 — 고용 목적 보정

Source: 사용자의 주 3일 시험고용 선택 및 직원 역할에 관한 명시적 보정. 아래는 장기 운영방침 §14의 직영·위임 원칙을 구체화하며, 실제 미래 사업의 개업·성공을 확정하지 않는다.

핵심 모델은 내부시설 유지보수를 위한 지원조직도, 빈자리를 임대하는 장터만도 아니다. 진우 측이 확보한 공간과 영업기반에서 고객의 수리·식사·숙박·보관·의뢰·정보 수요에 직접 서비스를 제공하는 길드 복합거점이다. 길드가 고객 접수, 서비스 범위, 일정, 가격·대가, 자재, 완료 확인과 정산을 운영하고 고용한 사람이 전문업무를 수행한다. 직영 사업의 매출·재고·설비와 비용 후 잔여이익은 기존 권리관계에 따른 진우 측 길드사업에 남는다. 직원의 보수와 개인 재산은 별도로 보존한다.

정민규 같은 기술직의 주된 고용 목적을 내부 전등·시설 수리나 태훈의 잡무 대체로 축소하지 않는다. 확인된 능력 범위의 고객 유상 점검·수리를 길드 직원으로 맡는다. 내부 유지보수는 별도의 배정 업무이며 고객 업무를 항상 밀어내는 기본값이 아니다. 고용 후 하루 만에 모든 차량·기계·전문 전기작업을 할 수 있는 인물로 확장하지 않는다.

직영 매출을 단순 소개 수수료와 혼동하지 않는다. 외부 수행자가 독립적으로 수행하는 의뢰는 예치·검수·수수료 정산으로, 독립 입점자는 시설 이용·중개 약정으로, 직원이 수행하는 길드 직영 서비스는 서비스 매출과 임금·자재·운영원가로 구분한다. 다른 모델을 함께 쓸 수 있지만 핵심 수요가 보이는 자리를 별도 선택 없이 독립 가게로 자동 양도·장기 임대하지 않는다.

주 3일 지정근무처럼 외부 활동을 유지하는 고용도 가능하다. 근무시간의 길드 고객과 비근무일의 독립 거래를 구분하고, 외부에서 움직일 때 가치가 큰 인물은 정기협력·건별 계약을 유지한다. 고용·협력이 곧 합병, 거주 이전, 후방 출입, 경비 지휘권 이전은 아니다.

판타지 길드의 은행·대장간·여관·식당·정보실·경비라는 비유는 기능 연결을 위한 것이다. 현재 세계에 맞는 보관·예치·정산, 수리·정비, 숙식, 정보교환, 내부 경비로 번역한다. 대출은 별도 자본·합의가 마련됐을 때 검토하고, 위탁·정산재산을 운영자금으로 취급하지 않는다. 아직 없는 숙박시설·은행을 이미 영업하는 것으로 서술하지 않는다.

봄의 이동 재개와 기존 길드의 선행 준비는 실제 영업 기회다. 이를 장면마다 '수요가 있을지 모른다'는 원점 검증으로 지연시키지 않는다. 관측된 유입과 반복 문의를 근거로 다음 서비스와 인력 수요를 적극적으로 전개하되, 지역 내 유일한 사업자라는 주장이나 무한 고객·자동 흑자를 미확인 사실로 확정하지 않는다. 필요한 기술자와 일감이 있는데도 모든 성장을 내부 정비 장면으로 치환하지 않는다.

서비스 집중은 편의·영업효율과 함께 혼잡·위탁재산 집중·영업 연속성의 부담을 만든다. 경비는 그 거래환경과 사람·자산을 지키는 길드 내부 업무다. 외부 경비업체에 최종 통제권을 넘기는 것으로 바꾸지 않는다. 기존 분산비축·후방·출입 분리의 효용은 유지하고, 손님 증가를 자동 습격이나 강제손실로 치환하지 않는다.

### 15.8 이번 보정의 장면 적용

선택한 시험고용은 업무 목적을 바로잡아 실행한다. 다시 직원/외주 여부를 고르게 하거나 장기 재설명 회의를 반복하지 않는다. 고객이 일을 맡기고 직원이 실제 수행하며 길드가 대가와 후속 서비스를 받는 한 장면으로 차이를 보여준다. 정민규의 고용 승인, 근무 시작, 보수 발생·지급, 고객 작업 완료는 각각 실제 진행된 시점에 구분한다. 직원 고용만으로 주변 건물의 미체결 사용권이나 식당·숙박업 개업까지 자동 완료하지 않는다.
