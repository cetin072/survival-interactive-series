-- Run with a trusted PostgreSQL role after applying
-- 20260928143739_archive_visual_asset_service_readback.sql.
\set ON_ERROR_STOP on

begin;

do $$
declare
  function_row record;
begin
  select p.prosecdef, p.proconfig, p.proacl
    into function_row
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'archive_visual_asset_readback'
      and pg_get_function_identity_arguments(p.oid) = 'p_point_id text, p_generation_key text';

  if not found or function_row.prosecdef is not false
     or not ('search_path=""' = any(function_row.proconfig)) then
    raise exception 'trusted visual readback function must be SECURITY INVOKER with an empty search_path';
  end if;

  if not has_function_privilege('service_role',
       'public.archive_visual_asset_readback(text,text)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.archive_visual_asset_readback(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.archive_visual_asset_readback(text,text)', 'EXECUTE') then
    raise exception 'trusted visual readback execute grants are not service_role-only';
  end if;

  if exists (
    select 1 from aclexplode(function_row.proacl) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC retains EXECUTE on trusted visual readback';
  end if;

  if not has_function_privilege('service_role',
       'public.archive_visual_asset_reconcile(jsonb)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.archive_visual_asset_reconcile(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.archive_visual_asset_reconcile(jsonb)', 'EXECUTE') then
    raise exception 'trusted visual reconcile execute grants are not service_role-only';
  end if;

  if has_schema_privilege('anon', 'survival_rpg', 'USAGE')
     or has_schema_privilege('authenticated', 'survival_rpg', 'USAGE')
     or not has_schema_privilege('service_role', 'survival_rpg', 'USAGE')
     or not has_table_privilege('service_role', 'survival_rpg.visual_assets', 'SELECT')
     or not has_table_privilege('service_role', 'survival_rpg.visual_assets', 'INSERT')
     or not (select relrowsecurity from pg_class where oid = 'survival_rpg.visual_assets'::regclass) then
    raise exception 'survival_rpg access boundary changed unexpectedly';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  matches jsonb[];
begin
  select array_agg(row_value)
    into matches
    from public.archive_visual_asset_readback(
      'point-df6dfecbd13bcd0d2fc7de0a0b44d2d4f87c5343b7fa4b343bdaaa67e59e67b5',
      'generation-3743c065c28f7621e2c6d3cc01fd4860af12f16f3430481663ed37dc4a2c0f1b'
    ) as readback(row_value);

  if coalesce(array_length(matches, 1), 0) <> 1
     or matches[1] -> 'source' ->> 'point_id'
          <> 'point-df6dfecbd13bcd0d2fc7de0a0b44d2d4f87c5343b7fa4b343bdaaa67e59e67b5'
     or matches[1] -> 'source' ->> 'generation_key'
          <> 'generation-3743c065c28f7621e2c6d3cc01fd4860af12f16f3430481663ed37dc4a2c0f1b' then
    raise exception 'warehouse trusted readback did not return exactly one bound registry row';
  end if;
end;
$$;

do $$
declare
  before_count bigint;
  after_count bigint;
  row_value jsonb;
begin
  select count(*) into before_count
    from survival_rpg.visual_assets
    where source ->> 'point_id' = 'point-df6dfecbd13bcd0d2fc7de0a0b44d2d4f87c5343b7fa4b343bdaaa67e59e67b5';

  select reconcile.row_value into row_value
    from public.archive_visual_asset_reconcile(
      (select pg_catalog.to_jsonb(asset) from survival_rpg.visual_assets asset
       where asset.source ->> 'point_id' = 'point-df6dfecbd13bcd0d2fc7de0a0b44d2d4f87c5343b7fa4b343bdaaa67e59e67b5'
       limit 1)
    ) as reconcile(row_value);

  select count(*) into after_count
    from survival_rpg.visual_assets
    where source ->> 'point_id' = 'point-df6dfecbd13bcd0d2fc7de0a0b44d2d4f87c5343b7fa4b343bdaaa67e59e67b5';

  if before_count <> 1 or after_count <> 1
     or row_value -> 'source' ->> 'point_id'
          <> 'point-df6dfecbd13bcd0d2fc7de0a0b44d2d4f87c5343b7fa4b343bdaaa67e59e67b5' then
    raise exception 'reconcile must reuse the existing warehouse row without duplicates or overwrite';
  end if;
end;
$$;

rollback;
