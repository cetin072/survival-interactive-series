# Automatic Archive Publication — Step 10 / 10: readiness and runbook

Status: IN_PROGRESS / FINAL PRODUCT NOT PROVEN

The target remains: the player only plays with ChatGPT, while public text and acceptable illustrations accumulate on the archive website without a manual archive task. This document is an operational evidence inventory, not a declaration that the target works.

## Architecture at the current boundary

`approved public RAW and publication snapshot -> Reader candidate -> public graph -> visual points and briefs -> image request/observed result -> human-reviewed local candidate -> durable asset -> site-ready projection -> public website`

The first three transforms have local compilers. The image tail now has one visually reviewed built-in Codex foreground PNG from a real Step 5 public brief, preserved as an unpublished experiment in Draft PR #144. PR #144 validates that PNG against the current READY public Visual Point and computes a disabled local observation entry. A pure approval-gated function can compute a local candidate and disabled ingest plan, but its positive test uses a synthetic approval; there is no real owner decision, accepted asset or active production path. The Step 9 read-only command checks the existing compilers together; it does not bridge an uncommitted Reader candidate into graph compilation. Its catalog-bound S02 attempt journal is empty. An opt-in local append function was tested on a temporary file, but the orchestrator does not invoke it. Step 8 consumes a pinned public Visual Catalog and an empty site-asset manifest; it can display a validated local static image if one is later accepted, but currently shows pending states only. No hidden world seed, private GM record, or PLAYER_ARCHIVE-only map is an authorized input to this chain.

## Completion matrix

| Capability | Implemented code | Local/CI evidence | Actual ongoing runtime evidence | Status |
| --- | --- | --- | --- | --- |
| Public text Reader | Step 1–3 batch and append-only compiler | Existing isolated and repository CI checks | Continuous gameplay-to-publication handoff not proven | IN_PROGRESS |
| Public graph/story index | Step 4 compiler | Real public baseline + isolated synthetic updates in CI | Continuous updates not proven | CODE_COMPLETE_BUT_UNPROVEN |
| Visual candidates and briefs | Step 5 compiler | Real public appearance-to-brief check; 34 current points | Repeated automatic generation from new play not proven | CODE_COMPLETE_BUT_UNPROVEN |
| Image execution | Step 6 foreground POC/request/receipt and later sample | Two earlier files quarantined; one later built-in Codex PNG visually reviewed and byte-verified; 0 accepted archive assets | Reliable repeated or unattended execution not proven | IN_PROGRESS / BLOCKED |
| Accepted result handoff | Step 7 local acceptance contract plus separate Codex foreground observation inbox in Draft PR #144 | Actual PNG/observer record and current public point binding passed archive CI; a synthetic owner decision exercises the disabled candidate/ingest plan | 1 pending observation computed in CI, 0 real owner decisions, 0 accepted candidates, 0 durable assets | IN_PROGRESS |
| Website visual state | Step 8 pending-state UI and guarded static image display in Draft PR #145 | Local tests/build/browser preview; catalog and empty site-asset validation. Archive/game-state CI pass; two remote Preview checks fail because `[skip netlify]` means no Deploy Preview (404). | 0 site assets; current 1,880,742-byte experiment PNG exceeds the 200,000-byte site-asset limit; no deployed image or site rollout | CODE_COMPLETE_BUT_UNPROVEN |
| Orchestration | Step 9 read-only pipeline, local attempt journal and pinned historical POC metadata audit in Draft PR #146 | Real S02 Reader/graph/visual dry-run; synthetic event-chain, local append and concurrent-change tests; two prior receipt digests and bindings rechecked from committed metadata | Committed journal has 0 events; historical POC remains 2 quarantined / 0 accepted; no unattended run or trusted observed-result queue | IN_PROGRESS |
| Storage/database publication | No enabled writer | 0 uploads, 0 database writes | None | BLOCKED |
| Scheduling | No enabled schedule | No unattended image-to-site run | None | NOT_TESTED |
| Added-cost boundary | Paid API disabled; no purchase/upgrade action | No independent invoice/quota proof | Zero added cost for repeated images unproven | BLOCKED |

The current Step 9 PR head passed archive and game-state CI. Updated PR #144 also passed both checks, including the real foreground sample/public brief binding. A successful synthetic test or compiled brief never counts as a model-generated image. A local accepted candidate never counts as stored or published. A missing Deploy Preview does not prove a browser defect, and local browser checks do not prove the deployed site.

## Development runbook (read-only)

Run on the branch containing Step 9 after checking the current source revision and approved public inputs. The S02 demo is a fixed regression case, not an instruction to replay old gameplay:

```sh
node --experimental-strip-types archive/scripts/check-archive-pipeline.mjs --demo-s02 --check
node --experimental-strip-types archive/scripts/check-archive-pipeline.mjs --demo-s02 \
  --ledger archive/content/visuals/C03-AFTERFALL/ATTEMPTS_S02.json --check
```

For a later approved public batch, supply its frozen snapshot and pinned public facts, plus dated appearance/map projections when applicable:

```sh
node --experimental-strip-types archive/scripts/check-archive-pipeline.mjs \
  --snapshot /path/to/approved-snapshot.json \
  --facts archive/content/public-facts/C03-AFTERFALL/Sxx/FACTS.json \
  --appearances archive/content/public-facts/C03-AFTERFALL/Sxx/APPEARANCES.json \
  --check
```

If Reader reports `AWAITING_REVIEWED_BOOK_COMMIT`, stop downstream compilation for that batch and review the public book candidate. Do not use a prior graph as evidence for the new Reader. If graph/visual compile, inspect their hashes, provenance, readiness and `selected_point_ids`; selection is not an image invocation. The attempt journal records only `RESERVED`, `FAILED` and `QUARANTINED`; its empty state does not erase the two earlier POC quarantines. The separate `historical_poc` report rechecks the committed receipt metadata for those two quarantines, not the original pixels or current queue. Its local append function is not called by this command and its hash chain is not independent receipt authentication. One built-in foreground invocation produced a plausible, decoded, hash-pinned image, but the observed artifact path does not prove the provider prompt or supply the Step 7 `image_gen.text2im` result UUID. The new local sample is bound to a current public point/generation key in a disabled, in-memory observation entry, while the artifact basename remains unverified as a provider result ID. The new pure function can produce a local candidate only from an explicit owner decision tied to this observation and SHA; no such real decision is recorded. Its observer-attested association keeps the provider result ID null and does not prove the provider prompt. The two earlier outputs remain quarantined. Storage and production publication require their own approved activation and proof.

## Release gate and smallest next actions

1. Resolve the Step 6 capability/cost boundary without a paid API, extra credits or an upgrade. Use the validated local observation inbox to complete trustworthy result association for the existing foreground sample or another supported result, then obtain final review and hash-bound acceptance from a current public brief. If this cannot be done within zero added cost, leave image execution blocked.
2. Prove durable storage and exact public entity/asset binding with that accepted result. Do not infer a registry id from a graph node id or publish a temporary path.
3. Produce and provenance-bind a reviewed, optimized site derivative from an accepted image (the current 1,880,742-byte PNG exceeds Step 8's 200,000-byte limit), then inspect a nonproduction Deploy Preview. The empty manifest and pending-state UI are not evidence of image delivery.
4. Complete a repeated unattended run and audit the relevant account cost/quota behavior. Only then reconsider scheduling and the final “player only plays” claim.
5. Review Draft PRs #144–#147 in dependency order, keep `[skip netlify]` for code-only merges, and obtain approval before main merge, Canon-impacting changes or Production rollout under `AGENTS.md`.

No Supabase write, Storage upload, Netlify rollout, paid image call, schedule, or main merge is authorized by this runbook.
