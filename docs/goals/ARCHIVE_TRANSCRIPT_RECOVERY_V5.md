# Archive Transcript Recovery V5 — Phase A Audit

## Scope

Phase A recovers only text that can be verified as public USER↔GM material. It
does not alter Canon, checkpoint, game state, graph entities, or engine code.

## Audited refs

- `origin/main` at `a91873f` (merged Archive V4)
- `origin/worldline/stronghold-chronicle` at `eb3f277`
- `origin/worldline/afterfall-rpg` at `251d825`
- all reachable Git history for the C02 and C03 `raw_transcript` paths,
  including deletion/rename object discovery

## Recovery result

| Chronicle | Result | Published records |
| --- | --- | --- |
| C01 한준호 | S01 complete; S02 partial | S01 PART_001–009 and S02 PART_001 remain byte-preserved; S02 opening remains a gap. |
| C02 박도현 / STRONGHOLD | partial | Three literal USER-side fragments, each clearly marked `VERIFIED_FRAGMENT`; GM output remains missing. |
| C03 서진우 / AFTERFALL | missing | S01 index and S02 checkpoints establish missing coverage only; no raw USER/GM part was found in the audited branch/history. |

## Integrity and privacy rules

- Each Chronicle has an `archive/content/transcripts/<chronicle>/MANIFEST.md`.
- The C02 copies are byte-identical to their cited STRONGHOLD source files.
- C01/C02 reader records carry no C03 entity edge.
- Canon, ROOM archive, checkpoint, feedback, and ledger files are cited as
  context only and are never transformed into dialogue.
- Raw sources remain public-safe reviewed; `[REDACTED]` text is preserved.

## Validation plan

- Static catalog tests cover source-root mapping, gaps, C02 fragment status,
  and no cross-Chronicle entity links.
- Production build, Archive CI, Deploy Preview, and an Archive-only diff check
  are required before opening the Phase A pull request.
