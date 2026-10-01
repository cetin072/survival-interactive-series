# Knowledge Automation C 3.0

## Normal path

Archive and Knowledge state → C-PREP → durable `PREPARED` job → Semantic Worker → one-shot submit → C-FINALIZER → atomic package commit and Draft PR → existing Worker Gate → existing HUMAN_REVIEW or exact-head publication handoff → existing Production batch.

## Ownership

- **C-PREP** scans the current source inventory, selects one oldest eligible FRESH source before considering a due BACKFILL, excludes handled identities, applies the existing backfill cadence, checks legacy worker PR/branch blockers, pins source/policy/main, and writes a compact durable job.
- **ChatGPT Semantic Worker** reads one prepared job, researches and semantically evaluates one candidate, submits one versioned result, then stops. It owns no GitHub, CI, repository state, publication, or Production work.
- **C-FINALIZER** claims submitted work, revalidates source/policy/package and duplicate state, writes one atomic package commit on a deterministic worker branch, opens one Draft PR with `PACKAGE_READY`, and records lifecycle state. Existing Worker Gate and publication workflows own the publication decision and exact-head merge. HOLD is terminal and creates no content PR. HUMAN_REVIEW uses the existing Operator Inbox.

The current C1 runtime remains available as legacy/fallback during migration. C2 Longform is unchanged; the durable job type check reserves `LONGFORM` without creating such jobs here.

## Durable boundary and recovery

Supabase `survival_ops.knowledge_semantic_jobs` persists source identity, policy and main pins, compact context, immutable submitted result and digest, lifecycle references, blockers and attempts. A unique active-job index serializes semantic work. `PREPARED` is not expired, so the other scheduled worker can safely continue after a run interruption. Submit uses a database row lock and digest equality: the first valid result is accepted, identical resubmission returns `ALREADY_SUBMITTED`, and a different resubmission is rejected. A scheduled program-owned dispatcher triggers the finalizer; finalizer claims can be recovered after a stale attempt.

## Schedules and release boundary

Supabase external dispatch schedules C-PREP for 05:45 and 17:45 KST (UTC cron 20:45 and 08:45). GitHub workflow schedules are fallback entry points, and both workflows also support manual dispatch. A separate five-minute dispatcher starts the finalizer only for submitted or stale-finalizing work. The existing publication handoff, exact-head validation, HUMAN_REVIEW consumer, and batched Production policy remain unchanged. No direct Netlify deploy is added.

## Observability

`archive_operator_system_status()` exposes current/latest semantic job state, type, source, preparation/submission age, decision, PR/head/merge references, blocker and prep status. `PREPARED` older than 12 hours is surfaced as `SEMANTIC_WORKER_NOT_CONSUMED`; submitted/finalizing work older than 15 minutes is surfaced as `FINALIZER_STALLED`. Operators can see the persisted blocker without querying ChatGPT task status.

## Scheduled task handoff

The AM and PM worker prompts are in `docs/KNOWLEDGE_SEMANTIC_WORKER_PROMPT_V1.md`. They are recommendations only; this change does not create, edit, enable, or disable ChatGPT Scheduled Tasks. Keep the existing V2 task as fallback until C3 has passed staging and end-to-end acceptance. Then the user can add independent 06:00 and 18:00 KST tasks with the provided prompt and later retire the old task.
