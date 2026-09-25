# Reader Edition Publication Policy V1.2

Reader Edition is a selection layer over verified public gameplay records, not
a system for rewriting Canon as a novel.

## Source and isolation

- C01 uses `seasons_v2/**` only.
- C02 uses `worldlines/STRONGHOLD/**` only.
- C03 uses `worldlines/AFTERFALL/**` or its durable Archive transcript namespace.
- Every chapter records source references and a transform version. No Chronicle
  may fill a gap with another Chronicle's material.
- Every verified RAW part is inventoried as included or omitted with a reason.
  `sourceRefs` identify the durable canonical source; `archiveSourceRefs` identify
  the exact Archive copy read, and SHA-256 source hashes make the selection auditable.

## Deterministic selection contract

The publisher supports `##` and `###` role headers, bare or numbered (`USER 001`,
`GM 001`, `GM 001-A`, `GM 001-B`) and descriptive suffixes. It discards USER
blocks and structurally labelled operational metadata, then selects GM public
prose in original order. A GM block is classified as narrative, design meta, or
operational meta; an ambiguous block is retained. From a GM block it may remove
only a trailing Choice Gate with both an explicit choice cue and multiple action
options. Narrative numbered lists, headings, dialogue, spelling, and paragraph
order remain exactly as sourced.

Verified GM prose is never summarized, rewritten, reordered, or supplemented.
Markdown is stored unchanged and rendered safely as Markdown in the Reader; it
is never flattened into rewritten plain text. A too-long chapter is split at a
source/event boundary rather than shortened. A `VERIFIED_GM_NARRATIVE` chapter
with no source, no GM block, or an empty body is a generator failure.
Chapter titles and boundaries are editorial metadata. A bridge is allowed only
for a confirmed PLAYER_SAFE Canon fact, is limited to 1–3 sentences, and is
stored as `EDITORIAL_CANON_BRIDGE`, never as verified GM text.

## Editorial map and meta overrides

`archive/scripts/reader-editorial-map.mjs` is the small, explicit publication
map for chapter boundaries, titles, Story-to-Wiki links, and historical
exceptions. It may select contiguous source ranges at a verified scene marker
or exclude an entire source only when it is plainly operational/design material.
Every override records a reason in generated publication metadata. It never
modifies a RAW file.

The decision order is deliberately conservative: clear narrative publishes,
clear meta is excluded, and an ambiguous or mixed block is retained unless a
precise scene boundary makes the exclusion safe. A perfect meta classifier is
not a prerequisite for daily publication. Long chapters are split at a real
scene/event boundary, never shortened; titles and TOC labels describe the
events actually present in the selected prose.

## Publication format

`archive/content/stories/<Chronicle>/BOOK.json` is the frontend content
contract. It contains book metadata, chapters, body text, source kind, source
references, and transform version. Adding a chapter does not require a Reader
component change.

## Daily 04:30 KST batch

1. Check new Supabase RAW pairs and capture health.
2. Decide whether durable GitHub RAW promotion is needed.
3. Extract verified GM text; exclude USER, obvious operational/design metadata,
   and conservative Choice Gates. Preserve ambiguous prose.
4. Update the editorial map: attach prose to its current event chapter or add a
   new event-boundary chapter and TOC title.
5. Reconcile PLAYER_SAFE Explorer changes when necessary.
6. Use one branch, PR, CI, Preview, squash merge, and Production verification.

The batch never summarizes play into new prose. Its normal Story update is
**GM original text plus chapter/table-of-contents editing**.

Automation handoff text: per-turn is Supabase RAW only; the 04:30 batch audits
capture health, promotes durable RAW when needed, preserves GM prose while
excluding USER/obvious meta/Choice Gates, updates Reader chapters and Wiki,
then uses one PR, CI/Preview, squash merge, and Production verification.
