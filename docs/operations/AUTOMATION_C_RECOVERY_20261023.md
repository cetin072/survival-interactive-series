# Automation C recovery — 2026-10-23 KST

## Scope and control
User authorized PR #620 and directly necessary recovery changes, main merge after checks, forward migrations, existing-job retries and existing schedule resume. No forced Production deploy, LLM rerun, original-result overwrite or high-risk approval.

Before recovery: 48 jobs; 18 BLOCKED, 9 HOLD, 7 HUMAN_REVIEW, 14 PUBLISHED. Eight BLOCKED rows reserve K-011/K-012 already published by later jobs; preserve them as history. Ten current failures concern K-036..046 (K-042 is normal duplicate HOLD).
Supabase Prep AM/PM were already OFF; GitHub workflow knowledge-semantic-prep.yml was active independently. Disabled that existing workflow (readback disabled_manually), leaving Finalizer ON. No new schedules created.

## Root causes and fix
- Missing worldline S03/S04 RAW: exact allowlisted C03 Archive path only after main and worldline originals are absent. Verify season/session/public-safe capture metadata, registered part pin and actual bytes. Reader chapter hash and sourceRefs/sourceHashes remain authoritative.
- Prep and Finalizer now share verifyPins. Prep records SOURCE_ACCESS failure without creating a semantic job.
- Shared pause: existing cron.job AM/PM active flags control both dispatch origins through DB admission. Both must be ON. Use postgres-only survival_ops.set_knowledge_semantic_prep_enabled(false/true) once; GitHub fallback cannot admit work while paused. No new table or expanded client role.
- New PREPARED submissions require BRIEF fields, blocks, table headers and V2 lead/final provenance. Historical duplicate submissions retain immutable-result idempotency.

## Stored manuscript triage
| Brief | Before | Stored package validation | Action |
|---|---|---|---|
| K-036 | BLOCKED/KNOWLEDGE_CONTRACT | Missing meta_description, slug, basis and other fields; body/bullets format; abbreviated sources | Editorial revision needed; preserve original |
| K-037 | BLOCKED/KNOWLEDGE_CONTRACT | table.columns instead of headers; N1 narrative source needs separate provenance treatment | Editorial/evidence revision needed; preserve original |
| K-038 | BLOCKED/SEMANTIC_EDITORIAL_LEAD_REQUIRED | body_md/dek without BRIEF lead/sections | HIGH/HUMAN_REVIEW revision needed; preserve all text and original SHA |
| K-039 | BLOCKED/SEMANTIC_SOURCE_UNAVAILABLE | Pins and package PASS | One guarded retry after merge; HUMAN_REVIEW |
| K-040 | same | Pins and package PASS | One guarded retry after merge |
| K-041 | same | Pins and package PASS | One guarded retry after merge |
| K-042 | HOLD/SEMANTIC_DUPLICATE | Normal disposition | No retry |
| K-043 | BLOCKED/SEMANTIC_SOURCE_UNAVAILABLE | Pins PASS; sections use body, tools are labels without actual downloadable resources | Separate editorial revision; no invented downloads |
| K-044 | same | Same section/download contract issue | Separate editorial revision |
| K-045 | BLOCKED/SEMANTIC_SOURCE_UNAVAILABLE | Pins and package PASS | One guarded retry after merge |
| K-046 | same | S04 pin and package PASS | One guarded retry after merge |

No original semantic_result, source/policy/result digest, job ID, Brief ID or evidence was changed by triage. Tests use disposable clones or rolled-back synthetic DB fixtures. Existing original/raw files are not edited.

## Validation before merge
- Actual S03 7 archived RAW hashes and S04 K-046 hash verified.
- Source resolver tests cover main/worldline priority, S02 fallback, public metadata and corrupt bytes.
- Stored ten-job source pins PASS; package outcomes are recorded above.
- Semantic 71 tests and Knowledge 71 tests passed before final added resolver test; latest CI must rerun.
- Web 279 tests PASS with bundled Node v24.19.0. System Node v22.23.2 reports Korean PM as English PM, causing three unrelated locale assertions; no tests weakened.
- Reader, TypeScript/Vite build and public boundary 48 probes PASS.
- Rolled-back live DB tests: shared pause blocks new admission, resumes both existing cron rows, malformed K-036/037/038 submissions rejected before storage, normal HOLD accepted, duplicate submission idempotent. All synthetic rows rolled back.

## Execution gate
Merge latest #620 only after exact-head required CI. Apply both forward migrations and read back definitions. Recover one eligible job at a time through retry_knowledge_semantic_blocked_finalizer(job_id, expected result SHA, exact blocker). Wait for terminal/HUMAN_REVIEW state and slot release before next job. K-043/044 quality failures are not blindly retried. Verify at least one LOW-risk pipeline completes. Resume existing Prep and GitHub workflow only after recovery conditions; verify Worker and Consumer separately. Keep 48-hour Production policy and never force a deploy.
