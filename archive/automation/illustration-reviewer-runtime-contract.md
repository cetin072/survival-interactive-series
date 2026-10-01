# AFTERFALL B Reviewer runtime contract

The existing scheduled AFTERFALL B Reviewer reservation predates and is incompatible with the lease RPC contract. Update that reservation to use this V2 contract before enabling lease enforcement. Do not send staging or review mutations without the current lease token.

The machine-readable request fixture is [illustration-reviewer-runtime-contract.json](illustration-reviewer-runtime-contract.json). Its call shapes and terminal lease transitions are checked by `test_finalize_illustration_job.py`.

## Acquire and hold one lease

Before staging or reviewing, call `archive_illustration_render_job_lease_acquire` with `p_job_id`, a unique `p_owner`, and `p_lease_seconds` in the allowed 60–7200 second range. Reviewer jobs may be acquired only in `PREPARED`, `INGESTING`, or `READY_FOR_REVIEW`. Continue only for `LEASE_ACQUIRED`; on `LEASE_HELD`, stop without mutating the job and do not borrow or replay the other owner's token.

Keep the returned UUID `lease_token` for this run. Every mutation below must use that exact token while the lease is unexpired. A stale, expired, previous-run, or mismatched token fails closed. Read-only RPCs do not need the token.

## Mutating RPC calls

1. `archive_illustration_review_staging_begin`: pass the UUID as `p_meta.lease_token`; `p_meta.job_id` must be the leased job. This requires `PREPARED`.
2. `archive_illustration_review_staging_chunk_put`: pass `p_job_id`, `p_lease_token`, `p_staging_id`, `p_chunk_index`, and `p_chunk_b64`. The staging row must belong to that job. Allowed states are `PREPARED`, `INGESTING`, and `READY_FOR_REVIEW`.
3. `archive_illustration_review_staging_finalize`: pass `p_job_id`, `p_lease_token`, and `p_staging_id`. The staging row must belong to that job; the same three states are allowed.
4. `archive_illustration_review_complete`: pass `p_review` with `job_id`, `lease_token`, decision, review provider, output identity/dimensions, and rejection codes. This requires `PREPARED`.

The JSON fixture gives the exact PostgREST argument names. Do not keep retrying a failed mutation with a different token; reacquire only after the current lease has expired and the job remains in an allowed state.

## Decision results and lease lifecycle

- `HUMAN_REVIEW`: the job enters `HUMAN_REVIEW`; worker owner/token are cleared and `lease_until` becomes decision time plus seven days. Worker lease acquisition and heartbeat are not allowed during this SLA. The stale sweeper blocks it with `HUMAN_REVIEW_SLA_EXPIRED` only after expiry.
- `REJECT`: the job enters `REVIEW_REJECTED`; owner/token/until are cleared. The current `attempt_no` does not change during review completion. A later semantic retry is assigned the next attempt by enqueue policy. Same-day automatic regeneration remains disabled.
- `PASS`: completion dispatches the job into `FINALIZE_QUEUED` and clears the Reviewer lease. The Program Finalizer must acquire its own fresh lease before any finalizer mutation.

`REVIEWER_AUTOMATION_UPDATE_REQUIRED = YES` — update the scheduled Reviewer reservation to this contract before enabling the lease-enforced rollout. This repository change does not modify the ChatGPT automation.
