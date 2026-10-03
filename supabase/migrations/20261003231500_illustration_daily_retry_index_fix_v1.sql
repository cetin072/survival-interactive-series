-- Automation B: allow multiple same-day attempts until one SUCCEEDED asset exists.
-- Keep only the one-active-job guard; remove the obsolete one-job-per-KST-day guard.

drop index if exists survival_ops.illustration_render_jobs_one_per_kst_day_idx;

create index if not exists illustration_render_jobs_date_kst_idx
  on survival_ops.illustration_render_jobs(date_kst,created_at);

notify pgrst,'reload schema';
