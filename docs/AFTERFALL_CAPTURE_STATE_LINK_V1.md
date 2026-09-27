# AFTERFALL atomic turn state links v1

Status: **ADDITIVE DATABASE CONTRACT / ROOM CALLER NOT VERIFIED**

Migration: `supabase/migrations/20260926162611_afterfall_atomic_turn_state_link_v1.sql`
Connected staging migration: `20260926162611` (`afterfall_atomic_turn_state_link_v1`)

## Contract

`append_public_transcript_turn_with_state_link(...)` extends the current atomic
USER/GM append path with a required `APPLIED` or `NO_STATE_CHANGE` assertion and
non-null user/GM save versions. It locks the current AFTERFALL save row, checks
that the submitted GM version is the database's current save head, appends both
exact transcript messages, then inserts an immutable turn-to-save link in the
same PostgreSQL transaction. A failure rolls back the pair and link together.

The link table is scoped to `C03` / `AFTERFALL`, has RLS enabled and forced, and
has no grants to `anon` or `authenticated`. The function is `SECURITY INVOKER`
with a pinned `search_path` and EXECUTE limited to `service_role`. It does not
read or publish transcript bodies through a new exporter.

The function does not update `saves`, prove the semantic truth of the outcome,
or classify a turn as public Archive content. `outcome` is the trusted capture
caller's assertion; `linked_save_version` records the save head observed while
the function holds the row lock. Visibility and provenance review remain
separate. No game-room client or scheduled runner has been shown to call this
function, so adding the SQL contract alone does not establish automatic
capture.

## Compatibility and recovery

The existing `append_public_transcript_turn(...)` remains available for older
capture clients and historical recovery. It may continue to store unlinked
RAW. Those rows have no entry in `transcript_turn_state_links` and remain
quarantined from any publication path that requires state reconciliation.
Already stored RAW rows are not updated or relinked by this migration.

An exact retry uses the same session, turn, order, content, hashes, and both
idempotency UUIDs. Existing link fields and returned message identities must
match. A later current save version does not prevent a retry of an already
linked turn; an unlinked turn cannot be attached to a stale save head.

## Verification limits

`tools/test_afterfall_turn_state_link_sql.py` checks the source migration's
scope, grants, transaction structure, and retry guards.
`supabase/tests/afterfall_atomic_turn_state_link_v1_verification.sql` checks
installed function/table ACLs and RLS using read-only catalog queries. It has
passed on the connected staging project.
They do not prove that ChatGPT game rooms or a trusted external runtime invoke
the API. A real game-room capture and safe public exporter still require their
own authenticated integration and end-to-end evidence.

## Adjacent-turn save-version continuity

Migration `20260927042720_afterfall_turn_state_continuity_v1.sql` adds a
`BEFORE INSERT` trigger without editing or re-running the already-applied v1
migration. When an adjacent linked turn exists, the new USER save version must
equal that prior turn's GM save version. An already-inserted successor is also
checked, so inserting links out of order cannot bypass the rule. Both backward
movement and unexplained forward gaps are rejected.

The trigger validates adjacent linked pairs only. It does not invent a link
across an existing unlinked RAW gap, update old rows, or approve publication.
The migration and its read-only catalog verifier are code-only and have not
been deployed to staging; the connected database still has zero state-link
rows for the existing S03 capture.

