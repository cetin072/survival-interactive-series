# Thin Engine Delivery Pipeline

상태: ACTIVE
목적: Thin Engine v0.1을 구현하면서 사용자가 기획방 ↔ PC Codex 사이를 반복 왕복하는 횟수를 줄인다.

## 운영 철학
완전자동 개발이 아니라 **Human-Gated Semi-Automation**을 사용한다.

핵심:
> Milestone 내부 = 자동 반복
> Milestone 사이 = 사람 승인

## 역할
### 기획방 / ChatGPT
- Milestone Issue 작성
- 모델/추론 추천
- PR diff/테스트/설계 검수
- 수정 필요 시 GitHub PR에 직접 기록
- Human Gate에서 다음 단계 추천

### PC Codex
- Issue 직접 읽기
- 구현
- 테스트
- Draft PR
- PR 최신 댓글/리뷰 직접 확인
- 같은 branch/PR에서 반복 수정
- `HUMAN GATE READY`에서 정지

### 사용자
기본적으로 세 가지에만 개입한다.
1. Milestone 시작 승인
2. 실제 화면/플레이 체감 확인
3. main merge 및 다음 Milestone 진행 승인

사용자가 코드/검수 내용을 채팅방 사이에 복사하는 것은 기본 운영이 아니다.

## Gate
### Gate A — UX / 재미
사용자가 실제 브라우저에서 확인해야 하는 변경.
예: M0 Web Shell, M4 Renderer, 최종 S01 회귀테스트.

### Gate B — 구조/비용/보안
다음이 생기면 자동 진행 중단:
- 아키텍처 범위 변경
- 저장 방식 변경
- API 비용 구조 변화
- 인증/보안 결정
- 외부 서비스 신규 도입

### Gate C — Merge
main 병합은 사용자 승인 후에만 한다.
병합 뒤 다음 Milestone을 시작한다.

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

### M4 — MUD Renderer Automation
목표: FAMILY/RESOURCE/EVENT/AUTO/PHASE 등 상태 기반 자동 표현.
권장: Terra / Medium.

### M5 — AI GM Integration
목표: Live State snapshot → AI narrative/choices/state proposal → Validator → Commit.
권장: Sol / High.

### M6 — S01 Regression / First End-to-End Test
목표: 이미 결과를 아는 S01 일부 구간으로 기억·정합성·입력·렌더링·AI 연결을 검증.
권장: Sol / High for debugging; normal run may use target production model.

### Next Gate
M6 통과 후에만 S06 Hidden World Seed 생성 및 첫 신규 웹 시즌을 시작한다.

## Codex 시작 명령 최소화
새 Milestone 시작 시 사용자는 PC Codex에서 아래 수준의 짧은 지시만 한다.

`최신 main을 확인하고 승인된 다음 Thin Engine Milestone Issue를 직접 읽어 engine/AGENTS.md 규칙대로 진행해. HUMAN GATE READY에서 멈춰.`

이후 같은 Milestone 안에서는 사용자가 PR 댓글을 복사하지 않는다.
Codex가 GitHub 최신 PR 댓글/리뷰를 직접 읽고 반복 수정한다.

## 완료 조건
각 Milestone은 다음이 모두 만족되어야 Human Gate Ready다.
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
