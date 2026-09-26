# Automatic Archive Publication — Step 5 / 10

Status: IMPLEMENTED / LOCAL VISUAL POINT AND BRIEF COMPILER
Parent: Steps 2–4 (#134, #135, #136).

## Result and boundary

`frozen public graph + confirmed public appearance snapshot -> candidates -> ready gate -> provider-neutral Visual Brief -> local VISUALS.json`

This step produces real structured briefs and a deterministic prioritized worklist, not images. There is no provider call, fake generation result, database write, Storage upload, cron activation or website deployment. The user still only plays; the eventual batch producer supplies these public projections automatically. This is not a new table the player must maintain.

The existing Reader and graph are only read. A graph compile may run in memory using Step 4; the visual CLI does not persist that graph, change Reader chapters or read live GM/hidden state.

## Inputs and public boundary

The compiler accepts the C03/AFTERFALL PUBLIC_ARCHIVE graph produced by Step 4, with a verified content digest and an anchor equal to the Publication Batch. Future entity or appearance records, unknown fields, wrong namespaces, duplicate ids and hidden/coordinate metadata are rejected. It uses current public node data only; graph history, relationships and story co-mentions do not become image facts.

Existing public appearances come from `archive/web/src/archive/characterAppearance.ts`. The CLI verifies its exact Git bytes and pins the known legacy blob `74beacb2424ad2b6d39fdbf4761fdfb99032df85` before using the save-253 compatibility adapter. A later change cannot masquerade as the older appearance snapshot: a dated PUBLIC_ARCHIVE appearance input is then required. The adapter omits audit notes, reader descriptions and runtime reference strings, retaining only the declared visual anchor fields with source-file evidence.

A future batch may supply a committed dated appearance projection under `archive/content/public-facts/C03-AFTERFALL/Sxx/*.json` using `public-appearance-v1`: Chronicle/worldline/visibility, anchor and records (node_id/status/visual). The loader derives evidence from that file's pinned bytes rather than trusting caller-supplied evidence. This is an upstream publication projection, not a new player task.

Checksums prove bytes and integrity, not semantic truth. PUBLIC_ARCHIVE classification must already be justified by the trusted source-promotion stage. `public_safe` or player knowledge alone is not public internet authorization.

## Point selection and readiness

- CHARACTER: PLAYER / CORE / MAJOR / recurring curated characters. A confirmed anchor needs at least four real visual fields; voice is excluded from the physical threshold and render facts. Missing anchors remain WAITING_CANON with no renderable brief.
- LOCATION: public overview from label, role and public description. Restricted-detail descriptions are withheld. A ready location brief is explicitly illustrative, not a surveyed floor plan; it must not invent layout, floor count, security positions or routes.
- EVENT: public recorded description, with no inferred participants, weapons, injuries, motives or future outcomes. An unresolved visual scope remains waiting instead of being completed by imagination.
- ENVIRONMENT: an explicit environmental tag selects this category instead of creating a duplicate EVENT point for the same source. It maps to the existing DB asset type EVENT; no schema enum is added.
- MAP: only an explicit approved public-map descriptor may produce an atmosphere-layer brief. It maps to WORLD_MAP. No map is inferred from the graph.

Nonvisual references/factions and unqualified character tiers are skipped. Every candidate retains its source pointer/hash, anchor, priority and reason. READY means **a brief is prepared**, not that a provider is available, an image was generated or publication was authorized.

## Map singleton and security

The existing runtime singleton is AF-MAP-001. Read-only verification during this step found READY / PLAYER_ARCHIVE with no provider, image URL or object path. This step does not change it, create another map asset, or relabel PLAYER_ARCHIVE as PUBLIC_ARCHIVE.

Without a vetted public map projection the local catalog records WAITING_PUBLIC_MAP_PROJECTION and emits no map point. With a dated approved public descriptor, only the background/atmosphere layer can be prepared. The exact topology stays in a separate deterministic renderer. Nodes, edges, coordinates, distances and routes are not accepted by the descriptor and do not enter the provider brief; projection checksums/references stay in provenance only.

This does not implement a map renderer or prove a complete public map exists.

## Shared art direction

`AFTERFALL_ARCHIVE_V1` remains the style id. The compiler uses one immutable, versioned art profile: painterly/non-photorealistic, realistic proportions, contemporary Korean environment, natural light, restrained saturation, quiet cinematic space and small humans in a beautiful vast world.

Mood variants are QUIET_DECAY, VAST_WORLD, RED_HORIZON and QUIET_FANTASY. Explicit public tags choose non-default variants; no private plot or current clock decides them. QUIET_FANTASY describes lyrical light/composition, not magical/medieval objects. Red-horizon imagery needs an explicit red-horizon source tag. Environmental treatments must not invent time-dependent overgrowth, snow, thaw or ruined structures absent from the source.

Portraits use a single-subject master composition. Environment/location/event briefs use a wide public overview. No embedded text, generic zombie/cyberpunk/Mad Max/tactical-poster defaults, automatic weapons, explosions, corpses or gore. Art direction and source facts are separate fields; an illustration never establishes new Canon.

## Identity, deduplication and batch planning

Point identity is the public namespace + subject id + category. Generation identity hashes the actual render brief, not checkout SHA, graph link counts, unrelated role metadata, source pointers or execution date. A voice-only change or later identical snapshot does not request a new face. A changed physical anchor keeps the point id and changes the generation key.

Point ids are local bookkeeping identities, not a parallel authoritative visual-assets table. `registry_asset_id` is unresolved for normal entities until the delivery adapter binds actual runtime entity/asset IDs; the compiler does not guess that a UI node id equals a Supabase character id. Existing assets must be reconciled before any later DB write. The map uses only its existing singleton binding.

A selection-only planner applies the existing limits: 3 attempts per batch, 6 per day, initial attempt + 2 retries per point. Failures and retries consume attempts. Matching successful generation receipts skip the same generation key; old-revision receipts do not suppress changed visuals. These inputs will come from a trusted durable ledger, not user clicks. Limits are checked against Step 2 POLICY in CI.

This planner does not reserve quota, persist an execution ledger or run a provider. Every catalog and selection result keeps execution disabled / ZERO_COST_ONLY. Paid or unknown-cost services cannot be enabled by an environment flag or a planner option. Actual capability/cost verification and worker claiming remain later gates.

## Local run and persistence

```sh
node --test archive/scripts/lib/visual-compiler.test.mjs
node --experimental-strip-types archive/scripts/check-visual-batch.mjs
node --experimental-strip-types archive/scripts/run-visual-publication.mjs --demo-s02 --check
node --experimental-strip-types archive/scripts/run-visual-publication.mjs --demo-s02 --apply
```

For future normalized sources:

```sh
node --experimental-strip-types archive/scripts/run-visual-publication.mjs --snapshot /path/snapshot.json --facts archive/content/public-facts/C03-AFTERFALL/Sxx/FACTS.json --appearances archive/content/public-facts/C03-AFTERFALL/Sxx/APPEARANCES.json --check
```

Optional `--map` accepts only a pinned, approved public-map JSON descriptor. No arbitrary image/provider config is accepted.

`--check` compiles in memory and reports counts. `--apply` writes only local `archive/content/visuals/C03-AFTERFALL/VISUALS.json`, using Step 4's existing atomic-file writer, lock, conflict detection and symlink rejection. Repeat output is a no-op. A stale batch or invalid input preserves the good catalog. This is not distributed exactly-once execution, a remote commit or a site publish.

## Verification

74 isolated Node tests exercise candidate selection, five-category/schema mapping, appearance reuse and waiting gates, source/visibility/hash/date validation, explicit style variants, no topology leakage, stable identity, receipt deduplication, attempt limits and refusal to enable execution.

GitHub CI also compiles the actual public graph and confirmed appearances, compares copied visual fields, runs a deterministic double compile, and uses an isolated local-only Git clone for: actual file creation, repeat NOOP, synthetic S99 environment/map, unchanged portrait identity across snapshots, stale-write rejection, private-map rejection and preservation of existing public data/Reader books. Synthetic records are never actual Canon or published content.

Local tests in the implementation container are the isolated module suite plus syntax/whitespace checks. Direct GitHub clone is unavailable there; full-repository integrations and all pre-existing tests/build run in GitHub Actions. No complete local repository test is claimed.

## Cost-safe delivery and handoff

Use existing standard Ubuntu CI in the public repository, with no new artifact/cache service, dependency, paid API or key. Keep `[skip netlify]` in the PR title and final commit to skip Preview/Production deployment for this code-only stage. Do not use `[skip ci]`.

References checked for this delivery:
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://www.netlify.com/knowledge-base/how-to-deploy-a-site-to-netlify/

Next is Step 6: test the real included-cost ChatGPT image-generation/result-ingestion path, and distinguish supported interaction from unattended scheduling. Step 5 makes **no** claim that zero-cost unattended image production has been demonstrated. Storage, scheduling and site integration remain later stages.
