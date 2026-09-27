-- PostgreSQL 17 isolated test. Synthetic rows only; never run against staging.
begin;

insert into survival_rpg.saves (worldline_id, save_version)
values ('AFTERFALL', 253);
insert into survival_rpg.transcript_sessions
  (id, worldline_id, chronicle_id, season_id, last_message_order)
values
  ('11111111-1111-4111-8111-111111111111', 'AFTERFALL', 'C03', 'S99', 3),
  ('22222222-2222-4222-8222-222222222222', 'OTHER', 'C99', 'S99', 1);
insert into survival_rpg.transcript_messages
  (id, worldline_id, chronicle_id, season_id, session_id, turn_no,
   message_order, role, content, content_sha256, save_version,
   idempotency_key)
values
  ('10000000-0000-4000-8000-000000000001', 'AFTERFALL', 'C03', 'S99',
   '11111111-1111-4111-8111-111111111111', 1, 0, 'USER',
   'synthetic linked user',
   '117b6b9f1e01ac02d23d3eed7c1a01223c7107bbfd133e6a6968282ff6664282', 253,
   '30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', 'AFTERFALL', 'C03', 'S99',
   '11111111-1111-4111-8111-111111111111', 1, 1, 'GM',
   'synthetic linked gm',
   '7a92b031edac305119b4e820f66f85e1f7ef8bd73d6219d1b31daf17fb18f067', 253,
   '30000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003', 'AFTERFALL', 'C03', 'S99',
   '11111111-1111-4111-8111-111111111111', 2, 2, 'USER',
   'synthetic unlinked user', repeat('c', 64), 253,
   '30000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004', 'AFTERFALL', 'C03', 'S99',
   '11111111-1111-4111-8111-111111111111', 2, 3, 'GM',
   'synthetic unlinked gm', repeat('d', 64), 253,
   '30000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000001', 'OTHER', 'C99', 'S99',
   '22222222-2222-4222-8222-222222222222', 1, 0, 'USER',
   'synthetic other user', repeat('e', 64), 253,
   '40000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'OTHER', 'C99', 'S99',
   '22222222-2222-4222-8222-222222222222', 1, 1, 'GM',
   'synthetic other gm', repeat('f', 64), 253,
   '40000000-0000-4000-8000-000000000002');
insert into survival_rpg.transcript_turn_state_links
  (worldline_id, chronicle_id, season_id, session_id, turn_no,
   user_message_id, gm_message_id, outcome, user_save_version,
   gm_save_version, linked_save_version)
values ('AFTERFALL', 'C03', 'S99', '11111111-1111-4111-8111-111111111111',
  1, '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'NO_STATE_CHANGE', 253, 253, 253);

do $$
begin
  if (select rolcanlogin is not true or rolinherit or rolsuper or rolbypassrls
      or rolcreaterole or rolcreatedb or rolreplication
      from pg_roles where rolname = 'archive_exporter') then
    raise exception 'archive_exporter role attributes are unsafe';
  end if;
  if (select rolpassword is not null from pg_authid
      where rolname = 'archive_exporter') then
    raise exception 'migration must not install a login secret';
  end if;
  if exists (select 1 from pg_auth_members
      where member = 'archive_exporter'::regrole) then
    raise exception 'archive_exporter has inherited membership';
  end if;
  if has_table_privilege('archive_exporter', 'survival_rpg.saves', 'SELECT')
    or has_table_privilege('archive_exporter', 'survival_rpg.transcript_messages', 'INSERT')
    or has_table_privilege('archive_exporter', 'survival_rpg.transcript_messages', 'UPDATE')
    or has_table_privilege('archive_exporter', 'survival_rpg.transcript_turn_state_links', 'INSERT') then
    raise exception 'archive_exporter acquired source write or save read privilege';
  end if;
end;
$$;

set local role archive_exporter;
do $$
begin
  if (select count(*) from survival_rpg.transcript_sessions) <> 1
    or (select count(*) from survival_rpg.transcript_turn_state_links) <> 1
    or (select count(*) from survival_rpg.transcript_messages) <> 2 then
    raise exception 'exporter RLS leaked unrelated or unlinked rows';
  end if;
  begin
    insert into survival_rpg.transcript_messages
      (worldline_id, chronicle_id, season_id, session_id, turn_no,
       message_order, role, content, content_sha256, idempotency_key)
    values ('AFTERFALL', 'C03', 'S99',
      '11111111-1111-4111-8111-111111111111', 3, 4, 'USER',
      'must be denied', repeat('a', 64),
      '50000000-0000-4000-8000-000000000001');
    raise exception 'exporter insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Keep only these synthetic rows in the ephemeral CI database for the actual
-- node-postgres login test that follows. Never run this fixture on staging.
commit;
