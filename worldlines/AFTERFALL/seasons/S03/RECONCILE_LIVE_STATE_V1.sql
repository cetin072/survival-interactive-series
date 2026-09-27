-- One-time, observed-play reconciliation. Run only while the S03 room is idle.
-- Source: LIVE session 8ef127f7-4729-4161-9784-49123171ad2a, turns 1-16.
-- Never retro-link those RAW rows or substitute a guessed save version.
-- The first live execution reached save 254; a guarded same-version correction
-- then set known_world.time/location. This source includes both final fields.
begin;
set local lock_timeout = '5s';

do $reconcile$
declare
  v_session constant uuid := '8ef127f7-4729-4161-9784-49123171ad2a';
  v_worldline constant text := 'AFTERFALL';
  v_checkpoint constant text := 'worldlines/AFTERFALL/seasons/S03/CURRENT_CHECKPOINT_2027-04-08.md';
  v_scene constant text := 'S03_GUILD_CLUSTER_NEXT_INVESTMENT';
  v_summary constant text :=
    'S03 LIVE RAW turns 1-16 were already played through 2027-04-08 11:30. Jinwoo retains final guild security command; Choi Donghyuk only trains and evaluates, and two candidates began limited daytime trial duty. The outside convoy completed its limited space/material/labor exchange and departed without a confirmed hostile identity. The guild runs direct lunch and customer repair services; Park Seonok agreed to two years of use for the kitchen-side building, and Jeong Mingyu began a three-day-per-week one-month trial for customer electrical repairs. Im Jeongho remains an independent repair partner. A paid relocation of six people was completed; after collaborator payment the guild retained four bed frames, four mattresses, six bedding sets and one cabinet. Lodging, expanded storage and formal deposit/settlement remain open investment choices, not already-open businesses.';
  v_save_version integer;
  v_event_id bigint;
  v_scene_id bigint;
  v_archive_id bigint;
  v_updated integer;
begin
  perform pg_advisory_xact_lock(hashtext('AFTERFALL_S03_RAW_1_16_RECONCILIATION'));

  select s.save_version into v_save_version
  from survival_rpg.saves s
  where s.worldline_id = v_worldline
  for update;

  if v_save_version is distinct from 253 then
    raise exception 'Expected AFTERFALL save 253, got %', v_save_version;
  end if;

  if (select count(*) from survival_rpg.transcript_messages m
      where m.session_id = v_session and m.message_order > 41) <> 0
     or (select count(*) from survival_rpg.transcript_messages m
         where m.session_id = v_session and m.role = 'GM'
           and m.turn_no between 1 and 16) <> 16
     or not exists (
       select 1 from survival_rpg.transcript_messages m
       where m.session_id = v_session and m.turn_no = 16
         and m.message_order = 41 and m.role = 'GM'
         and m.source_type = 'LIVE' and m.save_version is null
         and m.content_sha256 =
           'd0f8cad19c0613f13535a7c167cfa650f27793647546e78c475cf7081c1c8ead'
     )
     or not exists (
       select 1 from survival_rpg.transcript_messages m
       where m.session_id = v_session and m.turn_no = 16
         and m.message_order = 40 and m.role = 'USER'
         and m.source_type = 'LIVE' and m.save_version is null
         and m.content_sha256 =
           '355fcddb1ad89e7b4c8a0025706082e2d2a89f223cfc34f8c5633e5fc856a043'
     )
     or exists (
       select 1 from survival_rpg.transcript_turn_state_links l
       where l.session_id = v_session
     ) then
    raise exception 'S03 RAW head changed or historical links appeared; review before repair';
  end if;

  if exists (
    select 1 from survival_rpg.scenes
    where worldline_id = v_worldline and scene_id = v_scene
  ) then
    raise exception 'S03 reconciliation scene already exists';
  end if;

  -- Preserve the exact pre-reconciliation save before replacing current pointers.
  insert into survival_rpg.state_archives
    (worldline_id, source_save_version, archive_kind, payload, note)
  select v_worldline, 253, 'PRE_S03_LIVE_RECONCILIATION',
    jsonb_build_object('state', s.state, 'gm_state', s.gm_state),
    'Exact save 253 snapshot before observed S03 RAW turns 1-16 reconciliation'
  from survival_rpg.saves s where s.worldline_id = v_worldline
  returning id into v_archive_id;

  insert into survival_rpg.events
    (worldline_id, game_time, event_type, summary, state_delta,
     save_version, event_class, scene_id, tags, canon_status)
  values
    (v_worldline, '2027-04-08 11:30',
     'S03_LIVE_RAW_RECONCILIATION', v_summary,
     jsonb_build_object(
       'source_session_id', v_session,
       'source_turn_range', jsonb_build_array(1, 16),
       'source_message_order_range', jsonb_build_array(0, 41),
       'prior_save_version', 253,
       'historical_raw_state_links', 'UNCHANGED_ZERO',
       'checkpoint', v_checkpoint
     ),
     254, 'CONTINUITY', v_scene,
     array['S03', 'OBSERVED_LIVE_RAW', 'STATE_RECONCILIATION'], 'CANON')
  returning id into v_event_id;

  insert into survival_rpg.scenes
    (worldline_id, scene_id, game_time, location, participants,
     pressures, choice_summary, outcome_summary, npc_changes,
     world_changes, source_event_ids, canon_status)
  values
    (v_worldline, v_scene, '2027-04-08 11:30',
     '폐쇄 체육시설 길드권역', array['서진우', '최은채', '장태훈'],
     array['GUILD_SERVICE_CAPACITY', 'CUSTODY_AND_ACCOUNTING'],
     '숙박, 보관, 예치·정산 중 다음 투자 우선순위를 정할 차례다.',
     '점심과 고객 수리 서비스가 운영되고, 숙박 준비 집기와 반복 문의가 쌓였다. 다음 투자 우선순위는 아직 미결이다.',
     '{}'::jsonb,
     jsonb_build_object('source_session_id', v_session,
       'last_observed_turn', 16, 'historical_raw_state_links', 'UNCHANGED_ZERO'),
     array[v_event_id], 'CANON')
  returning id into v_scene_id;

  update survival_rpg.saves s
  set
    save_version = 254,
    updated_at = now(),
    state = s.state || jsonb_build_object(
      'season', 3,
      'active_arc', jsonb_build_object(
        'id', 'S03_GUILD_CLUSTER_GROWTH',
        'status', 'ACTIVE',
        'started_at', '2027-03-23 21:17',
        'current_stage', 'NEXT_INVESTMENT_DECISION',
        'checkpoint', v_checkpoint
      ),
      'runtime_index', jsonb_set(
        s.state->'runtime_index', '{current_checkpoint}', to_jsonb(v_checkpoint), true
      ),
      'known_world', jsonb_set(
        jsonb_set(
          jsonb_set(
            s.state->'known_world', '{current_focus}',
            to_jsonb(array[
              'S03 LIVE RAW through 2027-04-08 11:30; next guild investment choice remains open',
              'Guild security final command belongs to Seo Jinwoo; two candidates are on limited daytime trial duty',
              'Direct lunch and customer electrical repair services operate; lodging is not yet open',
              'Paid relocation completed and four bed frames, four mattresses, six bedding sets and one cabinet remain as lodging preparation assets',
              'Outside convoy identity and intent remain unconfirmed; private rear bases remain undisclosed'
            ]::text[]), true
          ),
          '{time}', to_jsonb('2027-04-08 11:30'::text), true
        ),
        '{location}', to_jsonb('폐쇄 체육시설 길드권역'::text), true
      ),
      'recent_events', (
        select coalesce(jsonb_agg(x.value order by x.ordinality), '[]'::jsonb)
        from (
          select value, ordinality
          from jsonb_array_elements(coalesce(s.state->'recent_events', '[]'::jsonb))
            with ordinality
          order by ordinality desc limit 4
        ) x
      ) || jsonb_build_array(jsonb_build_object(
        'id', v_event_id, 'event_type', 'S03_LIVE_RAW_RECONCILIATION',
        'game_time', '2027-04-08 11:30', 'summary', v_summary
      )),
      's03_live_checkpoint', jsonb_build_object(
        'source_session_id', v_session,
        'last_turn_no', 16,
        'last_message_order', 41,
        'last_game_time', '2027-04-08 11:30',
        'current_scene', v_scene,
        'checkpoint', v_checkpoint,
        'historical_raw_links', 'UNLINKED_PRESERVED'
      )
    ),
    gm_state = s.gm_state || jsonb_build_object(
      'current_scene', v_scene,
      'season_status',
        coalesce(s.gm_state->'season_status', '{}'::jsonb)
        || jsonb_build_object('season3', 'ACTIVE'),
      'pending_consequences', jsonb_build_array(
        jsonb_build_object('axis', 'GUILD_INVESTMENT',
          'condition', '숙박·보관·예치정산의 다음 투자 우선순위가 미결이다. 미개설 서비스를 이미 운영 중으로 취급하지 않는다.'),
        jsonb_build_object('axis', 'SECURITY',
          'condition', '경비 후보는 제한 검증 중이며 최종 지휘권은 서진우에게 있다. 후방 거점 공개는 승인되지 않았다.'),
        jsonb_build_object('axis', 'CUSTODY',
          'condition', '고객 예치재산과 길드 운영자금을 분리한다. 투자나 대출을 이미 개설한 것으로 취급하지 않는다.'),
        jsonb_build_object('axis', 'CONVOY',
          'condition', '외부 차량집단은 제한 거래를 마쳤으나 정체와 적대성은 미확정이다.')
      )
    )
  where s.worldline_id = v_worldline and s.save_version = 253;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'AFTERFALL save compare-and-swap failed';
  end if;
end;
$reconcile$;

commit;
