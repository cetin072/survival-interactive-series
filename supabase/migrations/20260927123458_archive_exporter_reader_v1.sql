-- Dedicated, passwordless-at-install read identity for linked AFTERFALL source.
-- This role can read private linked text but cannot approve or publish it.
-- Provision a login secret separately after staging verification and approval.
-- Requires the three already-applied AFTERFALL turn-link migrations copied from
-- worldline/afterfall-rpg; no existing migration is rewritten or replayed.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'archive_exporter') then
    raise exception 'archive_exporter already exists; audit it before migration'
      using errcode = '42710';
  end if;
  if to_regclass('survival_rpg.transcript_sessions') is null
    or to_regclass('survival_rpg.transcript_messages') is null
    or to_regclass('survival_rpg.transcript_turn_state_links') is null
    or to_regclass('survival_rpg.saves') is null
    or to_regprocedure('survival_rpg.lock_afterfall_authoritative_save_head(text)') is null
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'survival_rpg.transcript_turn_state_links'::regclass
        and tgname = 'enforce_afterfall_turn_state_continuity_before_insert'
        and not tgisinternal
    ) then
    raise exception 'hardened AFTERFALL linked capture is required first'
      using errcode = '55000';
  end if;
  if (select count(*) = 3 and bool_and(c.relrowsecurity and c.relforcerowsecurity)
      from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'survival_rpg' and c.relname in
        ('transcript_sessions', 'transcript_messages', 'transcript_turn_state_links'))
     is not true then
    raise exception 'forced source RLS is required' using errcode = '55000';
  end if;
end;
$$;

create role archive_exporter login nosuperuser noinherit nocreatedb
  nocreaterole noreplication nobypassrls password null;
alter role archive_exporter set default_transaction_read_only = on;
alter role archive_exporter set statement_timeout = '10s';
alter role archive_exporter set search_path = pg_catalog, survival_rpg;

do $$
begin
  execute format('grant connect on database %I to archive_exporter', current_database());
end;
$$;
grant usage on schema survival_rpg to archive_exporter;
grant select (id, worldline_id, chronicle_id, season_id, status,
  last_message_order)
  on survival_rpg.transcript_sessions to archive_exporter;
grant select (id, idempotency_key, worldline_id, chronicle_id, season_id,
  session_id, turn_no, message_order, role, content, content_sha256,
  save_version, public_safe, source_type, game_time)
  on survival_rpg.transcript_messages to archive_exporter;
grant select (worldline_id, chronicle_id, season_id, session_id, turn_no,
  user_message_id, gm_message_id, outcome, user_save_version,
  gm_save_version, linked_save_version)
  on survival_rpg.transcript_turn_state_links to archive_exporter;

create policy archive_exporter_read_sessions
  on survival_rpg.transcript_sessions for select to archive_exporter
  using (worldline_id = 'AFTERFALL' and chronicle_id = 'C03');
create policy archive_exporter_read_links
  on survival_rpg.transcript_turn_state_links for select to archive_exporter
  using (worldline_id = 'AFTERFALL' and chronicle_id = 'C03');
create policy archive_exporter_read_messages
  on survival_rpg.transcript_messages for select to archive_exporter
  using (
    worldline_id = 'AFTERFALL' and chronicle_id = 'C03'
    and public_safe is true
    and exists (
      select 1 from survival_rpg.transcript_turn_state_links as l
      where l.worldline_id = transcript_messages.worldline_id
        and l.chronicle_id = transcript_messages.chronicle_id
        and l.season_id = transcript_messages.season_id
        and l.session_id = transcript_messages.session_id
        and (l.user_message_id = transcript_messages.id
          or l.gm_message_id = transcript_messages.id)
    )
  );

do $$
begin
  if exists (select 1 from pg_auth_members as m
    where m.member = 'archive_exporter'::regrole)
    or exists (
      select 1 from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'survival_rpg' and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and (has_any_column_privilege('archive_exporter', c.oid, 'INSERT, UPDATE')
          or has_table_privilege('archive_exporter', c.oid, 'DELETE'))
    )
    or exists (
      select 1 from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'survival_rpg' and p.prosecdef
        and has_function_privilege('archive_exporter', p.oid, 'EXECUTE')
    ) then
    raise exception 'archive_exporter acquired an unsafe privilege'
      using errcode = '42501';
  end if;
end;
$$;
