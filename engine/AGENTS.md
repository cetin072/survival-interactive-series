# Thin Engine Codex Operating Rules

이 파일은 `engine/` 하위 구현 작업에 적용한다.
목적은 사용자가 기획방과 PC Codex 사이에서 긴 지시문을 반복 전달하지 않도록 **GitHub Issue/PR 중심 반자동 개발 루프**를 강제하는 것이다.

## Source of Truth
작업 시작 시 다음 순서로 확인한다.
1. 현재 GitHub Issue
2. 현재 Draft PR 및 최신 PR 댓글/리뷰
3. `docs/THIN_ENGINE_SPEC_V0_1.md`
4. `docs/THIN_ENGINE_WEB_GAME_V0_1.md`
5. `docs/THIN_ENGINE_DELIVERY_PIPELINE.md`
6. `docs/CODEX_MODEL_POLICY.md`
7. 필요 시 `core/PROJECT_DECISIONS.md`

과거 채팅의 긴 전달문보다 GitHub 최신 상태를 우선한다.

## 기본 작업 루프
일반 구간에서는 승인된 하나의 Milestone Issue만 작업한다.

1. `git fetch origin`
2. 현재 branch / working tree / origin/main 최신 상태 확인
3. Issue와 연결 설계문서 확인
4. 해당 Issue 전용 branch가 없으면 생성
5. Issue 범위만 구현
6. 필요한 로컬 테스트 실행
7. commit / push
8. Draft PR 생성 또는 기존 Draft PR 갱신
9. GitHub Actions 확인
10. PR에 새 기획/검수 댓글이 있으면 직접 읽고 **같은 branch/같은 PR**에서 수정
11. 테스트와 Actions를 다시 확인
12. 더 이상 미해결 검수사항이 없으면 `HUMAN GATE READY` 상태로 보고하고 멈춤

## Small Fix Self-Heal
현재 Issue/PR 범위 안에서 원인과 수정 방법이 명확한 작은 오류는 사용자가 다시 지시문을 전달할 때까지 기다리지 않는다.

예:
- 누락된 조건 검사
- 작은 타입/스키마 정합성 수정
- 명확한 회귀 테스트 추가
- 사소한 UI/CSS/문구 수정
- 테스트에서 드러난 단순 edge case

처리:
`원인 확인 → 같은 PR에서 최소 수정 → 관련 테스트 추가/수정 → 전체 회귀테스트 → build → diff check → push → Actions 확인 → 자체 재검수`

다음은 Self-Heal 범위가 아니다.
- 아키텍처 변경
- 데이터 계약의 큰 변경
- 인증/보안 경계 변경
- 저장 서비스 변경
- 새로운 외부 서비스 도입
- 예상하지 못한 비용 발생
- Canon/게임 규칙의 의미 변경
- 원인이 불명확한 대규모 버그

이 경우 `BLOCKED / HUMAN DECISION NEEDED`로 멈춘다.

## Fast Lane 예외
`docs/THIN_ENGINE_DELIVERY_PIPELINE.md`와 해당 Issue에 **FAST LANE PRE-APPROVED**가 명시된 구간은 일반 Milestone Gate의 예외다.

현재 사전승인 범위가 유효한 동안 Codex는 기획방이 제공한 Fast Lane 배치 지시를 기준으로:
1. 현재 Milestone 구현
2. 테스트/빌드/Actions 확인
3. 변경 diff를 Issue acceptance criteria와 대조해 자체 검수
4. 작은 문제는 `Small Fix Self-Heal`로 같은 PR에서 반복 수정
5. 미해결 사항이 없고 Gate B가 없으면 사전승인 범위 안에서 Ready/merge
6. 최신 main을 다시 fetch한 뒤 다음 사전승인 Milestone으로 이동

할 수 있다.

Fast Lane에서도 각 Milestone은 **별도 branch + 별도 PR**을 유지한다. 여러 Milestone을 하나의 거대 PR로 합치지 않는다.

Fast Lane 즉시 중단 조건:
- 사용자 로그인/권한 승인 필요
- API key/secret 실입력 필요
- 비용/유료 플랜 결정 필요
- 보안 또는 인증 구조 변경 필요
- 외부 서비스 신규 도입 필요
- 설계문서/Issue 사이 충돌
- 테스트/Actions 실패가 작은 수정으로 해결되지 않음
- 실제 UX 방향을 사용자가 결정해야 함

중단 시 현재 branch/PR을 안전하게 유지하고 다음 Milestone으로 넘어가지 않는다.

## 금지
- main 직접 수정 금지
- 일반 구간에서 사용자의 명시적 승인 없이 main merge 금지
- 일반 구간에서 사용자의 명시적 승인 없이 Draft 해제 / Ready for review 금지
- Fast Lane이 아닌데 다음 Milestone Issue를 임의로 시작 금지
- 현재 Issue 범위를 넘는 선행 구현 금지
- AI 연결, Cloud Save, 인증, 배포 등 후속 기능을 현재 Issue가 요구하지 않으면 추가 금지
- 기존 Canon/SAVE/시즌 기록을 엔진 편의상 임의 변경 금지
- 실제 주소, 토큰, API key, password 등 민감정보 저장 금지
- Fast Lane이라도 Gate B를 무시하고 진행 금지

## 수정 피드백 처리
PR에 새 댓글/리뷰가 생기면 사용자가 내용을 복사해 주기를 기다리지 않는다.
최신 GitHub PR conversation을 직접 확인한다.

수정이 Issue 범위 안이면:
`수정 → 테스트 → commit → push → Actions 확인`
을 같은 PR에서 반복한다.

수정이 범위를 바꾸거나 아키텍처 결정을 요구하면 임의 확장하지 말고 `BLOCKED / HUMAN DECISION NEEDED`로 멈춘다.

## 모델 선택
Issue 맨 위의 `Codex 권장 실행`을 따른다.
Issue에 모델 지시가 없으면 `docs/CODEX_MODEL_POLICY.md`를 따른다.

기본:
- 일반 UI/React/보통 구현: Terra / Medium
- 단순 CSS·문구·반복 수정: Luna / Medium
- Live State/Validator/Cloud Save/AI Contract/복잡한 버그: Sol / High

여러 Milestone을 한 번의 Fast Lane 실행으로 묶어 사용자가 중간에 모델을 바꾸기 어려운 경우, 포함된 단계 중 가장 높은 요구 수준을 사용해도 된다.
M3→M5 배치 실행은 **Sol / High** 사용을 허용한다.

## 완료 보고 형식
장문 설명 대신 아래만 보고한다.
- 완료한 Issue / PR 번호
- 각 merge SHA
- 현재 branch / 최신 HEAD
- 실행한 테스트와 결과
- GitHub Actions 상태
- 미해결 항목 또는 `없음`
- Fast Lane 종료 / BLOCKED / HUMAN GATE READY 여부

## 핵심 원칙
> 일반 구간은 Milestone 사이 사람 승인.
> 사전승인 Fast Lane은 작은 오류를 자체 수정하며 승인된 마지막 Milestone까지 연속 진행.
> 구조·비용·보안·계정 결정은 사람이 한다.
