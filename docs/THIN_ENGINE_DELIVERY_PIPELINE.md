# Thin Engine Delivery Pipeline

상태: ACTIVE
목적: Thin Engine v0.1을 구현하면서 사용자가 기획방 ↔ PC Codex 사이를 반복 왕복하는 횟수를 줄인다.

## 운영 철학
기본은 **Human-Gated Semi-Automation**이며, 사용자 사전승인이 있는 구간은 **Fast Lane**을 사용한다.

핵심:
> Milestone 내부 = 자동 반복
> 일반 Milestone 사이 = 사람 승인
> Fast Lane Milestone 사이 = 사전승인 범위 안에서 연속 진행
> 작은 오류 = 같은 PR에서 Codex Self-Heal

현재 Fast Lane 사전승인 구간:
- M3 → M4 → M5
- 승인일: 2026-08-30
- M2는 기존 Human Gate 방식으로 검수한다.
- M2 최종 PASS 후 기획방이 Fast Lane 배치 지시문 1개를 제공한다.
- M3~M5는 Gate B가 없는 한 사용자가 단계별 승인 문구를 반복하지 않는다.
- M5까지 구현/기술검증이 끝나면 Fast Lane을 종료하고 기획방이 M3~M5 전체를 독립 재검수한다.
- M6는 다시 Human Gate 대상이다.

## 역할
### 기획방 / ChatGPT
- Milestone Issue 작성
- 모델/추론 추천
- 일반 구간 PR diff/테스트/설계 검수
- Fast Lane 시작 전 범위·중단조건·완료조건 고정
- Fast Lane 종료 후 M3~M5 배치 전체 독립 재검수
- 수정 필요 시 작은 수정은 직접 처리하거나 GitHub PR에 기록

### PC Codex
- Issue 직접 읽기
- 구현
- 테스트
- Draft PR
- PR 최신 댓글/리뷰 직접 확인
- 같은 branch/PR에서 반복 수정
- 각 Milestone 완료 전 diff를 Issue acceptance criteria와 대조해 자체 검수
- 원인이 명확한 작은 오류는 `engine/AGENTS.md`의 Small Fix Self-Heal로 스스로 수정
- Fast Lane에서는 이전 단계가 완전히 통과하고 Gate B가 없을 때만 다음 사전승인 Milestone으로 이동
- 범위/보안/비용 결정이 필요하면 `BLOCKED / HUMAN DECISION NEEDED`에서 정지

### 사용자
기본적으로 다음에만 개입한다.
1. 일반 Milestone 시작/병합 승인
2. 실제 화면/플레이 체감 확인
3. Gate B 구조/비용/보안/계정 결정
4. Fast Lane 종료 후 다음 큰 단계 승인

사용자가 코드/검수 내용을 채팅방 사이에 복사하는 것은 기본 운영이 아니다.

## Fast Lane 규칙
Fast Lane은 무검수 자동개발이 아니라 **사전승인된 연속 개발 + Milestone별 자동 검증 + 종료 후 독립 배치 검수**다.

M3~M5에서는 각 Milestone마다 반드시:
1. 최신 main fetch
2. 해당 Issue와 설계문서 확인
3. 전용 branch 생성
4. Issue 범위만 구현
5. 테스트/build/diff check
6. Draft PR 생성
7. GitHub Actions 확인
8. Codex 자체 diff 검수
9. 작은 문제는 같은 PR에서 Self-Heal 후 전체 재검증
10. acceptance criteria 충족 + 미해결 사항 없음 + Gate B 없음 확인
11. 사전승인 범위 안에서 Ready/squash merge
12. Issue 완료 확인
13. 다음 Milestone으로 이동

Fast Lane에서도 M3, M4, M5를 하나의 거대 branch/PR로 합치지 않는다.
각 Milestone은 별도 branch와 별도 PR로 기록한다.

Fast Lane 종료 후 기획방은 M3~M5 전체 diff와 테스트/Actions/설계 준수를 다시 독립 검수한다.
이때 발견되는 작은 보완은 기획방이 직접 수정하거나 별도 작은 수정 PR로 처리할 수 있다.
큰 구조 오류면 M6 전에 수정한다.

## Small Fix Self-Heal
다음은 Codex가 사용자 왕복 없이 같은 PR에서 스스로 고칠 수 있다.
- 누락된 작은 validation condition
- 명확한 edge case
- 단순 타입/스키마 정합성
- 테스트 누락
- 작은 CSS/문구/UI 정렬
- lint/build/test에서 원인이 명확한 오류

Self-Heal은 반드시 최소 수정이어야 하고, 수정 후 전체 관련 테스트/build/Actions를 다시 확인한다.

다음은 Self-Heal 금지:
- 아키텍처 변경
- Public/Hidden State 경계 변경
- 저장/인증 서비스 변경
- 보안 완화
- 비용 구조 결정
- Canon 의미 변경
- 새로운 외부 서비스 추가
- 대규모 원인불명 버그

## Fast Lane 즉시 중단 조건 — Gate B
- 아키텍처 범위 변경
- 저장 방식/인증 구조 변경
- 예상하지 못한 비용 또는 유료 플랜 필요
- 사용자 계정 로그인·권한 승인 필요
- API key/secret 실입력 필요
- 보안 경계 완화 필요
- 외부 서비스 신규 도입
- 테스트/Actions 실패가 Self-Heal로 해결되지 않음
- Issue/설계 문서 간 충돌
- 실제 UX가 설계에서 크게 벗어남

중단 시 현재 branch/PR을 안전하게 유지하고 다음 단계로 넘어가지 않는다.

## Gate
### Gate A — UX / 재미
사용자가 실제 브라우저에서 확인해야 하는 변경.
예: M0 Web Shell, 최종 M5 첫 플레이, M6 S01 회귀테스트.

M4 Renderer의 일반적인 시각 검수는 Fast Lane 안에서 진행한다.
단, 큰 UX 방향 변경이 발생하면 사용자 Gate로 승격한다.

### Gate B — 구조/비용/보안/계정
위 Fast Lane 즉시 중단 조건을 따른다.

### Gate C — Merge
일반 Milestone의 main 병합은 사용자 승인 후에만 한다.

M3~M5 Fast Lane에서는 사용자가 해당 연속 구간의 진행과 Milestone별 병합을 사전 승인한 것으로 본다.
단, 각 단계의 acceptance criteria·테스트·Actions·자체 diff 검수를 모두 통과해야 하며 Gate B가 없어야 한다.

## Milestone Roadmap
### M0 — Web Shell
목표: 브라우저에서 MUD 게임 골격 확인.
권장: Terra / Medium.

### M1 — Live State Engine
목표: AI와 분리된 현재 사실/시간/위치/자원 상태 모델과 deterministic transition 기반 구현.
권장: Sol / High.

### M2 — Validator + Action Queue
목표: 위치/시간/차량/행동충돌 및 복수선택 순차 비용을 프로그램이 강제.
권장: Sol / High.

### M3 — Cloud Save + Access + Web Deploy
목표: 개인 접근코드, PC↔모바일 이어하기, Netlify 배포/세이브.
권장: Sol / High.
상태: Fast Lane.

### M4 — MUD Renderer Automation
목표: FAMILY/RESOURCE/EVENT/AUTO/PHASE 등 상태 기반 자동 표현.
권장: Terra / Medium.
상태: Fast Lane.

### M5 — AI GM Integration
목표: Live State snapshot → AI narrative/choices/state proposal → Validator → Commit.
권장: Sol / High.
상태: Fast Lane 마지막 단계.

M3→M5를 한 번의 Codex 실행으로 묶을 때는 중간 모델 변경 왕복을 피하기 위해 **Sol / High 전체 실행**을 허용한다.

### M6 — S01 Regression / First End-to-End Test
목표: 이미 결과를 아는 S01 일부 구간으로 기억·정합성·입력·렌더링·AI 연결을 검증.
권장: Sol / High for debugging; normal run may use target production model.
상태: Human Gate.

### Next Gate
M6 통과 후에만 S06 Hidden World Seed 생성 및 첫 신규 웹 시즌을 시작한다.

## Codex 시작 명령 최소화
일반 새 Milestone 시작 시 사용자는 PC Codex에서 아래 수준의 짧은 지시만 한다.

`최신 main을 확인하고 승인된 다음 Thin Engine Milestone Issue를 직접 읽어 engine/AGENTS.md 규칙대로 진행해. HUMAN GATE READY에서 멈춰.`

Fast Lane 시작 시에는 기획방이 M3~M5 배치 실행 지시를 1회 제공한다.
Gate B가 없으면 사용자가 매 Milestone마다 승인 문구나 수정 지시를 반복하지 않는다.

## 완료 조건
각 Milestone은 다음이 모두 만족되어야 자체 PASS다.
- Issue acceptance criteria 충족
- 범위 이탈 없음
- 필요한 로컬 테스트 통과
- 관련 GitHub Actions 통과
- 미해결 PR 검수사항 없음
- 보안/비용/Canon 관련 예외 없음

Fast Lane 전체 완료 조건:
- M3/M4/M5 각각 별도 PR과 merge 기록 존재
- M0~M5 회귀 테스트 통과
- Gate B 미발생 또는 사용자 결정 후 해소
- M5 mock/실제 연결 경계가 설계와 일치
- 기획방 독립 배치 검수 대기 상태

## 취미 보호선
- 자동화 자체를 위한 대형 플랫폼을 만들지 않는다.
- CI/CD, Issue, Draft PR, AGENTS 규칙으로 해결 가능한 일에 별도 orchestration 서버를 만들지 않는다.
- 자동화가 플레이보다 더 큰 관리 프로젝트가 되면 확장을 중단한다.
