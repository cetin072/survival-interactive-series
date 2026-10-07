# Knowledge Automation C 3.0

## Normal path

Archive and Knowledge state → C-PREP → durable `PREPARED` job → Semantic Worker → one-shot submit → C-FINALIZER → atomic package commit and Draft PR → existing Worker Gate → existing HUMAN_REVIEW or exact-head publication handoff → existing Production batch.

## Ownership

- **C-PREP** scans the current source inventory, selects one oldest eligible FRESH source, otherwise one unhandled EXPERIENCE_SEED, otherwise one due BACKFILL, excludes handled identities, applies the existing backfill cadence, checks legacy worker PR/branch blockers, pins source/policy/main, and writes a compact durable job. Reader BACKFILL automatically discovers Chronicle Reader books under `archive/content/stories/C*/BOOK.json`, admits only books whose Chronicle identity matches the directory and that contain at least one `VERIFIED_GM_NARRATIVE` chapter, and takes at most one unreviewed chapter per run. Adding a new Chronicle does not add schedules or workers.
- **ChatGPT Semantic Worker** reads one prepared job, researches and semantically evaluates one candidate, submits one versioned result, then stops. It owns no GitHub, CI, repository state, publication, or Production work.
- **C-FINALIZER** claims submitted work, revalidates source/policy/package and duplicate state, writes one atomic package commit on a deterministic worker branch, opens one Draft PR with `PACKAGE_READY`, and records lifecycle state. Existing Worker Gate and publication workflows own the publication decision and exact-head merge. HOLD is terminal and creates no content PR. HUMAN_REVIEW uses the existing Operator Inbox.

The current C1 runtime remains available as legacy/fallback during migration. C2 Longform is unchanged; the durable job type check reserves `LONGFORM` without creating such jobs here.

## Durable boundary and recovery

Supabase `survival_ops.knowledge_semantic_jobs` persists source identity, policy and main pins, compact context, immutable submitted result and digest, lifecycle references, blockers and attempts. A unique active-job index serializes semantic work. `PREPARED` is not expired, so the other scheduled worker can safely continue after a run interruption. Submit uses a database row lock and digest equality: the first valid result is accepted, identical resubmission returns `ALREADY_SUBMITTED`, and a different resubmission is rejected. A scheduled program-owned dispatcher triggers the finalizer; finalizer claims can be recovered after a stale attempt.

## Source priority and multi-chronicle backfill

The source order remains deliberately simple:

1. fresh verified public Archive source;
2. unhandled Experience Seed;
3. due verified Reader BACKFILL.

The Reader pool is discovered from the published Archive itself rather than a manually maintained list. Chronicle directories are ordered newest-first by their numeric `Cxx` prefix, so a future `C04`, `C05`, and later Reader automatically enter the pool once a valid `BOOK.json` with verified narrative exists. Empty Reader shells are ignored; malformed Chronicle identity fails closed. Discovery stays outside `worker-policy.json`, so adding Reader sources does not invalidate an already prepared semantic job's policy pin. A reviewed/HOLD/HUMAN_REVIEW/PUBLISHED Reader work key is skipped, so the selector eventually moves across all available chronicles without requiring new gameplay. Chronicle identity is part of the source reference (`BOOK.json#chapter-id`), preventing same chapter IDs in different books from colliding. Story text only supplies the question/provenance; reality claims still require independent authoritative external sources.

## Schedules and release boundary

Supabase external dispatch schedules C-PREP for 05:45, 11:45, 17:45, and 23:45 KST (UTC cron 20:45, 02:45, 08:45, and 14:45). The existing named cron jobs are updated in place. The existing ChatGPT worker should run at 06:00, 12:00, 18:00, and 00:00 KST. GitHub workflow schedules are fallback entry points, and both workflows also support manual dispatch. A separate five-minute dispatcher starts the finalizer only for submitted or stale-finalizing work. The existing publication handoff, exact-head validation, HUMAN_REVIEW consumer, and batched Production policy remain unchanged. No direct Netlify deploy is added.

## Observability

`archive_operator_system_status()` exposes current/latest semantic job state, type, source, preparation/submission age, decision, PR/head/merge references, blocker and prep status. `PREPARED` older than 12 hours is surfaced as `SEMANTIC_WORKER_NOT_CONSUMED`; submitted/finalizing work older than 15 minutes is surfaced as `FINALIZER_STALLED`. Operators can see the persisted blocker without querying ChatGPT task status.

## Scheduled task handoff

The worker prompt is in docs/KNOWLEDGE_SEMANTIC_WORKER_PROMPT_V1.md. Update the existing Knowledge Semantic Worker schedule when its owner can edit it; do not create a new Scheduled Task. The worker consumes at most one PREPARED job and never chooses a second source after HOLD or HUMAN_REVIEW.

Experience Seeds are question provenance, never real-world Evidence. Source file bytes are pinned in the existing durable job. EX-001's electrical risk requires an ELECTRICAL HUMAN_REVIEW package when its question merits a package; the worker must research independent authoritative sources.
