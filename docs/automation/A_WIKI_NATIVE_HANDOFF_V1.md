# A-Wiki Native Handoff V2 — durable Supabase submit

## Purpose

Native ChatGPT performs semantic judgment only. It never writes GitHub files, Graph facts, receipts, branches or PRs.

The durable control plane is one Supabase job row. GitHub owns every deterministic transformation and publication action.

## Final flow

```text
A-Core/main verified PUBLIC source
          |
          v
GitHub prepare
          |
          v
Supabase a_wiki_native_jobs
phase = EXTRACTOR_READY
          |
     Native Worker
     Extractor only
          |
     archive_a_wiki_native_job_submit()
          |
          v
EXTRACTOR_SUBMITTED
          |
Supabase dispatch -> GitHub consume
          |
GitHub compiles proposal + review-job
          |
          v
REVIEW_READY
          |
     Native Worker
     fresh Reviewer only
          |
     archive_a_wiki_native_job_submit()
          |
          v
REVIEW_SUBMITTED
          |
Supabase dispatch -> GitHub consume
          |
safe Finalizer
          |
Fact + Graph + Receipt LAST
          |
derived Visual catalog refresh
(no image generation)
          |
PR / exact-head CI / merge
          |
          v
PUBLISHED
          |
main push prepares next pending session
```

## Why this replaced the operational-branch transport

The first native task could read GitHub but its scheduled execution could not reliably perform the GitHub write needed for `result.json` / `review.json`.

That transport is removed from the authority path. Native output is now submitted through Supabase, matching the already proven Automation C pattern:

```text
native judgment -> durable submit -> program finalizer -> GitHub
```

The old `automation/a-wiki-native` branch is legacy evidence only and is not an authority.

## Durable job

Table: `survival_ops.a_wiki_native_jobs`

Only one active job may exist. `PUBLISHED` and `SUPERSEDED` rows are retained as
immutable history and are excluded from active-job selection.

Native-readable phases:

- `EXTRACTOR_READY`
- `REVIEW_READY`
- `HUMAN_REVIEW`
- `REJECT`
- `BLOCKED`

Program phases:

- `EXTRACTOR_SUBMITTED`
- `REVIEW_SUBMITTED`
- `FINALIZING`
- `PUBLISHED`

The immutable prepared job is bound to source SHA, Graph SHA and main SHA.

Approved AFTERFALL sources are discovered by season through the existing public
Reader source catalog, starting at S03. S03's historical SESSION_005 baseline is
preserved; later seasons begin with their first approved source. A session is
identified by its full season-qualified source path and source hash. Entity IDs
continue across seasons. A live/open S04 session is not a public source.

A-Core treats per-GM Runtime state links as optional provenance. For an already
verified and sealed PUBLIC session, A-Wiki may anchor the entire GM narrative
to its final public narrative time even when the last GM itself has no state
link, but **only** when an earlier GM within the same session has an exact
`APPLIED` link and every later public USER/GM message records exactly that
same verified save version without any conflicting state link. The unlinked
GM is not described as Runtime-applied. Missing applied evidence, unknown
tail save versions or later save changes fail closed with
`WIKI_PUBLIC_ANCHOR_NOT_APPLIED`. Immutable source/RAW SHA and the independent
Extractor/Reviewer/finalizer safeguards remain unchanged.

## Publication reconciliation and graph drift

`prepare` checks the durable job ledger **before** returning `NO_JOB`. A source
may have been independently reviewed and merged outside the Native handoff.
In that case the program verifies the exact source/PART, fact and receipt bytes
at the merged PR head, merge commit and current main, checks main ancestry, and
checks receipt-bound Graph revisions (including preserved history). Identical
facts whose older evidence was retained must also exist unchanged in the exact
receipt-bound pre-publication Graph. A malformed receipt is a blocker, not an
empty queue.

Only after those checks does the service-only
`archive_a_wiki_native_job_reconcile_publication` RPC close the stale row. It
records `completion_origin=EXTERNAL_REVIEWED_MERGE` and the verification evidence.
The original prepared package, Extractor/Reviewer fields and submission times
remain unchanged; the external work is never represented as a Native run.
Repeating the same reconciliation is a no-op. A source with no Native row is not
given a fabricated run history.

A publication-stage GitHub transport/check failure after an independent APPROVE review is recoverable only while the exact prepared Graph hash is still current. `prepare` revalidates the persisted review, moves that same durable job from `BLOCKED` back to `FINALIZING`, and redispatches the Program consumer. It does not run Extractor or Reviewer again. If main moved for unrelated code while the Graph stayed identical, the publication branch is rebuilt from latest main with the exact approved Fact/Graph/Receipt package plus the deterministic Visual catalog refresh, using force-with-lease on the existing publication branch.

For unfinished work blocked by `A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED`, the
program reads a fresh main worktree and calls the narrow
`archive_a_wiki_native_job_supersede_reprepare` RPC. The old row becomes
`SUPERSEDED`; a new row binds the same public source to the newer Graph and
starts at `EXTRACTOR_READY`. Both extraction and independent review run again.
Its publication branch includes the new graph revision to avoid adopting an old
proposal branch. Retrying the old approved proposal is explicitly rejected.

The operator readback composes A-Wiki with the existing A/B/C payload. The UI
distinguishes content review, repository merge, and confirmed Production
deployment. `PUBLISHED` means repository reflection; Production continues on the
existing batched release policy. Zero active jobs alone does not prove that a
fresh public-source scan ran.

## Native RPC contract

Project: `jgsxpdflgkqroecfjzxq`

Read:

`public.archive_a_wiki_native_job_current()`

Returns either:

```json
{
  "status": "EXTRACTOR_READY",
  "job_id": "<db uuid>",
  "session_id": "SESSION_006",
  "binding_sha256": "<prepared job sha>",
  "payload": { "version": "wiki-fact-job-v1" }
}
```

or:

```json
{
  "status": "REVIEW_READY",
  "job_id": "<db uuid>",
  "session_id": "SESSION_006",
  "binding_sha256": "<review job sha>",
  "proposal_sha256": "<proposal sha>",
  "payload": { "version": "wiki-fact-review-job-v1" }
}
```

Submit:

`public.archive_a_wiki_native_job_submit(job_id, expected_phase, binding_sha256, result)`

The database rejects the wrong phase, wrong binding, wrong result version, wrong Extractor job ID, wrong Reviewer proposal SHA and conflicting duplicate submissions.

After a successful submit the database attempts to dispatch the GitHub program consumer. The semantic result remains durable even if dispatch itself has a transient failure.

Retry dispatcher:

`public.archive_a_wiki_native_dispatch()`

## Extractor rules

For `EXTRACTOR_READY`:

- Use only the supplied verified PUBLIC GM blocks and supplied existing-node inventory.
- Read every GM block before declaring COMPLETE.
- USER text, memory, fixture data and other-session summaries are not authority.
- Future choice menus are not facts.
- Ambiguous intent is deferred.
- Produce one `wiki-fact-result-v1` object.
- Submit that object to Supabase.
- Do not self-review it in the same run.

## Reviewer rules

For `REVIEW_READY`:

- This is a fresh separate native execution.
- Read the complete prepared source and the fixed proposal.
- Check precision and completeness.
- Check identity, chronology, unsupported intent, future-choice leakage and relation strength.
- Do not edit the proposal.
- Output one `wiki-fact-review-v1` decision:
  - `APPROVE`
  - `HUMAN_REVIEW`
  - `REJECT`
- Submit only to Supabase.

## GitHub program ownership

`archive/scripts/a-wiki-native-control.mjs` owns:

1. deterministic source discovery and job preparation;
2. validation of submitted Extractor output;
3. deterministic proposal and review-job construction;
4. validation of submitted Reviewer output;
5. safe historical Graph finalization;
6. Fact and Receipt-last persistence;
7. A-Wiki tests;
8. publication branch and PR;
9. exact-head CI wait and merge;
10. PUBLISHED DB state;
11. deterministic `VISUALS.json` refresh from the finalized public Graph and the existing approved appearance input. This is derived worklist synchronization only; Automation B still exclusively owns image generation, review, transfer and site-asset finalization.

Native AI owns none of those mutations.

## Security

- The table lives in `survival_ops`, has RLS enabled and no anon/authenticated/service-role table privileges.
- Public RPC functions are denied to `public`, `anon` and `authenticated`; only `service_role` is granted execution.
- Dispatch implementation is private to `survival_ops` and executable only by postgres.
- All SECURITY DEFINER functions use an empty search path and schema-qualified relations/functions.
- GitHub and Supabase secrets remain server-only.
- Production remains owned by the existing batched Archive release gate.

## Failure boundaries

| Failure | Result |
| --- | --- |
| wrong binding / stale result | REJECTED, no phase change |
| Extractor semantic uncertainty | HUMAN_REVIEW |
| Reviewer omission/ambiguity | HUMAN_REVIEW |
| current Graph differs from prepared Graph | BLOCKED, no Graph write |
| verified graph drift with unchanged public source | old job retained; fresh Extractor/Reviewer package |
| merged external receipt with stale Native job | exact publication evidence checked, original Native history preserved |
| Finalizer validation fails | BLOCKED |
| Fact/Graph persistence fails | no Receipt |
| Visual catalog refresh fails | main unchanged; no image generation |
| PR CI / GitHub transport fails after APPROVE | BLOCKED; exact approved publication may resume if Graph binding is unchanged |
| PR CI fails | main unchanged |
| exact merge fails | DB never becomes PUBLISHED |
| successful merge | DB=PUBLISHED; main push prepares next source |

## Scheduling

One ChatGPT task is sufficient.

Each run reads the current Supabase phase and performs exactly one native role. A later run sees the next phase. There is no second Reviewer schedule and no GitHub write from the task.
