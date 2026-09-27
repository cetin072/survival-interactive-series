# AFTERFALL archive exporter access proposal v1

Status: **REVIEW PROPOSAL ONLY — NO ROLE, GRANT, RLS POLICY OR SECRET APPLIED**

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
