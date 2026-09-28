-- Keep the Archive exporter limited to public AFTERFALL transcript reads.
-- The role itself is created/hardened by earlier tracked migrations. This
-- migration intentionally does not CREATE/ALTER roles because hosted Supabase
-- migration execution may not have cluster-level role-management privileges.
-- The operator sets the login password outside migrations and stores its URL
-- in the ARCHIVE_EXPORT_DATABASE_URL repository secret.

do $$
declare
  role_row record;
begin
  select rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
         rolreplication, rolinherit, rolconfig
    into role_row
    from pg_roles
    where rolname = 'archive_exporter';

  if not found then
    raise exception 'archive_exporter role is missing; apply earlier Archive exporter role migrations first';
  end if;

  if role_row.rolcanlogin is not true
     or role_row.rolsuper is true
     or role_row.rolbypassrls is true
     or role_row.rolcreatedb is true
     or role_row.rolcreaterole is true
     or role_row.rolreplication is true
     or role_row.rolinherit is true
     or not coalesce('default_transaction_read_only=on' = any(role_row.rolconfig), false)
     or not coalesce('statement_timeout=10s' = any(role_row.rolconfig), false) then
    raise exception 'archive_exporter role does not satisfy the restricted read-only contract';
  end if;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles member_role on member_role.oid = m.member
    where member_role.rolname = 'archive_exporter'
  ) then
    raise exception 'archive_exporter must not inherit membership from another role';
  end if;

  if not has_database_privilege('archive_exporter', current_database(), 'CONNECT') then
    raise exception 'archive_exporter CONNECT privilege is missing';
  end if;
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
