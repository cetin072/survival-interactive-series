# A-Wiki native handoff v1

## Purpose

Connect the generic A-Wiki semantic pipeline to native ChatGPT with the minimum recurring surface:

- **one ChatGPT automation**
- **one machine-owned operational branch**
- GitHub event workflows for every deterministic step
- no new database, paid provider, or scheduler service

The AI automation performs only one semantic role per run. GitHub performs preparation, validation, finalization, CI and merge.

## Flow

```text
A-Core merges verified PUBLIC RAW to main
                 |
                 v
GitHub prepares exact A-Wiki job
                 |
                 v
automation/a-wiki-native
status = EXTRACTOR_READY
                 |
        ChatGPT task run #1
        Extractor only
                 |
                 v
result.json
                 |
          GitHub validates
          compiles proposal
          builds review job
                 |
                 v
status = REVIEW_READY
                 |
        ChatGPT task run #2
        fresh Reviewer only
                 |
                 v
review.json
                 |
          GitHub validates
          safe Finalizer
                 |
          fact + Graph + receipt
                 |
          exact-head PR / CI
                 |
               main
                 |
        next pending job prepared
```

A single schedule therefore gives separate native calls: the Extractor and Reviewer never run in the same automation execution.

## Operational branch

Branch: `automation/a-wiki-native`

Machine-owned directory:

`archive/automation/a-wiki-native/`

Files:

- `status.json` — current phase and immutable binding summary
- `job.json` — exact `wiki-fact-job-v1` generated from verified source + current Graph
- `result.json` — native Extractor output; written only by ChatGPT in EXTRACTOR_READY
- `proposal.json` — generated only by repository code
- `review-job.json` — complete prepared job + fixed proposal; generated only by repository code
- `review.json` — native Reviewer output; written only by ChatGPT in REVIEW_READY
- `reviewed.json` — repository validation output when present

The operational directory never merges into main. After a publication merge, GitHub resets the operational branch to the new main and prepares the next pending source.

## Native task contract

Every run starts by reading `status.json` from branch `automation/a-wiki-native`.

### EXTRACTOR_READY

Read `job.json` and current-main `docs/automation/A_WIKI_FACT_WORKER_V1.md`.

Do **only** the Extractor role. Read every supplied GM block and existing public node inventory. Produce one exact `wiki-fact-result-v1` object. Do not review your own result in the same run.

Write only:

`archive/automation/a-wiki-native/result.json`

to the same operational branch.

Do not modify status, job, Graph, facts, receipts, RAW, Reader or main.

### REVIEW_READY

Read `review-job.json` and current-main `docs/automation/A_WIKI_FACT_WORKER_V1.md`.

This is a new automation execution and therefore a fresh semantic pass. Review both:

1. precision — each proposed fact is entailed by the GM record;
2. completeness — no material durable fact is silently omitted while COMPLETE is claimed.

Return exactly one `wiki-fact-review-v1` result: APPROVE, HUMAN_REVIEW or REJECT.

Write only:

`archive/automation/a-wiki-native/review.json`

to the operational branch.

Do not edit the proposal in place.

### Other phases

- `NO_JOB`: no work.
- `HUMAN_REVIEW`, `REJECT`, `BLOCKED`: do not invent a recovery. Report the phase once.
- If the expected worker output already exists for the current immutable job/review binding, do not make a new semantic decision.

## GitHub ownership

GitHub owns:

- source discovery
- exact job preparation
- result/proposal/review hash binding
- review-job construction
- Graph freshness checks
- historical reconciliation
- fact and receipt writes
- CI / Deploy Preview
- publication PR
- exact tested merge
- next-job preparation

The native task never merges a PR and never writes Graph directly.

## Queue and failure rules

- One source at a time, manifest order.
- Receipt is the only durable completion signal after SESSION_005 legacy baseline.
- PARTIAL never applies.
- Same-anchor conflict or newer existing record fails closed.
- If main Graph changes between preparation and finalization, the operational job is regenerated from current main; stale native output is discarded.
- If publication CI fails, main remains unchanged.
- Production remains under the existing batched Archive release gate.

## Scheduling

Only one ChatGPT task is required. A four-hour cadence is sufficient for the current daily Archive rate:

- first eligible run: Extractor
- next eligible run: Reviewer
- GitHub finalizes immediately after Reviewer output

No second Reviewer schedule is needed.
