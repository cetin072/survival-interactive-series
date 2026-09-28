# AFTERFALL daily Archive setup

The runner defaults to `SHADOW`. It reads source rows through `archive_exporter`, creates one proposal PR, and never writes to the gameplay database. Keep `archive/automation/config.json` at `SHADOW` until the first real source proposal has been reviewed.

## Supabase exporter

Apply `supabase/migrations/20260928050000_archive_exporter_readonly.sql` through the repository's normal Supabase migration process. It grants `SELECT` on only the three transcript tables and scopes their RLS policies to public C03 AFTERFALL data. Message eligibility does not depend on a state link. No password is stored in the migration.

Set an operator generated password for `archive_exporter` from a trusted `psql` session with `\password archive_exporter`. Put the resulting connection URL directly into the repository Actions secret `ARCHIVE_EXPORT_DATABASE_URL`; require TLS and URL encode credentials. Do not put the password or URL in source, workflow output, PR text, or chat.

Run `supabase/tests/archive_exporter_readonly_verification.sql` with a trusted PostgreSQL role after the migration, in a disposable verification database. It creates fixtures inside a transaction and rolls them back. It briefly drops and restores the `public_safe` check as `NOT VALID` inside that same transaction so the RLS policy can be tested against a false row.

## GitHub proposal token

Set `ARCHIVE_GITHUB_TOKEN` as an Actions secret. Use a fine grained token limited to this repository with:

- Contents: read and write, for the proposal branch push.
- Pull requests: read and write, for creating, inspecting, and (only in `AUTO`) merging the proposal.
- Checks: read, Commit statuses: read, and Actions: read, for required CI results.
- Metadata: read (GitHub requires this for repository access).

Do not include administration, secrets, workflows, or unrelated repository access.

## AUTO Production verification

The `AUTO` path requires `NETLIFY_AUTH_TOKEN` as an Actions secret. The runner uses the Netlify API with GET requests to identify the Archive site and poll production deploys. A successful run requires deploy state `ready`, `context=production`, `commit_ref` equal to the exact squash merge SHA, and the existing Reader/RAW and illustration asset checks to pass on the Production site. Missing access, an ambiguous site, or a deploy that never matches ends as `AUTO_PUBLISH_INCOMPLETE`; it does not report publication success. Keep `SHADOW` enabled until a real source cycle is reviewed.

## Current limits

`SEMANTIC_GRAPH_FACT_EXTRACTION = NOT_IMPLEMENTED`. V1 only reconciles deterministic Reader links and structured data. It does not generate semantic facts, Knowledge content, or illustrations.
