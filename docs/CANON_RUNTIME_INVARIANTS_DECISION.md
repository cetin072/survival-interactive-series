# Canon Runtime Invariants Decision v1

상태: PLANNED / S07 READINESS

## 목적
장기 시즌에서 이미 확정된 지속 Canon이 새 시즌·새 채팅의 즉흥 생성에 의해 덮어써지는 오류를 줄인다.

이번 결정의 직접 계기는 S06에서 발생한 두 오류다.
- 평일 오전인데 정호가 도심 집에 있는 것으로 시작
- 최씨 개인 우물이 마을 공동 수원처럼 취급될 수 있는 표현 발생

GitHub 원본에는 이미 올바른 Canon이 존재했다. 따라서 문제는 저장 부재가 아니라 런타임 부팅/검증 누락이다.

## 역할 분리
- `core/PERSISTENT_CANON.md`: 지속 세계관과 관계를 사람이 읽기 좋은 형태로 보존
- `players/main/RUNTIME_STATE.json`: 현재 시간·위치·차량·자원·행동 등 변하는 상태
- `core/RUNTIME_INVARIANTS.json` (예정): 소유권·기본 생활패턴·공용/개인 구분·권한경계처럼 기계 검증이 필요한 하드 Canon의 작은 구조화 Registry

`RUNTIME_INVARIANTS`는 과거 시즌 서사를 저장하지 않는다.

## 초기 Registry 후보
### Family default operating model
- weekday: 준호·서윤·민석 = 도심 / 정호 = 외곽
- weekend: 가족 4인 = 외곽 재결집

### Assets / facilities
- `CHOI_WELL`: owner=CHOI_HOUSEHOLD, communal=false, village_auto_access=false
- `VILLAGE_BOREHOLE`: owner=VILLAGE_COMMON, communal=true, purpose=emergency_water
- `VILLAGE_STORAGE_TANK`: owner=VILLAGE_COMMON, communal=true
- `JUNHO_SOLAR`: owner=JUNHO_HOUSEHOLD, communal=false, village_auto_access=false
- `MOBILE_WELL_POWER`: owners=[JUNHO_HOUSEHOLD, CHOI_HOUSEHOLD], share=50/50
- `SPARE_WELL_PUMP`: owners=[JUNHO_HOUSEHOLD, CHOI_HOUSEHOLD], share=50/50

### Cooperation / authority
- JUNHO_HOUSEHOLD + CHOI_HOUSEHOLD = core cooperation; asset ownership remains separate
- JUNHO + CHOI + HEADMAN = information/emergency coordination line, not a joint government
- HEADMAN = village resident coordination / public facilities / administrative contact

## Validator target
향후 Validator는 장면의 창작 품질을 판단하지 않고 최소한 다음 기계 모순을 잡는다.
- default schedule과 시작 위치의 명백한 충돌
- private asset을 communal로 표시
- village public facility와 Choi private well 병합
- private asset의 자동 village access
- cooperation을 ownership merge로 표현한 구조화 상태
- 3-person coordination을 asset authority로 승격한 구조화 상태

## Boot rule
새 시즌/새 채팅 첫 장면 전에 최소:
1. CHARACTERS
2. RUNTIME_INVARIANTS
3. PERSISTENT_CANON
4. latest RUNTIME_STATE / SAVE
5. current season handoff
을 확인한다.

부팅 완료 전 즉흥 장면을 생성하지 않는다.

## 장기 원칙
과거 시즌 전체를 매번 읽지 않는다.
시즌 종료 시 지속되는 사실만 Persistent Canon과 Runtime Invariants에 승격한다.

핵심:
> History는 시즌 Canon에 남기고, 현재 지속 사실은 압축하며, 기계 검증이 필요한 하드 사실만 Registry로 만든다.
