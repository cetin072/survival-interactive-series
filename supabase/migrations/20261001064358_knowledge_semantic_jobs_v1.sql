-- C3 Knowledge Semantic Worker durable jobs and program-owned dispatch.
-- Existing C1 tables, workflows, and A/B dispatchers are not modified.

create schema if not exists survival_ops;

create table if not exists survival_ops.knowledge_semantic_jobs (
  job_id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('FRESH_BRIEF','BACKFILL_BRIEF','LONGFORM')),
  status text not null check (status in ('PREPARED','SUBMITTED','FINALIZING','PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED')),
  source_kind text not null check (source_kind in ('PUBLIC_ARCHIVE','PUBLIC_READER')),
  source_ref text not null check (char_length(source_ref) between 1 and 700),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  work_key text not null check (char_length(work_key) between 1 and 400),
  policy_version text not null check (char_length(policy_version) between 1 and 100),
  policy_sha256 text not null check (policy_sha256 ~ '^[a-f0-9]{64}$'),
  policy_pin jsonb not null check (jsonb_typeof(policy_pin) = 'object' and pg_column_size(policy_pin) <= 32768),
  main_sha_at_prepare text not null check (main_sha_at_prepare ~ '^[a-f0-9]{40}$'),
  semantic_context jsonb not null check (jsonb_typeof(semantic_context) = 'object' and pg_column_size(semantic_context) <= 65536),
  semantic_result jsonb check (semantic_result is null or (jsonb_typeof(semantic_result) = 'object' and pg_column_size(semantic_result) <= 524288)),
  semantic_result_sha256 text check (semantic_result_sha256 is null or semantic_result_sha256 ~ '^[a-f0-9]{64}$'),
  result_decision text check (result_decision is null or result_decision in ('BRIEF_READY','HOLD','HUMAN_REVIEW')),
  blocker_code text,
  blocker_stage text,
  created_at timestamptz not null default clock_timestamp(),
  prepared_at timestamptz not null default clock_timestamp(),
  submitted_at timestamptz,
  finalizing_at timestamptz,
  finalized_at timestamptz,
  published_at timestamptz,
  final_pr_number integer check (final_pr_number is null or final_pr_number > 0),
  final_head_ref text check (final_head_ref is null or final_head_ref ~ '^knowledge/worker/[A-Za-z0-9._/-]+$'),
  final_head_sha text check (final_head_sha is null or final_head_sha ~ '^[a-f0-9]{40}$'),
  merge_sha text check (merge_sha is null or merge_sha ~ '^[a-f0-9]{40}$'),
  finalizer_attempt_count integer not null default 0 check (finalizer_attempt_count between 0 and 20),
  finalizer_dispatch_count integer not null default 0 check (finalizer_dispatch_count between 0 and 100000),
  finalizer_dispatch_request_id bigint,
  finalizer_dispatch_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique (source_kind, source_ref, source_sha256, job_type),
  check ((status = 'PREPARED' and semantic_result is null and submitted_at is null)
      or (status <> 'PREPARED' and status in ('SUBMITTED','FINALIZING','PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED'))),
  check ((semantic_result is null and semantic_result_sha256 is null and result_decision is null)
      or (semantic_result is not null and semantic_result_sha256 is not null and result_decision is not null)),
  check (status in ('PREPARED','BLOCKED') or semantic_result is not null),
  check (status <> 'PUBLISHED' or (final_pr_number is not null and final_head_sha is not null and merge_sha is not null and published_at is not null))
);

create unique index if not exists knowledge_semantic_jobs_one_active
  on survival_ops.knowledge_semantic_jobs ((true))
  where status not in ('PUBLISHED','HOLD','BLOCKED');

alter table survival_ops.knowledge_semantic_jobs enable row level security;
revoke all on survival_ops.knowledge_semantic_jobs from public, anon, authenticated, service_role;
grant select, insert, update on survival_ops.knowledge_semantic_jobs to postgres;

create table if not exists survival_ops.knowledge_semantic_prep_runs (
  singleton boolean primary key default true check (singleton),
  last_status text not null check (last_status in ('PREPARED','NOOP','BLOCKED','ERROR')),
  last_stage text not null,
  blocker_code text,
  source_ref text,
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  main_sha text check (main_sha is null or main_sha ~ '^[a-f0-9]{40}$'),
  backfill_last_attempted_at timestamptz,
  backfill_last_work_key text,
  checked_at timestamptz not null default clock_timestamp()
);
alter table survival_ops.knowledge_semantic_prep_runs enable row level security;
revoke all on survival_ops.knowledge_semantic_prep_runs from public, anon, authenticated, service_role;
grant select, insert, update on survival_ops.knowledge_semantic_prep_runs to postgres;

create or replace function survival_ops.guard_knowledge_semantic_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status in ('PUBLISHED','HOLD','BLOCKED') then
      raise exception 'KNOWLEDGE_SEMANTIC_TERMINAL_IMMUTABLE';
    end if;
    if old.status <> 'PREPARED' and new.semantic_result is distinct from old.semantic_result then
      raise exception 'KNOWLEDGE_SEMANTIC_RESULT_IMMUTABLE';
    end if;
    if old.status = 'PREPARED' and new.status not in ('PREPARED','SUBMITTED','HOLD','BLOCKED') then
      raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
    elsif old.status = 'SUBMITTED' and new.status not in ('SUBMITTED','FINALIZING','HOLD','BLOCKED') then
      raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
    elsif old.status = 'FINALIZING' and new.status not in ('FINALIZING','SUBMITTED','PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
      raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
    elsif old.status = 'PR_OPEN' and new.status not in ('PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
      raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
    elsif old.status = 'HUMAN_REVIEW' and new.status not in ('HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
      raise exception 'KNOWLEDGE_SEMANTIC_TRANSITION_INVALID';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists knowledge_semantic_job_guard on survival_ops.knowledge_semantic_jobs;
create trigger knowledge_semantic_job_guard
before update on survival_ops.knowledge_semantic_jobs
for each row execute function survival_ops.guard_knowledge_semantic_job();

create or replace function public.archive_knowledge_semantic_job_current()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select pg_catalog.jsonb_build_object(
      'status','PREPARED',
      'job', pg_catalog.jsonb_build_object(
        'job_id', j.job_id,
        'job_type', j.job_type,
        'source_kind', j.source_kind,
        'source_ref', j.source_ref,
        'source_sha256', j.source_sha256,
        'work_key', j.work_key,
        'policy_version', j.policy_version,
        'main_sha_at_prepare', j.main_sha_at_prepare,
        'prepared_at', j.prepared_at,
        'context', j.semantic_context
      )
    )
    from survival_ops.knowledge_semantic_jobs j
    where j.status = 'PREPARED'
    order by j.prepared_at, j.job_id
    limit 1
  ), pg_catalog.jsonb_build_object('status','NO_JOB'));
$$;

create or replace function public.archive_knowledge_semantic_job_submit(
  p_job_id uuid,
  p_source_ref text,
  p_source_sha256 text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.knowledge_semantic_jobs%rowtype;
  result_sha text;
  decision text;
begin
  if p_job_id is null or p_source_ref is null or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
     or p_result is null or pg_catalog.jsonb_typeof(p_result) <> 'object'
     or pg_catalog.pg_column_size(p_result) > 524288 then
    raise exception 'KNOWLEDGE_SEMANTIC_SUBMIT_INVALID';
  end if;
  if p_result->>'version' is distinct from 'knowledge-semantic-result-v1'
     or p_result->>'job_id' is distinct from p_job_id::text then
    raise exception 'KNOWLEDGE_SEMANTIC_RESULT_CONTRACT_INVALID';
  end if;
  decision := p_result->>'decision';
  if decision is null or decision not in ('BRIEF_READY','HOLD','HUMAN_REVIEW') then
    raise exception 'KNOWLEDGE_SEMANTIC_DECISION_INVALID';
  end if;
  if decision in ('BRIEF_READY','HUMAN_REVIEW') and (
       pg_catalog.jsonb_typeof(p_result->'candidate') is distinct from 'object'
       or pg_catalog.jsonb_typeof(p_result->'evidence') is distinct from 'object'
       or pg_catalog.jsonb_typeof(p_result->'brief') is distinct from 'object') then
    raise exception 'KNOWLEDGE_SEMANTIC_BRIEF_PACKAGE_REQUIRED';
  end if;
  if decision in ('HOLD','HUMAN_REVIEW') and
      (pg_catalog.jsonb_typeof(p_result->'code') is distinct from 'string'
       or pg_catalog.jsonb_typeof(p_result->'note') is distinct from 'string') then
    raise exception 'KNOWLEDGE_SEMANTIC_DISPOSITION_REQUIRED';
  end if;

  select * into target
  from survival_ops.knowledge_semantic_jobs
  where job_id = p_job_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','JOB_NOT_FOUND');
  end if;
  if target.source_ref <> p_source_ref or target.source_sha256 <> p_source_sha256 then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','SOURCE_BINDING_MISMATCH');
  end if;
  result_sha := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_result::text,'UTF8'),'sha256'),'hex');
  if target.status <> 'PREPARED' then
    if target.semantic_result_sha256 = result_sha then
      return pg_catalog.jsonb_build_object('status','ALREADY_SUBMITTED','job_id',target.job_id);
    end if;
    if target.semantic_result_sha256 is not null then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','RESULT_CONFLICT');
    end if;
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','JOB_NOT_PREPARED');
  end if;

  update survival_ops.knowledge_semantic_jobs
    set semantic_result = p_result,
        semantic_result_sha256 = result_sha,
        result_decision = decision,
        status = 'SUBMITTED',
        submitted_at = clock_timestamp(),
        finalized_at = null,
        blocker_code = null,
        blocker_stage = null
  where job_id = p_job_id and status = 'PREPARED';

  return pg_catalog.jsonb_build_object(
    'status', 'ACCEPTED',
    'job_id', p_job_id,
    'result_sha256', result_sha
  );
end;
$$;

create or replace function public.archive_knowledge_semantic_job_prepare(
  p_job_type text,
  p_source_kind text,
  p_source_ref text,
  p_source_sha256 text,
  p_work_key text,
  p_policy_version text,
  p_policy_sha256 text,
  p_policy_pin jsonb,
  p_main_sha text,
  p_semantic_context jsonb,
  p_initial_status text default 'PREPARED',
  p_blocker_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created survival_ops.knowledge_semantic_jobs%rowtype;
  active_job survival_ops.knowledge_semantic_jobs%rowtype;
begin
  if p_job_type is null or p_job_type not in ('FRESH_BRIEF','BACKFILL_BRIEF')
     or p_source_kind is null or p_source_kind not in ('PUBLIC_ARCHIVE','PUBLIC_READER')
     or p_source_ref is null or p_work_key is null or p_policy_version is null
     or p_policy_sha256 is null or p_source_sha256 is null or p_main_sha is null
     or p_source_sha256 !~ '^[a-f0-9]{64}$'
     or p_policy_sha256 !~ '^[a-f0-9]{64}$'
     or p_main_sha !~ '^[a-f0-9]{40}$'
     or p_initial_status is null or p_initial_status not in ('PREPARED','BLOCKED')
     or p_policy_pin is null or pg_catalog.jsonb_typeof(p_policy_pin) is distinct from 'object'
     or p_semantic_context is null or pg_catalog.jsonb_typeof(p_semantic_context) is distinct from 'object' then
    raise exception 'KNOWLEDGE_SEMANTIC_PREPARE_INVALID';
  end if;

  insert into survival_ops.knowledge_semantic_jobs (
    job_type, status, source_kind, source_ref, source_sha256, work_key,
    policy_version, policy_sha256, policy_pin, main_sha_at_prepare,
    semantic_context, blocker_code, blocker_stage, finalized_at
  ) values (
    p_job_type, p_initial_status, p_source_kind, p_source_ref, p_source_sha256, p_work_key,
    p_policy_version, p_policy_sha256, p_policy_pin, p_main_sha,
    p_semantic_context, p_blocker_code,
    case when p_initial_status = 'BLOCKED' then 'PREP' else null end,
    case when p_initial_status = 'BLOCKED' then clock_timestamp() else null end
  )
  on conflict (source_kind, source_ref, source_sha256, job_type) do nothing
  returning * into created;

  if found then
    return pg_catalog.jsonb_build_object('status',created.status,'job_id',created.job_id,'created',true);
  end if;

  select * into active_job from survival_ops.knowledge_semantic_jobs
    where source_kind=p_source_kind and source_ref=p_source_ref and source_sha256=p_source_sha256 and job_type=p_job_type;
  if found then
    return pg_catalog.jsonb_build_object('status','EXISTING_JOB','job_id',active_job.job_id,'job_status',active_job.status);
  end if;

  select * into active_job from survival_ops.knowledge_semantic_jobs
    where status not in ('PUBLISHED','HOLD','BLOCKED') order by prepared_at limit 1;
  if found then
    return pg_catalog.jsonb_build_object('status','ACTIVE_JOB_EXISTS','job_id',active_job.job_id,'job_status',active_job.status);
  end if;

  raise exception 'KNOWLEDGE_SEMANTIC_PREPARE_RACE';
exception when unique_violation then
  select * into active_job from survival_ops.knowledge_semantic_jobs
    where status not in ('PUBLISHED','HOLD','BLOCKED') order by prepared_at limit 1;
  if found then
    return pg_catalog.jsonb_build_object('status','ACTIVE_JOB_EXISTS','job_id',active_job.job_id,'job_status',active_job.status);
  end if;
  raise;
end;
$$;

create or replace function public.archive_knowledge_semantic_job_claim_finalizer()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed survival_ops.knowledge_semantic_jobs%rowtype;
begin
  with candidate as (
    select j.job_id
    from survival_ops.knowledge_semantic_jobs j
    where j.status='SUBMITTED'
       or (j.status='FINALIZING' and j.finalizing_at < clock_timestamp() - interval '15 minutes')
    order by j.submitted_at, j.job_id
    for update skip locked
    limit 1
  )
  update survival_ops.knowledge_semantic_jobs j
  set status='FINALIZING',
      finalizing_at=clock_timestamp(),
      finalizer_attempt_count=least(j.finalizer_attempt_count+1,20)
  from candidate c
  where j.job_id=c.job_id
  returning j.* into claimed;

  if not found then return pg_catalog.jsonb_build_object('status','NO_SUBMITTED_JOB'); end if;
  return pg_catalog.to_jsonb(claimed);
end;
$$;

create or replace function public.archive_knowledge_semantic_job_update(
  p_job_id uuid,
  p_expected_status text,
  p_status text,
  p_blocker_code text default null,
  p_blocker_stage text default null,
  p_pr_number integer default null,
  p_head_ref text default null,
  p_head_sha text default null,
  p_merge_sha text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated survival_ops.knowledge_semantic_jobs%rowtype;
begin
  if p_status not in ('SUBMITTED','FINALIZING','PR_OPEN','HUMAN_REVIEW','PUBLISHED','HOLD','BLOCKED') then
    raise exception 'KNOWLEDGE_SEMANTIC_UPDATE_STATUS_INVALID';
  end if;
  update survival_ops.knowledge_semantic_jobs j
  set status=p_status,
      blocker_code=p_blocker_code,
      blocker_stage=p_blocker_stage,
      final_pr_number=coalesce(p_pr_number,j.final_pr_number),
      final_head_ref=coalesce(p_head_ref,j.final_head_ref),
      final_head_sha=coalesce(p_head_sha,j.final_head_sha),
      merge_sha=coalesce(p_merge_sha,j.merge_sha),
      finalized_at=case when p_status in ('HOLD','BLOCKED') then clock_timestamp() else j.finalized_at end,
      published_at=case when p_status='PUBLISHED' then clock_timestamp() else j.published_at end
  where j.job_id=p_job_id and j.status=p_expected_status
  returning j.* into updated;

  if not found then
    select * into updated from survival_ops.knowledge_semantic_jobs where job_id=p_job_id;
    if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;
    return pg_catalog.jsonb_build_object('status','STATE_MISMATCH','actual_status',updated.status);
  end if;
  return pg_catalog.jsonb_build_object('status',updated.status,'job_id',updated.job_id);
end;
$$;

create or replace function public.archive_knowledge_semantic_job_list_active()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'job_id',j.job_id,'job_type',j.job_type,'status',j.status,
    'source_kind',j.source_kind,'source_ref',j.source_ref,'source_sha256',j.source_sha256,
    'prepared_at',j.prepared_at,'submitted_at',j.submitted_at,
    'result_decision',j.result_decision,'final_pr_number',j.final_pr_number,
    'final_head_sha',j.final_head_sha,'merge_sha',j.merge_sha,
    'blocker_code',j.blocker_code,'blocker_stage',j.blocker_stage,
    'finalizer_attempt_count',j.finalizer_attempt_count
  ) order by j.prepared_at), '[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j
  where j.status not in ('PUBLISHED','HOLD','BLOCKED');
$$;

create or replace function public.archive_knowledge_semantic_job_list_handled()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'job_type',j.job_type,'source_kind',j.source_kind,'source_ref',j.source_ref,
    'source_sha256',j.source_sha256,'work_key',j.work_key,'status',j.status
  ) order by j.prepared_at), '[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j
  where j.status in ('PUBLISHED','HOLD','BLOCKED');
$$;

create or replace function public.archive_knowledge_semantic_job_list_reconcile()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'job_id',j.job_id,'status',j.status,'result_decision',j.result_decision,
    'final_pr_number',j.final_pr_number,'final_head_ref',j.final_head_ref,
    'final_head_sha',j.final_head_sha,'merge_sha',j.merge_sha,
    'prepared_at',j.prepared_at,'submitted_at',j.submitted_at
  ) order by j.updated_at), '[]'::jsonb)
  from survival_ops.knowledge_semantic_jobs j
  where j.status in ('PR_OPEN','HUMAN_REVIEW');
$$;

create or replace function public.archive_knowledge_semantic_job_prep_state()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select pg_catalog.jsonb_build_object(
      'last_status',r.last_status,'last_stage',r.last_stage,'blocker_code',r.blocker_code,
      'source_ref',r.source_ref,'source_sha256',r.source_sha256,'main_sha',r.main_sha,
      'backfill_last_attempted_at',r.backfill_last_attempted_at,
      'backfill_last_work_key',r.backfill_last_work_key,'checked_at',r.checked_at
    ) from survival_ops.knowledge_semantic_prep_runs r where r.singleton
  ),'{}'::jsonb);
$$;

create or replace function public.archive_knowledge_semantic_job_record_prep(
  p_status text, p_stage text, p_blocker_code text default null,
  p_source_ref text default null, p_source_sha256 text default null,
  p_main_sha text default null, p_backfill_work_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('PREPARED','NOOP','BLOCKED','ERROR') then raise exception 'KNOWLEDGE_SEMANTIC_PREP_STATUS_INVALID'; end if;
  insert into survival_ops.knowledge_semantic_prep_runs (
    singleton,last_status,last_stage,blocker_code,source_ref,source_sha256,main_sha,
    backfill_last_attempted_at,backfill_last_work_key,checked_at
  ) values (
    true,p_status,p_stage,p_blocker_code,p_source_ref,p_source_sha256,p_main_sha,
    case when p_backfill_work_key is not null then clock_timestamp() else null end,
    p_backfill_work_key,clock_timestamp()
  )
  on conflict (singleton) do update set
    last_status=excluded.last_status,last_stage=excluded.last_stage,blocker_code=excluded.blocker_code,
    source_ref=excluded.source_ref,source_sha256=excluded.source_sha256,main_sha=excluded.main_sha,
    backfill_last_attempted_at=coalesce(excluded.backfill_last_attempted_at,survival_ops.knowledge_semantic_prep_runs.backfill_last_attempted_at),
    backfill_last_work_key=coalesce(excluded.backfill_last_work_key,survival_ops.knowledge_semantic_prep_runs.backfill_last_work_key),
    checked_at=clock_timestamp();
  return pg_catalog.jsonb_build_object('status',p_status,'stage',p_stage);
end;
$$;

create or replace function survival_ops.dispatch_knowledge_workflow(p_workflow text, p_origin text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  github_token text;
  request_id bigint;
begin
  if p_workflow not in ('knowledge-semantic-prep.yml','knowledge-semantic-finalizer.yml') then
    raise exception 'KNOWLEDGE_DISPATCH_WORKFLOW_INVALID';
  end if;
  select ds.decrypted_secret into github_token
  from vault.decrypted_secrets ds
  where ds.name='archive_github_dispatch_token'
  order by ds.created_at desc limit 1;
  if github_token is null or length(btrim(github_token)) < 20 then
    raise exception 'KNOWLEDGE_GITHUB_DISPATCH_TOKEN_MISSING';
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/' || p_workflow || '/dispatches',
    body := pg_catalog.jsonb_build_object('ref','main','inputs',pg_catalog.jsonb_build_object('dispatch_origin',coalesce(nullif(p_origin,''),'supabase_cron'))),
    headers := pg_catalog.jsonb_build_object(
      'Accept','application/vnd.github+json',
      'Authorization','Bearer ' || github_token,
      'X-GitHub-Api-Version','2022-11-28',
      'Content-Type','application/json',
      'User-Agent','supabase-knowledge-semantic-dispatch'
    ),
    timeout_milliseconds := 10000
  ) into request_id;
  return request_id;
end;
$$;

create or replace function survival_ops.dispatch_knowledge_semantic_prep(p_origin text default 'supabase_cron')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare request_id bigint;
begin
  request_id := survival_ops.dispatch_knowledge_workflow('knowledge-semantic-prep.yml',p_origin);
  return request_id;
end;
$$;

create or replace function survival_ops.dispatch_knowledge_semantic_finalizer()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare request_id bigint;
begin
  if not exists (select 1 from survival_ops.knowledge_semantic_jobs
      where status='SUBMITTED'
         or (status='FINALIZING' and finalizing_at < clock_timestamp() - interval '15 minutes')
         or (status in ('PR_OPEN','HUMAN_REVIEW') and updated_at < clock_timestamp() - interval '5 minutes')) then return null; end if;
  request_id := survival_ops.dispatch_knowledge_workflow('knowledge-semantic-finalizer.yml','semantic_submit');
  update survival_ops.knowledge_semantic_jobs
    set finalizer_dispatch_count=least(finalizer_dispatch_count+1,100000),
        finalizer_dispatch_at=clock_timestamp(),
        finalizer_dispatch_request_id=request_id
    where status='SUBMITTED'
       or (status='FINALIZING' and finalizing_at < clock_timestamp() - interval '15 minutes')
       or (status in ('PR_OPEN','HUMAN_REVIEW') and updated_at < clock_timestamp() - interval '5 minutes');
  return request_id;
end;
$$;

revoke all on function survival_ops.guard_knowledge_semantic_job() from public,anon,authenticated,service_role;
revoke all on function survival_ops.dispatch_knowledge_workflow(text,text) from public,anon,authenticated,service_role;
revoke all on function survival_ops.dispatch_knowledge_semantic_prep(text) from public,anon,authenticated,service_role;
revoke all on function survival_ops.dispatch_knowledge_semantic_finalizer() from public,anon,authenticated,service_role;
grant execute on function survival_ops.dispatch_knowledge_semantic_prep(text) to postgres;
grant execute on function survival_ops.dispatch_knowledge_semantic_finalizer() to postgres;

revoke all on function public.archive_knowledge_semantic_job_current() from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_claim_finalizer() from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_update(uuid,text,text,text,text,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_list_active() from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_list_handled() from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_list_reconcile() from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_prep_state() from public,anon,authenticated;
revoke all on function public.archive_knowledge_semantic_job_record_prep(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.archive_knowledge_semantic_job_current() to service_role;
grant execute on function public.archive_knowledge_semantic_job_submit(uuid,text,text,jsonb) to service_role;
grant execute on function public.archive_knowledge_semantic_job_prepare(text,text,text,text,text,text,text,jsonb,text,jsonb,text,text) to service_role;
grant execute on function public.archive_knowledge_semantic_job_claim_finalizer() to service_role;
grant execute on function public.archive_knowledge_semantic_job_update(uuid,text,text,text,text,integer,text,text,text) to service_role;
grant execute on function public.archive_knowledge_semantic_job_list_active() to service_role;
grant execute on function public.archive_knowledge_semantic_job_list_handled() to service_role;
grant execute on function public.archive_knowledge_semantic_job_list_reconcile() to service_role;
grant execute on function public.archive_knowledge_semantic_job_prep_state() to service_role;
grant execute on function public.archive_knowledge_semantic_job_record_prep(text,text,text,text,text,text,text) to service_role;

create or replace function public.archive_operator_system_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  archive_daily_count bigint;
  archive_task_count bigint;
  archive_latest_daily jsonb;
  archive_latest_task jsonb;
  visual_run_count bigint;
  visual_latest jsonb;
  review_pending bigint;
  review_errors bigint;
  knowledge_latest jsonb;
  knowledge_prep jsonb;
  knowledge_active_count bigint;
begin
  actor_id := survival_ops.private_require_archive_operator();
  select count(*) into archive_daily_count from survival_rpg.archive_publication_daily_runs;
  select count(*) into archive_task_count from survival_rpg.archive_publication_tasks;
  select pg_catalog.jsonb_build_object('scheduled_date',run.scheduled_date,'status',run.status,
    'attempt_count',run.attempt_count,'last_error_code',run.last_error_code,
    'started_at',run.started_at,'finished_at',run.finished_at)
    into archive_latest_daily from survival_rpg.archive_publication_daily_runs run
    order by coalesce(run.finished_at,run.started_at,run.created_at) desc limit 1;
  select pg_catalog.jsonb_build_object('task_id',task.task_id,'task_kind',task.task_kind,
    'chronicle_id',task.chronicle_id,'season_id',task.season_id,'status',task.status,
    'attempt_count',task.attempt_count,'last_error_code',task.last_error_code,
    'updated_at',task.updated_at,'completed_at',task.completed_at)
    into archive_latest_task from survival_rpg.archive_publication_tasks task
    order by coalesce(task.completed_at,task.updated_at,task.created_at) desc limit 1;
  select count(*) into visual_run_count from survival_ops.illustration_worker_runs;
  select pg_catalog.jsonb_build_object('run_id',run.run_id,'started_at',run.started_at,
    'finished_at',run.finished_at,'final_status',run.final_status,'blocker_code',run.blocker_code,
    'blocker_stage',run.blocker_stage,'target_subject_id',run.target_subject_id,
    'accepted_count',run.accepted_count,'registry_status',run.registry_status,
    'cleanup_status',run.cleanup_status,'main_sha',run.main_sha)
    into visual_latest from survival_ops.illustration_worker_runs run
    order by coalesce(run.finished_at,run.started_at,run.created_at) desc limit 1;
  select count(*) filter (where item.status='PENDING'),
         count(*) filter (where item.status='PENDING' and item.item_type='AUTOMATION_ERROR')
    into review_pending,review_errors from survival_ops.archive_review_items item;
  select pg_catalog.jsonb_build_object('job_id',j.job_id,'job_type',j.job_type,'status',j.status,
    'source_kind',j.source_kind,'source_ref',j.source_ref,'prepared_at',j.prepared_at,
    'submitted_at',j.submitted_at,'age_minutes',greatest(0,floor(extract(epoch from
      (clock_timestamp()-coalesce(j.updated_at,j.submitted_at,j.prepared_at)))/60)),
    'stalled_code',case
      when j.status='PREPARED' and clock_timestamp()-j.prepared_at > interval '12 hours' then 'SEMANTIC_WORKER_NOT_CONSUMED'
      when j.status in ('SUBMITTED','FINALIZING') and clock_timestamp()-coalesce(j.finalizing_at,j.submitted_at,j.updated_at) > interval '15 minutes' then 'FINALIZER_STALLED'
      when j.status in ('PR_OPEN','HUMAN_REVIEW') and clock_timestamp()-j.updated_at > interval '6 hours' then 'KNOWLEDGE_PR_STALLED'
      else null end,
    'result_decision',j.result_decision,'final_pr_number',j.final_pr_number,
    'final_head_sha',j.final_head_sha,'merge_sha',j.merge_sha,
    'blocker_code',j.blocker_code,'blocker_stage',j.blocker_stage,
    'finalizer_attempt_count',j.finalizer_attempt_count)
    into knowledge_latest from survival_ops.knowledge_semantic_jobs j
    order by j.prepared_at desc limit 1;
  select count(*) into knowledge_active_count from survival_ops.knowledge_semantic_jobs j
    where j.status not in ('PUBLISHED','HOLD','BLOCKED');
  select pg_catalog.jsonb_build_object('last_status',r.last_status,'last_stage',r.last_stage,
    'blocker_code',r.blocker_code,'source_ref',r.source_ref,'source_sha256',r.source_sha256,
    'main_sha',r.main_sha,'backfill_last_attempted_at',r.backfill_last_attempted_at,
    'checked_at',r.checked_at) into knowledge_prep
    from survival_ops.knowledge_semantic_prep_runs r where r.singleton;
  return pg_catalog.jsonb_build_object(
    'archive',pg_catalog.jsonb_build_object('daily_run_count',archive_daily_count,
      'task_count',archive_task_count,'latest_daily_run',archive_latest_daily,'latest_task',archive_latest_task),
    'visual',pg_catalog.jsonb_build_object('run_count',visual_run_count,'latest_run',visual_latest),
    'review',pg_catalog.jsonb_build_object('pending_count',review_pending,'automation_error_count',review_errors),
    'knowledge_semantic',pg_catalog.jsonb_build_object('active_count',knowledge_active_count,
      'latest_job',knowledge_latest,'prep',knowledge_prep));
end;
$$;
revoke all on function public.archive_operator_system_status() from public,anon;
grant execute on function public.archive_operator_system_status() to authenticated;

do $schedule$
begin
  if not exists (select 1 from cron.job where jobname='afterfall-knowledge-semantic-prep-am') then
    perform cron.schedule('afterfall-knowledge-semantic-prep-am','45 20 * * *',
      $$select survival_ops.dispatch_knowledge_semantic_prep('supabase_cron_am');$$);
  end if;
  if not exists (select 1 from cron.job where jobname='afterfall-knowledge-semantic-prep-pm') then
    perform cron.schedule('afterfall-knowledge-semantic-prep-pm','45 8 * * *',
      $$select survival_ops.dispatch_knowledge_semantic_prep('supabase_cron_pm');$$);
  end if;
  if not exists (select 1 from cron.job where jobname='afterfall-knowledge-semantic-finalizer') then
    perform cron.schedule('afterfall-knowledge-semantic-finalizer','*/5 * * * *',
      $$select survival_ops.dispatch_knowledge_semantic_finalizer();$$);
  end if;
end;
$schedule$;
