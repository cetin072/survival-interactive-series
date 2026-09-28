-- Run with a trusted PostgreSQL role after applying
-- 20260928050000_archive_exporter_readonly.sql. All fixture changes roll back.
-- A superuser connection is required to exercise FORCE ROW LEVEL SECURITY and
-- briefly bypass the existing public_safe CHECK for the private-row test.
\set ON_ERROR_STOP on

begin;

do $$
declare
  role_row record;
  message_policy text;
  session_policy text;
  link_policy text;
begin
  select rolsuper, rolbypassrls, rolcanlogin, rolinherit, rolconfig
    into role_row from pg_roles where rolname = 'archive_exporter';
  if not found or role_row.rolsuper or role_row.rolbypassrls or not role_row.rolcanlogin
     or role_row.rolinherit
     or not coalesce('default_transaction_read_only=on' = any(role_row.rolconfig), false)
     or not coalesce('statement_timeout=10s' = any(role_row.rolconfig), false) then
    raise exception 'archive_exporter role contract failed';
  end if;

  if not has_table_privilege('archive_exporter', 'survival_rpg.transcript_messages', 'SELECT')
     or not has_table_privilege('archive_exporter', 'survival_rpg.transcript_sessions', 'SELECT')
     or not has_table_privilege('archive_exporter', 'survival_rpg.transcript_turn_state_links', 'SELECT') then
    raise exception 'archive_exporter SELECT grants are incomplete';
  end if;

  if has_table_privilege('archive_exporter', 'survival_rpg.transcript_messages', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('archive_exporter', 'survival_rpg.transcript_sessions', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('archive_exporter', 'survival_rpg.transcript_turn_state_links', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'archive_exporter has an unexpected table privilege';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'survival_rpg'
      and table_name in ('transcript_messages','transcript_sessions','transcript_turn_state_links')
      and has_column_privilege('archive_exporter',
        format('%I.%I', table_schema, table_name), column_name,
        'INSERT,UPDATE,REFERENCES')
  ) then
    raise exception 'archive_exporter has an unexpected column write privilege';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'survival_rpg' and c.relkind in ('r','p','v','m')
      and c.relname not in ('transcript_messages','transcript_sessions','transcript_turn_state_links')
      and has_table_privilege('archive_exporter', c.oid, 'SELECT')
  ) then
    raise exception 'archive_exporter can read an unapproved survival_rpg relation';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid) into message_policy
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'survival_rpg' and c.relname = 'transcript_messages'
      and pol.polname = 'archive_exporter_read_messages' and pol.polcmd = 'r';
  select pg_get_expr(pol.polqual, pol.polrelid) into session_policy
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'survival_rpg' and c.relname = 'transcript_sessions'
      and pol.polname = 'archive_exporter_read_sessions' and pol.polcmd = 'r';
  select pg_get_expr(pol.polqual, pol.polrelid) into link_policy
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'survival_rpg' and c.relname = 'transcript_turn_state_links'
      and pol.polname = 'archive_exporter_read_links' and pol.polcmd = 'r';

  if message_policy is null or message_policy not like '%worldline_id%AFTERFALL%'
     or message_policy not like '%chronicle_id%C03%'
     or message_policy not ilike '%public_safe%true%'
     or message_policy ilike '%exists%' then
    raise exception 'message RLS policy does not permit optional state links safely';
  end if;
  if session_policy is null or session_policy not like '%worldline_id%AFTERFALL%'
     or session_policy not like '%chronicle_id%C03%' then
    raise exception 'session RLS scope is not C03 AFTERFALL';
  end if;
  if link_policy is null or link_policy not like '%worldline_id%AFTERFALL%'
     or link_policy not like '%chronicle_id%C03%' then
    raise exception 'state-link RLS scope is not C03 AFTERFALL';
  end if;
end;
$$;

-- The production schema disallows storing public_safe=false. Drop and restore
-- that CHECK as NOT VALID only inside this transaction so the policy itself can
-- be exercised against one false row. The transaction rollback restores it.
alter table survival_rpg.transcript_messages
  drop constraint transcript_messages_public_safe_check;

insert into survival_rpg.transcript_sessions (id, worldline_id, chronicle_id, season_id)
values
  ('00000000-0000-4000-8000-00000000e001', 'AFTERFALL', 'C03', 'S03'),
  ('00000000-0000-4000-8000-00000000e002', 'OTHER', 'C03', 'S03'),
  ('00000000-0000-4000-8000-00000000e003', 'AFTERFALL', 'C99', 'S03');

insert into survival_rpg.transcript_messages (
  id, worldline_id, chronicle_id, season_id, session_id, turn_no, message_order,
  role, content, content_sha256, idempotency_key, public_safe
) values
  ('00000000-0000-4000-8000-00000000e101', 'AFTERFALL', 'C03', 'S03', '00000000-0000-4000-8000-00000000e001', 1, 0, 'USER', 'public without link user', repeat('a',64), '00000000-0000-4000-8000-00000000f101', true),
  ('00000000-0000-4000-8000-00000000e102', 'AFTERFALL', 'C03', 'S03', '00000000-0000-4000-8000-00000000e001', 1, 1, 'GM', 'public without link gm', repeat('b',64), '00000000-0000-4000-8000-00000000f102', true),
  ('00000000-0000-4000-8000-00000000e103', 'AFTERFALL', 'C03', 'S03', '00000000-0000-4000-8000-00000000e001', 2, 2, 'USER', 'public with link user', repeat('c',64), '00000000-0000-4000-8000-00000000f103', true),
  ('00000000-0000-4000-8000-00000000e104', 'AFTERFALL', 'C03', 'S03', '00000000-0000-4000-8000-00000000e001', 2, 3, 'GM', 'public with link gm', repeat('d',64), '00000000-0000-4000-8000-00000000f104', true),
  ('00000000-0000-4000-8000-00000000e105', 'AFTERFALL', 'C03', 'S03', '00000000-0000-4000-8000-00000000e001', 3, 4, 'GM', 'private row', repeat('e',64), '00000000-0000-4000-8000-00000000f105', false),
  ('00000000-0000-4000-8000-00000000e106', 'AFTERFALL', 'C99', 'S03', '00000000-0000-4000-8000-00000000e003', 4, 5, 'GM', 'wrong chronicle row', repeat('f',64), '00000000-0000-4000-8000-00000000f106', true),
  ('00000000-0000-4000-8000-00000000e107', 'OTHER', 'C03', 'S03', '00000000-0000-4000-8000-00000000e002', 5, 6, 'GM', 'wrong worldline row', repeat('1',64), '00000000-0000-4000-8000-00000000f107', true);

alter table survival_rpg.transcript_messages
  add constraint transcript_messages_public_safe_check check (public_safe) not valid;

insert into survival_rpg.transcript_turn_state_links (
  worldline_id, chronicle_id, season_id, session_id, turn_no,
  user_message_id, gm_message_id, outcome,
  user_save_version, gm_save_version, linked_save_version
) values (
  'AFTERFALL', 'C03', 'S03', '00000000-0000-4000-8000-00000000e001', 2,
  '00000000-0000-4000-8000-00000000e103', '00000000-0000-4000-8000-00000000e104',
  'APPLIED', 1, 2, 2
);

set local role archive_exporter;

do $$
declare
  visible_without_link integer;
  visible_with_link integer;
  visible_private integer;
  visible_wrong_chronicle integer;
  visible_wrong_worldline integer;
  visible_sessions integer;
  visible_links integer;
begin
  select count(*) into visible_without_link from survival_rpg.transcript_messages
    where id in ('00000000-0000-4000-8000-00000000e101','00000000-0000-4000-8000-00000000e102');
  select count(*) into visible_with_link from survival_rpg.transcript_messages
    where id in ('00000000-0000-4000-8000-00000000e103','00000000-0000-4000-8000-00000000e104');
  select count(*) into visible_private from survival_rpg.transcript_messages
    where id = '00000000-0000-4000-8000-00000000e105';
  select count(*) into visible_wrong_chronicle from survival_rpg.transcript_messages
    where id = '00000000-0000-4000-8000-00000000e106';
  select count(*) into visible_wrong_worldline from survival_rpg.transcript_messages
    where id = '00000000-0000-4000-8000-00000000e107';
  select count(*) into visible_sessions from survival_rpg.transcript_sessions
    where id in ('00000000-0000-4000-8000-00000000e001','00000000-0000-4000-8000-00000000e002','00000000-0000-4000-8000-00000000e003');
  select count(*) into visible_links from survival_rpg.transcript_turn_state_links
    where session_id = '00000000-0000-4000-8000-00000000e001' and turn_no = 2;

  if visible_without_link <> 2 or visible_with_link <> 2
     or visible_private <> 0 or visible_wrong_chronicle <> 0
     or visible_wrong_worldline <> 0 or visible_sessions <> 1 or visible_links <> 1 then
    raise exception 'archive_exporter RLS fixture visibility failed';
  end if;

  begin
    insert into survival_rpg.transcript_messages (
      worldline_id, chronicle_id, season_id, session_id, turn_no, message_order,
      role, content, content_sha256, idempotency_key
    ) values (
      'AFTERFALL', 'C03', 'S03', '00000000-0000-4000-8000-00000000e001', 9, 9,
      'GM', 'must be denied', repeat('2',64), '00000000-0000-4000-8000-00000000f109'
    );
    raise exception 'archive_exporter INSERT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update survival_rpg.transcript_messages set content = 'must be denied'
      where id = '00000000-0000-4000-8000-00000000e101';
    raise exception 'archive_exporter UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from survival_rpg.transcript_messages where id = '00000000-0000-4000-8000-00000000e101';
    raise exception 'archive_exporter DELETE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
