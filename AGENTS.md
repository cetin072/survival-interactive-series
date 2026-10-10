# Survival Interactive Series — 작업 기준

이 저장소는 생존 인터랙티브 시리즈의 Canon, 플레이 기록, 웹게임 런타임과 AI GM 실험을 함께 관리합니다.

## 작업 시작

- 일반 작업은 현재 Issue/요청 + `AGENTS.md` + 직접 관련 파일/테스트를 먼저 확인합니다.
- 큰 기능·여러 모듈 변경은 관련 부팅/기획 문서와 현재 Draft PR/review를 추가로 확인합니다.
- 아키텍처·보안·Runtime AI 경계·배포 구조 변경에서만 중앙 공통 표준 원문을 반드시 다시 확인합니다.
- 기존 Issue/branch/Draft PR이 있으면 같은 작업 흐름을 이어가고, 표준 도입만을 이유로 새 구현 브랜치를 중복 생성하지 않습니다.
- Canon, Raw Transcript, Hidden World Seed 등 프로젝트 고유 경계는 해당 작업과 직접 관련될 때 기존 문서와 현재 Issue를 우선합니다.


## 최상위 개발 원칙

> **가장 단순하고 구조가 명확한 실행본을, 이미 검증된 것을 최대한 재사용해 먼저 작동시킨다. 실제 사용에서 확인된 문제만 보강하고, 필요성이 확인된 만큼만 확장한다. 단, 비가역 위험은 먼저 막는다.**

- 구조는 그림으로 보았을 때도 책임, 입력·출력, 데이터 흐름, 의존관계, 실패 경계가 꼬이지 않아야 합니다.
- 다른 Automation의 검증된 구현이 적합하면 런타임 의존시키기보다 필요한 코드를 대상 영역으로 복제해 독립적으로 수정·발전시킵니다.
- 상세 공통 원칙의 source of truth는 `cetin072/ai-development-system/DEVELOPMENT_CONSTITUTION.md`입니다.
- 새 코드나 새 의존성을 추가하기 전에는 `생략 가능 → 기존 구현 재사용 → 표준/플랫폼 기본 기능 → 이미 쓰는 의존성 → 최소 새 코드` 순서로 확인합니다. 단, 보안·권한·입력 검증·데이터 보존·필수 오류 처리는 단순화를 이유로 줄이지 않습니다.
- Exact-head 검증, 승인 gate, 데이터 보존, receipt/recovery, 보안 검증은 코드 길이나 단계 수를 줄이기 위한 단순화 대상으로 보지 않습니다.

## 상태 우선 실행 원칙

- 운영·복구·설정 변경 요청은 가능 여부를 추측하기보다 현재 실제 상태와 기존 리소스를 먼저 확인합니다.
- 새 리소스를 만들기 전에 기존 Issue, branch, PR, 예약, job, 파일, receipt 등 재사용·수정 가능한 대상을 우선합니다.
- 안전하고 가역적인 작업은 가장 작은 실제 실행을 먼저 시도하고 결과를 확인합니다. 실행 가능한 경로를 실제 확인 없이 불가능하다고 단정하지 않습니다.
- `불가능`, `도구 없음`, `사용자 수동 필요` 판정은 실제 도구 확인 또는 실행 실패의 구체적 근거가 있을 때만 합니다.
- 실제 실패한 경우에만 다음 fallback으로 이동하며, 정상 경로가 성공했으면 불필요한 우회·중복 생성·추가 예약을 만들지 않습니다.
- Production, 보안·인증, 비공개 정보, 원본 훼손, Migration, 대량 삭제 등 비가역 위험이 큰 작업은 실행보다 안전 경계와 복구 가능성을 먼저 확인합니다.

## Bunker OS / 사업·사이트 전략 라우팅

- 생존일기 5년 방향, 실제 벙커 여정, 생존지식 사이트 전략, 수익화, 외부 사업/전략 자료, 사용자 행동 실험을 다룰 때는 `docs/bunker_os/NORTH_STAR.md`, `STRATEGY.md`, `SOURCE_LIBRARY.md`, `DECISION_LOG.md`, `EXPERIMENT_LOG.md`를 현재 Issue와 함께 확인합니다.
- `NORTH_STAR.md`는 장기 목적과 고정 약속, `STRATEGY.md`는 변경 가능한 현재 가설입니다. 새 자료는 Source → Decision/Experiment → Strategy 순서로 필요한 만큼만 반영합니다.
- Bunker OS는 게임 Canon/Worldline/GM 규칙을 대체하지 않습니다. 서사 플레이는 아래 Worldline/Boot 라우팅과 각 worldline의 권위 문서가 계속 우선합니다.
- 기존 Archive/Knowledge/Automation A·B·C의 검증된 백그라운드 운영은 Bunker OS 도입만을 이유로 중단·복제·재구축하지 않습니다.

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

## Learning Loop v0 파일럿

- 이 파일럿의 로컬 SOP는 [`docs/automation/skills/learning-loop-v0/SKILL.md`](docs/automation/skills/learning-loop-v0/SKILL.md)입니다.
- 사용자가 별도로 `Lesson 등록`을 요청하기를 기다리지 않습니다. **실질적인 개발 작업을 마칠 때** 다음 신호가 실제로 있었는지만 짧게 판정합니다: 사용자에 의한 개발 방식/판단 교정, 반복 실패, 사용자가 발견한 기계적 사전 검출 가능 버그, 재사용 가능한 더 단순·안전한 성공 절차, 기존 Rule/Skill/Gate 미준수.
- 신호가 없으면 아무 기록도 남기지 않습니다. 모든 작업을 회고하거나 별도 Lesson 문서를 만들지 않습니다.
- 신호가 있으면 현재 작업의 **기존 Issue 또는 Draft PR에만** `Learning Loop v0` 형식의 짧은 후보를 남깁니다. 별도 Issue·중앙 규칙·Skill을 자동 생성하지 않습니다.
- Canon / Worldline / RAW Transcript / GM 규칙 / Automation A·B·C 고유 계약 / 이미지·Archive·Knowledge의 프로젝트 전용 결정은 기본적으로 **생존일기 로컬**로 유지합니다.
- 둘 이상의 프로젝트에서 같은 개발 운영 문제가 반복되거나 보안·권한·데이터 무결성처럼 보편적 위험일 때만 중앙 공통 후보로 표시합니다.
- 이 파일럿은 Hook, background observer, 별도 DB, 새 예약을 사용하지 않으며 기존 Exact-head·승인·데이터 보존·Canon/RAW 안전 경계를 약화하지 않습니다.

## 검증

- 기존 테스트와 상태 검증을 삭제하거나 약화하지 않습니다.
- 웹 런타임 변경은 관련 테스트, build, 상태 검증과 필요한 Preview 확인을 거칩니다.
- 표준 감사 결과는 PASS / REVIEW / FIX로 구분하고, 직접 관련 없는 리팩터링은 후속 Issue로 분리합니다.
