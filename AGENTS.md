# Survival Interactive Series — 작업 기준

이 저장소는 생존 인터랙티브 시리즈의 Canon, 플레이 기록, 웹게임 런타임과 AI GM 실험을 함께 관리합니다.

## 작업 시작

- 일반 작업은 현재 Issue/요청 + `AGENTS.md` + 직접 관련 파일/테스트를 먼저 확인합니다.
- 큰 기능·여러 모듈 변경은 관련 부팅/기획 문서와 현재 Draft PR/review를 추가로 확인합니다.
- 아키텍처·보안·Runtime AI 경계·배포 구조 변경에서만 중앙 공통 표준 원문을 반드시 다시 확인합니다.
- 기존 Issue/branch/Draft PR이 있으면 같은 작업 흐름을 이어가고, 표준 도입만을 이유로 새 구현 브랜치를 중복 생성하지 않습니다.
- Canon, Raw Transcript, Hidden World Seed 등 프로젝트 고유 경계는 해당 작업과 직접 관련될 때 기존 문서와 현재 Issue를 우선합니다.

## Worldline / Boot 라우팅 — 하드 가드

- 사용자가 정확한 boot/handoff/checkpoint 파일명, worldline 이름, branch 이름, 특정 주인공의 연속 연대기를 명시하면 루트의 기본 부팅 절차보다 **그 명시적 대상이 우선**합니다.
- 정확한 파일이 default branch에 없다고 해서 파일이 없는 것으로 판단하지 않습니다. 저장소의 브랜치까지 확인해 실제 ref/path를 찾습니다.
- 독립 worldline을 찾은 뒤에는 그 branch의 BOOT/CURRENT_STATE/최신 handoff가 권위 소스이며, 다른 세계선의 `core/*`, `players/main/*`, `canon_v2/*`, `seasons*/*`를 fallback으로 섞지 않습니다.
- exact boot 또는 worldline identity를 확인하지 못하면 fail closed 합니다. 다른 주인공/세계선을 추정해 장면을 생성하지 않습니다.
- 저장소 수준 registry는 `WORLDLINE_ROUTER.md`를 확인합니다.
- 현재 상태보다 오래된 내부 계획 문서가 있어도 이미 플레이된 역사를 되감거나 과거 예정 사건을 소급 삽입하지 않습니다. 최신 handoff/current state가 시간축에서 우선합니다.

## 공통 웹 아키텍처 기준

- 웹 제작 공통 source of truth는 `cetin072/ai-development-system`의 `docs/WEB_ARCHITECTURE_STANDARD_V1.md`입니다.
- 핵심 원칙은 **Static by Default, Dynamic by Necessity**입니다.
- 이 프로젝트의 웹게임은 동적 앱이므로 JavaScript 사용 자체를 줄이는 것이 목표가 아닙니다.
- 게임 규칙·상태·선택·자유행동·AI 응답은 실제 필요에 따른 동적 처리로 인정합니다.
- 초기 게임 App Shell과 핵심 입력/선택 UI는 가능한 한 결정적으로 구성하고, 별도 후처리 race 때문에 존재 여부가 달라지지 않게 합니다.
- Runtime AI/API 실패 시 deterministic fallback, retry 또는 명시적 오류 상태를 제공합니다.
- AI는 제안하고 authoritative engine이 최종 상태를 확정하는 기존 책임 경계를 유지합니다.
- API 키·비밀값은 클라이언트에 노출하지 않습니다.
- loading / empty / error / retry 상태를 구분하고, 하나의 JS 오류가 이후 핵심 이벤트 초기화 전체를 막지 않게 설계합니다.
- 기존 정상 동작 구조를 표준 준수만을 이유로 대규모 재작성하지 않고 Issue #69에서 위험도 순으로 감사합니다.

## 브랜치 / PR / 배포

- `main`을 직접 수정하지 않습니다.
- 현재 Draft PR이 있으면 그 범위와 제품 결정을 존중합니다.
- Preview 전용으로 명시된 PR을 임의로 Ready/merge/Production 배포하지 않습니다.
- 사용자 승인 전에는 중요한 아키텍처 변경, 유료 API 비용 확대, Canon 영향 변경, main 병합, Production 배포를 하지 않습니다.

## 검증

- 기존 테스트와 상태 검증을 삭제하거나 약화하지 않습니다.
- 웹 런타임 변경은 관련 테스트, build, 상태 검증과 필요한 Preview 확인을 거칩니다.
- 표준 감사 결과는 PASS / REVIEW / FIX로 구분하고, 직접 관련 없는 리팩터링은 후속 Issue로 분리합니다.
