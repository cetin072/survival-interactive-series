-- Provide the trusted illustration worker a row-scoped readback route when
-- the private survival_rpg schema is intentionally absent from PostgREST's
-- exposed-schema allowlist. The function remains invoker-rights and is only
-- executable by service_role; it does not grant or change table/schema access.
create or replace function public.archive_visual_asset_readback(
  p_point_id text,
  p_generation_key text
)
returns setof jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.to_jsonb(asset)
  from survival_rpg.visual_assets as asset
  where asset.worldline_id = 'AFTERFALL'
    and (
      asset.source ->> 'point_id' = p_point_id
      or asset.source ->> 'generation_key' = p_generation_key
    )
  order by asset.asset_id
  limit 2;
$$;

comment on function public.archive_visual_asset_readback(text, text) is
  'Trusted illustration handoff readback for at most two AFTERFALL rows matching a point or generation key.';

revoke all on function public.archive_visual_asset_readback(text, text) from public;
revoke execute on function public.archive_visual_asset_readback(text, text) from anon, authenticated;
grant execute on function public.archive_visual_asset_readback(text, text) to service_role;

create or replace function public.archive_visual_asset_reconcile(p_row jsonb)
returns setof jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  point_id text := p_row -> 'source' ->> 'point_id';
  generation_key text := p_row -> 'source' ->> 'generation_key';
  candidate survival_rpg.visual_assets%rowtype;
begin
  if p_row ->> 'worldline_id' <> 'AFTERFALL'
     or point_id is null or point_id = ''
     or generation_key is null or generation_key = '' then
    raise exception 'INVALID_AFTERFALL_VISUAL_ROW' using errcode = '22023';
  end if;

  -- Serialize trusted retries for one point; never update or replace an existing row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(point_id, 0));

  if not exists (
    select 1 from survival_rpg.visual_assets asset
    where asset.worldline_id = 'AFTERFALL'
      and (asset.source ->> 'point_id' = point_id
        or asset.source ->> 'generation_key' = generation_key)
  ) then
    select * into candidate
      from pg_catalog.jsonb_populate_record(null::survival_rpg.visual_assets, p_row);

    insert into survival_rpg.visual_assets (
      worldline_id, asset_id, asset_type, status, visibility, title, style_version,
      source, brief, prompt_snapshot, provider, provider_model, provider_asset_id,
      object_path, image_url, generation_meta
    ) values (
      candidate.worldline_id, candidate.asset_id, candidate.asset_type, candidate.status,
      candidate.visibility, candidate.title, candidate.style_version, candidate.source,
      candidate.brief, candidate.prompt_snapshot, candidate.provider, candidate.provider_model,
      candidate.provider_asset_id, candidate.object_path, candidate.image_url,
      candidate.generation_meta
    ) on conflict do nothing;
  end if;

  return query
    select pg_catalog.to_jsonb(asset)
    from survival_rpg.visual_assets asset
    where asset.worldline_id = 'AFTERFALL'
      and (asset.source ->> 'point_id' = point_id
        or asset.source ->> 'generation_key' = generation_key)
    order by asset.asset_id
    limit 2;
end;
$$;

comment on function public.archive_visual_asset_reconcile(jsonb) is
  'Service-role-only insert-once reconciliation for one AFTERFALL visual row; never overwrites and returns at most two matching rows for duplicate detection.';

revoke all on function public.archive_visual_asset_reconcile(jsonb) from public;
revoke execute on function public.archive_visual_asset_reconcile(jsonb) from anon, authenticated;
grant execute on function public.archive_visual_asset_reconcile(jsonb) to service_role;

notify pgrst, 'reload schema';
