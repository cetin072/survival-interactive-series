# C3 Brief reservation contract and recovery

## Authority

C-PREP allocates the next ID from main Briefs plus durable reservations. Once admitted, the job's semantic_context.target is immutable. All history retains its reservation, including HOLD, HUMAN_REVIEW, BLOCKED and PUBLISHED. Gaps in the main directory are valid.

C-FINALIZER validates the submitted Brief, Candidate and Evidence against that reservation. The read-only service RPC verifies the current ledger owner, source/policy binding, immutable result digest and absence of another owner. The current main package check separately rejects an existing Brief. Finalizer never allocates or renumbers.

The existing prepare RPC's advisory lock and all-status duplicate check remain authoritative for admission. A trigger uses the same lock to prohibit new duplicate inserts and target updates. Historical K-011/K-012 retry rows remain unchanged; a global unique index would reject those existing records. A collision remains fail closed.

## Review and publication

An explicit HUMAN_REVIEW package may reach the Operator Inbox when the release gate returns HUMAN_REVIEW_REQUIRED or HOLD with requires_human=true (for example material unknowns). This permits a review handoff, not publication. Incomplete packages without an explicit human reason and REJECTED transport/content results remain blocked. BRIEF_READY still requires AUTO_PUBLISH_ELIGIBLE. Existing human approval, public projection, exact-head and Production gates are unchanged.

## Existing-result recovery

Use survival_ops.retry_knowledge_semantic_blocked_finalizer with the exact existing job ID, stored result SHA and blocker code. This existing postgres-only function preserves the result and pins; it creates no replacement job. Before retry, verify reservation RPC, source/policy bytes, current main absence, review/PR references, and the single machine slot.

Do not retry while PREPARED/SUBMITTED/FINALIZING/PR_OPEN work owns the slot. In particular K-019 is already PREPARED; reactivating K-016 or K-018 immediately would violate the existing unique machine index. Preserve K-019 and do not fabricate a HOLD, clear it, delete it or bypass the index.

Rollout requires the forward migration plus the code on current main (the existing finalizer workflow explicitly checks out main). This code PR remains Draft until approved. After approved rollout, manually consume the existing K-019 through the existing worker path while the schedule remains disabled; wait for its real machine outcome to free the slot. Then retry existing blocked finalizers one at a time, waiting for each to leave the slot. Re-enable the same scheduled Worker only after those validations and recovery succeed.

## 2026-10-09 read-only audit

Main: bf49a49e0966beef2d8442d33a4540945280491b.

- K-015: existing HUMAN_REVIEW, PR #425; untouched.
- K-016: existing BLOCKED/FINALIZER/SEMANTIC_TARGET_BRIEF_STALE; BRIEF_READY. Source/policy pins, DB result digest, reserved identity and main absence verified. Existing package passes schema and AUTO_PUBLISH_ELIGIBLE.
- K-017: existing HOLD/SEMANTIC_DUPLICATE; untouched.
- K-018: existing BLOCKED/FINALIZER/SEMANTIC_TARGET_BRIEF_STALE; HUMAN_REVIEW. Source/policy pins, DB result digest, reserved identity and main absence verified. Existing package passes schema; release is HOLD/requires_human=true/MATERIAL_UNKNOWNS, eligible only for the review handoff.
- K-019: existing PREPARED job, original S04 FRESH source/policy pins verified; occupies the one machine slot.

The candidate migration was exercised in a rolled-back transaction against existing job identities. Valid K-016/K-018 bindings passed; wrong target, wrong digest and new duplicate reservations were rejected. Existing retry rejected the occupied K-019 slot. No persistent Job or review mutation occurred.

Worker ID: 6abe754980a88191986e041b52181e7d. This session could not read the ChatGPT task because browser initialization failed. Current enabled state, updated_at, prompt, schedule and last/next execution are UNVERIFIED. OFF cause is CAUSE_NOT_VERIFIED. No schedule or Worker was created/modified.
