# AFTERFALL capture/state synchronization v1

Status: **AUDIT GUARD IMPLEMENTED / LIVE CAPTURE LINKAGE BLOCKED**

Scope: `C03 / AFTERFALL / 서진우` on `worldline/afterfall-rpg`. This document and
the metadata auditor do not change Canon, RAW, Supabase rows, or season state.

## Existing capture boundary

`PLAY_SESSION_PROTOCOL_V3.md` already requires one atomic USER→GM transcript
write before the exact GM response is emitted. The database function is
restricted to `service_role`; the browser is not a trusted capture client.
The Archive publication runner is separate from normal gameplay.

The current database has no restricted public Archive exporter, and the
available administrative database connection is not the game-room capture
caller. Therefore its presence does not prove that every ChatGPT game room is
automatically observed. Do not scrape rooms or infer uncaptured dialogue.

## Required link for each completed turn

Before a captured pair can enter publication, an audit input must establish:

- C03 / AFTERFALL identity and the session's actual season;
- contiguous message orders and complete USER→GM pairs;
- valid content hashes and public-safe capture status;
- a state outcome for the pair: `APPLIED` with before/after save versions, or
  `NO_STATE_CHANGE` with the same save version on both messages;
- alignment between the database save, active session season, and repository
  continuity anchor.

The metadata-only auditor in `tools/afterfall_capture_sync.py` rejects raw text,
save payloads, hidden state and extra fields. It never repairs a save, changes
`CURRENT_STATE.json`, closes a session or grants publication approval. A
`CAPTURE_SYNCED` result means only that the supplied metadata is internally
consistent; a separate visibility/provenance gate is still required.

Run its synthetic tests with:

```sh
python -m unittest tools.test_afterfall_capture_sync
```

## Live audit outcome and handling

The read-only audit on 2026-09-27 found the current repository continuity
anchor and `survival_rpg.saves` at S02 / save 253, while the database has one
open C03 / AFTERFALL S03 session with three complete USER→GM pairs. The six
captured rows have valid lowercase SHA-256 shape and contiguous orders, but
their `save_version` values are null. The S03 start handoff in this branch also
does not establish that these turns are reflected in the authoritative save.

This is `NEEDS_GM_REVIEW` for the affected S03 range. It is not safe to infer
that the game state advanced, alter the save, rewrite the current checkpoint,
or publish those messages as a reconciled S03 chapter. The 76 existing
public-safe transcript rows remain unchanged. The audit did not read message
bodies or hidden GM state and did not write to Supabase.

## Remaining runtime integration

The live capture path must be upgraded at its trusted caller and database
boundary to persist the state outcome/version with the atomic pair. A
versioned database migration and its live staging verification are still
required; this PR does not apply a migration. A least-privilege exporter for
approved public fields and an actual runner identity must then be tested before
scheduled publication is enabled. Until those are in place, missing linkage is
quarantined rather than guessed.
