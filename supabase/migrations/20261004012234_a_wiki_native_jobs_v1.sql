-- A-Wiki native semantic durable handoff.
-- Native AI reads/submits one phase through Supabase; GitHub owns deterministic finalization.
begin;

create schema if not exists survival_ops;

create table if not exists survival_ops.a_wiki_native_jobs (
  job_id uuid primary key default gen_random_uuid(),
  status text not null check (status in (
    'EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED',
    'FINALIZING','HUMAN_REVIEW','REJECT','PUBLISHED','BLOCKED'
  )),
  session_id text not null check (session_id ~ '^SESSION_[0-9]{3}$'),
  source_ref text not null check (char_length(source_ref) between 1 and 700),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  graph_sha256 text not null check (graph_sha256 ~ '^[a-f0-9]{64}$'),
  main_sha_at_prepare text not null check (main_sha_at_prepare ~ '^[a-f0-9]{40}$'),
  prepared_job jsonb not null check (
    jsonb_typeof(prepared_job)='object' and pg_column_size(prepared_job) <= 4194304
  ),
  prepared_job_sha256 text not null check (prepared_job_sha256 ~ '^[a-f0-9]{64}$'),
  extractor_result jsonb check (
    extractor_result is null or (jsonb_typeof(extractor_result)='object' and pg_column_size(extractor_result) <= 4194304)
  ),
  extractor_result_sha256 text check (extractor_result_sha256 is null or extractor_result_sha256 ~ '^[a-f0-9]{64}$'),
  proposal jsonb check (
    proposal is null or (jsonb_typeof(proposal)='object' and pg_column_size(proposal) <= 4194304)
  ),
  proposal_sha256 text check (proposal_sha256 is null or proposal_sha256 ~ '^[a-f0-9]{64}$'),
  review_job jsonb check (
    review_job is null or (jsonb_typeof(review_job)='object' and pg_column_size(review_job) <= 8388608)
  ),
  review_job_sha256 text check (review_job_sha256 is null or review_job_sha256 ~ '^[a-f0-9]{64}$'),
  review_result jsonb check (
    review_result is null or (jsonb_typeof(review_result)='object' and pg_column_size(review_result) <= 1048576)
  ),
  review_result_sha256 text check (review_result_sha256 is null or review_result_sha256 ~ '^[a-f0-9]{64}$'),
  blocker_code text,
  final_pr_number integer check (final_pr_number is null or final_pr_number > 0),
  final_head_ref text,
  final_head_sha text check (final_head_sha is null or final_head_sha ~ '^[a-f0-9]{40}$'),
  merge_sha text check (merge_sha is null or merge_sha ~ '^[a-f0-9]{40}$'),
  dispatch_count integer not null default 0 check (dispatch_count between 0 and 100000),
  dispatch_request_id bigint,
  dispatch_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  extractor_submitted_at timestamptz,
  review_ready_at timestamptz,
  review_submitted_at timestamptz,
  finalizing_at timestamptz,
  published_at timestamptz,
  unique (source_ref, source_sha256),
  check (
    (extractor_result is null and extractor_result_sha256 is null)
    or (extractor_result is not null and extractor_result_sha256 is not null)
  ),
  check (
    (proposal is null and proposal_sha256 is null and review_job is null and review_job_sha256 is null)
    or (proposal is not null and proposal_sha256 is not null and review_job is not null and review_job_sha256 is not null)
  ),
  check (
    (review_result is null and review_result_sha256 is null)
    or (review_result is not null and review_result_sha256 is not null)
  ),
  check (
    status <> 'PUBLISHED'
    or (final_pr_number is not null and final_head_sha is not null and merge_sha is not null and published_at is not null)
  )
);

create unique index if not exists a_wiki_native_jobs_one_active
  on survival_ops.a_wiki_native_jobs ((true))
  where status <> 'PUBLISHED';

alter table survival_ops.a_wiki_native_jobs enable row level security;
revoke all on survival_ops.a_wiki_native_jobs from public,anon,authenticated,service_role;
grant select,insert,update on survival_ops.a_wiki_native_jobs to postgres;

create or replace function survival_ops.guard_a_wiki_native_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='UPDATE' then
    if old.status in ('PUBLISHED','HUMAN_REVIEW','REJECT','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TERMINAL_IMMUTABLE';
    end if;
    if old.prepared_job is distinct from new.prepared_job
       or old.prepared_job_sha256 is distinct from new.prepared_job_sha256
       or old.source_ref is distinct from new.source_ref
       or old.source_sha256 is distinct from new.source_sha256
       or old.graph_sha256 is distinct from new.graph_sha256
       or old.main_sha_at_prepare is distinct from new.main_sha_at_prepare then
      raise exception 'A_WIKI_NATIVE_BINDING_IMMUTABLE';
    end if;
    if old.status='EXTRACTOR_READY' and new.status not in ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='EXTRACTOR_SUBMITTED' and new.status not in ('EXTRACTOR_SUBMITTED','REVIEW_READY','HUMAN_REVIEW','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='REVIEW_READY' and new.status not in ('REVIEW_READY','REVIEW_SUBMITTED','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='REVIEW_SUBMITTED' and new.status not in ('REVIEW_SUBMITTED','FINALIZING','HUMAN_REVIEW','REJECT','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='FINALIZING' and new.status not in ('FINALIZING','PUBLISHED','HUMAN_REVIEW','REJECT','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists a_wiki_native_job_guard on survival_ops.a_wiki_native_jobs;
create trigger a_wiki_native_job_guard
before update on survival_ops.a_wiki_native_jobs
for each row execute function survival_ops.guard_a_wiki_native_job();

create or replace function survival_ops.dispatch_a_wiki_native_finalizer(
  p_origin text default 'native_submit'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  github_token text;
  request_id bigint;
begin
  select ds.decrypted_secret into github_token
  from vault.decrypted_secrets ds
  where ds.name='archive_github_dispatch_token'
  order by ds.created_at desc
  limit 1;

  if github_token is null or length(pg_catalog.btrim(github_token)) < 20 then
    raise exception 'A_WIKI_GITHUB_DISPATCH_TOKEN_MISSING';
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/a-wiki-native-handoff.yml/dispatches',
    body := pg_catalog.jsonb_build_object(
      'ref','main',
      'inputs',pg_catalog.jsonb_build_object(
        'action','consume',
        'dispatch_origin',coalesce(nullif(p_origin,''),'native_submit')
      )
    ),
    headers := pg_catalog.jsonb_build_object(
      'Accept','application/vnd.github+json',
      'Authorization','Bearer ' || github_token,
      'X-GitHub-Api-Version','2022-11-28',
      'Content-Type','application/json',
      'User-Agent','supabase-a-wiki-native-dispatch'
    ),
    timeout_milliseconds := 10000
  ) into request_id;

  update survival_ops.a_wiki_native_jobs
  set dispatch_count=least(dispatch_count+1,100000),
      dispatch_request_id=request_id,
      dispatch_at=clock_timestamp()
  where status in ('EXTRACTOR_SUBMITTED','REVIEW_SUBMITTED','FINALIZING');

  return request_id;
end;
$$;

create or replace function public.archive_a_wiki_native_job_prepare(
  p_job jsonb,
  p_main_sha text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created survival_ops.a_wiki_native_jobs%rowtype;
  existing survival_ops.a_wiki_native_jobs%rowtype;
  v_source jsonb;
  v_job_sha text;
begin
  if p_job is null or pg_catalog.jsonb_typeof(p_job) <> 'object'
     or pg_catalog.pg_column_size(p_job) > 4194304
     or p_job->>'version' is distinct from 'wiki-fact-job-v1'
     or p_main_sha is null or p_main_sha !~ '^[a-f0-9]{40}$' then
    raise exception 'A_WIKI_NATIVE_PREPARE_INVALID';
  end if;
  v_source := p_job->'source';
  if pg_catalog.jsonb_typeof(v_source) is distinct from 'object'
     or v_source->>'session_id' !~ '^SESSION_[0-9]{3}$'
     or v_source->>'manifest_ref' is null
     or v_source->>'manifest_sha256' !~ '^[a-f0-9]{64}$'
     or p_job->>'graph_sha256' !~ '^[a-f0-9]{64}$' then
    raise exception 'A_WIKI_NATIVE_PREPARE_BINDING_INVALID';
  end if;

  v_job_sha := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_job::text,'UTF8'),'sha256'),'hex'
  );

  insert into survival_ops.a_wiki_native_jobs (
    status,session_id,source_ref,source_sha256,graph_sha256,main_sha_at_prepare,
    prepared_job,prepared_job_sha256
  ) values (
    'EXTRACTOR_READY',
    v_source->>'session_id',
    v_source->>'manifest_ref',
    v_source->>'manifest_sha256',
    p_job->>'graph_sha256',
    p_main_sha,
    p_job,
    v_job_sha
  )
  on conflict (source_ref,source_sha256) do nothing
  returning * into created;

  if found then
    return pg_catalog.jsonb_build_object(
      'status','EXTRACTOR_READY','job_id',created.job_id,'created',true,
      'session_id',created.session_id,'binding_sha256',created.prepared_job_sha256
    );
  end if;

  select * into existing
  from survival_ops.a_wiki_native_jobs
  where source_ref=v_source->>'manifest_ref'
    and source_sha256=v_source->>'manifest_sha256';

  if found then
    return pg_catalog.jsonb_build_object(
      'status','EXISTING_JOB','job_id',existing.job_id,'job_status',existing.status,
      'session_id',existing.session_id
    );
  end if;

  select * into existing
  from survival_ops.a_wiki_native_jobs
  where status <> 'PUBLISHED'
  order by created_at
  limit 1;

  if found then
    return pg_catalog.jsonb_build_object(
      'status','ACTIVE_JOB_EXISTS','job_id',existing.job_id,'job_status',existing.status,
      'session_id',existing.session_id
    );
  end if;

  raise exception 'A_WIKI_NATIVE_PREPARE_RACE';
exception when unique_violation then
  select * into existing
  from survival_ops.a_wiki_native_jobs
  where status <> 'PUBLISHED'
  order by created_at
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'status','ACTIVE_JOB_EXISTS','job_id',existing.job_id,'job_status',existing.status,
      'session_id',existing.session_id
    );
  end if;
  raise;
end;
$$;

create or replace function public.archive_a_wiki_native_job_current()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when j.status='EXTRACTOR_READY' then pg_catalog.jsonb_build_object(
        'status','EXTRACTOR_READY','job_id',j.job_id,'session_id',j.session_id,
        'binding_sha256',j.prepared_job_sha256,'payload',j.prepared_job
      )
      when j.status='REVIEW_READY' then pg_catalog.jsonb_build_object(
        'status','REVIEW_READY','job_id',j.job_id,'session_id',j.session_id,
        'binding_sha256',j.review_job_sha256,'proposal_sha256',j.proposal_sha256,
        'payload',j.review_job
      )
      else pg_catalog.jsonb_build_object(
        'status',j.status,'job_id',j.job_id,'session_id',j.session_id,
        'blocker_code',j.blocker_code
      )
    end
    from survival_ops.a_wiki_native_jobs j
    where j.status <> 'PUBLISHED'
    order by j.created_at,j.job_id
    limit 1
  ), pg_catalog.jsonb_build_object('status','NO_JOB'));
$$;

create or replace function public.archive_a_wiki_native_job_submit(
  p_job_id uuid,
  p_expected_phase text,
  p_binding_sha256 text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.a_wiki_native_jobs%rowtype;
  result_sha text;
  dispatch_id bigint;
begin
  if p_job_id is null
     or p_expected_phase not in ('EXTRACTOR_READY','REVIEW_READY')
     or p_binding_sha256 !~ '^[a-f0-9]{64}$'
     or p_result is null or pg_catalog.jsonb_typeof(p_result) <> 'object'
     or pg_catalog.pg_column_size(p_result) > 4194304 then
    raise exception 'A_WIKI_NATIVE_SUBMIT_INVALID';
  end if;

  select * into target
  from survival_ops.a_wiki_native_jobs
  where job_id=p_job_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','JOB_NOT_FOUND');
  end if;

  result_sha := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_result::text,'UTF8'),'sha256'),'hex'
  );

  if p_expected_phase='EXTRACTOR_READY' then
    if p_binding_sha256 <> target.prepared_job_sha256 then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','BINDING_MISMATCH');
    end if;
    if p_result->>'version' is distinct from 'wiki-fact-result-v1'
       or p_result->>'job_id' is distinct from target.prepared_job->>'job_id' then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','RESULT_CONTRACT_INVALID');
    end if;
    if target.status <> 'EXTRACTOR_READY' then
      if target.extractor_result_sha256=result_sha then
        return pg_catalog.jsonb_build_object('status','ALREADY_SUBMITTED','job_id',target.job_id);
      end if;
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','PHASE_MISMATCH','actual_status',target.status);
    end if;

    update survival_ops.a_wiki_native_jobs
    set extractor_result=p_result,
        extractor_result_sha256=result_sha,
        status='EXTRACTOR_SUBMITTED',
        extractor_submitted_at=clock_timestamp(),
        blocker_code=null
    where job_id=target.job_id and status='EXTRACTOR_READY';

  else
    if target.review_job_sha256 is null or p_binding_sha256 <> target.review_job_sha256 then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','BINDING_MISMATCH');
    end if;
    if p_result->>'version' is distinct from 'wiki-fact-review-v1'
       or p_result->>'proposal_sha256' is distinct from target.proposal_sha256
       or p_result->>'decision' not in ('APPROVE','HUMAN_REVIEW','REJECT') then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','REVIEW_CONTRACT_INVALID');
    end if;
    if target.status <> 'REVIEW_READY' then
      if target.review_result_sha256=result_sha then
        return pg_catalog.jsonb_build_object('status','ALREADY_SUBMITTED','job_id',target.job_id);
      end if;
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','PHASE_MISMATCH','actual_status',target.status);
    end if;

    update survival_ops.a_wiki_native_jobs
    set review_result=p_result,
        review_result_sha256=result_sha,
        status='REVIEW_SUBMITTED',
        review_submitted_at=clock_timestamp(),
        blocker_code=null
    where job_id=target.job_id and status='REVIEW_READY';
  end if;

  begin
    dispatch_id := survival_ops.dispatch_a_wiki_native_finalizer('native_submit');
  exception when others then
    dispatch_id := null;
  end;

  return pg_catalog.jsonb_build_object(
    'status','ACCEPTED','job_id',target.job_id,
    'result_sha256',result_sha,'dispatch_request_id',dispatch_id
  );
end;
$$;

create or replace function public.archive_a_wiki_native_job_program_current()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select pg_catalog.to_jsonb(j)
    from survival_ops.a_wiki_native_jobs j
    where j.status in ('EXTRACTOR_SUBMITTED','REVIEW_SUBMITTED','FINALIZING')
    order by j.created_at,j.job_id
    limit 1
  ), pg_catalog.jsonb_build_object('status','NO_PROGRAM_JOB'));
$$;

create or replace function public.archive_a_wiki_native_job_advance(
  p_job_id uuid,
  p_expected_status text,
  p_status text,
  p_proposal jsonb default null,
  p_review_job jsonb default null,
  p_blocker_code text default null,
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
  target survival_ops.a_wiki_native_jobs%rowtype;
  p_sha text;
  rj_sha text;
begin
  if p_status not in ('REVIEW_READY','FINALIZING','HUMAN_REVIEW','REJECT','PUBLISHED','BLOCKED') then
    raise exception 'A_WIKI_NATIVE_ADVANCE_STATUS_INVALID';
  end if;

  select * into target
  from survival_ops.a_wiki_native_jobs
  where job_id=p_job_id
  for update;
  if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;
  if target.status <> p_expected_status then
    return pg_catalog.jsonb_build_object('status','STATE_MISMATCH','actual_status',target.status);
  end if;

  if p_status='REVIEW_READY' then
    if p_expected_status <> 'EXTRACTOR_SUBMITTED'
       or p_proposal is null or pg_catalog.jsonb_typeof(p_proposal)<>'object'
       or p_review_job is null or pg_catalog.jsonb_typeof(p_review_job)<>'object'
       or p_proposal->>'version' is distinct from 'wiki-fact-proposal-v1'
       or p_review_job->>'version' is distinct from 'wiki-fact-review-job-v1'
       or p_review_job->'proposal' is distinct from p_proposal then
      raise exception 'A_WIKI_NATIVE_REVIEW_PACKAGE_INVALID';
    end if;
    p_sha := pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(p_proposal::text,'UTF8'),'sha256'),'hex'
    );
    rj_sha := pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(p_review_job::text,'UTF8'),'sha256'),'hex'
    );
    update survival_ops.a_wiki_native_jobs
    set status='REVIEW_READY',
        proposal=p_proposal, proposal_sha256=p_sha,
        review_job=p_review_job, review_job_sha256=rj_sha,
        review_ready_at=clock_timestamp(), blocker_code=null
    where job_id=p_job_id and status=p_expected_status;

  elsif p_status='FINALIZING' then
    update survival_ops.a_wiki_native_jobs
    set status='FINALIZING',finalizing_at=clock_timestamp(),blocker_code=null
    where job_id=p_job_id and status=p_expected_status;

  elsif p_status='PUBLISHED' then
    if p_expected_status <> 'FINALIZING'
       or p_pr_number is null or p_pr_number <= 0
       or p_head_sha !~ '^[a-f0-9]{40}$'
       or p_merge_sha !~ '^[a-f0-9]{40}$' then
      raise exception 'A_WIKI_NATIVE_PUBLISH_BINDING_INVALID';
    end if;
    update survival_ops.a_wiki_native_jobs
    set status='PUBLISHED',
        final_pr_number=p_pr_number,final_head_ref=p_head_ref,
        final_head_sha=p_head_sha,merge_sha=p_merge_sha,
        published_at=clock_timestamp(),blocker_code=null
    where job_id=p_job_id and status=p_expected_status;

  else
    update survival_ops.a_wiki_native_jobs
    set status=p_status,blocker_code=p_blocker_code
    where job_id=p_job_id and status=p_expected_status;
  end if;

  return pg_catalog.jsonb_build_object('status',p_status,'job_id',p_job_id);
end;
$$;

create or replace function public.archive_a_wiki_native_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare request_id bigint;
begin
  request_id := survival_ops.dispatch_a_wiki_native_finalizer('native_retry');
  return pg_catalog.jsonb_build_object('status','DISPATCHED','request_id',request_id);
end;
$$;

revoke all on function survival_ops.guard_a_wiki_native_job() from public,anon,authenticated,service_role;
revoke all on function survival_ops.dispatch_a_wiki_native_finalizer(text) from public,anon,authenticated,service_role;
grant execute on function survival_ops.dispatch_a_wiki_native_finalizer(text) to postgres;

revoke all on function public.archive_a_wiki_native_job_prepare(jsonb,text) from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_current() from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_submit(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_program_current() from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_advance(uuid,text,text,jsonb,jsonb,text,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_dispatch() from public,anon,authenticated;

grant execute on function public.archive_a_wiki_native_job_prepare(jsonb,text) to service_role;
grant execute on function public.archive_a_wiki_native_job_current() to service_role;
grant execute on function public.archive_a_wiki_native_job_submit(uuid,text,text,jsonb) to service_role;
grant execute on function public.archive_a_wiki_native_job_program_current() to service_role;
grant execute on function public.archive_a_wiki_native_job_advance(uuid,text,text,jsonb,jsonb,text,integer,text,text,text) to service_role;
grant execute on function public.archive_a_wiki_native_dispatch() to service_role;

commit;
