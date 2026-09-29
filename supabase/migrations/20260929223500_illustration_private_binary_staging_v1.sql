-- Private chunked ingress for accepted AFTERFALL illustration originals.
-- Renderer output is staged privately in survival_ops, then a trusted main
-- workflow reconstructs/verifies exact bytes before private Storage + registry.

create table if not exists survival_ops.illustration_binary_staging (
  staging_id text primary key,
  worldline_id text not null default 'AFTERFALL',
  point_id text not null,
  generation_key text not null,
  subject_id text not null,
  source_commit text not null,
  identity_path text not null,
  source_sha256 text not null,
  byte_count integer not null,
  width integer not null,
  height integer not null,
  mime_type text not null default 'image/png',
  chunk_count integer not null,
  status text not null default 'UPLOADING',
  created_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz,
  constraint illustration_binary_staging_worldline_check
    check (worldline_id = 'AFTERFALL'),
  constraint illustration_binary_staging_point_check
    check (point_id ~ '^point-[a-f0-9]{64}$'),
  constraint illustration_binary_staging_generation_check
    check (generation_key ~ '^generation-[a-f0-9]{64}$'),
  constraint illustration_binary_staging_subject_check
    check (subject_id ~ '^(char|loc|event)-[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint illustration_binary_staging_commit_check
    check (source_commit ~ '^[a-f0-9]{40}$'),
  constraint illustration_binary_staging_identity_check
    check (identity_path ~ '^archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_[A-Z0-9_-]+[.]json$'),
  constraint illustration_binary_staging_sha_check
    check (source_sha256 ~ '^[a-f0-9]{64}$'),
  constraint illustration_binary_staging_byte_count_check
    check (byte_count between 1 and 20971520),
  constraint illustration_binary_staging_dimensions_check
    check (width between 1 and 8192 and height between 1 and 8192),
  constraint illustration_binary_staging_mime_check
    check (mime_type = 'image/png'),
  constraint illustration_binary_staging_chunk_count_check
    check (chunk_count between 1 and 128),
  constraint illustration_binary_staging_status_check
    check (status in ('UPLOADING','READY'))
);

create table if not exists survival_ops.illustration_binary_staging_chunks (
  staging_id text not null references survival_ops.illustration_binary_staging(staging_id) on delete cascade,
  chunk_index integer not null,
  chunk_b64 text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (staging_id, chunk_index),
  constraint illustration_binary_chunk_index_check
    check (chunk_index between 0 and 127),
  constraint illustration_binary_chunk_size_check
    check (length(chunk_b64) between 1 and 240000)
);

comment on table survival_ops.illustration_binary_staging is
  'Private temporary metadata for accepted illustration originals before trusted Storage handoff.';
comment on table survival_ops.illustration_binary_staging_chunks is
  'Private base64 chunks for one accepted illustration original; deleted after trusted handoff.';

revoke all on table survival_ops.illustration_binary_staging from public, anon, authenticated;
revoke all on table survival_ops.illustration_binary_staging_chunks from public, anon, authenticated;
grant usage on schema survival_ops to service_role;
grant select, insert, update, delete on table survival_ops.illustration_binary_staging to service_role;
grant select, insert, update, delete on table survival_ops.illustration_binary_staging_chunks to service_role;

create or replace function public.archive_illustration_staging_finalize(p_staging_id text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_meta survival_ops.illustration_binary_staging%rowtype;
  v_chunk_count integer;
  v_min_chunk integer;
  v_max_chunk integer;
  v_b64 text;
  v_bytes bytea;
  v_width integer;
  v_height integer;
  v_sha text;
begin
  select * into v_meta
  from survival_ops.illustration_binary_staging
  where staging_id = p_staging_id
  for update;

  if not found then
    raise exception 'ILLUSTRATION_STAGING_NOT_FOUND' using errcode = '22023';
  end if;

  select count(*), min(chunk_index), max(chunk_index),
         string_agg(chunk_b64, '' order by chunk_index)
    into v_chunk_count, v_min_chunk, v_max_chunk, v_b64
  from survival_ops.illustration_binary_staging_chunks
  where staging_id = p_staging_id;

  if v_chunk_count <> v_meta.chunk_count
     or v_min_chunk <> 0
     or v_max_chunk <> v_meta.chunk_count - 1 then
    raise exception 'ILLUSTRATION_STAGING_CHUNK_SET_INVALID' using errcode = '22023';
  end if;

  begin
    v_bytes := decode(v_b64, 'base64');
  exception when others then
    raise exception 'ILLUSTRATION_STAGING_BASE64_INVALID' using errcode = '22023';
  end;

  if octet_length(v_bytes) <> v_meta.byte_count then
    raise exception 'ILLUSTRATION_STAGING_BYTE_COUNT_MISMATCH' using errcode = '22023';
  end if;

  v_sha := encode(extensions.digest(v_bytes, 'sha256'), 'hex');
  if v_sha <> v_meta.source_sha256 then
    raise exception 'ILLUSTRATION_STAGING_SHA256_MISMATCH' using errcode = '22023';
  end if;

  if octet_length(v_bytes) < 24
     or substring(v_bytes from 1 for 8) <> decode('89504e470d0a1a0a', 'hex')
     or substring(v_bytes from 13 for 4) <> convert_to('IHDR', 'UTF8') then
    raise exception 'ILLUSTRATION_STAGING_PNG_INVALID' using errcode = '22023';
  end if;

  v_width :=
      get_byte(v_bytes, 16) * 16777216
    + get_byte(v_bytes, 17) * 65536
    + get_byte(v_bytes, 18) * 256
    + get_byte(v_bytes, 19);
  v_height :=
      get_byte(v_bytes, 20) * 16777216
    + get_byte(v_bytes, 21) * 65536
    + get_byte(v_bytes, 22) * 256
    + get_byte(v_bytes, 23);

  if v_width <> v_meta.width or v_height <> v_meta.height then
    raise exception 'ILLUSTRATION_STAGING_DIMENSIONS_MISMATCH' using errcode = '22023';
  end if;

  update survival_ops.illustration_binary_staging
  set status = 'READY', finalized_at = clock_timestamp()
  where staging_id = p_staging_id;

  return jsonb_build_object(
    'staging_id', v_meta.staging_id,
    'status', 'READY',
    'point_id', v_meta.point_id,
    'generation_key', v_meta.generation_key,
    'subject_id', v_meta.subject_id,
    'source_commit', v_meta.source_commit,
    'identity_path', v_meta.identity_path,
    'source_sha256', v_meta.source_sha256,
    'byte_count', v_meta.byte_count,
    'width', v_meta.width,
    'height', v_meta.height,
    'mime_type', v_meta.mime_type,
    'chunk_count', v_meta.chunk_count
  );
end;
$$;

create or replace function public.archive_illustration_staging_meta(p_staging_id text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'staging_id', s.staging_id,
    'status', s.status,
    'point_id', s.point_id,
    'generation_key', s.generation_key,
    'subject_id', s.subject_id,
    'source_commit', s.source_commit,
    'identity_path', s.identity_path,
    'source_sha256', s.source_sha256,
    'byte_count', s.byte_count,
    'width', s.width,
    'height', s.height,
    'mime_type', s.mime_type,
    'chunk_count', s.chunk_count
  )
  from survival_ops.illustration_binary_staging s
  where s.staging_id = p_staging_id
    and s.status = 'READY';
$$;

create or replace function public.archive_illustration_staging_chunks(p_staging_id text)
returns table(chunk_index integer, chunk_b64 text)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.chunk_index, c.chunk_b64
  from survival_ops.illustration_binary_staging_chunks c
  join survival_ops.illustration_binary_staging s
    on s.staging_id = c.staging_id
  where c.staging_id = p_staging_id
    and s.status = 'READY'
  order by c.chunk_index;
$$;

create or replace function public.archive_illustration_staging_cleanup(
  p_staging_id text,
  p_source_sha256 text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from survival_ops.illustration_binary_staging
  where staging_id = p_staging_id
    and source_sha256 = p_source_sha256
    and status = 'READY';
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'staging_id', p_staging_id,
    'deleted', v_deleted
  );
end;
$$;

revoke all on function public.archive_illustration_staging_finalize(text) from public;
revoke execute on function public.archive_illustration_staging_finalize(text) from anon, authenticated;
grant execute on function public.archive_illustration_staging_finalize(text) to service_role;

revoke all on function public.archive_illustration_staging_meta(text) from public;
revoke execute on function public.archive_illustration_staging_meta(text) from anon, authenticated;
grant execute on function public.archive_illustration_staging_meta(text) to service_role;

revoke all on function public.archive_illustration_staging_chunks(text) from public;
revoke execute on function public.archive_illustration_staging_chunks(text) from anon, authenticated;
grant execute on function public.archive_illustration_staging_chunks(text) to service_role;

revoke all on function public.archive_illustration_staging_cleanup(text, text) from public;
revoke execute on function public.archive_illustration_staging_cleanup(text, text) from anon, authenticated;
grant execute on function public.archive_illustration_staging_cleanup(text, text) to service_role;

notify pgrst, 'reload schema';
