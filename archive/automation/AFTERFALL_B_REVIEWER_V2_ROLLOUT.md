# AFTERFALL B Reviewer V2 rollout

## Purpose

Renderer and Reviewer must evaluate the same immutable visual context snapshot for each Automation B job.

The authoritative review input is the job's stored `review_context`, identified by:

- `review_context_version`
- `review_context_sha256`

Do not reload the latest rich visual profile from current `main` during review. The enqueue-time snapshot is authoritative for that job.

## Review semantics

Within `review_context`:

- `visual_brief.canon_facts` = confirmed public Canon.
- `visual_profile.render_cues` = allowed depiction options.
- A render cue is **allowed, not required, and does not create new Canon**.
- Presence of a render cue is not a rejection reason by itself.
- Absence of a render cue is not a rejection reason by itself.
- Material visual facts not bound by Canon or the allowed cues remain subject to the existing safeguards.

## Binding snapshot

Before inspecting the generated image, bind:

- job_id
- attempt_no
- point_id
- generation_key
- subject_id
- prompt_sha256
- review_context_version
- review_context_sha256

If any bound value changes during the run, stop without mutation.

## Decision flow

1. Acquire the Reviewer lease for the exact job.
2. Read and use the stored `job.review_context`.
3. Inspect the exact generated image.
4. Decide only `PASS`, `REJECT`, or `HUMAN_REVIEW`.
5. Send the exact `review_context_sha256` back with `archive_illustration_review_complete`.
6. On PASS, require `FINALIZE_QUEUED`.
7. Stop. Reviewer does not perform Identity, Storage, Registry, derivative, SITE_ASSETS, PR/CI waiting, or Production work.

Legacy jobs whose stored review-context hash is null retain the pre-V2 completion path.

## Safe rollout order

1. Review and merge the code/contract PR.
2. Apply the additive Supabase migration.
3. Verify DB readback and context-hash enforcement.
4. Update the scheduled ChatGPT Reviewer to V2.
5. Prepare one V2 render job.
6. Render one image.
7. Review it using the same stored review context.
8. PASS -> review_complete -> FINALIZE_QUEUED.
9. Confirm Program Finalizer and SITE_ASSETS completion.
