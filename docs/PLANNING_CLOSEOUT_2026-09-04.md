# Planning Closeout — 2026-09-04

## 상태
현재 기획방의 웹/AI 실험 단계는 여기서 일단 마감한다.
다음 활동은 별도 채팅방에서 블라인드 정식 시즌 플레이로 전환한다.

## 1. 현재까지 확정된 제품 방향
- 현대 한국 기반 가족 생존 인터랙티브 드라마
- 초기 핵심판은 4인 가족 파티
- 플레이어는 준호 archetype 중심
- 가족은 독립 행동/반대/실수/성장 가능
- 재난은 단순 대피 이벤트가 아니라 가족·거점·사회 기능의 장기 변화로 이어질 수 있음
- 재미의 핵심은 캐릭터 애착 + 중요한 판단 + 선택의 장기 결과 + 가족/거점 성장

## 2. 시나리오 제작 방향
- 기존 실제 시즌 플레이를 IP/시나리오 광산으로 사용
- 과거 선택을 정답으로 고정하지 않음
- Golden Route는 대표 제작 기준선일 뿐 강제 경로가 아님
- Scenario Skeleton은 `고정 앵커 + 압박 트랙 + 조건부 사건 카드 + Choice Gate + 성장/보상` 방식
- 분기 폭발은 Scenario Graph의 재합류로 통제

## 3. 웹/엔진에서 확보한 기술 자산
- Canon v2 public runtime bridge
- authoritative state/engine commit
- Validator / Action Queue
- 선택지/자유행동/복수선택
- Story MUD UI
- local save/log/transcript export
- Compact GM Brief / Minimal Intent compiler
- family/world reaction proposal 구조
- Pro-first / Flash-on-retry 실험
- Live AI smoke 비용 통제
- UI 비주얼 방향 문서화

## 4. 현재 웹/AI 실험 상태
- Draft PR #67은 PREVIEW ONLY 상태 유지
- Production 미배포
- main 직접 수정/병합 없음
- Issue #57 Web Game MVP는 열어 두되 제품 방향상 일시 보류
- Runtime AI는 필수 기능으로 확정하지 않음
- OpenRouter key 자체는 유효하나 spending limit 소진 상태 확인
- 추가 결제/모델 비교는 현재 필요 없음
- 유료 Live Smoke는 명시적으로 요청한 marker 변경 커밋에서만 실행되도록 비용 차단 완료

## 5. 현재 가장 유망한 제품화 옵션
### 1순위 후보 — Hybrid
- 본편은 사전 제작 Scenario Graph + 웹 엔진
- 자유행동/예외행동/선택적 자유대화에만 Runtime AI

### 비교 후보
- No Runtime AI
- Full AI GM

어느 형태가 최종 제품이 될지는 실제 재미있는 시즌을 충분히 확보한 뒤 결정한다.

## 6. 지금 하지 않는 것
- 산불 시나리오 추가 반복 플레이
- OpenRouter 충전/모델 경쟁
- 대규모 UI 구현
- 캐릭터 무한 커스터마이징 개발
- 1인/커플/친구 4인 등 파티 확장
- 게임 출시를 위한 분기 대량 제작

## 7. 다음 단계
다른 채팅방에서 새로운 정식 시즌을 시작한다.

GM은:
- 재난을 사전 공개하지 않고
- 기존 산불 패턴을 피하며
- 플레이어에게 충분히 낯선 상황을 제공하고
- 시즌 번호 때문에 재난 규모를 약하게 제한하지 않으며
- 플레이어가 제작자가 아니라 플레이어로 즐기도록 운영한다.

시즌 종료 후 재미가 강했던 경우에만 이 기획방/게임화 파이프라인으로 다시 가져온다.

## 8. 새 시즌 부팅 기준
`docs/NEXT_SEASON_ROOM_BOOT_V1.md`를 사용한다.

## 관련 문서
- `docs/PLAY_FIRST_BUILD_LATER_DECISION_V1.md`
- `docs/BLIND_SEASON_PLAY_PROTOCOL_V1.md`
- `docs/SEASON_TO_GAME_PRODUCTION_PIPELINE_V1.md`
- `docs/NEXT_SEASON_ROOM_BOOT_V1.md`
- `docs/PRODUCT_DESIGN_FOUNDATION_V1.md`
- `docs/SCENARIO_SKELETON_SPEC_V1.md`
- `docs/WEB_ENGINE_RESPONSIBILITY_V1.md`
- `docs/UI_VISUAL_DIRECTION_V1.md`
- `docs/GM_LIVE_TEST_COST_POLICY.md`

## 마감 원칙
**Play First. Build Later.**

지금은 게임을 만들기 위해 노는 것이 아니라, 재미있게 놀다 보니 나중에 게임으로 만들 가치가 있는 시즌을 발견하는 단계다.