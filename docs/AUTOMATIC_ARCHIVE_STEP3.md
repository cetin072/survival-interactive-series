# Automatic Archive Publication — Step 3 of 10

Status: IMPLEMENTED / LOCAL TEXT COMPILER + ATOMIC BOOK UPDATE
Parent: Step 2 / PR #134

## Result and boundary

`frozen approved cold RAW -> existing Reader transform -> reviewed chapters retained + automatic new chapters -> local BOOK.json`

This is the text-building stage of the ten-step roadmap, not activation of the full unattended site publisher. It produces actual Reader JSON, not just a plan. No image, graph, Supabase write, scheduler, remote Git write, auto-merge or Netlify deployment is performed by the runner. RAW promotion from live capture to approved cold-archive inputs remains an upstream integration; a `public_safe` flag alone is never an internet-publication permission.

## Existing Reader stays intact

The existing GM-only transform and manual editorial plan are retained. Existing C01/C02/C03 books must roundtrip unchanged. A new source absent from the editorial map can use the automatic fallback only with explicit approved-source metadata. In v1 one immutable PART produces at most one chapter; its title comes from a retained heading, otherwise a deterministic source label. No model rewrites prose or invents dialogue, emotion, summary, relationships or connecting scenes. Automatic chapters have no invented graph edges.

A source wholly classified as meta stays omitted with the existing exclusion accounting. A fragment cannot be inferred into a complete pair. Missing or contradictory metadata fails closed.

## Approved new-source contract

Historical S01/S02 catalogs are not migrated or rewritten. New C03 season directories (S03 onward) are discovered only under `archive/content/transcripts/C03-AFTERFALL/`. Their MANIFEST must declare `visibility: PUBLIC_ARCHIVE`, the correct Chronicle/worldline/season, `archive_class: COLD_RAW`, and unique session ids. A missing/private visibility means no automatic reading.

A session additionally needs PUBLIC_ARCHIVE visibility, verified paired-capture classification, true atomic pairing, exact captured range, balanced counts and a safe SOURCE_MANIFEST reference. Its SOURCE_MANIFEST must agree, be closed, retain `public_safe_only: true`, ordered USER/GM hash metadata, and an exact PART inventory. New automatic inputs also require `parts_sha256: { PART_001.md: "<64-hex-byte-hash>" }`. Actual PART bytes and role-header sequence are checked before selection. This field is not retroactively fabricated for legacy records.

These checks establish consistency against an approved cold publication, not independent proof that a caller truthfully classified every sentence. Source approval and the existing RAW-vs-worldline integrity checks remain necessary. A caller must not relabel raw GM/private data as PUBLIC_ARCHIVE to bypass that boundary.

Every automatic chapter retains source/Archive refs, raw content hashes, session/part identity, captured range, source-manifest SHA-256 and transform version. No full runtime or GM state is serialized into the output.

## Frozen batch and safe application

`run-reader-publication.mjs` reuses Step 2 `createBatch` / `planPublication`. It requires the snapshot's exact checkout SHA and verifies each source-entry digest against that Git revision. Reader source bytes come from pinned Git objects, not arbitrary network paths. Source manifests/hashes and the batch time boundary are verified. New chapters must belong to the batch's paired public source refs. Later unprocessed sources outside that batch are deferred; later chapters already in the committed book are retained unchanged. Rechecking historical S02 after a newer season is published must neither fail merely due to time progression nor roll the newer edition back.

The runner regenerates one target Chronicle only. It checks that every existing chapter remains in place and byte-equivalent at the data level. An old chapter deletion, edit, reorder, unapproved addition or source outside the frozen batch rejects the update. Intentional corrections/backfills that reorder a published edition require a separately reviewed operation.

A local apply uses an exclusive per-book lock, optimistic old-byte comparison, a fully written/synced temporary file in the same directory and atomic rename. Failure before commit preserves the old book. Repeat application of identical output is a no-op. Locks are cooperative; abandoned locks require review and are never stolen automatically. This is not a claim of distributed exactly-once processing or a multi-book transaction. A crash around commit leaves either the old or the complete new file, not half a JSON file.

The source receipt report links the Step 2 batch/task ids to source digests and resulting chapter ids. It distinguishes retained legacy editions, one-sided fragments and compiled Reader input. The report is not a durable job ledger or proof of remote publication.

## Run

Node 22, Git and existing built-in modules; no new dependency or API key.

```sh
node --test archive/scripts/lib/reader-batch.test.mjs
node archive/scripts/check-reader-batch.mjs
node archive/scripts/run-reader-publication.mjs --demo-s02 --check
# A future orchestrator supplies a normalized frozen snapshot:
node archive/scripts/run-reader-publication.mjs --snapshot /path/snapshot.json --check
node archive/scripts/run-reader-publication.mjs --snapshot /path/snapshot.json --apply
```

`--check` creates actual candidate content in memory but writes no content file. `--apply` can update only the local C03 BOOK.json, never push/deploy. There is no implicit apply mode, paid provider, credential lookup or schedule. Costs remain outside this offline execution path. The existing generator and `reader:check` recognize approved automatic chapters so future publication checks can reproduce them.

## Verification

- 50 new Node unit tests: source visibility, namespace, ranges, hashes, role/pair order, inventory, fragments, deterministic chapter generation, existing text protection, atomic update, no-op, stale lock, I/O failure, concurrent edit and untouched RAW/other-Chronicle sentinels.
- Existing Step 2 tests and Archive tests remain required.
- Real repository books are rebuilt and compared with committed BOOK.json without modifying the originals.
- Real S02 batch is executed twice and must produce identical metadata reports and NOOP.
- A local-only temporary Git clone receives a synthetic S99 fixture, then exercises the actual runner: one new chapter, old chapters unchanged, repeat NOOP, corrupt input rejected while the good book remains. No fixture is pushed or presented as actual Canon.
- Existing Reader publication/hash checks and Vite build remain in CI.

Local unit/syntax verification can run without downloading a full repository. Full real-book and isolated Git end-to-end verification runs on existing GitHub CI, where the complete checkout is available. Do not claim local full-repository verification when only the isolated unit suite was run.

## Cost-safe delivery

This code-only PR and squash commit carry `[skip netlify]`; no new Preview/Production deployment is required. Existing standard public-repository GitHub CI is used without new artifact/cache storage or services. Provider/billing verification and scheduling remain later roadmap gates.

References:
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/

## Handoff

Next: Step 4 — automatic public Character / Location / Event / Relationship updates. Step 3 does not change the game's Canon, advance S03, or turn on background work. Image creation/storage and batch scheduling remain steps 5–8, site integration and end-to-end operation remain steps 9–10.
