-- Durable execution receipts for AFTERFALL Automation B scheduled illustration runs.
-- This is an operations ledger only; it is not gameplay Canon or a public site source.
create schema if not exists survival_ops;

create table if not exists survival_ops.illustration_worker_runs (
  run_id text primary key,
  scheduled_for timestamptz,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  scheduler text not null,
  worker text not null,
  main_sha text,
  active_provider text,
  target_subject_id text,
  point_id text,
  generation_key text,
  prompt_contract text,
  generation_attempt_count smallint not null default 0,
  accepted_count smallint not null default 0,
  accepted_source_sha256 text,
  transferable_original boolean,
  identity_pr_number integer,
  trusted_handoff_status text not null default 'NOT_STARTED',
  storage_readback_status text not null default 'NOT_STARTED',
  registry_status text not null default 'NOT_STARTED',
  cleanup_status text not null default 'NOT_STARTED',
  final_status text not null default 'STARTED',
  blocker_code text,
  blocker_stage text,
  receipt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint illustration_worker_runs_main_sha_check
    check (main_sha is null or main_sha ~ '^[a-f0-9]{40}$'),
  constraint illustration_worker_runs_point_id_check
    check (point_id is null or point_id ~ '^point-[a-f0-9]{64}$'),
  constraint illustration_worker_runs_generation_key_check
    check (generation_key is null or generation_key ~ '^generation-[a-f0-9]{64}$'),
  constraint illustration_worker_runs_source_sha_check
    check (accepted_source_sha256 is null or accepted_source_sha256 ~ '^[a-f0-9]{64}$'),
  constraint illustration_worker_runs_attempt_count_check
    check (generation_attempt_count between 0 and 3),
  constraint illustration_worker_runs_accepted_count_check
    check (accepted_count between 0 and 1),
  constraint illustration_worker_runs_prompt_contract_check
    check (prompt_contract is null or prompt_contract = 'illustration-image-prompt-v1'),
  constraint illustration_worker_runs_handoff_status_check
    check (trusted_handoff_status in ('NOT_STARTED','BLOCKED','IN_PROGRESS','SUCCEEDED')),
  constraint illustration_worker_runs_storage_status_check
    check (storage_readback_status in ('NOT_STARTED','BLOCKED','IN_PROGRESS','SUCCEEDED')),
  constraint illustration_worker_runs_registry_status_check
    check (registry_status in ('NOT_STARTED','BLOCKED','IN_PROGRESS','SUCCEEDED')),
  constraint illustration_worker_runs_cleanup_status_check
    check (cleanup_status in ('NOT_STARTED','BLOCKED','IN_PROGRESS','SUCCEEDED')),
  constraint illustration_worker_runs_final_status_check
    check (final_status in ('STARTED','NO_CANDIDATE','BLOCKED','SUCCEEDED'))
);

comment on table survival_ops.illustration_worker_runs is
  'Durable Automation B execution ledger. Stores one receipt per scheduled illustration-worker run; not gameplay Canon.';

revoke all on table survival_ops.illustration_worker_runs from public;
revoke all on table survival_ops.illustration_worker_runs from anon, authenticated;
grant usage on schema survival_ops to service_role;
grant select, insert, update on table survival_ops.illustration_worker_runs to service_role;

create or replace function public.archive_illustration_worker_run_upsert(p_run jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_run_id text := p_run ->> 'run_id';
  v_receipt_version text := p_run ->> 'receipt_version';
  v_attempts jsonb := coalesce(p_run -> 'generation_attempts', '[]'::jsonb);
  v_attempt_count integer := jsonb_array_length(v_attempts);
  v_accepted_count integer := coalesce((p_run -> 'accepted' ->> 'count')::integer, 0);
  v_final_status text := coalesce(p_run ->> 'final_status', 'STARTED');
  v_row survival_ops.illustration_worker_runs%rowtype;
begin
  if v_receipt_version <> 'illustration-worker-run-receipt-v1'
     or v_run_id is null or length(v_run_id) < 8
     or p_run ->> 'scheduler' is null
     or p_run ->> 'worker' is null
     or v_attempt_count > 3
     or v_accepted_count not between 0 and 1
     or v_final_status not in ('STARTED','NO_CANDIDATE','BLOCKED','SUCCEEDED') then
    raise exception 'INVALID_ILLUSTRATION_WORKER_RUN_RECEIPT' using errcode = '22023';
  end if;

  if v_accepted_count = 1 and (
      p_run -> 'accepted' ->> 'source_sha256' is null
      or p_run -> 'accepted' ->> 'transferable_original' is null
    ) then
    raise exception 'INVALID_ACCEPTED_ILLUSTRATION_RECEIPT' using errcode = '22023';
  end if;

  insert into survival_ops.illustration_worker_runs (
    run_id, scheduled_for, started_at, finished_at, scheduler, worker,
    main_sha, active_provider, target_subject_id, point_id, generation_key,
    prompt_contract, generation_attempt_count, accepted_count,
    accepted_source_sha256, transferable_original, identity_pr_number,
    trusted_handoff_status, storage_readback_status, registry_status,
    cleanup_status, final_status, blocker_code, blocker_stage, receipt, updated_at
  ) values (
    v_run_id,
    nullif(p_run ->> 'scheduled_for', '')::timestamptz,
    coalesce(nullif(p_run ->> 'started_at', '')::timestamptz, clock_timestamp()),
    nullif(p_run ->> 'finished_at', '')::timestamptz,
    p_run ->> 'scheduler',
    p_run ->> 'worker',
    nullif(p_run ->> 'main_sha', ''),
    nullif(p_run ->> 'active_provider', ''),
    nullif(p_run -> 'target' ->> 'subject_id', ''),
    nullif(p_run -> 'target' ->> 'point_id', ''),
    nullif(p_run -> 'target' ->> 'generation_key', ''),
    nullif(p_run -> 'prompt' ->> 'contract_version', ''),
    v_attempt_count,
    v_accepted_count,
    nullif(p_run -> 'accepted' ->> 'source_sha256', ''),
    case
      when p_run -> 'accepted' ? 'transferable_original'
      then (p_run -> 'accepted' ->> 'transferable_original')::boolean
      else null
    end,
    nullif(p_run -> 'downstream' ->> 'identity_pr_number', '')::integer,
    coalesce(p_run -> 'downstream' ->> 'trusted_handoff', 'NOT_STARTED'),
    coalesce(p_run -> 'downstream' ->> 'storage_readback', 'NOT_STARTED'),
    coalesce(p_run -> 'downstream' ->> 'registry', 'NOT_STARTED'),
    coalesce(p_run -> 'downstream' ->> 'cleanup', 'NOT_STARTED'),
    v_final_status,
    nullif(p_run -> 'blocker' ->> 'code', ''),
    nullif(p_run -> 'blocker' ->> 'stage', ''),
    p_run,
    clock_timestamp()
  )
  on conflict (run_id) do update set
    scheduled_for = excluded.scheduled_for,
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    scheduler = excluded.scheduler,
    worker = excluded.worker,
    main_sha = excluded.main_sha,
    active_provider = excluded.active_provider,
    target_subject_id = excluded.target_subject_id,
    point_id = excluded.point_id,
    generation_key = excluded.generation_key,
    prompt_contract = excluded.prompt_contract,
    generation_attempt_count = excluded.generation_attempt_count,
    accepted_count = excluded.accepted_count,
    accepted_source_sha256 = excluded.accepted_source_sha256,
    transferable_original = excluded.transferable_original,
    identity_pr_number = excluded.identity_pr_number,
    trusted_handoff_status = excluded.trusted_handoff_status,
    storage_readback_status = excluded.storage_readback_status,
    registry_status = excluded.registry_status,
    cleanup_status = excluded.cleanup_status,
    final_status = excluded.final_status,
    blocker_code = excluded.blocker_code,
    blocker_stage = excluded.blocker_stage,
    receipt = excluded.receipt,
    updated_at = clock_timestamp()
  returning * into v_row;

  return pg_catalog.to_jsonb(v_row);
end;
$$;

comment on function public.archive_illustration_worker_run_upsert(jsonb) is
  'Service-role-only upsert for one Automation B scheduled-run receipt. The receipt is operational metadata, not Canon.';

revoke all on function public.archive_illustration_worker_run_upsert(jsonb) from public;
revoke execute on function public.archive_illustration_worker_run_upsert(jsonb) from anon, authenticated;
grant execute on function public.archive_illustration_worker_run_upsert(jsonb) to service_role;

create or replace function public.archive_illustration_worker_run_readback(p_run_id text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.to_jsonb(r)
  from survival_ops.illustration_worker_runs r
  where r.run_id = p_run_id;
$$;

comment on function public.archive_illustration_worker_run_readback(text) is
  'Service-role-only exact readback for one Automation B scheduled-run receipt.';

revoke all on function public.archive_illustration_worker_run_readback(text) from public;
revoke execute on function public.archive_illustration_worker_run_readback(text) from anon, authenticated;
grant execute on function public.archive_illustration_worker_run_readback(text) to service_role;

notify pgrst, 'reload schema';
