# Play First / Build Later Decision v1

## Status
**APPROVED — 2026-09-04**

이 문서는 《생존일기》의 현재 최우선 제작 방향을 고정한다.

## 1. 현재 최우선 목표
지금 당장 웹게임 완성을 최우선으로 두지 않는다.

현재 0순위 목표는:

> **ChatGPT 기반 블라인드 시즌 플레이를 충분히 즐기면서, 실제로 재미있는 IP와 플레이 데이터를 축적하는 것.**

웹/엔진/런타임 AI는 이 경험에서 검증된 구조를 나중에 제품화하기 위한 수단이다.

## 2. 플레이가 곧 IP 프로토타이핑
새 시즌은 제작자가 정답 경로를 미리 보는 방식이 아니라 플레이어가 재난과 장기 규모를 모르는 상태에서 시작한다.

플레이 중에는:
- 재미와 몰입 우선
- 재난 종류·규모·장기전 여부 사전 공개 금지
- 평온기 압축
- 가족 독립행동 유지
- 중요한 선택만 플레이어에게 요청
- 실패는 가능한 한 fail-forward
- 실제 선택과 GM 반응을 RAW로 보존

플레이가 끝난 뒤에만 구조를 분석한다.

## 3. 과거 시즌의 용도
기존 시즌과 앞으로의 시즌은 단순 과거 로그가 아니다.

각 시즌은 다음의 원재료가 된다.
- Golden Route 후보
- 재난/사건 구조
- 가족 갈등 패턴
- Choice Gate 패턴
- 세계 압박 패턴
- 장기 인과관계
- 거점/성장 보상
- 캐릭터 기억과 관계 변화
- 삽화/영상/IP 장면 후보

과거 사용자의 선택을 정답으로 고정하지 않는다.

## 4. 향후 게임화 원칙
언젠가 특정 시즌을 게임으로 만들기로 결정하면 먼저 **AI 없는 버전도 충분히 가능한지 검토**한다.

우선순위:
1. 재미있는 실제 시즌 선택
2. 대표 Golden Route 추출
3. 대체 분기 시뮬레이션
4. 분기들이 다시 합류 가능한 Scenario Graph로 구조화
5. 웹 엔진으로 시간/위치/가족/자원/도로/거점/관계 상태를 확정
6. 사전 제작 시나리오만으로 충분한 경험인지 테스트
7. 필요한 경우에만 런타임 AI 추가

## 5. Runtime AI의 현재 지위
Runtime AI는 **필수 기능으로 확정하지 않는다.**

가능한 제품 형태는 세 가지다.

### A. No Runtime AI
- 사전 제작 Scenario Graph
- 엔진 기반 상태/분기
- 최고 안정성/최저 비용

### B. Hybrid Runtime AI — 현재 가장 유망한 후보
- 대부분 사전 제작
- 예상 밖 자유행동, 자유대화, 일부 캐릭터 반응에서만 AI 호출
- AI는 와일드카드 처리기/연기 증폭기 역할

### C. Full AI GM
- 높은 자유도
- 높은 비용/QA/안정성 부담
- 현재는 연구 옵션

최종 선택은 실제 플레이 품질과 제품화 필요성으로 결정한다.

## 6. 당분간 중단/보류
- OpenRouter 유료 모델 비교
- 반복 Live AI smoke
- AI 모델 미세 최적화
- 대규모 UI/그래픽 구현
- AI 런타임을 전제로 한 과도한 엔진 확장

OpenRouter 키는 유효하지만 spending limit이 소진된 상태이며, 제품 방향상 지금 즉시 추가 결제/실험할 이유가 없다.

## 7. 유지하는 기술 자산
기존 웹 실험은 폐기하지 않는다.

보존 가치가 높은 것:
- Canon v2 public runtime bridge
- Validator / Action Queue
- authoritative engine commit
- Story + choice/free-action UI
- local save/log/transcript
- Compact GM Brief
- Minimal Intent compiler
- Pro-first / Flash-on-retry 구조
- AI live-test 비용 통제 장치
- MUD Story UI

이들은 향후 제품화 시 재사용 후보이다.

## 8. 제품 정체성
현재 핵심 정체성은 유지한다.

> **현대 한국을 배경으로, 살아 움직이는 가족과 함께 재난을 버티고 거점과 가족의 역사를 축적하는 인터랙티브 생존 드라마.**

초기 핵심판은 4인 가족 파티를 기준으로 한다.

관련 문서:
- `docs/PRODUCT_DESIGN_FOUNDATION_V1.md`
- `docs/SCENARIO_SKELETON_SPEC_V1.md`
- `docs/WEB_ENGINE_RESPONSIBILITY_V1.md`
- `docs/UI_VISUAL_DIRECTION_V1.md`
- `docs/GM_LIVE_TEST_COST_POLICY.md`

## 9. 재개 조건
웹게임 제작을 본격 재개하는 조건은 다음 중 하나다.
- 플레이 중 "이 시즌은 게임으로 만들고 싶다"는 강한 후보가 생김
- 여러 시즌에서 반복되는 핵심 재미 패턴이 충분히 확인됨
- 특정 단편 게임 출시를 실제 목표로 정함

그 전까지는 **Play First. Build Later.**