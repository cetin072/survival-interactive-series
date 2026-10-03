-- Automation B illustration vault.
-- Every reviewed render is copied to a 30-day private Storage vault.
-- Accepted images continue through the existing permanent-original pipeline.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'survival-illustration-vault',
  'survival-illustration-vault',
  false,
  20971520,
  array['image/png']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists survival_ops.illustration_vault_items (
  job_id text primary key references survival_ops.illustration_render_jobs(job_id) on delete cascade,
  review_staging_id text not null,
  source_sha256 text not null,
  object_path text not null unique,
  status text not null default 'QUEUED',
  dispatch_attempt_count smallint not null default 0,
  dispatch_request_id bigint,
  dispatch_at timestamptz,
  archived_at timestamptz,
  expires_at timestamptz,
  deleted_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint illustration_vault_sha_check check (source_sha256 ~ '^[a-f0-9]{64}$'),
  constraint illustration_vault_status_check check (status in ('QUEUED','DISPATCHED','STORED','BLOCKED','DELETED')),
  constraint illustration_vault_attempt_check check (dispatch_attempt_count between 0 and 20)
);

create index if not exists illustration_vault_items_expiry_idx
  on survival_ops.illustration_vault_items(status,expires_at);
create index if not exists illustration_vault_items_dispatch_idx
  on survival_ops.illustration_vault_items(status,dispatch_at);

revoke all on table survival_ops.illustration_vault_items from public,anon,authenticated;
grant select,insert,update,delete on survival_ops.illustration_vault_items to service_role;

create or replace function public.archive_operator_can_view_illustration_vault()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select auth.uid()) is not null
    and public.current_profile_is_active()
    and public.private_actor_can('survival_archive.review')
$$;

revoke all on function public.archive_operator_can_view_illustration_vault() from public,anon;
grant execute on function public.archive_operator_can_view_illustration_vault() to authenticated;

drop policy if exists "archive operator illustration vault read" on storage.objects;
create policy "archive operator illustration vault read"
on storage.objects
for select
to authenticated
using (
  bucket_id='survival-illustration-vault'
  and public.archive_operator_can_view_illustration_vault()
);

create or replace function archive_ops.dispatch_afterfall_illustration_vault(p_job_id text)
returns bigint
language plpgsql
security definer
set search_path='pg_catalog','vault','net','archive_ops','survival_ops'
as $$
declare
  github_token text;
  request_id bigint;
  v_item survival_ops.illustration_vault_items%rowtype;
begin
  select * into v_item
  from survival_ops.illustration_vault_items
  where job_id=p_job_id
  for update;

  if not found then
    raise exception 'ILLUSTRATION_VAULT_ITEM_NOT_FOUND';
  end if;
  if v_item.status in ('STORED','DELETED') then
    return coalesce(v_item.dispatch_request_id,0);
  end if;
  if v_item.dispatch_attempt_count >= 5 then
    update survival_ops.illustration_vault_items
      set status='BLOCKED',last_error_code=coalesce(last_error_code,'VAULT_DISPATCH_ATTEMPTS_EXHAUSTED'),
          updated_at=clock_timestamp()
    where job_id=p_job_id;
    return coalesce(v_item.dispatch_request_id,0);
  end if;

  select decrypted_secret into github_token
  from vault.decrypted_secrets
  where name='archive_github_dispatch_token'
  order by created_at desc
  limit 1;

  if github_token is null or length(btrim(github_token))<20 then
    raise exception 'ARCHIVE_GITHUB_DISPATCH_TOKEN_MISSING';
  end if;

  select net.http_post(
    url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/archive-illustration-vault.yml/dispatches',
    body:=jsonb_build_object('ref','main','inputs',jsonb_build_object('job_id',p_job_id)),
    headers:=jsonb_build_object(
      'Accept','application/vnd.github+json',
      'Authorization','Bearer '||github_token,
      'X-GitHub-Api-Version','2022-11-28',
      'Content-Type','application/json',
      'User-Agent','supabase-afterfall-illustration-vault'
    ),
    timeout_milliseconds:=10000
  ) into request_id;

  update survival_ops.illustration_vault_items
  set status='DISPATCHED',
      dispatch_attempt_count=dispatch_attempt_count+1,
      dispatch_request_id=request_id,
      dispatch_at=clock_timestamp(),
      updated_at=clock_timestamp(),
      last_error_code=null
  where job_id=p_job_id;

  return request_id;
end
$$;

create or replace function archive_ops.dispatch_afterfall_illustration_vault_pending()
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','archive_ops','survival_ops'
as $$
declare
  v_job_id text;
  v_count integer:=0;
  v_request bigint;
begin
  for v_job_id in
    select job_id
    from survival_ops.illustration_vault_items
    where status='QUEUED'
       or (status='DISPATCHED' and dispatch_at < clock_timestamp()-interval '20 minutes')
    order by created_at
    limit 3
  loop
    begin
      v_request:=archive_ops.dispatch_afterfall_illustration_vault(v_job_id);
      v_count:=v_count+1;
    exception when others then
      update survival_ops.illustration_vault_items
      set last_error_code=left(sqlerrm,200),updated_at=clock_timestamp()
      where job_id=v_job_id and status<>'DELETED';
    end;
  end loop;

  return jsonb_build_object('dispatched',v_count);
end
$$;

create or replace function public.archive_illustration_vault_job(p_job_id text)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'job_id',v.job_id,
    'review_staging_id',v.review_staging_id,
    'source_sha256',v.source_sha256,
    'object_path',v.object_path,
    'vault_status',v.status,
    'dispatch_attempt_count',v.dispatch_attempt_count,
    'subject_id',j.subject_id,
    'title',j.title,
    'date_kst',j.date_kst,
    'attempt_no',j.attempt_no,
    'review_decision',j.review_decision,
    'review_summary',j.review_summary,
    'rejection_codes',j.rejection_codes,
    'output_bytes',j.output_bytes,
    'output_width',j.output_width,
    'output_height',j.output_height,
    'provider_asset_id',j.provider_asset_id,
    'prompt_sha256',j.prompt_sha256,
    'prompt_text',j.prompt_text
  )
  from survival_ops.illustration_vault_items v
  join survival_ops.illustration_render_jobs j on j.job_id=v.job_id
  where v.job_id=p_job_id
$$;

revoke all on function public.archive_illustration_vault_job(text) from public,anon,authenticated;
grant execute on function public.archive_illustration_vault_job(text) to service_role;

create or replace function public.archive_illustration_vault_mark_stored(
  p_job_id text,p_object_path text,p_source_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_item survival_ops.illustration_vault_items%rowtype;
begin
  select * into v_item from survival_ops.illustration_vault_items
  where job_id=p_job_id for update;
  if not found
     or v_item.source_sha256<>p_source_sha256
     or v_item.object_path<>p_object_path then
    raise exception 'ILLUSTRATION_VAULT_BINDING_INVALID' using errcode='22023';
  end if;

  update survival_ops.illustration_vault_items
  set status='STORED',
      archived_at=coalesce(archived_at,clock_timestamp()),
      expires_at=coalesce(expires_at,clock_timestamp()+interval '30 days'),
      updated_at=clock_timestamp(),
      last_error_code=null
  where job_id=p_job_id;

  return jsonb_build_object(
    'status','STORED',
    'job_id',p_job_id,
    'object_path',p_object_path,
    'expires_at',(select expires_at from survival_ops.illustration_vault_items where job_id=p_job_id)
  );
end
$$;

revoke all on function public.archive_illustration_vault_mark_stored(text,text,text) from public,anon,authenticated;
grant execute on function public.archive_illustration_vault_mark_stored(text,text,text) to service_role;

create or replace function public.archive_illustration_vault_mark_error(p_job_id text,p_error_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
begin
  update survival_ops.illustration_vault_items
  set last_error_code=left(coalesce(p_error_code,'VAULT_UNKNOWN_ERROR'),200),
      status=case
        when status in ('QUEUED','DISPATCHED') and dispatch_attempt_count>=5 then 'BLOCKED'
        else status
      end,
      updated_at=clock_timestamp()
  where job_id=p_job_id and status<>'DELETED';

  return jsonb_build_object('job_id',p_job_id,'recorded',found);
end
$$;

revoke all on function public.archive_illustration_vault_mark_error(text,text) from public,anon,authenticated;
grant execute on function public.archive_illustration_vault_mark_error(text,text) to service_role;

create or replace function public.archive_illustration_vault_cleanup_review_staging(
  p_job_id text,p_source_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_staging_id text;
  v_deleted integer:=0;
begin
  select v.review_staging_id into v_staging_id
  from survival_ops.illustration_vault_items v
  join survival_ops.illustration_render_jobs j on j.job_id=v.job_id
  where v.job_id=p_job_id
    and v.status='STORED'
    and v.source_sha256=p_source_sha256
    and (
      j.review_decision in ('REJECT','HUMAN_REVIEW')
      or (j.review_decision='PASS' and j.status='SUCCEEDED')
    );

  if v_staging_id is null then
    return jsonb_build_object('job_id',p_job_id,'deleted',0);
  end if;

  delete from survival_ops.illustration_review_staging
  where staging_id=v_staging_id and source_sha256=p_source_sha256;
  get diagnostics v_deleted=row_count;

  return jsonb_build_object('job_id',p_job_id,'staging_id',v_staging_id,'deleted',v_deleted);
end
$$;

revoke all on function public.archive_illustration_vault_cleanup_review_staging(text,text) from public,anon,authenticated;
grant execute on function public.archive_illustration_vault_cleanup_review_staging(text,text) to service_role;

create or replace function public.archive_illustration_vault_expired(p_limit integer default 50)
returns table(job_id text,object_path text,source_sha256 text)
language sql
stable
security definer
set search_path=''
as $$
  select v.job_id,v.object_path,v.source_sha256
  from survival_ops.illustration_vault_items v
  where v.status='STORED'
    and v.expires_at<=clock_timestamp()
  order by v.expires_at
  limit least(greatest(coalesce(p_limit,50),1),200)
$$;

revoke all on function public.archive_illustration_vault_expired(integer) from public,anon,authenticated;
grant execute on function public.archive_illustration_vault_expired(integer) to service_role;

create or replace function public.archive_illustration_vault_mark_deleted(
  p_job_id text,p_source_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare v_count integer;
begin
  update survival_ops.illustration_vault_items
  set status='DELETED',deleted_at=clock_timestamp(),updated_at=clock_timestamp()
  where job_id=p_job_id and source_sha256=p_source_sha256 and status='STORED';
  get diagnostics v_count=row_count;
  return jsonb_build_object('job_id',p_job_id,'deleted',v_count);
end
$$;

revoke all on function public.archive_illustration_vault_mark_deleted(text,text) from public,anon,authenticated;
grant execute on function public.archive_illustration_vault_mark_deleted(text,text) to service_role;

create or replace function public.archive_operator_illustration_vault(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor_id uuid;
begin
  actor_id:=survival_ops.private_require_archive_operator();
  return coalesce((
    select jsonb_agg(row_data order by created_at desc)
    from (
      select
        jsonb_build_object(
          'job_id',v.job_id,
          'object_path',v.object_path,
          'vault_status',v.status,
          'archived_at',v.archived_at,
          'expires_at',v.expires_at,
          'created_at',v.created_at,
          'subject_id',j.subject_id,
          'title',j.title,
          'date_kst',j.date_kst,
          'attempt_no',j.attempt_no,
          'review_decision',j.review_decision,
          'review_summary',j.review_summary,
          'rejection_codes',j.rejection_codes,
          'output_bytes',j.output_bytes,
          'output_width',j.output_width,
          'output_height',j.output_height,
          'prompt_text',j.prompt_text
        ) as row_data,
        v.created_at
      from survival_ops.illustration_vault_items v
      join survival_ops.illustration_render_jobs j on j.job_id=v.job_id
      where v.status<>'DELETED'
      order by v.created_at desc
      limit least(greatest(coalesce(p_limit,100),1),200)
    ) q
  ),'[]'::jsonb);
end
$$;

revoke all on function public.archive_operator_illustration_vault(integer) from public,anon;
grant execute on function public.archive_operator_illustration_vault(integer) to authenticated;

create or replace function public.archive_illustration_review_complete_unleased_internal(p_review jsonb)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','survival_ops','archive_ops'
as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_decision text:=p_review->>'decision';
  v_dispatch bigint;
  v_vault_dispatch bigint;
  v_review survival_ops.illustration_review_staging%rowtype;
  v_object_path text;
begin
  select * into v_job
  from survival_ops.illustration_render_jobs
  where job_id=p_review->>'job_id'
  for update;

  if not found or v_job.status<>'PREPARED' then
    raise exception 'ILLUSTRATION_REVIEW_JOB_NOT_PREPARED' using errcode='22023';
  end if;

  if v_decision not in ('PASS','REJECT','HUMAN_REVIEW')
     or p_review->>'review_provider' is null
     or p_review->>'output_sha256' !~ '^[a-f0-9]{64}$'
     or coalesce((p_review->>'output_bytes')::integer,0) not between 1 and 20971520
     or coalesce((p_review->>'output_width')::integer,0) not between 1 and 8192
     or coalesce((p_review->>'output_height')::integer,0) not between 1 and 8192
     or jsonb_typeof(coalesce(p_review->'rejection_codes','[]'::jsonb))<>'array'
     or p_review->>'review_staging_id' is null
     or p_review->>'provider_asset_id' is null then
    raise exception 'INVALID_ILLUSTRATION_REVIEW' using errcode='22023';
  end if;

  select * into v_review
  from survival_ops.illustration_review_staging
  where staging_id=p_review->>'review_staging_id' and status='READY';

  if not found
     or v_review.job_id<>v_job.job_id
     or v_review.point_id<>v_job.point_id
     or v_review.generation_key<>v_job.generation_key
     or v_review.subject_id<>v_job.subject_id
     or v_review.source_sha256<>p_review->>'output_sha256'
     or v_review.byte_count<>(p_review->>'output_bytes')::integer
     or v_review.width<>(p_review->>'output_width')::integer
     or v_review.height<>(p_review->>'output_height')::integer
     or v_review.provider_asset_id<>p_review->>'provider_asset_id' then
    raise exception 'ILLUSTRATION_REVIEW_STAGING_BINDING_INVALID' using errcode='22023';
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
    review_staging_id=p_review->>'review_staging_id',
    provider_asset_id=p_review->>'provider_asset_id',
    reviewed_at=clock_timestamp(),
    updated_at=clock_timestamp(),
    status=case
      when v_decision='PASS' then 'REVIEW_PASS_STAGED'
      when v_decision='REJECT' then 'REVIEW_REJECTED'
      else 'HUMAN_REVIEW'
    end
  where job_id=v_job.job_id;

  v_object_path:='AFTERFALL/'||v_job.date_kst::text||'/'||v_job.job_id||'/'||(p_review->>'output_sha256')||'.png';

  insert into survival_ops.illustration_vault_items(
    job_id,review_staging_id,source_sha256,object_path,status
  ) values (
    v_job.job_id,p_review->>'review_staging_id',p_review->>'output_sha256',v_object_path,'QUEUED'
  )
  on conflict (job_id) do update set
    review_staging_id=excluded.review_staging_id,
    source_sha256=excluded.source_sha256,
    object_path=excluded.object_path,
    updated_at=clock_timestamp()
  where survival_ops.illustration_vault_items.status not in ('STORED','DELETED');

  v_vault_dispatch:=archive_ops.dispatch_afterfall_illustration_vault(v_job.job_id);

  if v_decision='PASS' then
    v_dispatch:=archive_ops.dispatch_afterfall_illustration_finalize(v_job.job_id);
    update survival_ops.illustration_render_jobs
    set status='FINALIZE_QUEUED',finalizer_dispatch_request_id=v_dispatch,updated_at=clock_timestamp()
    where job_id=v_job.job_id;
  end if;

  return jsonb_build_object(
    'status',case when v_decision='PASS' then 'FINALIZE_QUEUED' else v_decision end,
    'job_id',v_job.job_id,
    'dispatch_request_id',v_dispatch,
    'vault_dispatch_request_id',v_vault_dispatch
  );
end
$$;

create or replace function archive_ops.dispatch_afterfall_illustration_prep()
returns bigint
language plpgsql
security definer
set search_path='pg_catalog','vault','net','archive_ops'
as $$
declare github_token text; request_id bigint;
begin
  perform archive_ops.dispatch_afterfall_illustration_sweep();
  perform archive_ops.dispatch_afterfall_illustration_vault_pending();

  select decrypted_secret into github_token from vault.decrypted_secrets
    where name='archive_github_dispatch_token' order by created_at desc limit 1;
  if github_token is null or length(btrim(github_token))<20 then
    raise exception 'ARCHIVE_GITHUB_DISPATCH_TOKEN_MISSING';
  end if;
  select net.http_post(
    url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/archive-illustration-prep.yml/dispatches',
    body:=jsonb_build_object('ref','main'),
    headers:=jsonb_build_object(
      'Accept','application/vnd.github+json','Authorization','Bearer '||github_token,
      'X-GitHub-Api-Version','2022-11-28','Content-Type','application/json',
      'User-Agent','supabase-afterfall-illustration-prep'
    ),
    timeout_milliseconds:=10000
  ) into request_id;
  return request_id;
end
$$;

notify pgrst,'reload schema';
