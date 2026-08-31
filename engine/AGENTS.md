# Thin Engine Codex Operating Rules

이 파일은 `engine/` 하위 구현 작업에 적용한다.
목적은 사용자가 기획방과 PC Codex 사이에서 긴 지시문을 반복 전달하지 않도록 GitHub Issue/PR 중심 개발 루프를 유지하는 것이다.

## Source of Truth
작업 시작 시 다음 순서로 확인한다.
1. 현재 GitHub Issue
2. 현재 Draft PR 및 최신 PR 댓글/리뷰
3. `docs/PERSONAL_RUNTIME_ARCHITECTURE_V1.md`
4. `docs/CODEX_MODEL_POLICY.md`
5. `docs/THIN_ENGINE_DELIVERY_PIPELINE.md`
6. 필요 시 `docs/THIN_ENGINE_SPEC_V0_1.md`
7. 필요 시 `docs/THIN_ENGINE_WEB_GAME_V0_1.md`
8. 필요 시 `core/PROJECT_DECISIONS.md`

현재 Issue가 과거 설계문서와 충돌하면 **현재 Issue + PERSONAL_RUNTIME_ARCHITECTURE_V1.md가 우선**한다.

과거 Zero-AI 실험 문서와 Issue #13은 검증 기록이며 현재 개인 플레이 아키텍처의 우선 기준이 아니다.

## 현재 활성 개발
현재 S06 시작 전 허용된 우선 구현은:

- **Issue #22 — GM Coprocessor v1: Netlify State Console + State Compiler + CI validation**

목표:
> AI GM의 기억·상태검산 부담을 줄여 시나리오·가족 자율성·대사·세계 압력에 더 집중하게 한다.

Issue #22 완료 후에는 치명적 상태 오류가 아니라면 기능 개발을 멈추고 S06~S08 플레이테스트를 우선한다.

## 기본 작업 루프
1. `git fetch origin`
2. 현재 branch / working tree / 최신 origin/main 확인
3. 현재 Issue와 위 Source of Truth 문서 확인
4. 기존 관련 branch/PR이 있으면 재사용, 없으면 Issue 전용 branch
5. Issue 범위만 구현
6. 필요한 로컬 테스트 실행
7. commit / push
8. Draft PR 생성 또는 갱신
9. GitHub Actions 확인
10. PR의 최신 기획/검수 댓글 직접 확인
11. 작은 문제는 같은 PR에서 Self-Heal
12. acceptance criteria 충족 후 보고하고 멈춤

main 직접 수정, Draft 해제, merge, Production 범위 확대는 사용자/기획방 승인 없이 하지 않는다.

## Small Fix Self-Heal
현재 Issue/PR 범위 안에서 원인과 수정법이 명확한 작은 오류는 사용자가 다시 지시문을 전달할 때까지 기다리지 않는다.

예:
- validation condition 누락
- 타입/스키마 정합성
- 테스트 누락
- 작은 모바일 UI/CSS 문제
- 빌드 설정의 명확한 오류
- cache-busting 또는 fetch fallback의 작은 오류
- lint/build/test의 원인이 명확한 오류

처리:
`원인 확인 → 같은 PR 최소 수정 → 관련 테스트 → 전체 회귀 → build → diff check → push → Actions → 자체 재검수`

## Self-Heal 금지 / HUMAN DECISION
다음은 임의로 확장하지 않는다.
- Personal AI GM 아키텍처 변경
- RUNTIME_STATE의 Source of Truth 의미 변경
- M1/M2 핵심 contract 큰 변경
- AI GM ↔ Engine 신규 런타임 계약 설계
- OpenAI/Gemini/Ollama/MCP 등 별도 Runtime AI 추가
- Netlify Functions/Blobs/Cloud Save 추가
- 인증/접근코드/친구 배포 추가
- Canon 의미 변경
- Hidden/Public 경계 변경
- 새로운 비용 구조
- 외부 서비스 신규 도입
- 대규모 원인불명 버그

이 경우 `BLOCKED / HUMAN DECISION NEEDED` 또는 모델 승급이 필요한 경우 `MODEL ESCALATION RECOMMENDED`로 보고하고 멈춘다.

## 상태 변경 원칙
상태 관련 구현은 기존 Validator/Action Queue와 새 RUNTIME_STATE 규격을 우회하지 않는다.

- 기계적 현재 상태는 구조화 파일에서 관리한다.
- UI는 source state를 임의 보정하지 않는다.
- 파생 정보는 deterministic compiler/view logic으로 만든다.
- Hidden GM 정보는 공개 Netlify State Console에 fetch/render하지 않는다.

## 모델 선택 — 반드시 정책 문서 사용
모델 선택의 단일 기준은:

`docs/CODEX_MODEL_POLICY.md`

이 파일에서 Luna/Terra/Sol 기준을 복제하거나 별도 해석하지 않는다.
현재 Issue 맨 위의 `Codex 권장 실행` 값을 따른다.

빠른 기억용 한 줄만 유지한다:
> **Luna = 실행이 단순 / Terra = 구현 / Sol = 설계 판단. Terra 안에서는 복잡도에 따라 Medium ↔ High.**

중요:
- 작업이 중요하다는 이유만으로 Sol을 사용하지 않는다.
- 파일 수가 많다는 이유만으로 Sol을 사용하지 않는다.
- 설계가 확정된 복잡 구현은 Terra + High가 우선이다.
- 설계/상태계약 자체를 다시 결정해야 할 때 Sol + High 승급을 검토한다.

현재 Issue #22 권장값은 Issue 본문을 따른다.

## Codex 역할
Codex는 실시간 GM이 아니다.

Codex 담당:
- State Compiler / Validator 구현
- 테스트/회귀테스트
- GitHub Actions
- Netlify State Console
- 배포/QA
- 시즌 종료 후 반복 오류 패치

AI GM 담당:
- 자유행동/복합행동 이해
- 장면/대사
- 가족 자율성
- 세계 반응
- 선택지/압력 배치

## 완료 보고 형식
장문 설명 대신 아래만 보고한다.
- Issue / PR 번호
- branch
- 최신 HEAD
- 주요 구현 영역
- 테스트 결과
- build 결과
- GitHub Actions 상태
- Netlify 배포 상태/URL(해당 시)
- Hidden state 미노출 여부(해당 시)
- 미해결 항목 또는 `없음`
- 모델 승급 필요 여부

## 핵심 원칙
> AI GM은 세계를 연기하고 판단한다.
> 엔진은 기억하고 검증하고 보여준다.
> Codex는 그 보조 시스템을 구현하고 검증한다.
> 모델 선택은 중요도가 아니라 설계 불확실성과 구현 복잡도로 결정한다.
