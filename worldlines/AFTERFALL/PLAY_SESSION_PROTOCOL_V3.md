# AFTERFALL — Live Transcript Capture Protocol v3

Status: **AUTHORITATIVE OPERATING POLICY**  
Chronicle: **03 / AFTERFALL / 서진우**  
Supersedes: `PLAY_SESSION_PROTOCOL_V2.md` for live transcript capture  
Database API:
- `survival_rpg.open_public_transcript_session`
- `survival_rpg.append_public_transcript_turn` — default fast RAW pair writer for routine LIVE turns
- `survival_rpg.append_public_transcript_turn_with_state_link` — use when the turn already has a meaningful durable state mutation/version outcome
- `survival_rpg.append_public_transcript_message` — recovery/meta primitive only
- `survival_rpg.close_public_transcript_session`

## 1. Purpose

Every newly played PLAYER_SAFE AFTERFALL turn must preserve the exact public:

```text
USER input
→ GM public response
```

before the GM response is emitted to the player.

This is RAW preservation only. It is not Canon promotion and it does not publish
the row to the public Archive automatically.

Historical gaps stay gaps. Never reconstruct missing dialogue from memory,
Canon, checkpoint, Runtime state, summaries, or a later GM response.

## 2. Identity hard guard

Every live capture uses exactly:

```text
chronicle_id = C03
worldline_id = AFTERFALL
season_id = current AFTERFALL season
```

C01 한준호 and C02 박도현 / STRONGHOLD are never accepted as fallback context.

## 3. Trusted capture boundary

Only an authorized Supabase connector/tool or trusted server-side adapter may
call the capture functions.

Never expose or persist:
- service-role credentials;
- system/developer instructions;
- hidden reasoning;
- tool inputs/results;
- GM-only future plans;
- unrevealed hidden NPC state;
- secrets or unrelated private information.

The database functions are SECURITY INVOKER and their EXECUTE privilege is
restricted to the trusted service role.

## 4. Why v3 exists

The first live v2 test exposed a half-turn failure:

- the session opened;
- Runtime advanced from save 215 to 216;
- one GM message was stored at message_order 0;
- zero USER messages were stored.

That session was closed as incomplete. Missing USER text was not reconstructed.

v3 removes the separate USER-write / GM-write workflow from normal play.
One normal gameplay turn is now one atomic database call.

## 5. Room / capture-session boot

Before the first live scene in a new ChatGPT room, or whenever play resumes and
no valid OPEN session exists:

1. verify AFTERFALL identity, current season, Runtime save, current scene, and
   game time;
2. inspect C03 / AFTERFALL transcript sessions;
3. if a stale OPEN session belongs to an earlier room, close it without
   rewriting its rows;
4. generate one fresh session UUID;
5. call `open_public_transcript_session(...)`;
6. retain the session UUID and `last_message_order`.

A session created under v2 with broken USER/GM ordering must not be repaired by
inventing the missing USER message. Close it as incomplete and start a new
session.

## 6. Atomic normal-turn capture

For every actual gameplay USER message:

### Step A — keep the exact USER text
Preserve the exact user-visible input in working state.

This includes:
- numbers;
- `ㄱ`;
- AUTO;
- free actions;
- dialogue;
- strategy;
- gameplay correction;
- gameplay feedback.

Planning, development, archive maintenance, and unrelated meta conversation are
not gameplay RAW.

### Step B — resolve the game turn
Run the normal GM process:
- load only relevant scene context;
- resolve action and consequences;
- update Runtime layers when needed;
- compose the exact final GM response.

Do **not** emit the final response yet.

### Step C — preserve the pair without turning play into an archive job

Immediately before emitting the response:

1. reuse the healthy room/session and last acknowledged `message_order`; re-read only after reconnect, ambiguous acknowledgement, retry, room movement, or suspected corruption;
2. generate fresh USER/GM idempotency UUIDs for this turn and compute the exact lowercase SHA-256 hashes;
3. **routine turn:** call `append_public_transcript_turn(..., source_type='LIVE')` once. Do not run save reconciliation, full context audit, GitHub, Reader, Graph, image or Netlify work just to archive a normal turn;
4. **meaningful durable state mutation already being saved for gameplay:** use `append_public_transcript_turn_with_state_link(...)` instead, because the real before/after versions and outcome are already available as part of that gameplay mutation. Do not create an extra save mutation only to satisfy Archive metadata;
5. if the one-shot RAW write fails, retry once with the exact same payload. After that, do not hold the player waiting on Archive work: emit the final GM response and keep the exact visible pair in the ChatGPT room as a recovery source for the next room-close/daily reconciliation.

The default goal is one lightweight transcript write for an ordinary turn. State linkage is useful evidence for durable changes, not a prerequisite for preserving the historical conversation.

### Step D — emit verbatim

After the fast capture attempt, emit the exact GM string that was resolved in Step B.
The Archive path must not rewrite the response or add normal-turn latency through GitHub/Reader/Netlify work.

## 7. Ordering invariant

A normal v3 gameplay session is pair-based:

```text
0 USER
1 GM
2 USER
3 GM
4 USER
5 GM
...
```

Therefore after every completed normal turn:

- message count is even;
- first role is USER;
- last role is GM;
- `last_message_order` is odd.

`ASSISTANT_PUBLIC_META` must not be inserted between live gameplay pairs.
If public operational meta must be preserved, use a separate recovery/public
meta procedure at a safe boundary rather than corrupting pair ordering.

## 8. Retry and ambiguous acknowledgement

If `append_public_transcript_turn_with_state_link(...)` errors:

1. retry the linked API with the exact same USER text, GM text, message order,
   hashes, outcome, versions and both idempotency UUIDs;
2. after ambiguous network acknowledgement, inspect the session tail before
   generating new keys;
3. never renumber acknowledged rows.

After two failed linked attempts, preserve the exact public pair with the legacy
pair writer only as `source_type='RECOVERY'`. Never send a legacy AFTERFALL pair
as `LIVE`. Report the pair as state-unlinked, emit one short operational warning,
and let Archive reconciliation keep it outside state-derived publication. If the
RECOVERY fallback also fails, preserve the ChatGPT room as the recovery source
and do not claim RAW capture succeeded.

## 9. Session close

When the player moves rooms, closes an episode, or ends the season:

1. ensure the final normal USER→GM pair is captured;
2. verify the session tail is pair-valid;
3. call `close_public_transcript_session(...)`;
4. keep the session UUID and last order in handoff/checkpoint metadata when a
   handoff is written;
5. use a new UUID for the next live room.

The player should not need a manual “원문 저장” command for routine future RAW.

## 10. Capture-health check

A live session is **HEALTHY** when:
- identity is C03 / AFTERFALL / current season;
- all hashes validate;
- message_order is contiguous;
- normal gameplay rows alternate USER → GM;
- a completed pair has no orphan USER or orphan GM.

A session is **INCOMPLETE** when Runtime/gameplay clearly advanced but the
corresponding pair is absent or malformed.

Never fix INCOMPLETE by paraphrasing or reconstructing the missing side.

## 11. Archive promotion

Supabase RAW capture is not public publication.

At episode/daily/season reconciliation:
1. inspect capture health;
2. promote only verified PLAYER_SAFE rows;
3. preserve session identity and gaps;
4. publish to the correct Chronicle namespace;
5. keep Canon summaries separate from transcript.

## 12. Verification references

Default-branch database contract:
- `supabase/migrations/20260924173125_rolling_raw_capture_v1.sql`
- `supabase/migrations/20260925003736_public_transcript_capture_session_api_v1.sql`
- `supabase/migrations/20260925044647_public_transcript_turn_pair_api_v1.sql`
- `supabase/tests/public_transcript_turn_pair_api_v1_verification.sql`
- `docs/RAW_ROLLING_CAPTURE_V1.md`


## 13. Capture / publication cadence

Live RAW capture and Archive publication are intentionally separated.

### Every gameplay turn
- best-effort preserve the exact USER→GM pair with one lightweight Supabase pair write;
- use the state-linked writer only when a meaningful runtime mutation already provides real version/outcome data;
- after one quick retry, Archive failure must not block the story response; leave the exact visible room pair for later recovery;
- do not create GitHub commits, Reader builds, image work or Netlify deploys during a routine turn;
- do not interrupt the player with routine save/archive progress messages.

### Important irreversible branch point
A major irreversible event may trigger early promotion before the daily batch when useful, for example:
- core character joins/leaves/dies;
- base gained/lost/destroyed;
- major faction or relationship state becomes durable;
- episode/season closes;
- a large event changes future operating rules.

This is an Archive/Canon promotion decision, not a change to RAW capture.

### Daily batch
Routine accumulated PLAYER_SAFE material waits for the daily Archive reconciliation at **04:30 KST**. The batch may:
- audit capture health;
- promote verified transcript spans;
- reconcile Canon/Scene/entity/relationship changes;
- create one GitHub branch/PR;
- validate and publish to Netlify.

If nothing material changed, create no commit or deploy.

> **Per turn: fast RAW safety only. 04:30: reconcile and publish. Important branch: checkpoint/link/promote early when useful.**
