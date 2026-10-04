-- Automation B: keep the immutable render prompt readable across Renderer -> Reviewer handoff.
-- Reviewer must be able to re-hash the same prompt after PREPARED becomes INGESTING/READY_FOR_REVIEW.

create or replace function public.archive_illustration_render_prompt()
returns text
language sql
stable
set search_path=''
as $$
  select prompt_text
  from survival_ops.illustration_render_jobs
  where status in ('PREPARED','INGESTING','READY_FOR_REVIEW')
  order by created_at desc
  limit 1
$$;
