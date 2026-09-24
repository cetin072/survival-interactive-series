# AFTERFALL — Season 2 Current Checkpoint

Status: AUTHORITATIVE CURRENT CONTINUATION OVERLAY
Game time: 2026-11-24 09:10
Runtime source of truth: Supabase survival_rpg.saves / AFTERFALL

이 문서는 S02 START_HANDOFF 이후 진행된 플레이를 압축해 새 채팅이 현재 지점에서 바로 이어지게 한다.
현재 수치·부상·일시 상태가 충돌하면 Supabase가 우선한다.

## 1. Identity

- IP: 《생존일기》
- Chronicle: 03
- Worldline: AFTERFALL
- Protagonist: 서진우, 32세, 응급실 간호사
- Season: 2 ACTIVE
- World phase: FRACTURE

## 2. Current resume point

**2026-11-24 09:10.**

11월 23일 화재·공공대피시설·광역 이상 관측까지는 Canon이다.

기존에 플레이된:
- 2026-11-24~11-26 핵심 4인 주도 48시간 겨울화
- 겨울화 Audit
- 11월 26일 실전검증 완료

는 **SUPERSEDED** 처리했다. 삭제하지 않고 과거 리부트 기록으로만 보존한다.

### Winter Reboot V2

이번 겨울의 전면 주도:
- **신하영** — 음식 / 조리 / 위생 / 단체생활 / 생활연료 절약
- **최유진** — 침구 / 세탁 / 수면공간 / 생활물자 / 일상 유지

두 사람은 자동 연합원이 아니다.
외부 신뢰 생활망의 위치를 유지한 채 겨울 운영의 주도권을 가진다.

기존 핵심 4인은 지원축:
- 서진우 — 외부 연결 / 응급 / 필요한 현장지원
- 윤서진 — 의료 / 건강
- 최은채 — 물류 / 기록
- 장태훈 — 난방 / 설비 / 급수 / 동파

중요:
**겨울 운영의 문제정의와 생활 우선순위를 핵심 4인이 먼저 결론내리지 않는다.**
하영·유진이 실제 생활 관점에서 먼저 본다.

GM current scene: `WINTER_REBOOT_HAYOUNG_YUJIN_LEAD`
Runtime save version anchor: `205`

## 3. Core four

- 서진우: 플레이어 캐릭터. 외부정찰·응급의료·정보·거점연결 중심.
- 윤서진: 응급의학과 전공의. 의료판단·건강관리.
- 최은채: 기록·물류·접근권·관계 경계.
- 장태훈: 발전기·급수·설비·부품·수리.

네 사람은 동등한 핵심축이다.
진우를 자동 지휘관·지역대표로 올리지 않는다.

### Speech continuity
핵심 4인은 친밀한 반말 종결.
씨/선생님 같은 굳은 호칭은 반말과 병존 가능.
존댓말 관계로 회귀시키지 않는다.

## 4. Character engine update

CHARACTER_BIBLE.md를 현재 캐릭터 정본으로 사용한다.

핵심:
- NPC = Desire / Fear / Contradiction / Strength / Shadow / Stress / Boundary / Tell / Relationship lens
- 진우의 성격은 GM이 고정하지 않음
- 반복 NPC는 진우가 없는 곳에서도 관계와 행동이 진행 가능
- 미래 연애·배신·사망·합류를 사전 확정하지 않음

### Name correction
Current canon: 신하영
Past alias in old Events: 이소라

오미정은 NON-CANON 역할중복 초안으로 폐기.

## 5. Two-base alliance

### 서림대학교 북서 실습센터
- 은닉 생활
- 의료
- 비축
- 후방복원
- 최소 발전·급수
- 비상철수

최근 겨울화:
- 전체난방 대신 생활·의료 핵심구역만 유지
- 미사용 공간과 동파위험 분기 차단·배수
- 첫 서리에서 파열 없음

### 북유성 농업기술 실증단지
- 관정
- 물
- 농업
- 종자
- 장기생산

최근 상태:
- 핵심 온실·관정 유지
- 외곽 화재피해 이후 외곽 온실 1구간 손실
- 손상 관수라인은 제한복구
- 노출배관 동파가 지속 위험
- 종자 일부는 두 거점으로 분산

### Alliance
총 7명 구조이나 합병 아님.
두 거점 재산·생활·운영은 독립.
공동방위·대량이동·거점포기 같은 큰 사안만 공동 판단.

## 6. Recent major history

### 서쪽 대형화재
- 지역 잔존 소방·행정·민간망과 실제 대응.
- 대응은 성과가 있었지만 실증단지 외곽 생산·관수 일부에 실제 피해.
- 준비가 피해를 줄였지만 사건 자체는 취소하지 못함.

### 두 번째 공공대피시설
- 문하진·정민규가 공개시설 후보의 전기·급수·화장실·접근성을 살림.
- 신하영은 식사·위생·가구 필요 파악.
- 최유진은 침구·세탁·수면구역·생활물자 회전.
- 둘은 연합원이 아니라 신뢰 가능한 공개 생활망.

### 광역 이상
- 북~북동 적색 발광과 수직 띠 반복.
- 무전 잡음 증가.
- 일부 아날로그 대역은 비정상적으로 먼 방송 수신.
- 대전 밖 복수 권역에서도 전력불안정·변압기 화재·무선/위성항법 이상 보고.
- 원인은 플레이어에게 미확정.

### 기존 48시간 겨울화

SUPERSEDED.
이번 리부트에서는 아직 실행되지 않았다.

## 7. Current vulnerabilities

- 장기 연료
- 전체건물 난방 불가능
- 화재로 줄어든 온실 보온여유
- 노출배관 동파
- 광역전력·통신 불안정
- 일부 철도·도시간 운송 축소
- 지역복구가 광역복구가 아닌 현장별 패치에 의존
- 이동인구와 공개대피시설 부담
- 자원거점에 대한 소문과 노출

## 8. External network

### High-value contacts
- 박민호: 이동형 119/정보·응급
- 강혜린: 북쪽 의원 의료
- 문하진: 잔존 행정·급수·시설
- 정민규: 외부 전기·시설 기술
- 최경희: 산림교육원/북쪽 교환망
- 한지수: 동천교 관리
- 김성호: 서쪽길 관리조
- 배철수·박재민: 폐시설·부품·물류
- 신하영: 조리·위생·단체생활
- 최유진: 세탁·침구·생활지원

### Boundary
외부협력 = 자동 연합가입이 아니다.
거점 위치·재고·출입권 공개는 별도 판단이다.

## 9. Current world model

WORLD_BIBLE.md 적용.

현재 공개적으로 확인된 세계는 아직 완전 무정부가 아니다.
행정·소방·의료·민간 자구망이 조각난 상태로 작동한다.

그러나:
- 광역복구보다 현장패치 의존
- 통신·연료·수송 취약
- 지역별 규칙 증가
- 공공기관 실행력의 편차 증가

로 인해 질서의 바닥이 얇아지고 있다.

정확한 향후 붕괴 사건과 순서는 GM-only다.

## 10. Runtime pressure snapshot

현재 리부트 기준:
- FOOD: 2 PRESSURE
- WATER: 2 PRESSURE
- POWER: 3 SEVERE
- FUEL: 3 SEVERE
- HEALTH: 2 PRESSURE
- ORDER: 2 PRESSURE
- MIGRATION: 3 SEVERE
- TRUST: 2 PRESSURE

이 값은 체크포인트 스냅샷이다.
실제 최신값은 `survival_rpg.world_pressures`가 우선한다.

## 11. Boot order for current continuation

현재 S02를 이어갈 때:

1. START_ROOM.md
2. BOOT.md
3. CHARACTER_BIBLE.md
4. WORLD_BIBLE.md
5. GM_CONTEXT_V1.md
6. PERSISTENT_CANON.md
7. CURRENT_STATE.json
8. 이 CURRENT_CHECKPOINT.md
9. check_runtime_consistency('AFTERFALL')
10. 장면 관련 인물만 지정한 get_gm_context
11. 필요할 때만 recent scenes → events

S01 RAW 전체를 정상부팅하지 않는다.
S02 START_HANDOFF는 시즌 시작 역사자료이며 현재 재개점이 아니다.

## 11-A. GM Context v1 migration

현재 Runtime은 GM Context v1으로 압축됐다.

- Save hot snapshot: 약 16만자 → 약 1.6만자
- known_world: 약 13만자 → 약 2천자
- 캐릭터 runtime: `survival_rpg.characters`
- Pressure: `world_pressures`
- Major scene memory: `scenes`
- Progress direction: `clocks`
- large time skip review: `world_ticks`
- 이전 거대 known_world 원본: `state_archives`

이 변경은 이야기 Canon을 삭제한 것이 아니라 현재 GM context에서 역사 산문을 분리한 것이다.

## 12. Spoiler guard

새 방 첫 출력에서:
- 다음 대형사건 설명 금지
- 정부 붕괴의 구체 촉발·시점 설명 금지
- NPC 미래관계 공개 금지
- 손실·사망 사전공개 금지

현재 장면에서 관찰할 수 있는 것부터 플레이한다.


## 13. Winter long-arc GM overlay

겨울 장기 에피소드 진행 시 GM은 다음 기획 overlay를 함께 적용한다.

- `seasons/S02/WINTER_LONG_ARC_GM_V1.md`
- 이 파일은 GM-only이며 플레이어에게 장기 단계, 예정 압력, 잠재 손실 구조를 공개하지 않는다.
- Supabase Runtime truth가 현재 수치/장면에 우선하고, 이 파일은 장기 인과·페이싱·NPC agency 운용 기준으로 사용한다.
- 특정 사망자/희생 거점/고정 패배를 사전 확정하지 않고, 구조적 수축의 구체 결과는 누적 상태와 플레이 결과로 판정한다.

## Live scene context
- 본편 재개 시 장면 관련 인물을 지정해 `get_scene_context()`를 우선 사용한다.
- 제작 메타가 포함된 확장 컨텍스트는 감사/기획 때만 사용한다.
- 상시 출력 후 금지어 검사는 사용하지 않는다. 메타 누수는 입력 경계에서 차단한다.
