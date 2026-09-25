# AFTERFALL — Live Transcript Capture Protocol v3

Status: **AUTHORITATIVE OPERATING POLICY**  
Chronicle: **03 / AFTERFALL / 서진우**  
Supersedes: `PLAY_SESSION_PROTOCOL_V2.md` for live transcript capture  
Database API:
- `survival_rpg.open_public_transcript_session`
- `survival_rpg.append_public_transcript_turn`
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

### Step C — write one atomic pair
Immediately before emitting the response:

1. read the current session's `last_message_order`;
2. set `p_user_message_order = last_message_order + 1`;
3. generate one stable USER idempotency UUID;
4. generate one distinct stable GM idempotency UUID;
5. compute lowercase SHA-256 for the exact USER text;
6. compute lowercase SHA-256 for the exact final GM text;
7. call `append_public_transcript_turn(...)`.

The database commits:

```text
USER = p_user_message_order
GM   = p_user_message_order + 1
```

inside one database statement.

If the GM half fails, the USER half must not remain committed.

### Step D — emit verbatim
Only after the turn-pair call succeeds, emit **the exact same GM string** that
was stored.

No cleanup, rewriting, extra paragraph, or hidden post-processing may make the
public reply differ from the stored GM content.

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

If `append_public_transcript_turn` errors:

1. retry with the exact same USER text, GM text, message order, hashes, and both
   idempotency UUIDs;
2. after ambiguous network acknowledgement, inspect the session tail before
   generating new keys;
3. never renumber acknowledged rows.

After two failed attempts:
- do not claim RAW capture succeeded;
- preserve the current ChatGPT room as the recovery source;
- emit one short operational warning;
- gameplay may continue, but the next Archive reconciliation must mark the
  capture gap.

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
- store the exact USER→GM pair in Supabase with `append_public_transcript_turn(...)`;
- do not create a GitHub commit or Netlify deploy for routine turns;
- do not interrupt the player with save/archive progress messages.

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

> **Per turn: preserve. 04:30: reconcile and publish. Important branch: optionally promote early.**
