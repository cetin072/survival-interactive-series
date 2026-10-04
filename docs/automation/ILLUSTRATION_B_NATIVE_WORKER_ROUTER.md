# Automation B — Native Worker Boot Router

Status: **CURRENT REVIEW/TRANSFER BOOT AUTHORITY**

This worker does not render images. PREPARED belongs exclusively to the separate Clean Renderer schedule.

1. Read `public.archive_illustration_render_job_current()` once from Supabase project `jgsxpdflgkqroecfjzxq`.
2. If there is no current job, stop with no mutation.
3. If status=`PREPARED`, stop immediately. Do not generate an image.
4. If status is `INGESTING` or `REVIEW_PASS_STAGED`, load:
   - `docs/automation/ILLUSTRATION_B_NATIVE_WORKER_PROMPT.md`
   - `archive/automation/illustration-native-worker-runtime-contract.json`
   - `archive/automation/illustration-review-provider.json`
   and perform exactly the one role bound to that status.
5. All other statuses are NOOP.

Invariant: **Clean Renderer owns PREPARED. Native Worker owns review/transfer only.**
