-- Remove grant options left by Supabase's managed grantor after SECURITY DEFINER
-- functions have been transferred to the non-login owner role.
revoke archive_runner_internal from postgres cascade;
revoke admin option for archive_runner_internal from postgres cascade;
revoke set option for archive_runner_internal from postgres cascade;
revoke inherit option for archive_runner_internal from postgres cascade;

-- Support task-scoped event lookup and parent-side FK maintenance.
create index archive_publication_task_events_task_idx
  on survival_rpg.archive_publication_task_events (task_id, occurred_at, event_id);
