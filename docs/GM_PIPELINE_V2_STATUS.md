# GM Pipeline v2 Status

Planning-room checkpoint for the current implementation handoff.

## Current branch
`feature/ai-gm-deepseek-provider`

## Existing scaffold
- `engine/web/src/server/compactStoryPipeline.ts`
- `engine/web/src/server/compactStoryPipeline.test.ts`

## Source-of-truth docs
- `docs/GM_PIPELINE_V2_ARCHITECTURE.md`
- `docs/GM_PIPELINE_V2_CODEX_HANDOFF.md`
- `docs/GM_STYLE_PROFILE_V1.md`
- `docs/GM_NARRATIVE_QUALITY_BENCHMARK.md`
- `docs/STORYTELLING_REPRO_COMPARISON_TEST.md`

## Implementation not yet complete
The existing `openRouterStoryProvider.ts` still needs to be migrated from full GMProposal generation to the compact story contract. This is the main Codex task.

## Gate after implementation
Run the same S01-like Story Benchmark with DeepSeek V4 Flash before considering any model upgrade.
