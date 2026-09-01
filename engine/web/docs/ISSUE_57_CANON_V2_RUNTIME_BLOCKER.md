# Issue #57 — Canon v2 Runtime Blocker

Status: `BLOCKED / HUMAN DECISION NEEDED`

The latest prepared continuation is `seasons_v2/S02/START_STATE.json`. It is
`READY_FOR_HIDDEN_WORLD_SEED`, with `hidden_seed_generated: false` and
`legacy_current_state_allowed: false`.

`REBOOT_START_HERE.md`, `canon_v2/PERSISTENT_CANON.md`, and the S02 Handoff
require the exact current date/time, family locations, vehicle position/fuel,
active public pressure, and first scene to be determined at the Hidden World
Seed gate. Those facts are not present in the current public Canon v2 source
set. Creating them in the web app would invent Canon facts; using
`players/main/RUNTIME_STATE.json` or `core/CHARACTERS.json` would promote
Legacy state contrary to the boot rules.

The smallest missing contract is one versioned, public-only runtime checkpoint
created after the Hidden World Seed gate. It must provide only:

- current public date/time and player location;
- visible family location and simple condition;
- visible resources and base capabilities;
- active public pressure and recent visible change;
- deterministic current scene, numbered choices, and turn-result source.

It must exclude the Hidden World Seed, unrevealed event truth, and all
`raw_transcript` content. Once that checkpoint is committed, the Phase 1
adapter can map it to the existing `RuntimeState`/State Console and Phase 2
can reuse the existing choice, free-action, validator, action-queue, and log
components without inventing Canon facts.
