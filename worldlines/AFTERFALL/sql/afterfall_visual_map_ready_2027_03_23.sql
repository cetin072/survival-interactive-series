-- AFTERFALL Visual Archive v1 — AF-MAP-001 Canon-ready promotion
-- Follow-up to afterfall_visual_archive_v1.
-- Canon anchor: S02 END 2027-03-23 / save 253.
-- This is a registry-state migration only. It does not generate an image,
-- select a paid provider, create Storage, or expose CORE_PRIVATE data.

update survival_rpg.visual_assets
set
  status = 'READY',
  source = source || jsonb_build_object(
    'canon_checkpoint', 'worldlines/AFTERFALL/seasons/S02/END_CHECKPOINT_2027-03-23.md',
    'canon_save_version', 253,
    'map_model_status', 'STABLE_AT_S02_END'
  ),
  brief = jsonb_build_object(
    'purpose', '아카이브 대문용 첫 세계관 지도',
    'generation_policy', 'READY_FOR_DETERMINISTIC_MAP_BUILD',
    'canon_gates', jsonb_build_object(
      'third_hub_expansion_settled', true,
      'front_living_structure_settled', true,
      'northwest_fallback_role_settled', true,
      'public_security_layer_settled', true
    ),
    'security_layers', jsonb_build_array(
      'PUBLIC_MAP',
      'TRUSTED_ROUTE_MAP',
      'CORE_MAP'
    ),
    'provider_policy', 'NO_PAID_PROVIDER_UNTIL_HUMAN_DECISION'
  ),
  generation_meta = generation_meta || jsonb_build_object(
    'ready_gate_reason', 'all explicit map Canon and public security gates passed',
    'ready_from_save_version', 253,
    'ready_checkpoint', '2027-03-23'
  )
where worldline_id = 'AFTERFALL'
  and asset_id = 'AF-MAP-001'
  and status in ('CANDIDATE', 'WAITING_CANON', 'READY');

do $$
begin
  if not exists (
    select 1
    from survival_rpg.visual_assets
    where worldline_id = 'AFTERFALL'
      and asset_id = 'AF-MAP-001'
      and status = 'READY'
  ) then
    raise exception 'AF-MAP-001 was not promoted to READY';
  end if;
end
$$;
