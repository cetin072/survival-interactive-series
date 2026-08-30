# Thin Engine Delivery Pipeline

상태: ACTIVE
목적: Thin Engine v0.1을 구현하면서 사용자가 기획방 ↔ PC Codex 사이를 반복 왕복하는 횟수를 줄인다.

## 운영 철학
기본은 **Human-Gated Semi-Automation**이며, 사용자 사전승인이 있는 구간은 **Fast Lane**을 사용한다.

핵심:
> Milestone 내부 = 자동 반복
> 일반 Milestone 사이 = 사람 승인
> Fast Lane Milestone 사이 = 기획방 검수 PASS 시 사전승인 범위 안에서 연속 진행

현재 Fast Lane 사전승인 구간:
- M3 → M4 → M5
- 승인일: 2026-08-30
- M2는 기존 Human Gate 방식으로 검수한다.
- M5 기술 검수 완료 후 Fast Lane을 종료하고 사용자에게 첫 플레이 가능 상태를 보고한다.
- M6는 다시 Human Gate 대상이다.

## 역할
### 기획방 / ChatGPT
- Milestone Issue 작성
- 모델/추론 추천
- PR diff/테스트/설계 검수
- 수정 필요 시 GitHub PR에 직접 기록
- 일반 Human Gate 또는 Fast Lane 진행 여부 판정

### PC Codex
- Issue 직접 읽기
- 구현
- 테스트
- Draft PR
- PR 최신 댓글/리뷰 직접 확인
- 같은 branch/PR에서 반복 수정
- 범위/보안/비용 결정이 필요하면 `BLOCKED / HUMAN DECISION NEEDED`에서 정지

### 사용자
기본적으로 다음에만 개입한다.
1. 일반 Milestone 시작/병합 승인
2. 실제 화면/플레이 체감 확인
3. Gate B 구조/비용/보안 결정
4. Fast Lane 종료 후 다음 큰 단계 승인

사용자가 코드/검수 내용을 채팅방 사이에 복사하는 것은 기본 운영이 아니다.

## Fast Lane 규칙
Fast Lane은 완전자동 병합이 아니라 **사전승인된 연속 개발 구간**이다.

M3~M5에서는:
- 이전 Milestone이 완료되고 기획방 기술 검수가 PASS이면 별도의 사용자 승인 문구 없이 다음 단계 진행 가능
- 기획방이 PR 검수와 수정 지시를 GitHub에서 관리
- Codex는 각 Issue 범위를 지키고 다음 Issue 조건이 충족될 때만 진행
- 구체적인 branch/PR 병합 방식은 해당 시점의 기획방 실행계획을 따른다.

Fast Lane 즉시 중단 조건:
- 아키텍처 범위 변경
- 저장 방식/인증 구조 변경
- 예상하지 못한 비용 또는 유료 플랜 필요
- 사용자 계정 로그인·권한 승인 필요
- API key/secret 입력 필요
- 보안 경계 완화 필요
- 외부 서비스 신규 도입
- 테스트/Actions 실패가 단순 수정으로 해결되지 않음
- Issue/설계 문서 간 충돌
- 실제 UX가 설계에서 크게 벗어남

중단 시 다음 단계로 넘어가지 않고 사용자 결정을 기다린다.

## Gate
### Gate A — UX / 재미
사용자가 실제 브라우저에서 확인해야 하는 변경.
예: M0 Web Shell, 최종 M5 첫 플레이, M6 S01 회귀테스트.

M4 Renderer의 일반적인 시각 검수는 Fast Lane 안에서 기획방이 처리한다.
단, 큰 UX 방향 변경이 발생하면 사용자 Gate로 승격한다.

### Gate B — 구조/비용/보안
다음이 생기면 자동 진행 중단:
- 아키텍처 범위 변경
- 저장 방식 변경
- API 비용 구조 변화
- 인증/보안 결정
- 외부 서비스 신규 도입
- 계정 권한 승인 또는 secret 입력 필요

### Gate C — Merge
일반 Milestone의 main 병합은 사용자 승인 후에만 한다.

M3~M5 Fast Lane에서는 사용자가 해당 연속 구간의 진행을 사전 승인했으므로, 기획방이 각 Milestone의 acceptance criteria·테스트·Actions·범위 준수를 확인한 뒤 사전승인 범위 안에서 다음 진행을 허용할 수 있다.
Gate B가 발생하면 이 사전승인은 즉시 중단된다.

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

### M6 — S01 Regression / First End-to-End Test
목표: 이미 결과를 아는 S01 일부 구간으로 기억·정합성·입력·렌더링·AI 연결을 검증.
권장: Sol / High for debugging; normal run may use target production model.
상태: Human Gate.

### Next Gate
M6 통과 후에만 S06 Hidden World Seed 생성 및 첫 신규 웹 시즌을 시작한다.

## Codex 시작 명령 최소화
일반 새 Milestone 시작 시 사용자는 PC Codex에서 아래 수준의 짧은 지시만 한다.

`최신 main을 확인하고 승인된 다음 Thin Engine Milestone Issue를 직접 읽어 engine/AGENTS.md 규칙대로 진행해. HUMAN GATE READY에서 멈춰.`

Fast Lane 시작 시에는 기획방이 M3~M5 배치 실행 지시를 별도로 제공한다.
Fast Lane 중 Gate B가 없으면 사용자가 매 Milestone마다 승인 문구를 반복하지 않는다.

## 완료 조건
각 Milestone은 다음이 모두 만족되어야 PASS다.
- Issue acceptance criteria 충족
- 범위 이탈 없음
- 필요한 로컬 테스트 통과
- 관련 GitHub Actions 통과
- 미해결 PR 검수사항 없음
- 보안/비용/Canon 관련 예외 없음

## 취미 보호선
- 자동화 자체를 위한 대형 플랫폼을 만들지 않는다.
- CI/CD, Issue, Draft PR, AGENTS 규칙으로 해결 가능한 일에 별도 orchestration 서버를 만들지 않는다.
- 자동화가 플레이보다 더 큰 관리 프로젝트가 되면 확장을 중단한다.
