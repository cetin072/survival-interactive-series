# Codex Handoff — GM Pipeline v2

이 문서는 Codex 실행용 짧은 handoff다. 상세 설계는 `docs/GM_PIPELINE_V2_ARCHITECTURE.md`를 Source of Truth로 사용한다.

## 작업 위치
- Repository: `cetin072/survival-interactive-series`
- Branch: `feature/ai-gm-deepseek-provider`
- Draft PR #66 유지
- PR #67은 Netlify Deploy Preview 전용이며 병합 금지
- 새 branch / 새 PR 생성 금지

## 현재 상태
이미 planning room에서 다음 scaffold가 추가됐다.
- `engine/web/src/server/compactStoryPipeline.ts`
- `engine/web/src/server/compactStoryPipeline.test.ts`

Codex는 이를 무조건 신뢰하지 말고 설계 문서와 기존 engine contract에 맞는지 먼저 검토한다. 필요하면 수정한다.

## 목표
현재 OpenRouter Story Provider가 AI에게 full `GMProposal` / Action Queue JSON을 직접 작성시키는 구조를 제거한다.

AI는 다음에 집중한다.
- story
- 4 choices
- bounded minimal state_hints

서버가 state_hints와 authoritative state를 기존 `GMProposal`로 compile한다.

기존 아래 원칙은 유지한다.
- `AI proposes, Engine commits`
- Validator / Action Queue
- Public-only transport
- Hidden/RAW 차단
- Mock/Null provider
- safe fallback

## 반드시 할 일
1. `docs/GM_PIPELINE_V2_ARCHITECTURE.md` 읽기.
2. 기존 `openRouterStoryProvider.ts`, `gmProposal.ts`, `gmTurnRuntime.ts`, Validator/Action Queue 경계를 확인.
3. `compactStoryPipeline.ts` scaffold를 검토하고 필요한 수정.
4. OpenRouter provider 입력을 `buildCompactGMBrief()` 기반으로 전환.
5. AI output schema를 `story + choices + state_hints`로 축소.
6. provider 내부에서 compact candidate를 normalize/validate 후 server compiler로 기존 `GMProposal` 생성.
7. AI에게 action id/from/presentation_blocks/family_reactions/full action JSON을 생성시키지 않기.
8. 기존 browser `/api/gm` response contract는 가능한 한 유지해 UI/engine 회귀를 최소화.
9. malformed/unknown hints는 drop하고 state corruption 금지.
10. state_hints가 없어도 story-only turn이 정상 진행되는지 유지.
11. S01 storytelling benchmark fixture로 번호선택, ordered choices, 자유행동 각각 회귀 테스트 추가/보강.
12. Story quality prompt는 `GM_STYLE_PROFILE_V1.md`, `GM_NARRATIVE_QUALITY_BENCHMARK.md`를 따른다. RAW transcript 자체를 prompt에 넣지 않는다.

## 비용/모델
- 기본 테스트 모델은 현재 DeepSeek V4 Flash 유지.
- Pro 또는 다른 비싼 모델로 임의 변경 금지.
- 이번 작업 목적은 모델 상향 전에 구조적 병목을 제거하는 것.

## 금지
- UI redesign
- 그래픽 기능 추가
- Canon 변경
- Hidden Seed 생성/노출
- RAW runtime load
- Production deploy
- main merge
- PR #67 merge
- unrelated cleanup/refactor

## 검증
- `npm test`
- web build
- repository validators
- GitHub CI
- Netlify Deploy Preview
- 브라우저 bundle에 secret 없음

## 완료 보고
아래만 간단히 보고한다.
1. GM Pipeline v2 구현 여부
2. AI input이 어떻게 줄었는지
3. AI output contract가 어떻게 줄었는지
4. 서버 compiler가 맡게 된 일
5. 테스트/빌드/CI/Preview 결과
6. 남은 위험 또는 benchmark에서 확인해야 할 것

완료 후 멈춘다. 다음 모델 비교나 UI 작업으로 넘어가지 않는다.
