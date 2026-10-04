> **HISTORICAL / NOT CURRENT LIVE LEDGER** — 현재 Automation B의 운영 상태는 `survival_ops.illustration_render_jobs`와 Operator Dashboard가 권위다. `illustration_worker_runs`는 과거 올인원 Worker 진단 설계 기록으로 유지하며 현재 Renderer/Reviewer 예약에서는 사용하지 않는다.

# AFTERFALL Illustration Worker Run Receipt v1

## Purpose

Make every scheduled Automation B run diagnosable after the fact.

A run must leave one durable operational receipt even when no image is accepted. The receipt is **not Canon** and is not a public site artifact.

## Storage

Primary ledger:

```text
Supabase
survival_ops.illustration_worker_runs
```

Trusted API boundary:

- `public.archive_illustration_worker_run_upsert(jsonb)`
- `public.archive_illustration_worker_run_readback(text)`

Both RPCs are executable only by `service_role`.

## Contract

```text
illustration-worker-run-receipt-v1
├─ run_id
├─ scheduler
├─ worker
├─ scheduled_for / started_at / finished_at
├─ main_sha
├─ active_provider
├─ target
│  ├─ subject_id
│  ├─ point_id
│  └─ generation_key
├─ prompt
│  ├─ contract_version
│  └─ status
├─ generation_attempts[0..3]
│  ├─ attempt_no
│  ├─ generation_status
│  ├─ review_status
│  ├─ rejection_codes
│  ├─ source_sha256
│  └─ transferable_original
├─ accepted
│  ├─ count
│  ├─ source_sha256
│  └─ transferable_original
├─ downstream
│  ├─ identity_pr_number
│  ├─ draft_release_id
│  ├─ trusted_handoff
│  ├─ storage_readback
│  ├─ registry
│  └─ cleanup
├─ blocker
│  ├─ code
│  └─ stage
└─ final_status
```

## Required behavior

1. Write `STARTED` before candidate processing.
2. Update the same `run_id` after material stages.
3. Each generation attempt records whether generation succeeded and why review rejected it.
4. One accepted image requires an exact SHA-256 and an explicit transferable-original boolean.
5. `BLOCKED` requires an exact blocker code and stage.
6. `SUCCEEDED` is valid only after trusted handoff, Storage readback, registry readback and cleanup all succeed.
7. No receipt means the worker must not claim completion.

## Example blocker codes

```text
NO_ELIGIBLE_CANDIDATE
PROMPT_COMPILER_REJECTED
PROVIDER_UNAVAILABLE
GENERATION_FAILED
NO_ACCEPTABLE_CANDIDATE
ORIGINAL_BINARY_NOT_TRANSFERABLE
IDENTITY_PR_BLOCKED
DRAFT_RELEASE_BLOCKED
TRUSTED_HANDOFF_BLOCKED
STORAGE_READBACK_FAILED
REGISTRY_READBACK_FAILED
CLEANUP_FAILED
```

These codes are descriptive operational metadata. They do not alter Canon, retry policy or visual quality rules.
