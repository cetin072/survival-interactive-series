-- ISOLATED PG17 ONLY. Capability fixtures stand in for the existing platform registry.
-- Never installed in production; production uses its existing functions unchanged.
create schema survival_ops;
create schema auth;
create table public.profiles(id uuid primary key,account_status text,can_review boolean);
insert into public.profiles values
  ('00000000-0000-4000-8000-000000000099','active',true),
  ('00000000-0000-4000-8000-000000000098','active',false),
  ('00000000-0000-4000-8000-000000000097','inactive',true);
revoke all on public.profiles from public,anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.current_profile_is_active() returns boolean language sql stable security definer set search_path='' as
  $$ select exists(select 1 from public.profiles where id=auth.uid() and account_status='active') $$;
create function public.private_actor_can(code text) returns boolean language sql stable security definer set search_path='' as
  $$ select exists(select 1 from public.profiles where id=auth.uid() and can_review and code='survival_archive.review') $$;
-- Same guard as the inspected live helper; capability lookup above is the fixture.
create function survival_ops.private_require_archive_operator() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not public.current_profile_is_active() or not public.private_actor_can('survival_archive.review') then
    raise exception using errcode='42501',message='SURVIVAL_ARCHIVE_OPERATOR_FORBIDDEN';
  end if;
  return actor_id;
end $$;
revoke all on function survival_ops.private_require_archive_operator() from public,anon,authenticated,service_role;
