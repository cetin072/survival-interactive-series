# AFTERFALL Original Illustration Storage Provider v1

Status: provider boundary implemented; active backend remains Supabase.

## Goal

Keep private high-resolution illustration originals replaceable without changing:

- Visual READY selection
- native image generation
- `survival_rpg.visual_assets` registry semantics
- deterministic site derivatives
- `SITE_ASSETS.json`
- Netlify publication

The storage backend must be a replaceable infrastructure detail, not an Illustration Automation B domain rule.

## Current backend

Default:

```text
ARCHIVE_ORIGINAL_STORAGE_PROVIDER=supabase
bucket=survival-archive-originals
```

If the provider variable is omitted, Supabase remains the default for backward compatibility.

Current Supabase configuration:

```text
ARCHIVE_SUPABASE_URL
ARCHIVE_SUPABASE_SERVICE_ROLE_KEY
ARCHIVE_ORIGINAL_STORAGE_BUCKET   # optional; defaults to survival-archive-originals
```

The service-role key stays trusted-runner only. It must never enter browser code, public manifests, or generated image metadata.

## Provider boundary

`archive/scripts/original_storage_provider.py` owns the private-original storage contract.

Provider responsibilities:

1. resolve its private bucket/container
2. perform trusted exact-byte readback
3. create one content-addressed original with a service-role direct upload and `x-upsert: false`
4. return the registry object locator

The current `illustration_storage_handoff.py` calls this provider boundary rather than implementing Supabase Storage directly. Service-role credentials remain only in the trusted GitHub Actions workflow; no private key, signed upload token, or upload grant is passed to the local machine.

## Primary private renderer handoff

For isolated ChatGPT renderer output, the preferred temporary transport is now
private Supabase staging rather than a GitHub Draft Release.

1. The isolated renderer writes an accepted PNG to the private user Library.
2. The handoff worker transfers the PNG as bounded base64 chunks into
   `survival_ops.illustration_binary_staging*`.
3. `archive_illustration_staging_finalize` reconstructs the exact bytes inside
   Postgres and verifies byte count, SHA-256, PNG signature and dimensions.
4. One immutable `illustration-staged-handoff-request-v1` on main identifies
   only the staging ID, exact source commit and identity path.
5. The trusted GitHub workflow uses its existing Supabase service-role secret to
   read the private chunks, reconstruct and independently verify the PNG, then
   executes the existing create-only private Storage upload and registry
   reconcile/readback.
6. After complete Storage + registry verification, the trusted workflow deletes
   the temporary staging row/chunks.

The staging tables are operational transport only. They are private, temporary,
not Canon, not a public site dependency, and never replace the private original
in `survival-archive-originals`.

The Draft Release transport below remains supported for existing receipts and
compatibility, but new isolated renderer output should prefer private Supabase
staging when no private GitHub binary-upload surface is available.

## Temporary private image handoff

The routine path uses a GitHub Draft Release as a short-lived staging handoff:

1. Codex native image generation produces the candidate; the accepted PNG and its identity record are committed to the task branch.
2. A Draft Release contains exactly one asset with the identity-bound filename. Its tag points at the exact source commit.
3. A `workflow_dispatch` run on `main` checks that the source commit is in the workflow commit history and that the identity JSON and catalog still match that source revision.
4. The trusted runner confirms the Release is still a draft, verifies anonymous asset download is denied, then downloads the authenticated bytes. It checks PNG validity, dimensions, byte count, and SHA-256 against the accepted identity.
5. The runner confirms the Supabase bucket is private, uploads the bytes directly with create-only semantics, and performs an exact authenticated readback.
6. It reads the registry, reconciles only if no matching row exists, and reads the exact row back.
7. A separate least-privilege cleanup job deletes the Draft Release and its source-bound tag, including when handoff processing fails after source validation.

The workflow runs only from the repository's `main` branch. It never grants a browser or local process Storage credentials. Draft assets are temporary and are not publication assets. The original remains private; public site derivatives and the two-image publication batch follow the separate release policy.

## Trusted registry API boundary

The PostgREST API currently exposes `public` and `graphql_public`; keep the `survival_rpg` schema private. The trusted worker reaches `survival_rpg.visual_assets` through two narrowly scoped RPCs in `public`:

- `archive_visual_asset_readback(point_id, generation_key)` returns at most two matching AFTERFALL rows so the worker can detect duplicates.
- `archive_visual_asset_reconcile(row)` inserts only when neither identity key exists, serializes retries for the point, never overwrites, and returns matching rows for exact readback.

Both functions use `SECURITY INVOKER` and an empty `search_path`. Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`; grant it only to `service_role`. The functions rely on the existing service-role table privileges and RLS configuration; do not expose `survival_rpg`, grant access to gameplay roles, or weaken RLS to support the trusted handoff.

## R2 readiness

Reserved selector:

```text
ARCHIVE_ORIGINAL_STORAGE_PROVIDER=r2
ARCHIVE_R2_ENDPOINT=...
ARCHIVE_R2_BUCKET=...
```

R2 is intentionally **not implemented yet**.

Selecting a configured R2 backend currently fails closed with:

```text
R2_STORAGE_ADAPTER_NOT_IMPLEMENTED
```

It must never silently fall back to Supabase.

A future R2 adapter should implement the same provider responsibilities while preserving the content-addressed object identity:

```text
AFTERFALL/<point_id>/<generation_key>/<source_sha256>.png
```

## Provenance

New visual registry rows should record:

```json
generation_meta.storage_provider = "supabase"
```

Legacy rows created before this contract do not contain the field and are treated as Supabase-backed unless explicitly migrated.

The public site does not read high-resolution originals directly. It continues to serve deterministic derivatives from the site publication path, so changing the original storage provider must not change public URLs.

## Migration rule

Do not bulk-move originals merely because another provider is available.

Recommended transition:

1. implement and test the new provider adapter
2. dual-read verification for one test asset
3. write one new original to the new provider
4. verify registry provenance and SHA readback
5. complete one E2E illustration cycle
6. only then switch the default for new originals
7. migrate legacy originals separately if there is a cost/capacity reason

Existing Supabase originals may remain valid indefinitely. Mixed-provider history is acceptable as long as every new asset records provider provenance and exact SHA identity.

## Non-negotiable invariants

- private originals are never public site dependencies
- exact SHA-256 readback before publication
- no overwrite/upsert of an existing different object
- no silent provider fallback
- no paid storage/provider activation without explicit approval
- image generation and site publication remain independent of the original-storage vendor
