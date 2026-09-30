-- Automation B V2.1: reviewer only decides quality and privately stages bytes.
-- Program finalizer owns identity, trusted handoff, registry and site derivative.

alter table survival_ops.illustration_render_jobs
  add column if not exists review_staging_id text,
  add column if not exists provider_asset_id text;

create table if not exists survival_ops.illustration_review_staging (
  staging_id text primary key,
  job_id text not null unique references survival_ops.illustration_render_jobs(job_id) on delete cascade,
  point_id text not null,
  generation_key text not null,
  subject_id text not null,
  source_sha256 text not null,
  byte_count integer not null,
  width integer not null,
  height integer not null,
  mime_type text not null default 'image/png',
  chunk_count integer not null,
  provider_asset_id text not null,
  status text not null default 'UPLOADING',
  created_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint illustration_review_staging_id_check check (staging_id ~ '^[a-z0-9][a-z0-9._:-]{7,159}$'),
  constraint illustration_review_staging_point_check check (point_id ~ '^point-[a-f0-9]{64}$'),
  constraint illustration_review_staging_generation_check check (generation_key ~ '^generation-[a-f0-9]{64}$'),
  constraint illustration_review_staging_subject_check check (subject_id ~ '^(char|loc|event)-[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint illustration_review_staging_sha_check check (source_sha256 ~ '^[a-f0-9]{64}$'),
  constraint illustration_review_staging_bytes_check check (byte_count between 1 and 20971520),
  constraint illustration_review_staging_dimensions_check check (width between 1 and 8192 and height between 1 and 8192),
  constraint illustration_review_staging_mime_check check (mime_type='image/png'),
  constraint illustration_review_staging_chunks_check check (chunk_count between 1 and 128),
  constraint illustration_review_staging_status_check check (status in ('UPLOADING','READY'))
);

create table if not exists survival_ops.illustration_review_staging_chunks (
  staging_id text not null references survival_ops.illustration_review_staging(staging_id) on delete cascade,
  chunk_index integer not null,
  chunk_b64 text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (staging_id,chunk_index),
  constraint illustration_review_chunk_index_check check (chunk_index between 0 and 127),
  constraint illustration_review_chunk_size_check check (length(chunk_b64) between 1 and 240000)
);

revoke all on table survival_ops.illustration_review_staging from public,anon,authenticated;
revoke all on table survival_ops.illustration_review_staging_chunks from public,anon,authenticated;
grant select,insert,update,delete on survival_ops.illustration_review_staging to service_role;
grant select,insert,update,delete on survival_ops.illustration_review_staging_chunks to service_role;

create or replace function public.archive_illustration_review_staging_begin(p_meta jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_row survival_ops.illustration_review_staging%rowtype;
begin
  select * into v_job from survival_ops.illustration_render_jobs
  where job_id=p_meta->>'job_id' for update;
  if not found or v_job.status<>'PREPARED' then
    raise exception 'ILLUSTRATION_REVIEW_JOB_NOT_PREPARED' using errcode='22023';
  end if;
  if p_meta->>'staging_id' !~ '^[a-z0-9][a-z0-9._:-]{7,159}$'
     or p_meta->>'point_id'<>v_job.point_id
     or p_meta->>'generation_key'<>v_job.generation_key
     or p_meta->>'subject_id'<>v_job.subject_id
     or p_meta->>'source_sha256' !~ '^[a-f0-9]{64}$'
     or coalesce((p_meta->>'byte_count')::integer,0) not between 1 and 20971520
     or coalesce((p_meta->>'width')::integer,0) not between 1 and 8192
     or coalesce((p_meta->>'height')::integer,0) not between 1 and 8192
     or p_meta->>'mime_type'<>'image/png'
     or coalesce((p_meta->>'chunk_count')::integer,0) not between 1 and 128
     or p_meta->>'provider_asset_id' is null
     or length(p_meta->>'provider_asset_id')<8 then
    raise exception 'INVALID_ILLUSTRATION_REVIEW_STAGING_META' using errcode='22023';
  end if;

  insert into survival_ops.illustration_review_staging(
    staging_id,job_id,point_id,generation_key,subject_id,source_sha256,
    byte_count,width,height,mime_type,chunk_count,provider_asset_id,status
  ) values (
    p_meta->>'staging_id',v_job.job_id,v_job.point_id,v_job.generation_key,v_job.subject_id,
    p_meta->>'source_sha256',(p_meta->>'byte_count')::integer,(p_meta->>'width')::integer,
    (p_meta->>'height')::integer,'image/png',(p_meta->>'chunk_count')::integer,
    p_meta->>'provider_asset_id','UPLOADING'
  )
  on conflict (staging_id) do update set updated_at=clock_timestamp()
  returning * into v_row;

  if v_row.job_id<>v_job.job_id
     or v_row.point_id<>v_job.point_id
     or v_row.generation_key<>v_job.generation_key
     or v_row.subject_id<>v_job.subject_id
     or v_row.source_sha256<>p_meta->>'source_sha256'
     or v_row.byte_count<>(p_meta->>'byte_count')::integer
     or v_row.width<>(p_meta->>'width')::integer
     or v_row.height<>(p_meta->>'height')::integer
     or v_row.chunk_count<>(p_meta->>'chunk_count')::integer
     or v_row.provider_asset_id<>p_meta->>'provider_asset_id' then
    raise exception 'ILLUSTRATION_REVIEW_STAGING_CONFLICT' using errcode='22023';
  end if;

  return jsonb_build_object(
    'staging_id',v_row.staging_id,'status',v_row.status,'job_id',v_row.job_id,
    'point_id',v_row.point_id,'generation_key',v_row.generation_key,'subject_id',v_row.subject_id,
    'source_sha256',v_row.source_sha256,'byte_count',v_row.byte_count,'width',v_row.width,
    'height',v_row.height,'mime_type',v_row.mime_type,'chunk_count',v_row.chunk_count,
    'provider_asset_id',v_row.provider_asset_id
  );
end $$;

create or replace function public.archive_illustration_review_staging_chunk_put(
  p_staging_id text,p_chunk_index integer,p_chunk_b64 text
)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_meta survival_ops.illustration_review_staging%rowtype;
  v_existing text;
begin
  select * into v_meta from survival_ops.illustration_review_staging
  where staging_id=p_staging_id for update;
  if not found or v_meta.status not in ('UPLOADING','READY') then
    raise exception 'ILLUSTRATION_REVIEW_STAGING_NOT_WRITABLE' using errcode='22023';
  end if;
  if p_chunk_index<0 or p_chunk_index>=v_meta.chunk_count
     or p_chunk_b64 is null or length(p_chunk_b64) not between 1 and 240000 then
    raise exception 'ILLUSTRATION_REVIEW_CHUNK_INVALID' using errcode='22023';
  end if;
  insert into survival_ops.illustration_review_staging_chunks(staging_id,chunk_index,chunk_b64)
  values(p_staging_id,p_chunk_index,p_chunk_b64)
  on conflict (staging_id,chunk_index) do nothing;
  select chunk_b64 into v_existing from survival_ops.illustration_review_staging_chunks
  where staging_id=p_staging_id and chunk_index=p_chunk_index;
  if v_existing is distinct from p_chunk_b64 then
    raise exception 'ILLUSTRATION_REVIEW_CHUNK_CONFLICT' using errcode='22023';
  end if;
  return jsonb_build_object('staging_id',p_staging_id,'chunk_index',p_chunk_index,'stored',true);
end $$;

create or replace function public.archive_illustration_review_staging_finalize(p_staging_id text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_meta survival_ops.illustration_review_staging%rowtype;
  v_count integer; v_min integer; v_max integer; v_b64 text; v_bytes bytea;
  v_sha text; v_width integer; v_height integer;
begin
  select * into v_meta from survival_ops.illustration_review_staging
  where staging_id=p_staging_id for update;
  if not found then raise exception 'ILLUSTRATION_REVIEW_STAGING_NOT_FOUND' using errcode='22023'; end if;

  select count(*),min(chunk_index),max(chunk_index),string_agg(chunk_b64,'' order by chunk_index)
  into v_count,v_min,v_max,v_b64
  from survival_ops.illustration_review_staging_chunks
  where staging_id=p_staging_id;

  if v_count<>v_meta.chunk_count or v_min<>0 or v_max<>v_meta.chunk_count-1 then
    raise exception 'ILLUSTRATION_REVIEW_CHUNK_SET_INVALID' using errcode='22023';
  end if;
  begin v_bytes:=decode(v_b64,'base64');
  exception when others then raise exception 'ILLUSTRATION_REVIEW_BASE64_INVALID' using errcode='22023'; end;

  if octet_length(v_bytes)<>v_meta.byte_count then
    raise exception 'ILLUSTRATION_REVIEW_BYTE_COUNT_MISMATCH' using errcode='22023';
  end if;
  v_sha:=encode(extensions.digest(v_bytes,'sha256'),'hex');
  if v_sha<>v_meta.source_sha256 then
    raise exception 'ILLUSTRATION_REVIEW_SHA256_MISMATCH' using errcode='22023';
  end if;
  if octet_length(v_bytes)<24
     or substring(v_bytes from 1 for 8)<>decode('89504e470d0a1a0a','hex')
     or substring(v_bytes from 13 for 4)<>convert_to('IHDR','UTF8') then
    raise exception 'ILLUSTRATION_REVIEW_PNG_INVALID' using errcode='22023';
  end if;
  v_width:=get_byte(v_bytes,16)*16777216+get_byte(v_bytes,17)*65536+get_byte(v_bytes,18)*256+get_byte(v_bytes,19);
  v_height:=get_byte(v_bytes,20)*16777216+get_byte(v_bytes,21)*65536+get_byte(v_bytes,22)*256+get_byte(v_bytes,23);
  if v_width<>v_meta.width or v_height<>v_meta.height then
    raise exception 'ILLUSTRATION_REVIEW_DIMENSIONS_MISMATCH' using errcode='22023';
  end if;

  update survival_ops.illustration_review_staging
  set status='READY',finalized_at=coalesce(finalized_at,clock_timestamp()),updated_at=clock_timestamp()
  where staging_id=p_staging_id;

  return jsonb_build_object(
    'staging_id',v_meta.staging_id,'status','READY','job_id',v_meta.job_id,
    'point_id',v_meta.point_id,'generation_key',v_meta.generation_key,'subject_id',v_meta.subject_id,
    'source_sha256',v_meta.source_sha256,'byte_count',v_meta.byte_count,'width',v_meta.width,
    'height',v_meta.height,'mime_type',v_meta.mime_type,'chunk_count',v_meta.chunk_count,
    'provider_asset_id',v_meta.provider_asset_id
  );
end $$;

create or replace function public.archive_illustration_review_staging_meta(p_staging_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'staging_id',s.staging_id,'status',s.status,'job_id',s.job_id,
    'point_id',s.point_id,'generation_key',s.generation_key,'subject_id',s.subject_id,
    'source_sha256',s.source_sha256,'byte_count',s.byte_count,'width',s.width,'height',s.height,
    'mime_type',s.mime_type,'chunk_count',s.chunk_count,'provider_asset_id',s.provider_asset_id
  )
  from survival_ops.illustration_review_staging s
  where s.staging_id=p_staging_id and s.status='READY'
$$;

create or replace function public.archive_illustration_review_staging_chunks(p_staging_id text)
returns table(chunk_index integer,chunk_b64 text)
language sql stable security invoker set search_path='' as $$
  select c.chunk_index,c.chunk_b64
  from survival_ops.illustration_review_staging_chunks c
  join survival_ops.illustration_review_staging s on s.staging_id=c.staging_id
  where c.staging_id=p_staging_id and s.status='READY'
  order by c.chunk_index
$$;

create or replace function public.archive_illustration_review_complete(p_review jsonb)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,survival_ops,archive_ops as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_decision text:=p_review->>'decision';
  v_dispatch bigint;
  v_review survival_ops.illustration_review_staging%rowtype;
begin
  select * into v_job from survival_ops.illustration_render_jobs
  where job_id=p_review->>'job_id' for update;
  if not found or v_job.status<>'PREPARED' then
    raise exception 'ILLUSTRATION_REVIEW_JOB_NOT_PREPARED' using errcode='22023';
  end if;
  if v_decision not in ('PASS','REJECT','HUMAN_REVIEW')
     or p_review->>'review_provider' is null
     or p_review->>'output_sha256' !~ '^[a-f0-9]{64}$'
     or coalesce((p_review->>'output_bytes')::integer,0) not between 1 and 20971520
     or coalesce((p_review->>'output_width')::integer,0) not between 1 and 8192
     or coalesce((p_review->>'output_height')::integer,0) not between 1 and 8192
     or jsonb_typeof(coalesce(p_review->'rejection_codes','[]'::jsonb))<>'array' then
    raise exception 'INVALID_ILLUSTRATION_REVIEW' using errcode='22023';
  end if;

  if v_decision='PASS' then
    if p_review->>'review_staging_id' is null or p_review->>'provider_asset_id' is null then
      raise exception 'ILLUSTRATION_REVIEW_PASS_STAGING_REQUIRED' using errcode='22023';
    end if;
    select * into v_review from survival_ops.illustration_review_staging
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
    review_staging_id=case when v_decision='PASS' then p_review->>'review_staging_id' else null end,
    provider_asset_id=case when v_decision='PASS' then p_review->>'provider_asset_id' else null end,
    reviewed_at=clock_timestamp(),updated_at=clock_timestamp(),
    status=case when v_decision='PASS' then 'REVIEW_PASS_STAGED'
                when v_decision='REJECT' then 'REVIEW_REJECTED'
                else 'HUMAN_REVIEW' end
  where job_id=v_job.job_id;

  if v_decision='PASS' then
    v_dispatch:=archive_ops.dispatch_afterfall_illustration_finalize(v_job.job_id);
    update survival_ops.illustration_render_jobs
    set status='FINALIZE_QUEUED',finalizer_dispatch_request_id=v_dispatch,updated_at=clock_timestamp()
    where job_id=v_job.job_id;
  end if;

  return jsonb_build_object(
    'status',case when v_decision='PASS' then 'FINALIZE_QUEUED' else v_decision end,
    'job_id',v_job.job_id,'dispatch_request_id',v_dispatch
  );
end $$;

create or replace function public.archive_illustration_review_promote(
  p_job_id text,p_review_staging_id text,p_handoff_staging_id text,
  p_source_commit text,p_identity_path text
)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
  v_job survival_ops.illustration_render_jobs%rowtype;
  v_review survival_ops.illustration_review_staging%rowtype;
  v_handoff survival_ops.illustration_binary_staging%rowtype;
  v_final jsonb;
begin
  select * into v_job from survival_ops.illustration_render_jobs
  where job_id=p_job_id for update;
  if not found or v_job.status<>'FINALIZING'
     or v_job.review_staging_id<>p_review_staging_id
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_identity_path !~ '^archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_[A-Z0-9_-]+[.]json$'
     or p_handoff_staging_id !~ '^[a-z0-9][a-z0-9._:-]{7,159}$' then
    raise exception 'ILLUSTRATION_REVIEW_PROMOTE_INVALID' using errcode='22023';
  end if;

  select * into v_review from survival_ops.illustration_review_staging
  where staging_id=p_review_staging_id and status='READY';
  if not found
     or v_review.job_id<>v_job.job_id
     or v_review.point_id<>v_job.point_id
     or v_review.generation_key<>v_job.generation_key
     or v_review.subject_id<>v_job.subject_id
     or v_review.source_sha256<>v_job.output_sha256
     or v_review.byte_count<>v_job.output_bytes
     or v_review.width<>v_job.output_width
     or v_review.height<>v_job.output_height then
    raise exception 'ILLUSTRATION_REVIEW_PROMOTE_BINDING_INVALID' using errcode='22023';
  end if;

  insert into survival_ops.illustration_binary_staging(
    staging_id,worldline_id,point_id,generation_key,subject_id,source_commit,identity_path,
    source_sha256,byte_count,width,height,mime_type,chunk_count,status
  ) values (
    p_handoff_staging_id,'AFTERFALL',v_review.point_id,v_review.generation_key,v_review.subject_id,
    p_source_commit,p_identity_path,v_review.source_sha256,v_review.byte_count,v_review.width,
    v_review.height,'image/png',v_review.chunk_count,'UPLOADING'
  ) on conflict (staging_id) do nothing;

  select * into v_handoff from survival_ops.illustration_binary_staging
  where staging_id=p_handoff_staging_id;
  if not found
     or v_handoff.point_id<>v_review.point_id
     or v_handoff.generation_key<>v_review.generation_key
     or v_handoff.subject_id<>v_review.subject_id
     or v_handoff.source_commit<>p_source_commit
     or v_handoff.identity_path<>p_identity_path
     or v_handoff.source_sha256<>v_review.source_sha256
     or v_handoff.byte_count<>v_review.byte_count
     or v_handoff.width<>v_review.width
     or v_handoff.height<>v_review.height
     or v_handoff.chunk_count<>v_review.chunk_count then
    raise exception 'ILLUSTRATION_HANDOFF_STAGING_CONFLICT' using errcode='22023';
  end if;

  insert into survival_ops.illustration_binary_staging_chunks(staging_id,chunk_index,chunk_b64)
  select p_handoff_staging_id,chunk_index,chunk_b64
  from survival_ops.illustration_review_staging_chunks
  where staging_id=p_review_staging_id
  order by chunk_index
  on conflict (staging_id,chunk_index) do nothing;

  v_final:=public.archive_illustration_staging_finalize(p_handoff_staging_id);
  if v_final->>'status'<>'READY' then
    raise exception 'ILLUSTRATION_HANDOFF_STAGING_FINALIZE_FAILED' using errcode='22023';
  end if;

  update survival_ops.illustration_render_jobs
  set identity_path=p_identity_path,source_commit=p_source_commit,staging_id=p_handoff_staging_id,
      updated_at=clock_timestamp()
  where job_id=p_job_id;

  return jsonb_build_object(
    'status','HANDOFF_STAGING_READY','job_id',p_job_id,
    'review_staging_id',p_review_staging_id,'staging_id',p_handoff_staging_id,
    'source_commit',p_source_commit,'identity_path',p_identity_path,
    'source_sha256',v_review.source_sha256
  );
end $$;

create or replace function public.archive_illustration_review_staging_cleanup(
  p_staging_id text,p_source_sha256 text
)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_deleted integer;
begin
  delete from survival_ops.illustration_review_staging
  where staging_id=p_staging_id and source_sha256=p_source_sha256 and status='READY';
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('staging_id',p_staging_id,'deleted',v_deleted);
end $$;

revoke all on function public.archive_illustration_review_staging_begin(jsonb) from public;
revoke execute on function public.archive_illustration_review_staging_begin(jsonb) from anon,authenticated;
grant execute on function public.archive_illustration_review_staging_begin(jsonb) to service_role;
revoke all on function public.archive_illustration_review_staging_chunk_put(text,integer,text) from public;
revoke execute on function public.archive_illustration_review_staging_chunk_put(text,integer,text) from anon,authenticated;
grant execute on function public.archive_illustration_review_staging_chunk_put(text,integer,text) to service_role;
revoke all on function public.archive_illustration_review_staging_finalize(text) from public;
revoke execute on function public.archive_illustration_review_staging_finalize(text) from anon,authenticated;
grant execute on function public.archive_illustration_review_staging_finalize(text) to service_role;
revoke all on function public.archive_illustration_review_staging_meta(text) from public;
revoke execute on function public.archive_illustration_review_staging_meta(text) from anon,authenticated;
grant execute on function public.archive_illustration_review_staging_meta(text) to service_role;
revoke all on function public.archive_illustration_review_staging_chunks(text) from public;
revoke execute on function public.archive_illustration_review_staging_chunks(text) from anon,authenticated;
grant execute on function public.archive_illustration_review_staging_chunks(text) to service_role;
revoke all on function public.archive_illustration_review_complete(jsonb) from public;
revoke execute on function public.archive_illustration_review_complete(jsonb) from anon,authenticated;
grant execute on function public.archive_illustration_review_complete(jsonb) to service_role;
revoke all on function public.archive_illustration_review_promote(text,text,text,text,text) from public;
revoke execute on function public.archive_illustration_review_promote(text,text,text,text,text) from anon,authenticated;
grant execute on function public.archive_illustration_review_promote(text,text,text,text,text) to service_role;
revoke all on function public.archive_illustration_review_staging_cleanup(text,text) from public;
revoke execute on function public.archive_illustration_review_staging_cleanup(text,text) from anon,authenticated;
grant execute on function public.archive_illustration_review_staging_cleanup(text,text) to service_role;

notify pgrst,'reload schema';
