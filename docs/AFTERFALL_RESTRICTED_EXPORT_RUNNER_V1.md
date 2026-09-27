# AFTERFALL restricted RAW export runner v1

Status: **CODE ONLY / NO RESTRICTED ROLE OR LIVE EXPORT VERIFIED**

The source bridge now has an opt-in `--check` runner. It connects with the dedicated `archive_exporter` PostgreSQL identity, opens a repeatable-read, read-only transaction, verifies the actual database session role and lack of elevated/write privileges, runs the fixed parameterized source query, then passes the result through the linked capture, segment and exact-body validators. The CLI prints bounded metadata, never USER/GM bodies. It writes no file or database row and has no scheduler, public approval or image path.

The runner rejects `service_role`, `postgres`, a writable transaction, a bypass-RLS or write-capable role, and connection-string SSL overrides. It requires TLS certificate validation. The fixed SQL withholds incomplete ranges and caps individual and total body bytes before returning JSON; the JavaScript validator independently checks the range and exact body hashes. The `pg` version is pinned in `archive/exporter/package.json` and `pnpm-lock.yaml`. These checks are defense in depth; the database still needs a separately reviewed role, grants and RLS policy that restrict what `archive_exporter` may read. Neither that role nor its credential has been created by this PR. Supplying an admin or broad service credential is not a supported shortcut.

After a restricted identity and credential are approved and provisioned, a read-only diagnostic can be invoked explicitly:

```sh
pnpm --dir archive/exporter install --frozen-lockfile
ARCHIVE_EXPORT_DATABASE_URL='<dedicated archive_exporter PostgreSQL URL>' \
  node archive/exporter/check-linked-export.mjs \
  --session '<session UUID>' --start 0 --end 1 --check
```

Do not paste a real URL into a shell history, PR, log or chat. Supply it through the approved secret mechanism. The current `S03` rows are not test inputs: the staging aggregate still shows 16 unversioned messages and zero linked turns. The CLI has not connected to staging or retrieved their bodies. Unit tests use a fake client to exercise role refusal, transaction rollback, exact source validation and output redaction. A staging `EXPLAIN` checked the fixed SQL syntax without executing an export. The installed `pg` package and frozen lockfile were checked locally; no live restricted-role query or cost/billing proof exists.

Even a valid restricted read only yields `PENDING_PUBLIC_APPROVAL`. A future standing public policy decision, public promotion and Step 3 manifest remain separate gates. The main product goal still requires repeated capture, text/graph/site publication and accepted images without player archive work.
