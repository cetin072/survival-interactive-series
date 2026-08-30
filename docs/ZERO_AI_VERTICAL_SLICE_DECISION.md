# Zero-AI Vertical Slice Decision

상태: **ACTIVE DECISION**  
기준일: 2026-08-30

## 결정
기존 Thin Engine M3→M5 Fast Lane은 중단한다.

현재 최우선 목표는 독립 웹게임 전체를 완성하는 것이 아니라 다음 가정을 가장 싸고 빠르게 검증하는 것이다.

> **런타임 생성형 AI 호출이 0회여도 생존기록의 핵심 재미가 유지되는가?**

이를 위해 GitHub Issue #13 `Thin Engine M3-V — Zero-AI Vertical Slice / Fun Validation`을 현재 유일한 다음 구현 Milestone으로 사용한다.

## 배경
기존 M5는 OpenAI API 기반 AI GM을 전제로 했다. 그러나 ChatGPT Plus와 OpenAI API는 별도 과금이며, 이 프로젝트의 새로운 최상위 비용 제약은 다음과 같다.

> 개발 단계의 정액제 지출은 허용하지만, 플레이 횟수에 비례해 늘어나는 AI 종량제 비용은 기본 경로에서 허용하지 않는다.

이 때문에 런타임 AI를 게임 필수요소로 두는 설계를 재검토했다.

## 유지되는 자산
- M0 React/TypeScript/Vite Web Shell
- M1 Live State
- M2 Validator
- M2 Action Queue
- `AI proposes, engine commits`에서 파생된 **모든 상태 변경은 deterministic engine validation을 통과해야 한다**는 원칙
- 현대 가족 생존 MUD, 숫자 선택 + 자유행동, 가족 자율성, 시즌제, Discovery-first world 원칙

## 새 검증 구조
M3-V에서는 런타임 AI를 전혀 사용하지 않는다.

최소 구조:

```text
Player Input
    ↓
Minimal Intent Parser
    ↓
Action Queue / Validator
    ↓
Live State
    ↓
Seeded RNG
    ↓
Minimal World Director
    ↓
Minimal Family Decision Engine
    ↓
Event Archetype / Scene Renderer
    ↓
Next Turn
```

## 반드시 검증할 두 시스템
### World Director
단순 상태 저장이 아니라 세계가 플레이어와 독립적으로 움직이는 감각을 만든다.

Vertical Slice 수준의 최소 책임:
- 현재 상태에 맞는 event archetype eligibility 판단
- 사건 없음(`no_event`) 허용
- 동일 사건 반복 억제
- 시간/자원/분산/압력에 따른 외부 변화
- 고정 스크립트/정답 루트 없이 Seed 기반 선택

### Family Decision Engine
가족을 플레이어의 수동 명령 실행기가 아니라 제한적 자율성을 가진 행위자로 만든다.

Vertical Slice 수준의 최소 결과:
- 동의
- 조건부 동의
- 거절
- 지연
- 독립 행동

랜덤 거절 자체를 난이도로 사용하지 않는다. 현재 위험, 상태, 성향 등 설명 가능한 입력에 근거해야 한다.

## Seeded RNG
회귀 테스트 가능성을 위해 deterministic RNG를 사용한다.

향후 Save에는 최소 다음 버전/재현 정보가 필요할 가능성이 높다.
- `engine_version`
- `content_version`
- `save_schema_version`
- `world_seed`
- RNG 진행 상태 또는 동일 재현에 필요한 값

M3-V에서는 과잉 일반화하지 말고 Slice 재현에 필요한 최소만 구현한다.

## 콘텐츠 원칙
Vertical Slice에서 대형 Content Pack을 만들지 않는다.

약 8~12개의 event archetype과 최소 scene grammar만으로 20~30턴을 검증한다.

Content는 고정 사건 순서가 아니라 다음 조합형 구조를 우선한다.
- eligibility/trigger
- 상태/위치/시간 조건
- pressure effect
- cooldown/repetition guard
- state/world proposal
- scene slots
- action hooks

사용자가 아직 보지 않은 미래 사건을 공개 설계 문서에 상세히 기록하지 않는다.

## 자유행동
M3-V의 자유행동은 소수 핵심 동사/대상 기반 parser로 처리한다.

완벽한 자연어 이해가 목표가 아니다.
해석 불가 시 엔진은 추측해서 상태를 오염시키지 않고 의미 후보를 제시하거나 재입력을 요구한다.

## M3-V에서 하지 않는 것
- OpenAI API
- Gemini API
- Local LLM/Ollama
- MCP
- Runtime AI Adapter
- Netlify Functions/Blobs 신규 사용
- Cloud Save
- 접근코드/친구 배포
- 대형 Content Pack
- 정식 S06 Hidden World Seed
- S06 정식 플레이

## Fun Gate
M3-V 기술 완료는 성공 판정이 아니다.

사용자가 약 20~30턴을 직접 플레이한 뒤 다음을 평가한다.
1. 가족이 살아있는 것처럼 느껴지는가
2. 세계가 플레이어와 독립적으로 움직이는가
3. 선택이 반복 노동처럼 느껴지지 않는가
4. 예상 밖 입력에 최소한 납득 가능한 대응이 가능한가
5. 한 세션 더 하고 싶은가

Fun Gate PASS 전에는 Cloud Save/AI Adapter/친구 배포/대형 Content Pack으로 확장하지 않는다.

## 기존 Roadmap 상태
아래 기존 Issues는 2026-08-30 기준 `not_planned`로 닫아 역사 기록으로 보존한다.
- #7 기존 M3 Cloud Save + Access + Netlify Deploy
- #8 기존 M4 MUD Renderer Automation
- #9 기존 M5 OpenAI API AI GM Integration
- #10 기존 M6 S01 Regression / End-to-End Test

이 기능들이 영구 폐기된 것은 아니다. #13 Fun Gate 결과를 바탕으로 새 우선순위와 범위로 다시 Issue화한다.

## 비용 원칙
기본 플레이 경로는 런타임 AI 종량제 비용 없이 작동해야 한다.

향후 무료 AI/로컬 AI Adapter를 추가할 수 있지만 다음 불변조건을 지향한다.

> AI Adapter가 꺼지거나 실패해도 게임의 기본 진행은 계속 가능해야 한다.

## 취미 보호선
재미 검증 전에 범용 시스템, 대규모 콘텐츠 제작, 다중 벤더 Adapter, 복잡한 인증/배포를 선행하지 않는다.

> 먼저 20~30턴이 재미있는지 확인한다. 그 다음 확장한다.
