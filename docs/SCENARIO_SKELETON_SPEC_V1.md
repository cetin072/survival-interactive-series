# 《생존일기》 Scenario Skeleton Spec v1

상태: **기획 기준 / S01 Vertical Slice 적용 대상**

이 문서는 기존 플레이 시즌과 신규 기획을 《생존일기》 런타임에서 재사용 가능한 **Scenario Skeleton**으로 변환하기 위한 공통 형식을 정의한다.

Scenario Skeleton은 완성 대본이 아니다.
플레이어가 과거와 다른 선택을 하더라도 세계가 논리적으로 진행되고, AI GM이 자유롭게 장면을 연기할 수 있게 하는 **사건·압박·조건의 뼈대**다.

---

## 1. 핵심 구조

정식 시나리오는 단순 선형 플로차트가 아니라 다음 세 층으로 구성한다.

```text
ANCHOR EVENTS
반드시 또는 높은 확률로 시즌을 구성하는 큰 전환점

+ PRESSURE TRACKS
시간과 선택에 따라 계속 진행되는 세계 압력

+ CONDITIONAL EVENT CARDS
현재 상태/관계/위치/자원에 따라 발생 가능한 사건
```

AI는 이 뼈대 안에서 장면·대사·인물 반응·세부 사건 표현을 자유롭게 만든다.

---

## 2. Anchor Event

Anchor는 시즌의 정체성을 만드는 큰 사건이다.

예: 산불 시즌

- 산불 발생/확산 인지
- 가족 분산 상태가 실제 위험으로 전환
- 주요 외곽 도로 통제 시작
- 가족 또는 거점에 직접적인 위협 도달
- 최종 대피/거점 선택
- 새로운 안정상태 도달

Anchor는 플레이어의 선택을 무효화해 억지로 같은 장면을 만들기 위한 장치가 아니다.

같은 Anchor라도 위치와 맥락은 달라질 수 있다.

예:
`외곽도로 통제`라는 Anchor는
- 플레이어가 도로 위에서 직접 겪을 수도 있고
- 가족의 전화로 알 수도 있고
- 이미 우회한 뒤 뉴스로 확인할 수도 있다.

즉 **사건의 세계적 사실은 유지되지만 경험 방식은 변한다.**

---

## 3. Pressure Track

Pressure Track은 플레이어가 아무 행동을 하지 않아도 움직이는 세계다.

예: 산불

### wildfire_pressure
- 0: 원거리 연기/주의
- 1: 산림 인접지역 대피 준비
- 2: 강풍으로 확산 가속
- 3: 외곽 도로 혼잡/부분 통제
- 4: 일부 마을 직접 위협
- 5: 거점 선택 또는 대피 실패 위험

### road_pressure
- 정상
- 정체 증가
- 특정 방향 병목
- 부분 통제
- 전면 통제/우회 필요

### institution_pressure
- 정상
- 비상근무
- 일부 업무 중단
- 인력 이탈/기능 축소
- 기능 상실

Pressure는 시간만으로 증가하지 않는다.

가능한 입력:
- 시간 경과
- 날씨
- 플레이어 이동
- 세계 사건
- 구조/대피 진행률
- 자원 고갈
- 기관 상태

---

## 4. Conditional Event Card

Event Card는 조건이 맞을 때 발생할 수 있는 작은/중간 사건이다.

각 카드는 최소 다음 속성을 가진다.

```text
id
category
trigger_conditions
eligible_locations
required_public_facts
blocked_if
priority
expiry
world_effect
character_hooks
choice_gate
memory_candidate
```

예:

### father_refuses_immediate_evacuation

trigger:
- father.location == outer_house
- wildfire_pressure >= 1
- father has not committed to evacuate

world effect:
- evacuation delay risk

character hook:
- 정호는 집/이웃/지역 책임을 우선할 수 있음

AI 자유 영역:
- 정확한 대사
- 누구를 먼저 확인하려는지
- 어떤 방식으로 반대하는지
- 준호와의 관계에 따른 말투/강도

---

## 5. Character Drive

캐릭터는 사건마다 임시로 성격을 부여받는 것이 아니라 지속적인 Drive를 가진다.

예:

### 정호
- 자신의 판단과 지역 경험을 중시
- 집과 이웃을 쉽게 버리지 않음
- 가족을 위해 위험을 감수하지만 명령에는 자동 복종하지 않음

### 서윤
- 가족 안전을 중시
- 자신의 직업적 책임도 실제 제약으로 작동
- 준호가 혼자 위험을 떠맡는 것을 경계

### 민석
- 초기에는 보호가 필요함
- 정보기기/지도 활용 가능
- 장기적으로 독립 판단과 역할이 성장할 수 있음

Character Drive는 `반드시 이런 대사를 한다`가 아니라 **AI가 현재 상황을 연기할 때 지켜야 하는 방향성**이다.

---

## 6. Character Constraint

Drive와 Constraint를 분리한다.

Drive = 무엇을 원하나
Constraint = 지금 무엇을 못 하나

예:

서윤:
- Drive: 가족 안전
- Constraint: 병원 비상 대응으로 즉시 이탈 불가

민석:
- Drive: 가족과 합류
- Constraint: 미성년자, 이동수단 제한

정호:
- Drive: 집/이웃 보호
- Constraint: 외곽 교통 악화, 연령에 따른 이동 부담

이 분리가 있어야 캐릭터가 단순 성격극이 아니라 실제 게임 변수로 작동한다.

---

## 7. Strategic Choice Gate

모든 Event가 플레이어 선택을 요구하지 않는다.

Choice Gate는 다음에만 연다.

- 우선순위 충돌
- 상당한 위험 감수
- 희소자원 배분
- 가족 분리/합류 전략
- 거점 선택
- 장기간 영향
- 관계에 큰 영향을 주는 결정
- 돌이키기 어려운 행동

Choice Gate가 아닌 예:

- 이미 결정한 목적지까지 정상 주행
- 반복 전화
- 안전한 주차
- 평범한 준비
- 명확한 업무 인계

이런 행동은 GM/가족/엔진이 자동 진행한다.

---

## 8. Consequence Hook

좋은 시나리오는 선택 직후만 달라지는 것이 아니라 이후에 회수된다.

각 주요 선택은 가능하면 Consequence Hook을 남긴다.

예:

`이웃을 도왔다`
→ 시간 손실
→ 후일 정보/노동/신뢰 보상 가능

`차량을 버렸다`
→ 즉시 이동 자유 증가
→ 후반 장거리 이동 제약

`정호의 의견을 반복적으로 무시했다`
→ 즉시 안전 확보 가능
→ 관계 기억에 누적
→ 이후 협조 방식 변화 가능

---

## 9. Family Memory Hook

모든 사건을 관계 기억으로 저장하지 않는다.

다음과 같은 사건만 Memory Candidate로 남긴다.

- 구조/희생
- 약속
- 배신감/강한 갈등
- 반복되는 행동 패턴
- 중요한 책임 분담
- 생존에 결정적인 도움
- 가족의 성장/역할 변화

Memory Hook 예:

```text
actor: player
subject: father
kind: respected_judgment
context: wildfire evacuation
weight: major
```

실제 사용자 화면에는 숫자 관계점수보다 자연어와 행동 변화로 나타내는 것을 우선한다.

---

## 10. Compression Zone

모든 시간을 실시간으로 플레이하지 않는다.

Compression Zone 조건:

- 안정적 반복 행동
- 새로운 전략 판단이 없음
- 위험이 예측 가능한 범위
- 자원 변화가 단순 반복

예:

`3일간 외곽 거점 보강`

AI는 3일을 턴 20개로 쪼개지 않고:
- 주요 성과
- 가족 역할 변화
- 자원 변화
- 새 문제
만 압축해 보여준다.

---

## 11. Recovery / Fail-Forward

시나리오는 정답 루트를 강제하지 않는다.

중요 인물 구조 실패, 차량 상실, 거점 포기 같은 결과가 발생해도 가능한 경우 새로운 상태로 이야기를 이어간다.

예:

- 원래 합류 실패 → 임시 분리 상태
- 차량 상실 → 도보/대중교통/타인의 차량 의존
- 외곽 거점 포기 → 도심 임시 거점
- 관계 악화 → 명령 거부/별도 판단 증가

즉 실패도 다른 콘텐츠 상태다.

---

## 12. Scenario Skeleton 최소 데이터

각 시즌은 최소 다음을 가진다.

### Metadata
- season_id
- title
- disaster_type
- expected_play_length
- difficulty

### Start State
- date/time
- family locations
- vehicles
- bases
- resources
- institutions
- known public information

### Character Drives/Constraints
- 가족별 목표
- 가족별 제약
- 시작 관계 상태

### Pressure Tracks
- 최소 1개 주 재난 압력
- 필요 시 교통/기관/자원 등 보조 압력

### Anchor Events
- 4~8개의 시즌 핵심 전환점 권장

### Event Cards
- Vertical Slice: 약 15~20개 핵심 카드
- 정식 시즌: 필요에 따라 확장

### Choice Gates
- 전략 선택 후보

### Consequence Hooks
- 후반 회수 가능한 장기 인과관계

### Memory Hooks
- 관계·성장에 영향을 줄 수 있는 핵심 사건

### End States
- 성공/부분 성공/손실 포함 여러 안정상태

---

## 13. 기존 플레이 시즌 변환 규칙

기존 RAW/플레이 기록을 읽을 때 다음 순서로 추출한다.

1. 실제로 재미가 발생한 순간 표시
2. 그 순간의 원인이 `대사`인지 `갈등 구조`인지 구분
3. 재사용 가능한 갈등 구조 추출
4. 플레이어가 실제 선택한 답은 제거
5. 사건이 발생하기 위한 조건만 남김
6. 캐릭터의 독립적 행동을 Drive/Constraint로 변환
7. 장기 결과를 Consequence/Memory Hook으로 변환
8. 반복·루즈한 턴은 Compression Zone 후보로 표시
9. 잘못된 설정/우연한 GM 오류는 뼈대에 포함하지 않음

RAW는 설계 광산이지 런타임 Source of Truth가 아니다.

---

## 14. Runtime 역할 분담

### Scenario Skeleton
`무슨 종류의 일이 일어날 수 있는가`

### Web/Game Engine
`현재 무엇이 사실이고 무엇이 가능한가`

### AI GM
`그 일이 지금 어떤 장면과 사람의 행동으로 보이는가`

세 층이 겹치지 않아야 한다.

---

## 15. S01 Vertical Slice 다음 작업

첫 적용 대상은 기존 산불 플레이에서 추출한 S01형 Vertical Slice다.

목표:

- Anchor 4~6개
- Pressure Track 2~4개
- Event Card 약 15~20개
- 가족 Drive/Constraint
- Strategic Choice Gate
- Consequence/Memory Hook
- 1개 이상의 Compression Zone
- 복수 End State

완성 후 현재 텍스트 UI에서 플레이해 다음을 검증한다.

> **그래픽 없이도 다음 장면이 궁금한가?**

이 질문에 YES가 나오기 전까지 대규모 비주얼 확장은 핵심 해결책으로 보지 않는다.
