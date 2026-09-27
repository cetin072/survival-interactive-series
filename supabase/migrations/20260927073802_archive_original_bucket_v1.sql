-- Private archive-only originals. Service-role runner uploads; no public object policy.
do $archive_bucket$
declare
  v_bucket storage.buckets%rowtype;
begin
  select * into v_bucket from storage.buckets
   where id = 'survival-archive-originals' for update;
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('survival-archive-originals', 'survival-archive-originals', false,
      20971520, array['image/png']::text[]);
  elsif v_bucket.name is distinct from 'survival-archive-originals'
     or v_bucket.public is distinct from false
     or v_bucket.file_size_limit is distinct from 20971520
     or v_bucket.allowed_mime_types is distinct from array['image/png']::text[] then
    raise exception 'ARCHIVE_ORIGINAL_BUCKET_CONFIG_MISMATCH';
  end if;
end;
$archive_bucket$;
