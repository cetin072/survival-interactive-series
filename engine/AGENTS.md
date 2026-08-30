# Thin Engine Codex Operating Rules

이 파일은 `engine/` 하위 구현 작업에 적용한다.
목적은 사용자가 기획방과 PC Codex 사이에서 긴 지시문을 반복 전달하지 않도록 **GitHub Issue/PR 중심 반자동 개발 루프**를 강제하는 것이다.

## Source of Truth
작업 시작 시 다음 순서로 확인한다.
1. 현재 GitHub Issue
2. 현재 Draft PR 및 최신 PR 댓글/리뷰
3. `docs/THIN_ENGINE_SPEC_V0_1.md`
4. `docs/THIN_ENGINE_WEB_GAME_V0_1.md`
5. `docs/CODEX_MODEL_POLICY.md`
6. 필요 시 `core/PROJECT_DECISIONS.md`

과거 채팅의 긴 전달문보다 GitHub 최신 상태를 우선한다.

## 기본 작업 루프
승인된 하나의 Milestone Issue만 작업한다.

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

## 금지
- main 직접 수정 금지
- 사용자의 명시적 승인 없이 main merge 금지
- 사용자의 명시적 승인 없이 Draft 해제 / Ready for review 금지
- 현재 Issue가 끝났다고 다음 Milestone Issue를 임의로 시작 금지
- 현재 Issue 범위를 넘는 선행 구현 금지
- AI 연결, Cloud Save, 인증, 배포 등 후속 기능을 현재 Issue가 요구하지 않으면 추가 금지
- 기존 Canon/SAVE/시즌 기록을 엔진 편의상 임의 변경 금지
- 실제 주소, 토큰, API key, password 등 민감정보 저장 금지

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

작업 도중 더 강한 모델이 필요해 보여도 범위를 임의 확대하지 않는다.

## 완료 보고 형식
장문 설명 대신 아래만 보고한다.
- Issue / PR 번호
- branch
- 최신 HEAD
- 실행한 테스트와 결과
- GitHub Actions 상태
- 미해결 항목 또는 `없음`
- `HUMAN GATE READY` 여부

## 핵심 원칙
> Milestone 내부는 Codex가 자율 반복하고, Milestone 사이는 사람이 승인한다.
