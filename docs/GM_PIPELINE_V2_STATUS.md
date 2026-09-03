# GM Pipeline v2 Status

## Status
**IMPLEMENTED / READY FOR S01 HUMAN STORY BENCHMARK**

## Current branch
`feature/ai-gm-deepseek-provider`

## Implemented architecture

```text
Browser input
→ Public Runtime Checkpoint
→ Compact GM Brief
→ DeepSeek V4 Flash
→ Story + 4 Choices + Minimal state_hints
→ Server Intent Compiler
→ existing GMProposal
→ Validator / Action Queue
→ authoritative Engine Commit
→ next scene
```

## AI input now
The model receives a bounded public-only brief containing:
- current scene
- current player action
- current date/time/location/visible pressure
- family locations/statuses
- bounded vehicle/resource/base information
- public signals
- bounded family character notes
- up to 4 recent player decisions
- writable public entity IDs

It does **not** receive RAW transcript, Hidden Seed, action IDs, full old history, UI metadata, or engine proposal structures.

## AI output now
The model produces only:
- `story`
- `choices`
- bounded `state_hints`

Allowed hint vocabulary:
- `time`
- `move`
- `resource`
- `base_capability`
- `signal`

The model no longer authors:
- authoritative `from`
- action IDs
- `exclusive_resources`
- full Action Queue / StateChangeProposal JSON
- `presentation_blocks`
- `family_reactions` metadata
- UI data
- final authoritative state

## Server compiler now owns
- hint normalization and bounds
- unknown hint/entity/resource/base rejection
- authoritative `from` generation
- action ID generation
- actor derivation
- hint de-duplication
- safe conversion to existing `GMProposal`
- Story-only turns when no mutation is needed

## Additional consistency fix
The S01 benchmark fixture previously had `player=회사` and operated vehicle=`회사 주차장`, which violated the existing vehicle/operator location invariant. The engine location is now consistently `회사`; the parking-lot detail remains descriptive vehicle status.

## Validation
- Compact pipeline unit/regression tests: green
- Provider → compiler → Validator/Action Queue → commit S01 regression: green
- Existing GitHub validation/build: green
- Netlify Deploy Preview: green
- Production: unchanged
- main: unchanged

## Next gate
Run the same S01-like human Story Benchmark with DeepSeek V4 Flash.

Decision after playtest:
- large quality improvement → architecture was the main bottleneck; keep low-cost Flash candidate
- partial improvement → architecture is correct but model may remain a bottleneck
- little/no improvement → revisit GM prompt/turn structure before paying for a model upgrade

Do not resume graphics/UI feature expansion until this storytelling gate is evaluated.
