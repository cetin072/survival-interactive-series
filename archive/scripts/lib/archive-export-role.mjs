/** Shared least-privilege admission; no fallback to service_role. */
const insist = (ok, code) => { if (!ok) throw new Error(code) }
export async function assertRestrictedExportRole(client) {
    const role = (await client.query(`select current_user::text as role_name, session_user::text as session_role,
      current_setting('transaction_read_only')::text as read_only, r.rolsuper, r.rolbypassrls,
      r.rolcreaterole, r.rolcreatedb, r.rolreplication,
      has_table_privilege(current_user,'survival_rpg.transcript_messages','SELECT') as can_read_messages,
      has_table_privilege(current_user,'survival_rpg.transcript_sessions','SELECT') as can_read_sessions,
      has_table_privilege(current_user,'survival_rpg.transcript_turn_state_links','SELECT') as can_read_links,
      has_table_privilege(current_user,'survival_rpg.transcript_messages','INSERT,UPDATE,DELETE') as can_write_messages,
      has_table_privilege(current_user,'survival_rpg.transcript_sessions','INSERT,UPDATE,DELETE') as can_write_sessions,
      has_table_privilege(current_user,'survival_rpg.transcript_turn_state_links','INSERT,UPDATE,DELETE') as can_write_links,
      (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='survival_rpg' and c.relkind in ('r','p','v','m')
          and c.relname not in ('transcript_messages','transcript_sessions','transcript_turn_state_links')
          and has_table_privilege(current_user,c.oid,'SELECT')) as other_source_selects
      from pg_roles r where r.rolname=current_user`)).rows[0]
    insist(role?.role_name === 'archive_exporter' && role.session_role === 'archive_exporter'
      && role.read_only === 'on' && role.rolsuper === false && role.rolbypassrls === false
      && role.rolcreaterole === false && role.rolcreatedb === false && role.rolreplication === false
      && role.can_read_messages === true && role.can_read_sessions === true && role.can_read_links === true
      && role.can_write_messages === false && role.can_write_sessions === false
      && role.can_write_links === false && role.other_source_selects === 0,
    'RESTRICTED_EXPORT_ROLE_REQUIRED')
}
