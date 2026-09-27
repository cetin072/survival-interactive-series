# AFTERFALL archive exporter access proposal v1

Status: **FORWARD MIGRATION IN DRAFT #167; STAGING NOT APPLIED; NO LOGIN SECRET**

Current implementation checkpoint (2026-09-27): `supabase/migrations/20260927121600_archive_exporter_reader_v1.sql` implements the scoped role, column grants and forced-RLS policies below after the exact already-applied worldline link migration files. The isolated PostgreSQL 17 CI exercises actual role impersonation, linked versus unlinked/out-of-scope rows, denied writes and passwordless install. This does not prove a real staging login or game-room call. The role and policies have not been installed in staging. The original review proposal below remains the design record.

This proposal is the database half of the opt-in, read-only source check in Draft PR #152. The exporter handles private, unapproved USER/GM bodies. `public_safe` means a capture was screened for storage; it is not owner approval to publish. The application still returns `PENDING_PUBLIC_APPROVAL` after a valid read.

## Proposed identity and grants

- Create a dedicated `archive_exporter` PostgreSQL login with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`, no role memberships, and no database ownership. Provision its password through an approved secret mechanism, never a migration, PR, shell history or chat.
- Grant `CONNECT` on the database, `USAGE` on `survival_rpg`, and only the `SELECT` columns used by `archive/scripts/sql/afterfall-linked-capture-export.sql` on `transcript_sessions`, `transcript_messages` and `transcript_turn_state_links`. Do not grant `SELECT` on `saves`, DML, sequence access, function execution, default privileges, or membership in `service_role`/`postgres`.
- Keep RLS enabled and forced on each source table. Grant no access to `anon` or `authenticated`. This login must never be exposed to the browser or a public API route.

## Proposed row policies

| Table | Rows visible to `archive_exporter` |
| --- | --- |
| `transcript_sessions` | `worldline_id = 'AFTERFALL'` and `chronicle_id = 'C03'` only. An OPEN session may contain a previously sealed segment, so session status alone must not decide visibility. |
| `transcript_turn_state_links` | The same AFTERFALL/C03 scope only. This policy does not query messages, avoiding an RLS dependency cycle. |
| `transcript_messages` | The same scope, `public_safe IS TRUE`, and an existing state link whose `user_message_id` or `gm_message_id` equals the message ID in the same worldline, chronicle, season and session. The links policy above applies to that existence check. |

These policies restrict the source reader; they cannot confer publication approval or prove semantic correctness of a link. The fixed SQL and JavaScript admission validator still require a contiguous USER/GM range, exact IDs and hashes, authoritative save versions, complete links and bounded body sizes. `archive_exporter` would be able to read all linked public-safe AFTERFALL/C03 source rows, including unapproved text, so its credential needs private-server-only custody and rotation.

## Review and verification before activation

1. Review the exact migration SQL, schema ownership, column grants, existing policies, and any default privileges against the deployed staging schema. Do not widen `service_role`, `anon` or `authenticated` grants.
2. In staging, verify the dedicated login has `NOINHERIT`, zero memberships, no write privileges and no RLS bypass. Verify out-of-scope, unlinked and `public_safe = false` rows are invisible without returning their bodies to logs.
3. Run the opt-in check only on a newly linked, complete, owner-authorized diagnostic pair. Current S03 rows are unlinked and are not a valid test fixture. Check transaction read-only status, TLS certificate validation, bounded output and rollback behavior.
4. Obtain separate approval for any standing public-text policy and for publication. A successful restricted read changes neither the Source Manifest nor the site.

No role or policy is created by this document. Applying the security boundary needs the project owner's approval under `AGENTS.md`; the subsequent migration and staging evidence should be reviewed before any production activation.

## Proposed SQL for migration review (do not execute from this document)

The deployed staging catalog was inspected read-only on 2026-09-27: the three source tables have RLS enabled and forced, have no SELECT policies, and `archive_exporter` does not exist. A read-only `EXPLAIN` parsed the message/link visibility expression without reading any bodies. The link table comes from the separate #148 branch; its migration must be integrated before this SQL can become a migration. Database name, default privileges, callable functions, and pooler login behavior must be reviewed at application time. This proposal is intentionally outside `supabase/migrations`.

```sql
create role archive_exporter login nosuperuser noinherit nocreatedb
  nocreaterole noreplication nobypassrls password null;
alter role archive_exporter set default_transaction_read_only = on;
alter role archive_exporter set statement_timeout = '10s';
alter role archive_exporter set search_path = pg_catalog, survival_rpg;

grant connect on database postgres to archive_exporter;
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
```

The SQL gives the private exporter read access to linked source rows, **not** public visibility. The final migration needs a privilege audit for permissions inherited from `PUBLIC` and callable `SECURITY DEFINER` functions as well as a rollback plan. In staging, test the policies with the dedicated login, including negative cases, before provisioning a production secret. No password is embedded in this proposal.

`archive/scripts/sql/afterfall-exporter-access-audit.sql` is a read-only catalog preflight for that later test. It checks role attributes and memberships, every column needed by the fixed export query, absence of writes or unrelated table reads in `survival_rpg`, forced RLS, and the three dedicated policies. On 2026-09-27 it ran against staging and returned `role_exists = false`, `rls_forced = true`, and `ready_for_private_diagnostic = false`, as expected. That result validates the missing-role branch and SQL syntax only; it is not positive evidence that the proposed grants or policies work. A later true result would permit a private diagnostic, not public promotion.
