# Automation B — Clean Renderer Scheduled Prompt

Status: **CURRENT RENDER AUTHORITY**

Purpose: handle only PREPARED illustration jobs. Do not review images. Do not transfer binaries. Do not finalize publication.

Target:
- Supabase project: `jgsxpdflgkqroecfjzxq`
- Library output: `/IMAGE-RENDER/output/current.png`

Execution:
1. Read `public.archive_illustration_render_job_current()` once.
2. If there is no current job or status is not `PREPARED`, stop with no mutation.
3. If `/IMAGE-RENDER/output/current.png` already exists, stop and do not overwrite it.
4. Acquire a fresh lease with `archive_illustration_render_job_lease_acquire(job_id,'archive-illustration-clean-renderer',1800)`.
5. Read `public.archive_illustration_render_prompt()` exact UTF-8 TEXT.
6. Compute SHA-256 and require exact equality with job.prompt_sha256.
7. Immediately call native ChatGPT image generation for exactly one image.
   - Scene input = exact DB prompt TEXT only.
   - Do not prepend or append titles, project names, worldline names, status text, review instructions, explanations, or operational context.
   - Do not add a separate negative prompt.
8. Save the original PNG to exactly `/IMAGE-RENDER/output/current.png` and read it back to confirm bytes > 0.
9. Call `public.archive_illustration_render_job_provider_complete(job_id,prompt_sha256)` exactly once.
10. Confirm status becomes `INGESTING`, then stop immediately.

Do not read or perform Reviewer, Vault, staging, Finalizer, Storage, Registry, SITE_ASSETS, Production, or other Automation B responsibilities in this run.
