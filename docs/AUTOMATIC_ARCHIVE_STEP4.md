# Automatic Archive Publication — Step 4 / 10

Status: IMPLEMENTED / LOCAL PUBLIC GRAPH COMPILER
Parent: Steps 2 and 3, PRs #134 / #135.

## Actual result

`frozen approved public facts + existing public Reader -> entity registry / explicit relationships / story index / article data -> local GRAPH.json`

This implements real graph reconciliation and a local output artifact. It does not activate a live Supabase extractor, automatically judge all natural-language facts, publish a site, generate an image or enable a scheduler. Source approval remains an upstream trusted publication responsibility; relabeling player-known or GM-only data as PUBLIC_ARCHIVE is prohibited. The later orchestration must supply these inputs automatically, not ask the player to maintain a new manual table.

## Reuse and scope

- Reuses Step 2 Publication Batch, immutable checkout and stable task identity.
- Reuses the already-published `archiveData.ts` nodes and relationship labels as a one-time compatibility baseline. No private runtime or Canon file is read.
- This baseline's existing PLAYER_SAFE label is NOT a general rule equating player knowledge with public internet approval. Only this known deployed source is accepted by the legacy adapter.
- Reuses existing BOOK.json and its editorial links. Existing prose and old UI are not rewritten.
- Compiler, CLI, tests and CI only; no new frontend runtime, dependency, network fetch, queue service or database.

## Public fact contract

`public-graph-facts-v1` requires the exact C03/AFTERFALL/season namespace, PUBLIC_ARCHIVE visibility, a save/time anchor equal to the batch and arrays of nodes/relations. Unknown top-level and record fields are rejected. Nodes contain the existing public label/type/subtitle/summary/tags/source/string-meta shape. Supported entity types are character, location, event, faction and reference.

New input files must be committed under `archive/content/public-facts/C03-AFTERFALL/Sxx/<name>.json`. The CLI reads exact Git objects at the batch's checkout SHA and keeps the file SHA-256 and record pointer as evidence. It does not resolve textual `source` descriptions into private documents. The legacy `/nodes/N` and `/relations/N` evidence pointers address the normalized exported arrays, not literal JSON inside the TypeScript file. The JSON producer must have already performed public/Canon classification; hashes prove bytes and provenance, not semantic truth.

Relations are explicit only. Typed relations include participated_in, occurred_at, lives_at, works_at, belongs_to and related_to; endpoint types are checked where meaningful. Legacy published labels remain published_relation instead of being guessed into a new meaning. Duplicate edges, missing endpoints and cross-Chronicle inputs are rejected. No relationship is inferred from two names appearing in one scene.

## Reconciliation

Node ids remain stable and scoped to C03. Semantic relation ids derive from endpoints and kind; legacy relation ids also retain the existing label. Repeated inputs are no-ops. A later save can update a fact and record its previous version/hash/source in history. Same-save conflicting facts, changed entity type or contradictory time progression fail closed. Omission never means deletion. Older batches cannot overwrite or add stale records into a newer graph.

The generated artifact has nodes, relations, story links, article data and a content digest. Article overview/subtitle/metadata are copied from approved values, never newly authored. Reverse relation navigation is generated without reversing a relation's meaning. Existing prior artifact checksums and records are validated before use; this is integrity checking, not a signature-based authorization system.

## Automatic story indexing

Two distinct link reasons are retained:

1. EDITORIAL_REFERENCE: an existing approved Reader node link.
2. EXACT_TEXT_MENTION: a unique public entity label/explicit alias appears in the Reader body.

Mention matching respects word boundaries and common Korean particles. Ambiguous aliases are withheld. Match evidence includes offsets and the chapter-body digest. It is a retrieval aid, not a claim that the named character participated in an event or that two people are allies. Shortened names, pronouns and difficult inflections may be missed deliberately; v1 prioritizes not inventing relationships. Automatic chapter provenance must be PUBLIC_ARCHIVE and within the effective graph time boundary. The known legacy manual chapters remain compatible.

## Local application

```sh
node --test archive/scripts/lib/publication-graph.test.mjs
node --experimental-strip-types archive/scripts/check-graph-batch.mjs
node --experimental-strip-types archive/scripts/run-graph-publication.mjs --demo-s02 --check
node --experimental-strip-types archive/scripts/run-graph-publication.mjs --demo-s02 --apply
# A future batch producer supplies both approved inputs:
node --experimental-strip-types archive/scripts/run-graph-publication.mjs --snapshot /path/snapshot.json --facts archive/content/public-facts/C03-AFTERFALL/Sxx/FACTS.json --apply
```

Node 22's type stripping is used only to load the fixed existing public TS data module after checking its bytes against Git. It does not evaluate arbitrary paths or import runtime/GM modules. `--check` compiles the candidate in memory and reports counts. `--apply` writes only local `archive/content/graphs/C03-AFTERFALL/GRAPH.json`, never pushes or deploys.

The writer supports first creation, cooperative exclusive lock, stale-byte detection, complete temporary output and atomic commit. Symlinked output files/parents are rejected. Failed validation or a failure before commit preserves the last good graph. Existing locks are not stolen. This is a single-file local transaction, not distributed exactly-once delivery; abandoned locks require review.

## Verification

72 local Node tests cover deterministic output, typed/legacy relationships, scope and privacy boundaries, evidence and time checks, updates/history, duplicate suppression, old-batch retention, alias ambiguity, mention-vs-relationship separation, article linkage and atomic file error paths.

Existing GitHub CI additionally runs the real public baseline: all current public node fields and relation labels must survive unchanged, article values must match, links must be reproducible and repeated compiles must match byte-for-byte. A separate local-only Git clone tests initial creation, repeat no-op, three synthetic S99 nodes/two relationships, rejection of private input and retention of the good graph. It checks all original Reader books remain unchanged. No synthetic fixture is committed as Canon or to the real content tree.

The implementation environment cannot clone GitHub directly, so local verification is the isolated module suite and syntax checks. Full-repository integration and existing tests/build run on GitHub Actions. Do not report full local end-to-end testing without that distinction.

## Cost and deployment boundary

Existing public-repository standard Ubuntu CI only; no additional dependency/artifact service or paid API. Keep `[skip netlify]` in this code-only PR title and commit/squash message. No Preview/Production deploy or new scheduler is enabled. The public website does not yet consume GRAPH.json; that integration belongs to Step 9.

References:
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/
- https://nodejs.org/download/release/v22.16.0/docs/api/cli.html#--experimental-strip-types

## Handoff

Next: Step 5 — Visual Point and provider-neutral Visual Brief generation from approved public facts. No new Canon, gameplay turn, image request, Supabase write, paid API, schedule or site publication is part of Step 4.
