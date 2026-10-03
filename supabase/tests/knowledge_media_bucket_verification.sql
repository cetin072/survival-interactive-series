\set ON_ERROR_STOP on
begin;

do $verify$
declare
  bucket_row record;
begin
  select * into bucket_row from storage.buckets where id='survival-knowledge-media';
  if not found
     or bucket_row.public is distinct from true
     or bucket_row.file_size_limit is distinct from 204800::bigint
     or bucket_row.allowed_mime_types is distinct from array['image/webp']::text[] then
    raise exception 'Knowledge media bucket contract invalid';
  end if;

  if has_function_privilege('anon','public.archive_operator_can_manage_knowledge_media()','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_operator_can_manage_knowledge_media()','EXECUTE') then
    raise exception 'Knowledge media capability RPC grants invalid';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname='archive operator knowledge media upload'
      and cmd='INSERT'
  ) then
    raise exception 'Knowledge media upload policy missing';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname like 'archive operator knowledge media%'
      and cmd in ('UPDATE','DELETE')
  ) then
    raise exception 'Knowledge media objects unexpectedly mutable from browser';
  end if;
end
$verify$;

-- Viewer cannot upload.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',true);
set local role authenticated;
do $viewer$
begin
  begin
    insert into storage.objects(bucket_id,name)
    values('survival-knowledge-media','knowledge/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp');
    raise exception 'viewer unexpectedly uploaded Knowledge media';
  exception when insufficient_privilege then
    null;
  end;
end
$viewer$;
reset role;

-- Operator can upload one immutable object path.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
insert into storage.objects(bucket_id,name)
values('survival-knowledge-media','knowledge/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.webp');

do $bad_path$
begin
  begin
    insert into storage.objects(bucket_id,name)
    values('survival-knowledge-media','misc/not-knowledge.webp');
    raise exception 'operator unexpectedly uploaded outside Knowledge path';
  exception when insufficient_privilege then
    null;
  end;
end
$bad_path$;
reset role;

do $final$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id='survival-knowledge-media'
      and name='knowledge/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp'
  ) then
    raise exception 'viewer Knowledge media object leaked through RLS';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id='survival-knowledge-media'
      and name='knowledge/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.webp'
  ) then
    raise exception 'operator Knowledge media upload did not pass RLS';
  end if;

  if exists (
    select 1 from storage.objects
    where bucket_id='survival-knowledge-media'
      and name='misc/not-knowledge.webp'
  ) then
    raise exception 'invalid Knowledge media path leaked through RLS';
  end if;
end
$final$;

rollback;
