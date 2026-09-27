-- Synthetic behavioral checks for the additive AFTERFALL trigger upgrade.
-- This runs only in the disposable PostgreSQL CI fixture.
insert into survival_rpg.saves (worldline_id, save_version)
values ('AFTERFALL', 11);

insert into survival_rpg.transcript_sessions (
  id, worldline_id, chronicle_id, season_id, status, last_message_order
) values (
  '10000000-0000-4000-8000-000000000001', 'AFTERFALL', 'C03', 'S03', 'OPEN', 3
);

insert into survival_rpg.transcript_sessions (
  id, worldline_id, chronicle_id, season_id, status, last_message_order
) values (
  '10000000-0000-4000-8000-000000000002', 'AFTERFALL', 'C03', 'S03', 'OPEN', 1
), (
  '10000000-0000-4000-8000-000000000003', 'AFTERFALL', 'C03', 'S03', 'OPEN', 5
);

insert into survival_rpg.transcript_sessions (
  id, worldline_id, chronicle_id, season_id, status, last_message_order
) values (
  '10000000-0000-4000-8000-000000000004', 'AFTERFALL', 'C03', 'S03', 'OPEN', -1
);

insert into survival_rpg.transcript_messages (
  id, worldline_id, chronicle_id, season_id, session_id,
  turn_no, message_order, role, save_version
) values
  ('20000000-0000-4000-8000-000000000001', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000001', 0, 0, 'USER', 10),
  ('20000000-0000-4000-8000-000000000002', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000001', 0, 1, 'GM', 11),
  ('20000000-0000-4000-8000-000000000003', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000001', 1, 2, 'USER', 11),
  ('20000000-0000-4000-8000-000000000004', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000001', 1, 3, 'GM', 12),
  ('20000000-0000-4000-8000-000000000005', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000001', 2, 4, 'USER', 12),
  ('20000000-0000-4000-8000-000000000006', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000001', 2, 5, 'GM', 13),
  ('20000000-0000-4000-8000-000000000007', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000001', 3, 6, 'GM', 13),
  ('20000000-0000-4000-8000-000000000008', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000001', 3, 7, 'USER', 12),
  ('20000000-0000-4000-8000-000000000009', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000002', 0, 0, 'USER', 13),
  ('20000000-0000-4000-8000-000000000010', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000002', 0, 1, 'GM', 13),
  ('20000000-0000-4000-8000-000000000011', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000003', 0, 4, 'USER', 13),
  ('20000000-0000-4000-8000-000000000012', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000003', 0, 5, 'GM', 13),
  ('20000000-0000-4000-8000-000000000013', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000003', 1, 2, 'USER', 13),
  ('20000000-0000-4000-8000-000000000014', 'AFTERFALL', 'C03', 'S03',
   '10000000-0000-4000-8000-000000000003', 1, 3, 'GM', 13);

-- Exercise the trigger under the same restricted database role used by the
-- capture RPC. This verifies its invoker privileges as well as its behavior.
set role service_role;

-- A valid linked pair is accepted at the current save head.
insert into survival_rpg.transcript_turn_state_links (
  worldline_id, chronicle_id, season_id, session_id, turn_no,
  user_message_id, gm_message_id, outcome,
  user_save_version, gm_save_version, linked_save_version
) values (
  'AFTERFALL', 'C03', 'S03', '10000000-0000-4000-8000-000000000001', 0,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
  'APPLIED', 10, 11, 11
);

-- The next adjacent pair is accepted only after the authoritative head advances.
reset role;
update survival_rpg.saves set save_version = 12 where worldline_id = 'AFTERFALL';
set role service_role;
insert into survival_rpg.transcript_turn_state_links (
  worldline_id, chronicle_id, season_id, session_id, turn_no,
  user_message_id, gm_message_id, outcome,
  user_save_version, gm_save_version, linked_save_version
) values (
  'AFTERFALL', 'C03', 'S03', '10000000-0000-4000-8000-000000000001', 1,
  '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004',
  'APPLIED', 11, 12, 12
);

do $$
declare
  v_rejected boolean;
begin
  v_rejected := false;
  begin
    insert into survival_rpg.transcript_turn_state_links (
      worldline_id, chronicle_id, season_id, session_id, turn_no,
      user_message_id, gm_message_id, outcome,
      user_save_version, gm_save_version, linked_save_version
    ) values (
      'AFTERFALL', 'C03', 'S03', '10000000-0000-4000-8000-000000000001', 2,
      '20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000006',
      'APPLIED', 12, 13, 13
    );
  exception when sqlstate '22023' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'link at a stale save head was accepted';
  end if;
end;
$$;

reset role;
update survival_rpg.saves set save_version = 13 where worldline_id = 'AFTERFALL';
set role service_role;

do $$
declare
  v_rejected boolean;
begin
  if has_table_privilege(current_user, 'survival_rpg.saves', 'SELECT')
     or has_table_privilege(current_user, 'survival_rpg.saves', 'UPDATE')
     or has_table_privilege(current_user, 'survival_rpg.transcript_messages', 'UPDATE')
     or has_table_privilege(current_user, 'survival_rpg.transcript_turn_state_links', 'UPDATE') then
    raise exception 'service_role gained direct save or transcript update privileges';
  end if;

  v_rejected := false;
  begin
    insert into survival_rpg.transcript_turn_state_links (
      worldline_id, chronicle_id, season_id, session_id, turn_no,
      user_message_id, gm_message_id, outcome,
      user_save_version, gm_save_version, linked_save_version
    ) values (
      'AFTERFALL', 'C03', 'S03', '10000000-0000-4000-8000-000000000001', 2,
      '20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000007',
      'APPLIED', 12, 13, 13
    );
  exception when sqlstate '22023' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'link with mismatched turn/message chronology was accepted';
  end if;

  v_rejected := false;
  begin
    insert into survival_rpg.transcript_turn_state_links (
      worldline_id, chronicle_id, season_id, session_id, turn_no,
      user_message_id, gm_message_id, outcome,
      user_save_version, gm_save_version, linked_save_version
    ) values (
      'AFTERFALL', 'C03', 'S03', '10000000-0000-4000-8000-000000000001', 2,
      '20000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000007',
      'APPLIED', 12, 13, 13
    );
  exception when sqlstate '22023' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'link with reversed USER/GM roles was accepted';
  end if;
end;
$$;

-- A verified NO_STATE_CHANGE pair remains valid at the same save head.
insert into survival_rpg.transcript_turn_state_links (
  worldline_id, chronicle_id, season_id, session_id, turn_no,
  user_message_id, gm_message_id, outcome,
  user_save_version, gm_save_version, linked_save_version
) values (
  'AFTERFALL', 'C03', 'S03', '10000000-0000-4000-8000-000000000002', 0,
  '20000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000010',
  'NO_STATE_CHANGE', 13, 13, 13
);

-- A successor inserted first is accepted, but a later predecessor cannot
-- claim earlier turn identity with message orders that reverse that pair.
insert into survival_rpg.transcript_turn_state_links (
  worldline_id, chronicle_id, season_id, session_id, turn_no,
  user_message_id, gm_message_id, outcome,
  user_save_version, gm_save_version, linked_save_version
) values (
  'AFTERFALL', 'C03', 'S03', '10000000-0000-4000-8000-000000000003', 1,
  '20000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000014',
  'NO_STATE_CHANGE', 13, 13, 13
);

do $$
declare
  v_rejected boolean := false;
begin
  begin
    insert into survival_rpg.transcript_turn_state_links (
      worldline_id, chronicle_id, season_id, session_id, turn_no,
      user_message_id, gm_message_id, outcome,
      user_save_version, gm_save_version, linked_save_version
    ) values (
      'AFTERFALL', 'C03', 'S03', '10000000-0000-4000-8000-000000000003', 0,
      '20000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000012',
      'NO_STATE_CHANGE', 13, 13, 13
    );
  exception when sqlstate '22023' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'out-of-order predecessor with reversed message chronology was accepted';
  end if;
end;
$$;

-- The installed invoker RPC must still append both rows and a link under the
-- actual service_role grants, without UPDATE access to saves or transcript rows.
do $$
declare
  v_first record;
  v_retry record;
  v_link_count integer;
begin
  select * into v_first
  from survival_rpg.append_public_transcript_turn_with_state_link(
    '10000000-0000-4000-8000-000000000004', 'AFTERFALL', 'C03', 'S03', 0, 0,
    'fixture USER message', repeat('a', 64), '30000000-0000-4000-8000-000000000001',
    'fixture GM message', repeat('b', 64), '30000000-0000-4000-8000-000000000002',
    '2027-03-23 10:00', 'S03-SCENE-001', 12,
    '2027-03-23 10:01', 'S03-SCENE-001', 13, 'LIVE', 'APPLIED'
  );

  select * into v_retry
  from survival_rpg.append_public_transcript_turn_with_state_link(
    '10000000-0000-4000-8000-000000000004', 'AFTERFALL', 'C03', 'S03', 0, 0,
    'fixture USER message', repeat('a', 64), '30000000-0000-4000-8000-000000000001',
    'fixture GM message', repeat('b', 64), '30000000-0000-4000-8000-000000000002',
    '2027-03-23 10:00', 'S03-SCENE-001', 12,
    '2027-03-23 10:01', 'S03-SCENE-001', 13, 'LIVE', 'APPLIED'
  );

  if v_first.user_message_id is distinct from v_retry.user_message_id
     or v_first.gm_message_id is distinct from v_retry.gm_message_id then
    raise exception 'atomic capture retry changed message identities';
  end if;

  select count(*) into v_link_count
  from survival_rpg.transcript_turn_state_links as l
  where l.session_id = '10000000-0000-4000-8000-000000000004'
    and l.turn_no = 0;
  if v_link_count <> 1 then
    raise exception 'atomic capture retry created duplicate state links';
  end if;
end;
$$;

reset role;
