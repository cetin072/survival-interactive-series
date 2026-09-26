# GM Live Test Cost Policy

## Purpose

《생존일기》의 AI GM 품질을 실제 배포 환경에서 검증하되, 개발 과정의 반복 커밋이 모델 비용을 자동으로 소모하지 않도록 한다.

핵심 원칙:

> **무료 검증은 자주, 유료 실전 검증은 의도적으로.**

## 1. 기본 개발 루프 — AI 비용 0원

일반 코드 수정마다 자동으로 수행해도 되는 것:
- unit tests
- runtime/schema validation
- Validator / Action Queue regression
- transport contract tests
- TypeScript build
- Vite build
- Netlify Deploy Preview build

이 단계에서는 실제 OpenRouter 생성 호출을 하지 않는다.

## 2. Quick Live Smoke — 기본 5회

다음 같은 의미 있는 변경 후에만 실행한다.
- GM provider routing 변경
- Compact GM Brief 변경
- story compiler / state_hints 변경
- transport retry/fallback 변경
- narrative quality guard의 큰 변경
- human playtest 직전 안정성 확인

실행 조건:
- 최신 PR head commit이 `engine/web/public/live-smoke-marker.txt`를 직접 변경해야 한다.
- marker는 `quick-*` 형태로 사용한다.

검증 범위 예시:
1. 기본 numbered choice
2. ordered multi-choice
3. 복합 조건부 free action
4. 연속 turn 1
5. 연속 turn 2 / free action

목표:
- 5/5 commit
- transport error 없음
- story가 실제로 전진
- 다음 strategic choices 2–4개
- 보이는 마지막 MUD 시간과 engine time이 충돌하지 않음

## 3. Full Live Smoke — 10회

다음 경우에만 실행한다.
- Pro 품질 기준을 최종 고정할 때
- 더 싼 모델과 정식 A/B benchmark를 시작할 때
- 큰 provider/backend 구조 교체 후
- release candidate 직전

실행 조건:
- marker를 `full-*` 형태로 변경한다.

Full smoke는 numbered 1–4, ordered choice, 복합 free actions, 연속 3-turn을 포함한다.

## 4. Key preflight

Live Smoke는 실제 story generation 전에 Preview-only key health check를 수행한다.

다음 경우 story generation을 0회로 유지하고 즉시 중단한다.
- key missing
- invalid key
- key spending limit exhausted
- key status endpoint unavailable

키 문자열, 정확한 한도 금액, 계정 사용액은 로그나 브라우저에 노출하지 않는다.

## 5. Runtime model-call policy

최종 목표 구조:

```text
Normal turn
→ primary model 1 call
→ success: finish

Primary transient failure only
→ same checkpoint/input transport retry 1 time
→ emergency fallback model 1 call
→ success: one authoritative commit
```

금지:
- 매 턴 primary + fallback 동시 호출
- 품질 비교 목적 없는 반복 재생성
- 일반 커밋마다 10-turn live smoke
- 같은 실패를 사용자가 직접 여러 번 눌러 재현하게 하기

## 6. Quality-before-price benchmark

가성비 모델 탐색은 최종 Pro-level 기준 대본을 먼저 확보한 뒤 시작한다.

비교 기준:
- character consistency
- situational judgment
- player-action understanding
- family autonomy
- story progression per turn
- meaningful beats per turn
- choice fatigue
- continuity
- Korean dialogue/addressing
- latency
- cost per successful committed turn

단순 token 단가가 아니라 다음을 본다.

> **비슷한 품질을 가장 낮은 `성공 턴당 비용`으로 내는 모델**

낮은 가격 모델이 재시도/실패/짧은 장면 때문에 두세 번 호출된다면 실제 가성비는 나쁠 수 있다.

## 7. Current incident lesson

2026-09-04 Preview 안정성 작업 중 반복 Live Smoke가 누적되어 OpenRouter Preview key spending limit이 소진됐다.

이후 정책:
- paid smoke는 opt-in
- Quick 5가 기본
- Full 10은 milestone 전용
- key preflight로 blocked key에는 inference call 0회
- 사용자에게 반복 Preview 클릭을 디버깅 수단으로 요구하지 않는다.
