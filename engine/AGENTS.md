# Thin Engine Codex Operating Rules

이 파일은 `engine/` 하위 구현 작업에 적용한다.
목적은 사용자가 기획방과 PC Codex 사이에서 긴 지시문을 반복 전달하지 않도록 GitHub Issue/PR 중심 개발 루프를 강제하는 것이다.

## Source of Truth
작업 시작 시 다음 순서로 확인한다.
1. 현재 GitHub Issue
2. 현재 Draft PR 및 최신 PR 댓글/리뷰
3. `docs/ZERO_AI_VERTICAL_SLICE_DECISION.md`
4. `docs/THIN_ENGINE_DELIVERY_PIPELINE.md`
5. `docs/THIN_ENGINE_SPEC_V0_1.md`
6. `docs/THIN_ENGINE_WEB_GAME_V0_1.md`
7. `docs/CODEX_MODEL_POLICY.md`
8. 필요 시 `core/PROJECT_DECISIONS.md`

현재 실험 방향과 기존 문서가 충돌하면 **Issue #13 + ZERO_AI_VERTICAL_SLICE_DECISION.md가 우선**한다.

## 현재 활성 Milestone
현재 유일하게 시작 가능한 다음 구현 Milestone은:

- **Issue #13 — M3-V Zero-AI Vertical Slice / Fun Validation**

기존 #7~#10은 이전 Roadmap 기록으로 종료되었으며 임의 재개하지 않는다.

## 기본 작업 루프
1. `git fetch origin`
2. 현재 branch / working tree / 최신 origin/main 확인
3. Issue #13 및 현재 설계문서 확인
4. #13 전용 branch 생성 또는 기존 branch 확인
5. Issue 범위만 구현
6. 필요한 로컬 테스트 실행
7. commit / push
8. Draft PR 생성 또는 갱신
9. GitHub Actions 확인
10. PR의 최신 기획/검수 댓글 직접 확인
11. 작은 문제는 같은 PR에서 Self-Heal
12. acceptance criteria 충족 시 `HUMAN FUN GATE READY`로 보고하고 멈춤

## Small Fix Self-Heal
현재 Issue/PR 범위 안에서 원인과 수정법이 명확한 작은 오류는 사용자가 다시 지시문을 전달할 때까지 기다리지 않는다.

예:
- 작은 validation condition 누락
- 명확한 event eligibility/cooldown 오류
- seeded RNG 테스트 누락
- 타입/스키마 정합성
- 작은 모바일 UI/CSS 문제
- 단순 회귀 테스트 누락
- lint/build/test의 원인이 명확한 오류

처리:
`원인 확인 → 같은 PR 최소 수정 → 관련 테스트 → 전체 회귀 → build → diff check → push → Actions → 자체 재검수`

## Self-Heal 금지 / HUMAN DECISION
다음은 임의로 확장하지 않는다.
- World Director 설계 철학 변경
- Family Decision 의미 변경
- M1/M2 핵심 contract 큰 변경
- OpenAI/Gemini/Ollama/MCP 등 Runtime AI 추가
- Netlify Functions/Blobs/Cloud Save 추가
- 인증/접근코드/친구 배포 추가
- Canon 의미 변경
- 새로운 비용 구조
- 외부 서비스 신규 도입
- 대규모 원인불명 버그

이 경우 `BLOCKED / HUMAN DECISION NEEDED`로 멈춘다.

## M3-V 구현 보호선
이번 Milestone의 목적은 전체 게임 완성이 아니라 **AI 0회로 20~30턴이 재미있는지 검증**하는 것이다.

따라서:
- 범용 framework 선행 제작 금지
- 사건 수백 개 선제작 금지
- 여러 Runtime Adapter abstraction 선행 구현 금지
- 서버/Cloud 선행 구현 금지
- S06 정식 Hidden Seed 생성 금지
- 실제 S06 시작 금지

필요한 최소만 만든다.

## 상태 변경 원칙
M3-V에서도 기존 M2 Validator/Action Queue를 우회하지 않는다.

World Director나 Family Decision Engine이 만든 상태 변경도 기존 deterministic validation/commit 경로를 사용한다.

## 모델 선택
Issue 맨 위 `Codex 권장 실행`을 따른다.
Issue #13은:
- 모델: **GPT-5.6 Sol**
- 추론: **High**

이유: Seeded RNG + World Director + Family Decision + 기존 State/Validator 통합이 한 Milestone에 걸쳐 있어 상태 정합성 비용이 높다.

단순 CSS/문구 보완을 위해 별도 모델 전환 왕복을 요구하지 않는다. 같은 실행 안에서 작은 수정은 Self-Heal한다.

## 완료 보고 형식
장문 설명 대신 아래만 보고한다.
- Issue / PR 번호
- branch
- 최신 HEAD
- 주요 구현 영역
- 테스트 결과
- build 결과
- GitHub Actions 상태
- 런타임 AI/API 호출 0 여부
- 서버 의존 0 여부
- 미해결 항목 또는 `없음`
- `HUMAN FUN GATE READY`: 예 / 아니오

## 핵심 원칙
> 먼저 AI 없는 작은 게임이 재미있는지 증명한다.
> 재미가 확인된 뒤 Cloud/AI/친구배포를 다시 설계한다.
> 구조·비용·보안·계정 결정은 사람이 한다.
