# 《생존일기》 S01 산불 Vertical Slice v0.1

상태: **DESIGN CANDIDATE / 비정식 Canon / 첫 Scenario Skeleton 샘플**

근거:
- Canon v2 S01 RAW는 설계 광산으로만 사용
- 과거 플레이어 선택을 정답으로 고정하지 않음
- 과거 대사를 런타임 대본으로 복제하지 않음

목적:
`Scenario Skeleton + Web Engine + AI GM` 구조가 그래픽 없이도 계속 읽고 싶은 플레이를 만드는지 검증한다.

---

## 1. Premise

2026년 9월 초 평일 저녁.
강풍 속 산불이 도시 외곽으로 확산되고 있다.

가족 네 명은 서로 다른 장소에 있다.

- 플레이어/준호 역할 — 회사
- 배우자/서윤 역할 — 병원
- 자녀/민석 역할 — 학원
- 아버지/정호 역할 — 산림과 밭에 가까운 외곽주택

통신은 아직 정상이고 가족 차량도 사용 가능하지만 퇴근시간 정체와 외곽도로 통제 가능성이 빠르게 커진다.

시즌의 핵심 질문은 단순히 `산불에서 도망칠 수 있는가`가 아니다.

> **흩어진 가족을 어떤 순서와 기준으로 합류시키며, 기존 두 거주지가 모두 흔들릴 때 가족이 계속 생활할 수 있는 새로운 안정상태를 만들 수 있는가?**

---

## 2. Start State

### Time
- 2026-09-03
- 18:17

### Family
- player: 회사
- wife: 병원
- son: 학원
- father: 외곽주택

### Vehicle
- 가족 차량 1대
- 플레이어 접근 가능
- 운행 가능

### Bases
- 도심 아파트
- 정호 외곽주택

### Public world
- 통신 정상
- 전력 정상 또는 대부분 정상
- 퇴근시간 교통 증가
- 강풍
- 원거리 산불/연기 확인
- 외곽 산림 인접도로 통제 가능성
- 병원 비상대응 가능성

---

## 3. Character Drives / Constraints

### 플레이어 / 준호 역할
Drive:
- 가족 전체 생존과 합류
- 상황을 통제 가능한 계획으로 만들고 싶어함

Constraint:
- 한 번에 한 장소에만 직접 갈 수 있음
- 모든 가족을 직접 구조할 수 없음

### 서윤 역할
Drive:
- 가족 안전
- 특히 자녀 안전에 민감
- 플레이어가 혼자 위험을 떠맡는 것을 경계

Constraint:
- 병원 비상대응/업무 인계 때문에 즉시 이탈하지 못할 수 있음
- 교통 통제에 따라 퇴근 가능성이 계속 변함

### 민석 역할
Drive:
- 가족과 합류
- 상황을 이해하고 스스로 도움이 되고 싶어함

Constraint:
- 미성년자
- 독립 장거리 이동수단 부족

Agency hooks:
- 지도/교통정보 확인
- 자신의 주변 상황 보고
- 안전한 범위에서 합류점 이동 제안 가능

### 정호 역할
Drive:
- 가족 안전
- 자신의 집과 지역 상황을 직접 판단
- 이웃/지역 책임을 쉽게 버리지 않음

Constraint:
- 외곽 도로 악화
- 산불 접근
- 이동이 늦어질수록 퇴로 감소

Agency hooks:
- 플레이어 명령에 자동 복종하지 않음
- 지역 지식으로 우회/후퇴/대피 판단 가능
- 주변 이웃을 확인하려 할 수 있음

---

## 4. Pressure Tracks

### A. Wildfire Pressure
0. 먼 연기/주의
1. 대피 준비 권고
2. 강풍 확산 가속
3. 외곽 일부 지역 대피 권고
4. 마을/거점 접근 위험
5. 특정 거주지 복귀 제한 또는 상실 가능

### B. Road Pressure
0. 퇴근시간 혼잡
1. 외곽 정체 증가
2. 주요 교차로 통제 예고
3. 특정 방향 진입 제한
4. 경찰 유도/일방향 대피
5. 주요 경로 상실

### C. Institution Pressure
0. 정상
1. 병원/학원 비상대응 준비
2. 학원 조기귀가, 병원 인계 시작
3. 병원 이탈 지연, 공공 대피수송 시작
4. 일부 기관 기능 축소

### D. Infrastructure Pressure
0. 정상
1. 통신 지연/정전 가능성 뉴스
2. 외곽 일부 정전
3. 충전/전력/정보 접근성 악화
4. 장기화 시 물/전력/유통 안정성 판단 필요

---

## 5. Anchor Events

### A1 — 산불이 가족 문제로 전환
강풍/재난문자/가족 분산/도로 악화가 동시에 드러난다.

### A2 — 첫 가족 합류 또는 첫 분리 고착
플레이어의 우선순위에 따라 누군가와 합류하거나, 가족이 서로 다른 대피축으로 갈라진다.

### A3 — 외곽 접근 체계가 무너짐
도로 통제/경찰 유도/정전 등으로 기존 계획이 수정되어야 한다.

### A4 — 기존 거주지의 안전 전제가 깨짐
외곽주택 또는 아파트, 최악에는 둘 모두가 즉시 복귀 가능한 거점이 아닐 수 있음이 드러난다.

### A5 — 거점 0 판단
가족은 `원래 집으로 돌아가기`보다 `계속 생활할 수 있는 장소 유지`를 목표로 재정의해야 한다.

### A6 — 새로운 안정상태
대피소/임시거처/도심/외곽/제3지역 중 하나를 중심으로 다음 국면의 생활 전략을 만든다.

---

## 6. Conditional Event Cards — Vertical Slice 18개

### E01 wife_cannot_leave_yet
Trigger:
- wife.location == 병원
- institution_pressure >= 1
Effect:
- 즉시 가족 4인 합류 계획 불가
Character:
- 서윤이 스스로 `나를 못 움직인다고 가정하라`는 식의 현실적 기준을 제안 가능
Choice Gate: NO

### E02 father_checks_neighbors
Trigger:
- father.location == 외곽주택
- wildfire_pressure >= 1
- father evacuation not committed
Effect:
- 정호 대피 지연 위험
Memory candidate:
- 플레이어가 정호 판단을 존중/무시/강제했는지
Choice Gate: 조건부 YES

### E03 son_reports_traffic
Trigger:
- son at 학원/대중교통권
- communication available
Effect:
- 플레이어보다 먼저 민석이 지도/주변상황 정보를 제시
Choice Gate: NO

### E04 academy_early_release
Trigger:
- institution_pressure >= 1
Effect:
- 민석 보호/합류 문제가 시간 민감해짐
Choice Gate: YES if no family pickup plan

### E05 first_road_control_notice
Trigger:
- road_pressure >= 2
Effect:
- 특정 외곽축 통제 예고
Choice Gate: NO, 다음 전략판단의 압력으로 사용

### E06 father_retreat_or_push
Trigger:
- father moving near degraded road
- road_pressure >= 2
Possible outcomes:
- 지역 지식으로 후퇴
- 이웃/앞차를 따라 위험축 유지
Choice Gate: YES only if player can meaningfully influence

### E07 son_safe_landmark_move
Trigger:
- son separated
- nearby public landmark available
- route judged safe
Effect:
- 민석이 합류 효율을 높이기 위해 제한적 독립 이동 가능
Choice Gate: NO if already consistent with player strategy

### E08 outer_power_loss
Trigger:
- infrastructure_pressure >= 2
- father/outer_house affected
Effect:
- 외곽 거점 위험 상승
- 정전 대비가 장기 시스템으로 남을 수 있음
Choice Gate: NO

### E09 first_family_reunion
Trigger:
- player reaches same safe location as one family member
Effect:
- 첫 합류
- 이후 동행/역할분담 가능
Memory candidate: major
Choice Gate: NO

### E10 public_evacuation_transport
Trigger:
- road_pressure >= 3
- public assembly area reached
Effect:
- 자가용 대신 공식 대피수송이라는 새 전략 등장
Choice Gate: YES

### E11 quick_supply_opportunity
Trigger:
- accessible store
- rising pressure but short time window
Effect:
- 물/간단식량/마스크/보조전원 확보 가능
Cost:
- 시간
Choice Gate: YES only if opportunity cost meaningful

### E12 forced_direction_traffic
Trigger:
- road_pressure >= 4
Effect:
- 경찰이 특정 방향으로만 차량을 보내거나 복귀를 차단
Choice Gate: NO; 기존 계획을 깨는 세계 변화

### E13 temporary_family_split
Trigger:
- institutional constraint + road controls
Effect:
- 2+1+1 또는 2+2 등 임시 팀 구조 발생
Engine:
- 팀별 위치/시간/정보 비대칭 유지
Choice Gate: YES if split strategy is player-controlled

### E14 shelter_quality_question
Trigger:
- immediate life threat reduced
- family at public shelter or temporary refuge
Effect:
- 전력/물/화장실/배급/혼잡 등 장기 거점성 평가 시작
Choice Gate: NO initially

### E15 home_return_uncertainty
Trigger:
- wildfire_pressure >= 4 OR authorities restrict return
Effect:
- 외곽주택 또는 아파트 복귀 가능성 불확실
Choice Gate: YES when deciding whether to wait/move

### E16 zero_base_realization
Trigger:
- both existing homes uncertain/unusable OR scenario forces explicit worst-case planning
Effect:
- 가족 목표가 `집으로 귀환`에서 `생활 가능한 장소 유지`로 변경
Memory candidate: major family strategic milestone
Choice Gate: YES

### E17 new_temporary_base_search
Trigger:
- zero_base_realization
Possible strategies:
- 공공 대피시설 유지
- 숙박시설
- 친척/지인
- 안전지역 임시거처
- 남쪽/제3지역 새 생활거점
Choice Gate: YES

### E18 base_strengthening_aftershock
Trigger:
- immediate wildfire phase stabilized
- at least one base reusable
Effect:
- 외곽주택 또는 다른 거점의 물/전력/식량/퇴로 약점 평가
- `강화`보다 `철수 기준`이 먼저 생김
Compression Zone 진입 가능
Choice Gate: YES for long-term specialization

---

## 7. Strategic Choice Gates

### G1 — 첫 가족 우선순위
- 민석
- 정호
- 서윤과 계획 조정
- 정보 우선

중요:
과거 선택 경로를 강제하지 않는다.

### G2 — 정호의 독립 판단을 어떻게 다룰 것인가
- 강하게 대피 요구
- 목적지만 합의
- 정호 지역 판단 존중
- 직접 합류 시도

관계 기억과 실제 안전 결과가 모두 발생할 수 있다.

### G3 — 첫 합류 이후 가족 분리 전략
- 현재 합류한 가족의 안전 우선
- 다른 가족 구조/합류 우선
- 공식 대피 체계 이용
- 독자 이동 유지

### G4 — 도로 체계 붕괴 대응
- 우회
- 차량 포기/대중수송
- 특정 가족 합류 포기 후 안전 확보
- 위험축 진입 감수

### G5 — 거점 0 대응
- 대피소 유지
- 민간 숙박
- 지인/친척
- 새로운 지역 임시거점

### G6 — 재난 이후 장기 거점 전략
- 도시 인프라 중심
- 외곽주택 강화
- 다중 거점
- 제3 퇴로 확보

---

## 8. Consequence Hooks

### C01 father_trust
정호 의견 존중/무시/강제 패턴이 이후 협조 방식에 영향.

### C02 son_growth
민석에게 안전한 범위의 독립 역할을 줬는지 여부가 이후 자율성에 영향.

### C03 spouse_coordination
서윤의 제약을 인정하고 역할을 분담했는지, 무리한 합류를 요구했는지가 관계 기억에 영향.

### C04 vehicle_preservation
차량을 보존했는지 여부가 거점 0 상황의 이동/물자 운반 가능성에 영향.

### C05 emergency_supplies
초기 짧은 물자 확보가 대피소/분리 상태에서 후속 부담을 줄일 수 있음.

### C06 base_risk_memory
산불을 겪은 외곽주택은 이후 영구적으로 `화재 접근 위험 + 철수 기준 필요`라는 특성을 가짐.

---

## 9. Family Memory Hooks

- `father_refused_then_cooperated`
- `player_respected_father_local_judgment`
- `player_forced_father_to_leave`
- `wife_accepted_separate_family_plan`
- `player_respected_wife_work_constraint`
- `son_completed_first_independent_safe_move`
- `family_first_reunion_during_wildfire`
- `family_lost_assumption_of_home_return`
- `family_defined_zero_base_plan`

이 메모리는 대사를 그대로 저장하지 않고 사건 의미를 저장한다.

---

## 10. Compression Zone

### CZ1 — Immediate crisis 이후 1~3일
조건:
- 가족 생존/임시거처 확보
- 즉시 구조 판단 없음

압축 표시:
- 기관 정상화/악화
- 가족 피로 회복
- 거주지 복귀 가능성
- 물자 소비
- 교통 회복
- 다음 전략 문제

### CZ2 — 거점 강화 반복
조건:
- 위험이 낮고 같은 종류의 정비 반복

압축 결과:
- 물/식량 저장
- 예비전원
- 가족 수면공간
- 중복 생활물자
- 차량 동선
- 퇴로 지도

작은 공사 하나마다 선택을 요구하지 않는다.

---

## 11. Possible End States

### END-A — 가족 합류 + 기존 생활권 복귀 가능
손실이 적은 종료.
그러나 산불 경험에서 새 철수규칙/비상준비가 남음.

### END-B — 가족 합류 + 외곽주택 제한/상실
도심 또는 다른 임시거점 중심으로 재편.

### END-C — 가족 합류 + 아파트 제한/상실
외곽 또는 제3거점 활용 필요.

### END-D — 두 거주지 모두 불확실
`거점 0 상태`에서 새로운 임시 생활권 확보.

### END-E — 가족 일부 장기 분리
모두 생존했지만 기관/교통 문제로 완전 합류 실패.
다음 에피소드/시즌 초반에 분리 상태가 이어질 수 있음.

Fail-forward 원칙상 차량·거점·자원 손실은 곧바로 게임오버가 아니다.

---

## 12. Vertical Slice 재미 검증

테스트에서 다음을 본다.

1. 첫 3턴 안에 가족별 개성이 드러나는가
2. 한 선택 후 최소 3~5개의 의미 있는 진행이 자연스럽게 발생하는가
3. 가족이 플레이어 지시 없이 정보를 찾거나 판단하는가
4. 선택지가 미세행동이 아니라 전략적 갈등인가
5. 세계 압력이 플레이어를 기다리지 않고 움직이는가
6. 과거 정답 경로를 몰라도 플레이 가능한가
7. 다른 선택을 해도 Anchor/Pressure가 자연스럽게 재조합되는가
8. 가족 기억이 다음 장면의 태도에 영향을 주는가
9. 즉시 위기 후 장기 거점 문제로 자연스럽게 확장되는가
10. 그래픽 없이도 다음 장면이 궁금한가

---

## 13. v0.2 전 검토 질문

- Anchor 6개가 너무 강해 플레이어 자유를 압박하지 않는가
- Event Card 18개 중 실제로 Choice Gate가 너무 많은가
- `거점 0`까지 한 Vertical Slice에 넣는 것이 과도하게 긴가
- 정호/서윤/민석의 Agency가 시스템적으로 충분히 구분되는가
- 산불 압력과 교통 압력이 서로 중복되지 않는가
- 첫 플레이에서 설명 없이도 이해되는가
