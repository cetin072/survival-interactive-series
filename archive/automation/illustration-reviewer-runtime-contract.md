# AFTERFALL B Reviewer runtime contract

Automation B Reviewer V2 binds review to the exact enqueue-time shared visual context. The machine-readable contract is [illustration-reviewer-runtime-contract.json](illustration-reviewer-runtime-contract.json).

The scheduled Reviewer must be updated to V2 before shared-context jobs are reviewed. For V2 jobs, the authoritative review input is the stored `job.review_context`; do not reload a newer profile from `main`.

Reviewer rules:

- bind job_id, attempt_no, point_id, generation_key, subject_id, prompt_sha256, review_context_version, and review_context_sha256 before review;
- acquire and propagate the current Reviewer lease for every mutation;
- treat Canon facts as confirmed facts;
- treat rich render cues as allowed but not required, and never as new Canon;
- return the exact job review-context hash with the review decision;
- PASS must transition to FINALIZE_QUEUED;
- Reviewer stops after the decision and does not perform Finalizer work.

Legacy jobs with a null review-context hash retain the pre-V2 review path.

See [AFTERFALL_B_REVIEWER_V2_ROLLOUT.md](AFTERFALL_B_REVIEWER_V2_ROLLOUT.md) for the rollout order.
