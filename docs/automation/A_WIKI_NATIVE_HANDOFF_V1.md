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

Only one non-PUBLISHED job may exist.

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
10. PUBLISHED DB state.

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
| Finalizer validation fails | BLOCKED |
| Fact/Graph persistence fails | no Receipt |
| PR CI fails | main unchanged |
| exact merge fails | DB never becomes PUBLISHED |
| successful merge | DB=PUBLISHED; main push prepares next source |

## Scheduling

One ChatGPT task is sufficient.

Each run reads the current Supabase phase and performs exactly one native role. A later run sees the next phase. There is no second Reviewer schedule and no GitHub write from the task.
