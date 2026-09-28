-- Keep the Archive exporter limited to public AFTERFALL transcript reads.
-- The operator sets the login password outside migrations and stores its URL
-- in the ARCHIVE_EXPORT_DATABASE_URL repository secret.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'archive_exporter') then
    create role archive_exporter login;
  end if;
end;
$$;

alter role archive_exporter
  login nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit;
alter role archive_exporter set default_transaction_read_only = 'on';
alter role archive_exporter set statement_timeout = '10s';

do $$
declare
  membership record;
begin
  for membership in
    select granted.rolname
    from pg_auth_members m
    join pg_roles member_role on member_role.oid = m.member
    join pg_roles granted on granted.oid = m.roleid
    where member_role.rolname = 'archive_exporter'
  loop
    execute format('revoke %I from archive_exporter', membership.rolname);
  end loop;
  execute format('grant connect on database %I to archive_exporter', current_database());
end;
$$;

grant usage on schema survival_rpg to archive_exporter;

revoke all privileges on table
  survival_rpg.transcript_messages,
  survival_rpg.transcript_sessions,
  survival_rpg.transcript_turn_state_links
from public, anon, authenticated;

revoke all privileges on table
  survival_rpg.transcript_messages,
  survival_rpg.transcript_sessions,
  survival_rpg.transcript_turn_state_links
from archive_exporter;

do $$
declare
  column_row record;
begin
  for column_row in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'survival_rpg'
      and table_name in ('transcript_messages','transcript_sessions','transcript_turn_state_links')
  loop
    execute format('revoke all (%I) on table survival_rpg.%I from archive_exporter',
      column_row.column_name, column_row.table_name);
  end loop;
end;
$$;

grant select on table
  survival_rpg.transcript_messages,
  survival_rpg.transcript_sessions,
  survival_rpg.transcript_turn_state_links
to archive_exporter;

alter table survival_rpg.transcript_messages enable row level security;
alter table survival_rpg.transcript_messages force row level security;
alter table survival_rpg.transcript_sessions enable row level security;
alter table survival_rpg.transcript_sessions force row level security;
alter table survival_rpg.transcript_turn_state_links enable row level security;
alter table survival_rpg.transcript_turn_state_links force row level security;

drop policy if exists archive_exporter_read_messages on survival_rpg.transcript_messages;
create policy archive_exporter_read_messages
  on survival_rpg.transcript_messages
  for select to archive_exporter
  using (worldline_id = 'AFTERFALL' and chronicle_id = 'C03' and public_safe is true);

drop policy if exists archive_exporter_read_sessions on survival_rpg.transcript_sessions;
create policy archive_exporter_read_sessions
  on survival_rpg.transcript_sessions
  for select to archive_exporter
  using (worldline_id = 'AFTERFALL' and chronicle_id = 'C03');

drop policy if exists archive_exporter_read_links on survival_rpg.transcript_turn_state_links;
create policy archive_exporter_read_links
  on survival_rpg.transcript_turn_state_links
  for select to archive_exporter
  using (worldline_id = 'AFTERFALL' and chronicle_id = 'C03');
