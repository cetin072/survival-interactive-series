-- Automation B V2: programmatic prep/finalizer queue with ChatGPT only for render/review.
create schema if not exists survival_ops;
create schema if not exists archive_ops;

create table if not exists survival_ops.illustration_render_jobs (
  job_id text primary key,
  worldline_id text not null default 'AFTERFALL',
  date_kst date not null,
  main_sha text not null,
  point_id text not null,
  generation_key text not null,
  subject_id text not null,
  title text not null,
  active_provider text not null,
  prompt_contract text not null,
  prompt_text text not null,
  prompt_sha256 text not null,
  attempt_no smallint not null,
  status text not null default 'PREPARED',
  output_sha256 text,
  output_bytes integer,
  output_width integer,
  output_height integer,
  review_provider text,
  review_decision text,
  review_summary text,
  rejection_codes jsonb not null default '[]'::jsonb,
  identity_path text,
  source_commit text,
  staging_id text,
  finalizer_dispatch_request_id bigint,
  blocker_code text,
  blocker_stage text,
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  finalized_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

alter table survival_ops.illustration_render_jobs
  add column if not exists blocker_code text,
  add column if not exists blocker_stage text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_worldline_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_worldline_check check (worldline_id='AFTERFALL');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_main_sha_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_main_sha_check check (main_sha ~ '^[a-f0-9]{40}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_point_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_point_check check (point_id ~ '^point-[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_generation_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_generation_check check (generation_key ~ '^generation-[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_subject_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_subject_check check (subject_id ~ '^(char|loc|event)-[a-z0-9]+(-[a-z0-9]+)*$');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_provider_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_provider_check check (active_provider in ('native_chatgpt','api_openai','manual_import'));
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_prompt_contract_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_prompt_contract_check check (prompt_contract='illustration-image-prompt-v1');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_prompt_sha_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_prompt_sha_check check (prompt_sha256 ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_attempt_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_attempt_check check (attempt_no between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_status_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_status_check check (status in ('PREPARED','REVIEW_REJECTED','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING','SUCCEEDED','BLOCKED'));
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_output_sha_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_output_sha_check check (output_sha256 is null or output_sha256 ~ '^[a-f0-9]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_output_bytes_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_output_bytes_check check (output_bytes is null or output_bytes between 1 and 20971520);
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_output_dimensions_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_output_dimensions_check check ((output_width is null and output_height is null) or (output_width between 1 and 8192 and output_height between 1 and 8192));
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_decision_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_decision_check check (review_decision is null or review_decision in ('PASS','REJECT','HUMAN_REVIEW'));
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_rejection_codes_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_rejection_codes_check check (jsonb_typeof(rejection_codes)='array');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_identity_path_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_identity_path_check check (identity_path is null or identity_path ~ '^archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_[A-Z0-9_-]+[.]json$');
  end if;
  if not exists (select 1 from pg_constraint where conname='illustration_render_jobs_source_commit_check') then
    alter table survival_ops.illustration_render_jobs add constraint illustration_render_jobs_source_commit_check check (source_commit is null or source_commit ~ '^[a-f0-9]{40}$');
  end if;
end;
$$;

create unique index if not exists illustration_render_jobs_one_per_kst_day_idx
  on survival_ops.illustration_render_jobs(date_kst);
drop index if exists survival_ops.illustration_render_jobs_one_active_idx;
create unique index illustration_render_jobs_one_active_idx
  on survival_ops.illustration_render_jobs((worldline_id))
  where status in ('PREPARED','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING','BLOCKED');
create index if not exists illustration_render_jobs_identity_idx
  on survival_ops.illustration_render_jobs(point_id,generation_key,attempt_no desc);

revoke all on table survival_ops.illustration_render_jobs from public, anon, authenticated;
grant usage on schema survival_ops to service_role;
grant select, insert, update on survival_ops.illustration_render_jobs to service_role;

create or replace function public.archive_illustration_render_job_enqueue(p_job jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_attempt smallint;
  v_active survival_ops.illustration_render_jobs%rowtype;
  v_row survival_ops.illustration_render_jobs%rowtype;
begin
  select * into v_active from survival_ops.illustration_render_jobs
   where status in ('PREPARED','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING','BLOCKED')
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('status','WAITING_EXISTING_JOB','job_id',v_active.job_id,'subject_id',v_active.subject_id,'job_status',v_active.status);
  end if;
  if exists(select 1 from survival_ops.illustration_render_jobs where date_kst=v_today) then
    return jsonb_build_object('status','DAILY_JOB_CAP_REACHED','date_kst',v_today);
  end if;
  if p_job->>'job_id' is null
     or p_job->>'main_sha' !~ '^[a-f0-9]{40}$'
     or p_job->>'point_id' !~ '^point-[a-f0-9]{64}$'
     or p_job->>'generation_key' !~ '^generation-[a-f0-9]{64}$'
     or p_job->>'subject_id' !~ '^(char|loc|event)-[a-z0-9]+(-[a-z0-9]+)*$'
     or p_job->>'title' is null
     or p_job->>'active_provider' not in ('native_chatgpt','api_openai','manual_import')
     or p_job->>'prompt_contract' <> 'illustration-image-prompt-v1'
     or p_job->>'prompt_text' is null
     or length(p_job->>'prompt_text') < 20
     or length(p_job->>'prompt_text') > 12000
     or p_job->>'prompt_sha256' !~ '^[a-f0-9]{64}$'
  then raise exception 'INVALID_ILLUSTRATION_RENDER_JOB' using errcode='22023'; end if;
  if exists(select 1 from survival_ops.illustration_render_jobs where point_id=p_job->>'point_id' and generation_key=p_job->>'generation_key' and status='SUCCEEDED') then
    return jsonb_build_object('status','ILLUSTRATION_ALREADY_SUCCEEDED');
  end if;
  select count(*)::smallint+1 into v_attempt from survival_ops.illustration_render_jobs where point_id=p_job->>'point_id' and generation_key=p_job->>'generation_key';
  if v_attempt>3 then return jsonb_build_object('status','ILLUSTRATION_RETRY_CAP_REACHED'); end if;
  insert into survival_ops.illustration_render_jobs(job_id,date_kst,main_sha,point_id,generation_key,subject_id,title,active_provider,prompt_contract,prompt_text,prompt_sha256,attempt_no,status)
  values(p_job->>'job_id',v_today,p_job->>'main_sha',p_job->>'point_id',p_job->>'generation_key',p_job->>'subject_id',p_job->>'title',p_job->>'active_provider',p_job->>'prompt_contract',p_job->>'prompt_text',p_job->>'prompt_sha256',v_attempt,'PREPARED')
  returning * into v_row;
  return jsonb_build_object('status','PREPARED','job_id',v_row.job_id,'subject_id',v_row.subject_id,'attempt_no',v_row.attempt_no,'date_kst',v_row.date_kst,'prompt_sha256',v_row.prompt_sha256);
end $$;

create or replace function public.archive_illustration_render_prompt()
returns text language sql stable security invoker set search_path='' as $$
  select prompt_text from survival_ops.illustration_render_jobs where status='PREPARED' order by created_at desc limit 1;
$$;

create or replace function public.archive_illustration_render_job_current()
returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(j)-'prompt_text' from survival_ops.illustration_render_jobs j
  where j.status in ('PREPARED','HUMAN_REVIEW','REVIEW_PASS_STAGED','FINALIZE_QUEUED','FINALIZING','BLOCKED')
  order by j.created_at desc limit 1;
$$;

create or replace function public.archive_illustration_render_job_readback(p_job_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(j)-'prompt_text' from survival_ops.illustration_render_jobs j where j.job_id=p_job_id;
$$;

create or replace function archive_ops.dispatch_afterfall_illustration_finalize(p_job_id text)
returns bigint language plpgsql security definer set search_path=pg_catalog,vault,net,archive_ops as $$
declare github_token text; request_id bigint;
begin
  if p_job_id is null or length(p_job_id)<8 then raise exception 'ILLUSTRATION_FINALIZE_JOB_ID_INVALID'; end if;
  select decrypted_secret into github_token from vault.decrypted_secrets where name='archive_github_dispatch_token' order by created_at desc limit 1;
  if github_token is null or length(btrim(github_token))<20 then raise exception 'ARCHIVE_GITHUB_DISPATCH_TOKEN_MISSING'; end if;
  select net.http_post(
    url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/archive-illustration-finalizer.yml/dispatches',
    body:=jsonb_build_object('ref','main','inputs',jsonb_build_object('job_id',p_job_id)),
    headers:=jsonb_build_object('Accept','application/vnd.github+json','Authorization','Bearer '||github_token,'X-GitHub-Api-Version','2022-11-28','Content-Type','application/json','User-Agent','supabase-afterfall-illustration-finalize'),
    timeout_milliseconds:=10000
  ) into request_id;
  return request_id;
end $$;

create or replace function public.archive_illustration_review_complete(p_review jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,survival_ops,archive_ops as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_decision text := p_review->>'decision';
  v_dispatch bigint;
  v_stage survival_ops.illustration_binary_staging%rowtype;
begin
  select * into v_job from survival_ops.illustration_render_jobs where job_id=p_review->>'job_id' for update;
  if not found or v_job.status<>'PREPARED' then raise exception 'ILLUSTRATION_REVIEW_JOB_NOT_PREPARED' using errcode='22023'; end if;
  if v_decision not in ('PASS','REJECT','HUMAN_REVIEW')
     or p_review->>'review_provider' is null
     or p_review->>'output_sha256' !~ '^[a-f0-9]{64}$'
     or coalesce((p_review->>'output_bytes')::integer,0)<1
     or coalesce((p_review->>'output_width')::integer,0)<1
     or coalesce((p_review->>'output_height')::integer,0)<1
  then raise exception 'INVALID_ILLUSTRATION_REVIEW' using errcode='22023'; end if;
  if v_decision='PASS' then
    if p_review->>'identity_path' is null or p_review->>'source_commit' !~ '^[a-f0-9]{40}$' or p_review->>'staging_id' is null
    then raise exception 'ILLUSTRATION_REVIEW_PASS_BINDING_REQUIRED' using errcode='22023'; end if;
    select * into v_stage from survival_ops.illustration_binary_staging where staging_id=p_review->>'staging_id' and status='READY';
    if not found
       or v_stage.point_id<>v_job.point_id
       or v_stage.generation_key<>v_job.generation_key
       or v_stage.subject_id<>v_job.subject_id
       or v_stage.source_sha256<>p_review->>'output_sha256'
       or v_stage.source_commit<>p_review->>'source_commit'
       or v_stage.identity_path<>p_review->>'identity_path'
    then raise exception 'ILLUSTRATION_REVIEW_STAGING_BINDING_INVALID' using errcode='22023'; end if;
  end if;
  update survival_ops.illustration_render_jobs set
    output_sha256=p_review->>'output_sha256',
    output_bytes=(p_review->>'output_bytes')::integer,
    output_width=(p_review->>'output_width')::integer,
    output_height=(p_review->>'output_height')::integer,
    review_provider=p_review->>'review_provider',
    review_decision=v_decision,
    review_summary=nullif(p_review->>'review_summary',''),
    rejection_codes=coalesce(p_review->'rejection_codes','[]'::jsonb),
    identity_path=nullif(p_review->>'identity_path',''),
    source_commit=nullif(p_review->>'source_commit',''),
    staging_id=nullif(p_review->>'staging_id',''),
    reviewed_at=clock_timestamp(),updated_at=clock_timestamp(),
    status=case when v_decision='PASS' then 'REVIEW_PASS_STAGED' when v_decision='REJECT' then 'REVIEW_REJECTED' else 'HUMAN_REVIEW' end
  where job_id=v_job.job_id;
  if v_decision='PASS' then
    v_dispatch:=archive_ops.dispatch_afterfall_illustration_finalize(v_job.job_id);
    update survival_ops.illustration_render_jobs set status='FINALIZE_QUEUED',finalizer_dispatch_request_id=v_dispatch,updated_at=clock_timestamp() where job_id=v_job.job_id;
  end if;
  return jsonb_build_object('status',case when v_decision='PASS' then 'FINALIZE_QUEUED' else v_decision end,'job_id',v_job.job_id,'dispatch_request_id',v_dispatch);
end $$;

create or replace function public.archive_illustration_render_job_finish(p_job_id text,p_status text,p_summary jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_row survival_ops.illustration_render_jobs%rowtype;
begin
  if p_status not in ('FINALIZING','SUCCEEDED','BLOCKED') then raise exception 'ILLUSTRATION_FINISH_STATUS_INVALID' using errcode='22023'; end if;
  update survival_ops.illustration_render_jobs set
    status=p_status,
    finalized_at=case when p_status in ('SUCCEEDED','BLOCKED') then clock_timestamp() else finalized_at end,
    updated_at=clock_timestamp(),
    blocker_code=case when p_status='BLOCKED' then nullif(p_summary->>'blocker_code','') else null end,
    blocker_stage=case when p_status='BLOCKED' then nullif(p_summary->>'blocker_stage','') else null end
  where job_id=p_job_id returning * into v_row;
  if not found then raise exception 'ILLUSTRATION_RENDER_JOB_NOT_FOUND' using errcode='22023'; end if;
  return to_jsonb(v_row)-'prompt_text';
end $$;

create or replace function archive_ops.dispatch_afterfall_illustration_prep()
returns bigint language plpgsql security definer set search_path=pg_catalog,vault,net,archive_ops as $$
declare github_token text; request_id bigint;
begin
  select decrypted_secret into github_token from vault.decrypted_secrets where name='archive_github_dispatch_token' order by created_at desc limit 1;
  if github_token is null or length(btrim(github_token))<20 then raise exception 'ARCHIVE_GITHUB_DISPATCH_TOKEN_MISSING'; end if;
  select net.http_post(
    url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/archive-illustration-prep.yml/dispatches',
    body:=jsonb_build_object('ref','main'),
    headers:=jsonb_build_object('Accept','application/vnd.github+json','Authorization','Bearer '||github_token,'X-GitHub-Api-Version','2022-11-28','Content-Type','application/json','User-Agent','supabase-afterfall-illustration-prep'),
    timeout_milliseconds:=10000
  ) into request_id;
  return request_id;
end $$;

revoke all on function public.archive_illustration_render_job_enqueue(jsonb) from public;
revoke execute on function public.archive_illustration_render_job_enqueue(jsonb) from anon,authenticated;
grant execute on function public.archive_illustration_render_job_enqueue(jsonb) to service_role;
revoke all on function public.archive_illustration_render_prompt() from public;
revoke execute on function public.archive_illustration_render_prompt() from anon,authenticated;
grant execute on function public.archive_illustration_render_prompt() to service_role;
revoke all on function public.archive_illustration_render_job_current() from public;
revoke execute on function public.archive_illustration_render_job_current() from anon,authenticated;
grant execute on function public.archive_illustration_render_job_current() to service_role;
revoke all on function public.archive_illustration_render_job_readback(text) from public;
revoke execute on function public.archive_illustration_render_job_readback(text) from anon,authenticated;
grant execute on function public.archive_illustration_render_job_readback(text) to service_role;
revoke all on function public.archive_illustration_review_complete(jsonb) from public;
revoke execute on function public.archive_illustration_review_complete(jsonb) from anon,authenticated;
grant execute on function public.archive_illustration_review_complete(jsonb) to service_role;
revoke all on function public.archive_illustration_render_job_finish(text,text,jsonb) from public;
revoke execute on function public.archive_illustration_render_job_finish(text,text,jsonb) from anon,authenticated;
grant execute on function public.archive_illustration_render_job_finish(text,text,jsonb) to service_role;
revoke all on function archive_ops.dispatch_afterfall_illustration_finalize(text) from public,anon,authenticated,service_role;
grant execute on function archive_ops.dispatch_afterfall_illustration_finalize(text) to postgres;
revoke all on function archive_ops.dispatch_afterfall_illustration_prep() from public,anon,authenticated,service_role;
grant execute on function archive_ops.dispatch_afterfall_illustration_prep() to postgres;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='afterfall-illustration-prep-dispatch' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end $$;
select cron.schedule('afterfall-illustration-prep-dispatch','30 20 * * *',$$select archive_ops.dispatch_afterfall_illustration_prep();$$);

notify pgrst,'reload schema';
