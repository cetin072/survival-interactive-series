# Automatic Archive Publication — Step 10 / 10: readiness and runbook

Status: IN_PROGRESS / FINAL PRODUCT NOT PROVEN

The target remains: the player only plays with ChatGPT, while public text and acceptable illustrations accumulate on the archive website without a manual archive task. This document is an operational evidence inventory, not a declaration that the target works.

## Architecture at the current boundary

`approved public RAW and publication snapshot -> Reader candidate -> public graph -> visual points and briefs -> image request/observed result -> human-reviewed local candidate -> durable asset -> site-ready projection -> public website`

The first three transforms have local compilers. The image and delivery tail has no accepted real image or active production path. The Step 9 read-only command checks the existing compilers together; it does not bridge an uncommitted Reader candidate into graph compilation. Its catalog-bound S02 attempt journal is empty. An opt-in local append function was tested on a temporary file, but the orchestrator does not invoke it. Step 8 consumes a pinned public Visual Catalog and an empty site-asset manifest; it can display a validated local static image if one is later accepted, but currently shows pending states only. No hidden world seed, private GM record, or PLAYER_ARCHIVE-only map is an authorized input to this chain.

## Completion matrix

| Capability | Implemented code | Local/CI evidence | Actual ongoing runtime evidence | Status |
| --- | --- | --- | --- | --- |
| Public text Reader | Step 1–3 batch and append-only compiler | Existing isolated and repository CI checks | Continuous gameplay-to-publication handoff not proven | IN_PROGRESS |
| Public graph/story index | Step 4 compiler | Real public baseline + isolated synthetic updates in CI | Continuous updates not proven | CODE_COMPLETE_BUT_UNPROVEN |
| Visual candidates and briefs | Step 5 compiler | Real public appearance-to-brief check; 34 current points | Repeated automatic generation from new play not proven | CODE_COMPLETE_BUT_UNPROVEN |
| Image execution | Step 6 foreground POC/request/receipt | Two real files observed, both quarantined; 0 accepted | Reliable brief-driven or unattended success not proven | BLOCKED |
| Accepted result handoff | Step 7 local contract in Draft PR #144 | Synthetic positive/rejection tests and archive CI pass | 0 real accepted candidates, 0 durable assets | CODE_COMPLETE_BUT_UNPROVEN |
| Website visual state | Step 8 pending-state UI and guarded static image display in Draft PR #145 | Local tests/build/browser preview; catalog and empty site-asset validation. Archive/game-state CI pass; two remote Preview checks fail because `[skip netlify]` means no Deploy Preview (404). | 0 site assets; no deployed image or site rollout | CODE_COMPLETE_BUT_UNPROVEN |
| Orchestration | Step 9 read-only pipeline and local attempt journal in Draft PR #146 | Real S02 Reader/graph/visual dry-run; synthetic event-chain, local append and concurrent-change tests | Committed journal has 0 events; no unattended run or trusted observed-result queue | IN_PROGRESS |
| Storage/database publication | No enabled writer | 0 uploads, 0 database writes | None | BLOCKED |
| Scheduling | No enabled schedule | No unattended image-to-site run | None | NOT_TESTED |
| Added-cost boundary | Paid API disabled; no purchase/upgrade action | No independent invoice/quota proof | Zero added cost for repeated images unproven | BLOCKED |

The current Step 9 PR head passed archive and game-state CI. A successful synthetic test or compiled brief never counts as a model-generated image. A local accepted candidate never counts as stored or published. A missing Deploy Preview does not prove a browser defect, and local browser checks do not prove the deployed site.

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

If Reader reports `AWAITING_REVIEWED_BOOK_COMMIT`, stop downstream compilation for that batch and review the public book candidate. Do not use a prior graph as evidence for the new Reader. If graph/visual compile, inspect their hashes, provenance, readiness and `selected_point_ids`; selection is not an image invocation. The attempt journal records only `RESERVED`, `FAILED` and `QUARANTINED`; its empty state does not erase the two earlier POC quarantines. Its local append function is not called by this command and its hash chain is not independent receipt authentication. Image generation remains blocked until a supported cost-bounded runtime produces an actual brief-matching image. The reviewer must inspect pixels, bind the result to the point/generation key and record acceptance; quarantined results stay quarantined. Storage and production publication require their own approved activation and proof.

## Release gate and smallest next actions

1. Resolve the Step 6 capability/cost boundary without a paid API, extra credits or an upgrade. Produce **one** real accepted image from a current public brief, with observed tool result, decoded bytes, review and hash-bound handoff. If this cannot be done within zero added cost, leave image execution blocked.
2. Prove durable storage and exact public entity/asset binding with that accepted result. Do not infer a registry id from a graph node id or publish a temporary path.
3. Supply a real accepted image to the guarded site-asset path and inspect a nonproduction Deploy Preview. The currently empty manifest and local pending-state UI are not evidence of image delivery.
4. Complete a repeated unattended run and audit the relevant account cost/quota behavior. Only then reconsider scheduling and the final “player only plays” claim.
5. Review Draft PRs #144–#146 in dependency order, keep `[skip netlify]` for code-only merges, and obtain approval before main merge, Canon-impacting changes or Production rollout under `AGENTS.md`.

No Supabase write, Storage upload, Netlify rollout, paid image call, schedule, or main merge is authorized by this runbook.
