-- Knowledge public media v1.
-- Public read is intentional because these assets are embedded in public Knowledge articles.
-- Browser uploads are operator-only, immutable, and capped at the public image budget.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'survival-knowledge-media',
  'survival-knowledge-media',
  true,
  204800,
  array['image/webp']::text[]
)
on conflict (id) do update set
  public=true,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.archive_operator_can_manage_knowledge_media()
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

revoke all on function public.archive_operator_can_manage_knowledge_media() from public,anon;
grant execute on function public.archive_operator_can_manage_knowledge_media() to authenticated;

drop policy if exists "archive operator knowledge media upload" on storage.objects;
create policy "archive operator knowledge media upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='survival-knowledge-media'
  and name ~ '^knowledge/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  and public.archive_operator_can_manage_knowledge_media()
);

-- Deliberately no UPDATE policy: object paths are content-immutable.
-- V1 also omits browser DELETE so an approved article cannot lose an image
-- because a later editor session deleted the backing object.

notify pgrst,'reload schema';
