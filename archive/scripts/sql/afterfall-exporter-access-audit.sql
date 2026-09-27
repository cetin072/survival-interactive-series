-- Read-only metadata preflight for the proposed archive_exporter identity.
-- Reads catalog privileges only, never transcript rows or message bodies.
-- A true result permits a controlled private diagnostic, not publication.
with actor as (
  select oid, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
    rolreplication, rolbypassrls
  from pg_roles where rolname = 'archive_exporter'
), sources as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class as c join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'survival_rpg'
    and c.relname in ('transcript_sessions', 'transcript_messages',
      'transcript_turn_state_links')
), required_columns(relname, column_name) as (
  values
    ('transcript_sessions', 'id'),
    ('transcript_sessions', 'worldline_id'),
    ('transcript_sessions', 'chronicle_id'),
    ('transcript_sessions', 'season_id'),
    ('transcript_sessions', 'status'),
    ('transcript_sessions', 'last_message_order'),
    ('transcript_messages', 'id'),
    ('transcript_messages', 'idempotency_key'),
    ('transcript_messages', 'worldline_id'),
    ('transcript_messages', 'chronicle_id'),
    ('transcript_messages', 'season_id'),
    ('transcript_messages', 'session_id'),
    ('transcript_messages', 'turn_no'),
    ('transcript_messages', 'message_order'),
    ('transcript_messages', 'role'),
    ('transcript_messages', 'content'),
    ('transcript_messages', 'content_sha256'),
    ('transcript_messages', 'save_version'),
    ('transcript_messages', 'public_safe'),
    ('transcript_messages', 'source_type'),
    ('transcript_messages', 'game_time'),
    ('transcript_turn_state_links', 'worldline_id'),
    ('transcript_turn_state_links', 'chronicle_id'),
    ('transcript_turn_state_links', 'season_id'),
    ('transcript_turn_state_links', 'session_id'),
    ('transcript_turn_state_links', 'turn_no'),
    ('transcript_turn_state_links', 'user_message_id'),
    ('transcript_turn_state_links', 'gm_message_id'),
    ('transcript_turn_state_links', 'outcome'),
    ('transcript_turn_state_links', 'user_save_version'),
    ('transcript_turn_state_links', 'gm_save_version'),
    ('transcript_turn_state_links', 'linked_save_version')
), checks as (
  select exists (select 1 from actor) as role_exists,
    coalesce((select not (rolsuper or rolinherit or rolcreaterole
      or rolcreatedb or rolreplication or rolbypassrls) from actor), false)
      as role_attributes_safe,
    coalesce((select not exists (
      select 1 from pg_auth_members as am where am.member = actor.oid
    ) from actor), false) as no_role_memberships,
    coalesce((select has_schema_privilege(oid, 'survival_rpg', 'USAGE')
      from actor), false) as schema_usage_granted,
    coalesce((select has_column_privilege(oid,
      'survival_rpg.transcript_messages'::regclass, 'content', 'SELECT')
      from actor), false) as source_body_read_granted,
    coalesce((select not exists (
      select 1 from required_columns as rc
      join sources as s on s.relname = rc.relname
      where not has_column_privilege(a.oid, s.oid, rc.column_name, 'SELECT')
    ) from actor as a), false) as required_columns_readable,
    coalesce((select not exists (
      select 1 from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'survival_rpg'
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and (has_any_column_privilege(a.oid, c.oid, 'INSERT, UPDATE')
          or has_table_privilege(a.oid, c.oid, 'DELETE'))
    ) from actor as a), false) as schema_writes_denied,
    coalesce((select not exists (
      select 1 from pg_class as c
      join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'survival_rpg'
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
        and c.oid not in (select oid from sources)
        and has_any_column_privilege(a.oid, c.oid, 'SELECT')
    ) from actor as a), false) as other_source_reads_denied,
    (select count(*) = 3 and bool_and(relrowsecurity and relforcerowsecurity)
      from sources) as rls_forced,
    (select count(*) = 3 from pg_policy as p
      join sources as s on s.oid = p.polrelid
      cross join actor as a
      where p.polcmd = 'r' and a.oid = any(p.polroles)
        and (s.relname, p.polname) in (
          ('transcript_sessions', 'archive_exporter_read_sessions'),
          ('transcript_messages', 'archive_exporter_read_messages'),
          ('transcript_turn_state_links', 'archive_exporter_read_links')
        )) as dedicated_select_policies_present,
    (select count(*) = 3 from pg_policy as p
      join sources as s on s.oid = p.polrelid) as no_other_source_policies
)
select *, (role_exists and role_attributes_safe and no_role_memberships
  and schema_usage_granted and source_body_read_granted
  and required_columns_readable
  and schema_writes_denied and other_source_reads_denied and rls_forced
  and dedicated_select_policies_present and no_other_source_policies)
  as ready_for_private_diagnostic
from checks;
