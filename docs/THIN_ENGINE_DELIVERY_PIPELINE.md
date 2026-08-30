# Thin Engine Delivery Pipeline

상태: ACTIVE  
기준일: 2026-08-30

목적: 사용자가 기획방 ↔ PC Codex 사이를 반복 왕복하지 않으면서도, 구현보다 **재미 검증을 먼저** 수행한다.

## 현재 최상위 결정
기존 `M3 → M4 → M5 Fast Lane`은 종료했다.

현재 유일한 다음 구현 Milestone:
- **Issue #13 — M3-V Zero-AI Vertical Slice / Fun Validation**

설계 기준:
- `docs/ZERO_AI_VERTICAL_SLICE_DECISION.md`

기존 #7~#10은 이전 로드맵 기록으로 `not_planned` 종료 상태다. #13 Fun Gate 전에는 재개하지 않는다.

## 핵심 원칙
> M1/M2는 유지한다.
> 런타임 AI 없이 먼저 20~30턴을 만든다.
> 재미가 확인되기 전에는 Cloud/AI/친구배포/대형 Content Pack을 확장하지 않는다.

## 역할
### 기획방 / ChatGPT
- 게임 구조와 재미 가설 정의
- Issue 작성 및 범위 잠금
- Codex 모델/추론 추천
- PR diff/테스트/Actions 독립 검수
- Small Fix는 필요 시 GitHub에서 직접 수정 가능
- 사용자 Fun Gate 결과를 바탕으로 다음 Roadmap 결정

### PC Codex
- GitHub Issue/문서를 Source of Truth로 읽음
- 구현/테스트/Draft PR
- 같은 PR에서 작은 오류 Self-Heal
- 범위 밖 확장 금지
- 기술 완료 후 `HUMAN FUN GATE READY`에서 멈춤

### 사용자
- M3-V가 준비되면 실제 모바일/모바일 폭에서 20~30턴 플레이
- 재미/반복감/가족 자율성/세계 독립성 판단
- Fun Gate PASS/FAIL 결정

## 현재 개발 루프
1. 최신 `origin/main` 확인
2. Issue #13과 `ZERO_AI_VERTICAL_SLICE_DECISION.md` 확인
3. #13 전용 branch에서만 구현
4. M0~M2 기존 엔진 재사용
5. 테스트/build/diff check
6. Draft PR
7. GitHub Actions
8. Codex 자체 diff 검수
9. Small Fix는 같은 PR에서 Self-Heal
10. acceptance criteria 충족 시 `HUMAN FUN GATE READY`
11. 기획방 독립 검수
12. 사용자 20~30턴 직접 플레이
13. Fun Gate 결과에 따라 다음 Roadmap 작성

## Small Fix Self-Heal
다음은 같은 PR에서 사용자 왕복 없이 수정 가능하다.
- 명확한 타입/스키마 오류
- 작은 validation 누락
- deterministic test 누락
- 명확한 event eligibility/cooldown 버그
- 모바일 레이아웃 소수 수정
- lint/build/test의 원인이 명확한 오류

Self-Heal 후 관련 전체 테스트/build/Actions를 다시 확인한다.

다음은 Self-Heal 금지:
- World Director 철학 변경
- Family Decision 의미 변경
- M1/M2 contract의 큰 변경
- Runtime AI/외부 서비스 추가
- Cloud Save/인증 추가
- Canon 의미 변경
- 새로운 비용 구조
- 대규모 원인불명 버그

이 경우 `BLOCKED / HUMAN DECISION NEEDED`로 멈춘다.

## M3-V 범위
### 포함
- M0 Web Shell 재사용
- M1 Live State 재사용
- M2 Validator / Action Queue 재사용
- Seeded RNG 최소 구현
- Minimal World Director
- Minimal Family Decision Engine
- 약 8~12 Event Archetype
- 최소 Scene Renderer
- 숫자 선택
- 복수선택 Queue
- 최소 자유행동 parser
- Local Save
- 로컬 검증 로그
- 모바일 폭 UI

### 제외
- OpenAI API
- Gemini API
- Ollama/Local LLM
- MCP
- Runtime AI Adapter
- Netlify Functions/Blobs 신규 사용
- Cloud Save
- 접근코드/친구 배포
- 대형 Content Pack
- 정식 S06 Hidden Seed/시즌

## Technical Gate
M3-V는 다음이 모두 만족되어야 기획방 기술검수로 넘어간다.
- AI/API runtime call 0
- 서버 의존 0
- Seeded RNG 재현 테스트
- event eligibility/cooldown/no-event 테스트
- Family Decision deterministic test
- 기존 M2 location/vehicle/time/action consistency 유지
- Action Queue 순차 revalidation 유지
- 반복 사건 억제
- Local Save basic regression
- M0~M2 전체 회귀
- build 성공
- GitHub Actions 성공
- Draft PR

## Human Fun Gate
기술 PASS가 곧 제품 PASS는 아니다.

사용자가 약 20~30턴 직접 플레이한 뒤 평가한다.
- 가족이 살아있는가
- 세계가 플레이어와 무관하게 움직이는가
- 반복적인 선택 노동이 아닌가
- 예상 밖 입력에 납득 가능한 대응이 있는가
- 다시 플레이하고 싶은가

### PASS
다음 Roadmap을 새로 설계한다. 후보:
- Content Pack 확장
- Cloud Save/배포
- Renderer 고도화
- 선택적 무료/로컬 Runtime Adapter
- S01 기반 회귀테스트

### FAIL
AI Adapter를 바로 붙이지 않는다.
먼저 실패 원인을 분류한다.
- World Director 문제
- Family Decision 문제
- 사건 다양성 문제
- Scene Grammar 문제
- 자유행동 문제
- UI/속도 문제

가장 작은 수정으로 다시 Slice를 테스트한다.

## 비용 원칙
기본 플레이 경로는 플레이 횟수에 비례하는 AI 종량제 비용을 요구하지 않는다.

향후 무료/로컬 Runtime Adapter를 추가하더라도 기본 엔진은 Adapter 없이 진행 가능해야 한다.

## 취미 보호선
- 재미 확인 전 범용 엔진화 금지
- 사건 수백 개 선제작 금지
- 여러 AI 벤더 동시 지원 금지
- 자동화 플랫폼 만들기 금지
- 친구 배포를 핵심 개발보다 앞세우지 않음

> 먼저 작은 게임을 실제로 재미있게 만든다.
