# AFTERFALL B Reviewer runtime contract

Automation B Reviewer V2 binds review to the exact enqueue-time shared visual context. The machine-readable contract is [illustration-reviewer-runtime-contract.json](illustration-reviewer-runtime-contract.json).

The scheduled Reviewer uses the stored `job.review_context` as authority. It does not reload a newer profile from `main`.

## Review order

Every generated PNG follows the same order, regardless of the eventual decision:

1. bind job_id, attempt_no, point_id, generation_key, subject_id, prompt_sha256, review_context_version, and review_context_sha256;
2. acquire the Reviewer lease;
3. read and bind the exact `/AFTERFALL-B/render-output/current.png`;
4. copy that exact PNG into private review staging and finalize the staging bytes;
5. perform the visual review;
6. submit exactly one of PASS / REJECT / HUMAN_REVIEW with the same review_staging_id and provider_asset_id.

The staging-first rule is required because every generated render must enter the private 30-day Illustration Vault. A failed or rejected image is still an operational artifact and must not disappear before it can be archived.

## Decision behavior

- **PASS**: enqueue the 30-day vault copy and continue the existing Program Finalizer path. The accepted original is promoted to permanent private Storage, Registry, derivative and SITE_ASSETS exactly as before.
- **REJECT**: enqueue the 30-day vault copy. After the vault upload succeeds, temporary DB transport staging may be removed. No permanent asset is published.
- **HUMAN_REVIEW**: enqueue the 30-day vault copy and retain the human-review state. No permanent asset is published automatically.

The private vault bucket is `survival-illustration-vault`. It is operator-only, is separate from `survival-archive-originals`, and its Storage object is deleted after 30 days by Program Prep. This adds no scheduled AI task.

## Context semantics

- Canon facts are confirmed facts.
- rich render cues are allowed but not required, and never create new Canon.
- the exact job review-context hash is returned with the review decision.
- Reviewer stops after the review decision and never performs Finalizer work.

Legacy jobs with a null review-context hash retain the pre-V2 review-context path, but the staging-first vault rule still applies to newly reviewed PNGs.
