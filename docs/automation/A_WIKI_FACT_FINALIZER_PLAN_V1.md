# A-Wiki 1-C — reviewed Graph finalizer plan v1

Status: DEVELOPMENT_READY design. This document does not authorize or perform Graph publication.

## Goal

Finish the generic A-Wiki fact path without adding a new database, provider, service or scheduler.

A single existing Automation A cycle should be able to process one pending verified S03 source:

```text
A-Core verified public source
          |
          v
A-Wiki prepare job
          |
          v
Native Extractor
          |
          v
FACTS_PROPOSED
          |
          v
Independent second-pass semantic Review
          |
     +----+------------------+
     |                       |
  APPROVE               HUMAN_REVIEW / REJECT
     |                       |
     v                       v
Finalizer                STOP, Graph unchanged
     |
     v
Fact file -> Graph -> receipt
     |
     v
Tests / exact-head PR
     |
     v
main
```

Detailed Wiki Article generation is a later stage and is not part of 1-C.

## Simplification decisions

1. **No new schedule.** Reuse the existing Automation A execution. A-Wiki runs as a downstream phase after A-Core; a backlog may be processed even when A-Core has no new source.
2. **No new Supabase queue.** Automation C's job/result SHA-binding idea is reused, but its review database, approval consumer and publication scheduler are not copied.
3. **One source per cycle.** Preserve manifest order. SESSION_006 must finish before SESSION_007 is marked processed.
4. **One proposal, one review, one finalizer.** No parallel branches or multiple state machines.
5. **All-or-nothing semantic approval in v1.** A reviewer approves the complete proposal or returns HUMAN_REVIEW/REJECT. Per-fact approval can be added only if real use proves necessary.
6. **Production apply requires COMPLETE coverage.** PARTIAL extraction remains useful for tests and investigation but cannot mark a session processed.
7. **No automatic mid-history rewrite.** Historical facts may update a record only when the source anchor is not older than that individual record's anchor. If an existing node/relation is already newer than the source, stop for HUMAN_REVIEW rather than reconstructing history in v1.

## Reviewer contract

Add a small provider-independent reviewer result bound to the exact proposal:

```json
{
  "version": "wiki-fact-review-v1",
  "proposal_sha256": "<exact proposal hash>",
  "decision": "APPROVE",
  "note": "..."
}
```

Allowed decisions: `APPROVE`, `HUMAN_REVIEW`, `REJECT`.

The reviewer receives the **complete prepared job** (all verified GM blocks, source/Graph binding and identity inventory) together with the fixed proposal. It must check semantic entailment, identity, chronology, unsupported intent, relation meaning, and whether any material durable fact was omitted before accepting COMPLETE coverage. Exact quotation presence alone is not approval.

The review is a fresh separate second pass with a new context. It does not edit the extractor result. Any uncertainty or material omission returns HUMAN_REVIEW.

## Safe historical reconciliation

Current Graph has a global Reader boundary that may be newer than an unprocessed semantic source. Therefore the finalizer must compare **individual record anchors**, not only the global Graph anchor.

For each proposed node or relation:

```text
record missing
  -> create at source anchor

same data already present
  -> NOOP

existing record anchor < source anchor
  -> update current record
  -> append previous current record to history

existing record anchor == source anchor and data differs
  -> HUMAN_REVIEW / conflict

existing record anchor > source anchor
  -> HUMAN_REVIEW
  -> do not insert a synthetic historical snapshot in v1
```

The Graph global anchor never moves backward. It remains the later of the existing global boundary and the source boundary. Derived articles/story links are rebuilt from the resulting records using the current global boundary.

This rule is sufficient for the current backlog because the tested existing-node candidates, 최은채 and 장태훈, are anchored at save 253 while SESSION_006/007 are save 280/282. It avoids weakening the existing stale guard globally.

## Persistence order

The finalizer computes and validates every output before writing.

For an approved `FACTS_READY` result:

1. Verify exact job ID, proposal SHA, review SHA and expected Graph SHA.
2. Require `coverage.status === COMPLETE`.
3. Re-check the source manifest/raw hashes.
4. Run safe per-record reconciliation in memory.
5. Validate the complete candidate Graph and canonical bytes.
6. Prepare the deterministic public fact path:
   `archive/content/public-facts/C03-AFTERFALL/S03/AWIKI_SESSION_NNN_<sourceDigest>.json`
7. Write the fact file if absent; a different existing file is a hard collision.
8. Replace Graph atomically.
9. Write the completion receipt **last**.
10. Run A-Wiki/Graph tests and protected-file checks.
11. Commit only the allowed A-Wiki paths to a feature branch/PR.
12. Merge only the exact tested head based on current main.

If any step before the receipt fails, the source is not processed.

For an approved `NO_FACTS` result, Graph and fact file stay unchanged; write only a NO_FACTS completion receipt after validation.

## Completion receipt

Use one small immutable receipt per processed source, for example:

`archive/content/public-facts/C03-AFTERFALL/S03/receipts/AWIKI_SESSION_006_<sourceDigest>.json`

Minimum fields:

```json
{
  "version": "a-wiki-receipt-v1",
  "session_id": "SESSION_006",
  "source_sha256": "...",
  "job_id": "...",
  "proposal_sha256": "...",
  "review_sha256": "...",
  "outcome": "APPLIED",
  "fact_sha256": "...",
  "graph_before_sha256": "...",
  "graph_after_sha256": "...",
  "coverage": "COMPLETE"
}
```

For `NO_FACTS`, `fact_sha256` is null and before/after Graph hashes are equal.

The pending-source selector should use a successful receipt as the durable completion signal. Legacy SESSION_005 remains backward-compatible as an already-applied baseline until it receives an optional migration receipt.

A receipt is not written for HUMAN_REVIEW or REJECT in v1. The queue stops at that source. If repeated review becomes operationally noisy, add a durable HOLD record later; do not pre-build that state machine now.

## Failure boundaries

| Failure | Required behavior |
| --- | --- |
| Source/raw hash changed | reject; no write |
| Graph SHA changed after extraction | reject and regenerate from current Graph |
| Proposal/review SHA mismatch | reject; no write |
| PARTIAL coverage | no apply, no receipt |
| Unsupported/ambiguous semantic claim | HUMAN_REVIEW; Graph unchanged |
| Existing record newer than backfill source | HUMAN_REVIEW; Graph unchanged |
| Same-anchor conflicting record | HUMAN_REVIEW; Graph unchanged |
| Fact identity collision | reject; Graph unchanged |
| Graph validation/write failure | no receipt |
| CI failure | PR remains unmerged; main has no receipt |
| main moves before exact-head merge | rebase/revalidate; never force merge |

## Allowed implementation surface

Keep 1-C narrow. Expected changes only:

- `archive/scripts/lib/wiki-fact-extractor.mjs` — review contract validation helpers if needed.
- `archive/scripts/lib/publication-graph.mjs` — one explicit safe historical reconciliation function; do not weaken existing `reconcilePublicGraph`.
- one small A-Wiki finalizer module/CLI.
- `wiki-semantic-jobs.mjs` — pending selection switches from legacy fact-file completion to receipt completion, preserving SESSION_005 compatibility.
- A-Wiki tests and existing `.github/workflows/a-wiki-downstream.yml` gates.
- receipt directory created only by a successful apply.

Do not change RAW, BOOK, Canon, Automation B/C, Operator, public UI, Supabase schema, Netlify release rules or Production schedule.

## Development gates

Before merging 1-C:

- SESSION_006 COMPLETE replay can add its new facts and the supported 최은채 update without moving Graph global anchor backward.
- Re-running SESSION_006 is byte-identical NOOP.
- SESSION_007 becomes the next pending source only after the SESSION_006 receipt exists.
- Existing-record-newer-than-source synthetic case fails closed.
- Same-anchor conflict fails closed.
- NO_FACTS writes a receipt and advances once.
- PARTIAL never advances.
- Fact write without Graph success never produces a receipt.
- RAW, Reader/BOOK, Canon and B/C checksums stay unchanged.
- A-Wiki/Graph, Archive, Game and Deploy Preview gates remain green.

## Development-ready verdict

Proceed with 1-C only after this shape remains unchanged during implementation:

```text
existing Automation A
  -> prepare
  -> Extractor
  -> proposal
  -> second-pass Reviewer
  -> safe Finalizer
  -> fact + Graph
  -> receipt last
  -> exact-head CI/PR
  -> next session
```

This is the minimum structure that preserves provenance, chronological ordering and failure recovery while avoiding a second scheduler or a new persistence system.
