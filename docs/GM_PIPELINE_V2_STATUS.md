# GM Pipeline v2.2 Status

## Status
**IMPLEMENTED / STORY QUALITY IMPROVED / LIVE PROVIDER VERIFICATION BLOCKED BY OPENROUTER KEY LIMIT**

## Current branch
`feature/ai-gm-deepseek-provider`

## Current architecture

```text
Browser input
→ Public Runtime Checkpoint
→ Compact GM Brief + recent story memory + open threads
→ Preview primary GM: DeepSeek V4 Pro 0813
→ Story + strategic choices + Minimal state_hints + action_resolution
→ Server normalization / Intent Compiler
→ Story/engine time-location stabilization
→ existing GMProposal
→ Validator / Action Queue
→ authoritative Engine Commit
→ next scene

If the primary request fails:
Browser transport automatically retries the SAME checkpoint + input once
→ x-gm-retry-attempt: 1
→ Preview emergency GM: DeepSeek V4 Flash 0731
→ server repairs non-critical output-shape omissions
→ Validator / Action Queue
→ one authoritative commit only
```

The old `Pro + Flash every turn in parallel` experiment is abandoned. It doubled provider traffic, increased cost, and made rate/permission failures more likely. Normal turns now call only the primary model; Flash is failure-only emergency fallback.

## Storytelling v2.2 target

The GM is no longer optimized for `choice → short result → choice`.

A normal important turn should instead produce roughly:

```text
player strategic direction
→ execute the action
→ family reacts independently
→ outside world moves
→ follow-up actions happen automatically
→ new information / small event
→ another meaningful beat
→ stop only at a genuinely important decision gate
```

Target behavior:
- usually 4–6 meaningful story beats per important turn
- more reading / watching, fewer approval clicks
- routine execution is delegated to the GM
- strategic, dangerous, irreversible, family-priority, or scarce-resource decisions return to the player
- family members can agree, resist, delay, propose alternatives, or act independently
- Korean family forms of address are supplied as public runtime relationship data

## Continuity additions

Compact GM Brief now carries bounded public context for:
- current scene and player action
- current choices, so phrases like `1번 후속 진행` have an actual referent
- current date/time/location/pressure
- family locations/statuses
- bounded character notes
- family addressing/reference rules
- vehicles/resources/bases/public signals
- recent player decisions
- recent story memory
- unresolved `gm_open_threads`

AI output additionally carries bounded:
- `action_resolution`
- `open_threads`

These are not authoritative engine mutations. The server still owns validation and final commit.

## Server-side quality / safety guards

Implemented:
- duplicate/near-duplicate scene detection
- internal repeated-paragraph detection
- free-action grounding checks
- one rewrite attempt for correctable narrative-quality problems
- quality-rewrite failure does not discard an otherwise usable first scene except for critical failures
- MUD ending time/location can stabilize authoritative public time/player location when AI hints omit them
- vehicle location follows the operator where the existing engine invariant requires it
- micro-choice filtering for redundant `call again / check again / adjust only the meeting time` options when enough strategic choices remain
- in-flight identical browser requests are coalesced
- failed turns do not persist duplicate player-choice logs

## Preview provider transport

Current intended routing:

```text
attempt 0 → Pro 0813
transient/network/5xx failure → browser auto retry
attempt 1 → Flash 0731 emergency fallback
```

The retry is transport-level only. The browser does not commit the failed request, so a retry cannot produce two authoritative turns.

## Paid live verification policy

Paid Live Preview smoke is no longer an automatic development check.

- normal commits: unit tests + validator + TypeScript/Vite build only
- paid smoke requires an explicit change to `engine/web/public/live-smoke-marker.txt` in the latest head commit
- default marker prefix `quick-...` → 5 live AI turns
- marker prefix `full-...` → 10 live AI turns
- live smoke performs an OpenRouter key preflight before generating any story
- if the key is missing/invalid/spending-limit-exhausted, paid generation aborts before the first GM call

This prevents development commits from silently consuming model budget.

## Current live-provider blocker — 2026-09-04 KST

A Preview-only sanitized key preflight confirmed:
- OpenRouter API key is present
- key authentication is valid
- the key has a spending limit
- **the configured spending limit is exhausted**

This explains the recent immediate HTTP 403 failures. No further paid live-AI stress test should run until the OpenRouter key limit is reset/increased or the Preview key is replaced.

No secret value, exact key limit, or account usage amount is exposed to the browser or repository.

## Validation that does not require paid inference

- pipeline/unit/regression tests: green
- transport retry-attempt header regression: green
- public-only transport boundary tests: green
- existing Validator / Action Queue tests: green
- TypeScript/Vite build: green
- Netlify Deploy Preview builds: green
- paid Live Smoke gating: verified — AI steps skip when the latest head commit did not explicitly change the marker
- Production: unchanged
- main: unchanged

## Next gate

1. Restore a small controlled OpenRouter Preview budget.
2. Bump marker once in `quick-*` mode and require 5/5 live turns.
3. Human-play 3–4 long turns and judge story quality, character autonomy, choice fatigue, and state continuity.
4. Freeze this Pro-level response quality as the benchmark.
5. Only then benchmark cheaper models against the frozen quality benchmark.

Do not optimize model price by lowering the quality target first.
