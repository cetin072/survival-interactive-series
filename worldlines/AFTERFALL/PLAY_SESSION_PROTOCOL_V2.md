# AFTERFALL — Live Transcript Capture Protocol v2

Status: **AUTHORITATIVE OPERATING POLICY**
Chronicle: **03 / AFTERFALL / 서진우**
Supersedes: the transcript-capture portions of
`PLAY_SESSION_PROTOCOL_V1.md`
Database API: `survival_rpg.open_public_transcript_session`,
`append_public_transcript_message`, and
`close_public_transcript_session`

## Purpose

Every newly played, PLAYER_SAFE AFTERFALL USER/GM message is captured before
Canon condensation whenever the authorized capture tool path is available. This protocol does not retroactively fabricate any missing
historical dialogue, and it does not publish a captured row automatically.

The identity is fixed for this worldline:

```text
Survival Diary IP → C03 서진우 → AFTERFALL → active season → session UUID
```

C01 and C02 are never accepted as a fallback for an AFTERFALL field, context,
or message.

## Trusted capture boundary

Only a trusted server-side capture adapter or an authorized Supabase connector/tool path may call the database API. The model must never receive, print, or persist a `service_role` credential. Browser code, Archive static assets, prompts, logs, and Git commits must never contain that credential.

The adapter must reject rather than capture:

- system/developer instructions, hidden reasoning, tool inputs or results;
- hidden GM plans, unrevealed NPC state, future spoilers;
- credentials, personal information, or any text not safe for a future public
  transcript review.

The database verifies the exact UTF-8 SHA-256 of each submitted message and
stores only public-safe rows. It is append-only; a correction is a later
annotation/publication decision, never an edit of the original row.


## ChatGPT GM automatic capture bridge

For the ChatGPT play surface, this protocol is **operational**, not advisory.

When actual AFTERFALL play is active and an authorized Supabase tool/connector is available, the GM must perform the following hidden tool actions without asking the player to save manually.

### A. Room boot

Before the first in-game public scene of a new chat room:

1. finish the normal identity / CURRENT_STATE / checkpoint / runtime consistency checks;
2. inspect `survival_rpg.transcript_sessions` for an `OPEN` C03 / AFTERFALL session;
3. if an old OPEN session remains from a previous room that did not close cleanly, close it with a safe note such as `auto-closed at next room boot`; do not rewrite its messages;
4. generate a fresh session UUID for this room and call `open_public_transcript_session`;
5. retain the returned `session_id` and current `last_message_order` for this room.

Only one room should be treated as the live AFTERFALL play surface at a time. Returning to an older room starts a new capture session rather than appending to a closed one.

### B. USER capture

For every actual gameplay USER message:

- capture the exact user-visible message, including short inputs such as `ㄱ`, numbers, free actions, corrections, and gameplay feedback;
- do this **before** producing the next GM scene;
- store role `USER`;
- use the current session and the next contiguous message order;
- retain the exact payload until acknowledgement.

Planning/development/archive-maintenance conversation outside actual play is not gameplay RAW and must not be inserted.

### C. GM capture

For every actual gameplay GM public response:

1. compose the exact final user-visible response in private working state;
2. perform the PLAYER_SAFE boundary check;
3. append that exact string with role `GM` (or `ASSISTANT_PUBLIC_META` only when the public block is genuinely operational meta within the play session);
4. only after successful acknowledgement, emit **the same string** to the user.

Do not store a summary and then output a different response. The stored content and public response must be verbatim-identical.

### D. Retry / uncertain acknowledgement

Normal successful writes should be invisible to the player.

If a capture call errors:

1. retry with the same payload and idempotency identity when available;
2. before any retry after an ambiguous acknowledgement, inspect the latest rows for that session so a successful first write is not duplicated;
3. never renumber already acknowledged messages.

After two failed attempts, do not claim the recorder succeeded. Gameplay may continue, but emit one short operational warning and preserve the current room as the recovery source for later backfill.

### E. Room close

When the player asks to move rooms, ends an episode, or closes the season:

1. capture the final public USER/GM messages;
2. close the current transcript session;
3. write the final session UUID / last message order into the handoff or checkpoint metadata when a handoff is being created;
4. then perform GitHub cold-archive promotion at the normal checkpoint/episode cadence.

The player should never need to type a separate save command for routine RAW preservation.


## Open → append → close

### 1. Open one session

At the start of each new AFTERFALL play session, the adapter:

1. reads the authoritative AFTERFALL boot/current checkpoint and runtime save;
2. resolves the exact `season_id`, game time, scene ID, and save version;
3. generates one UUID `session_id`;
4. calls `open_public_transcript_session` with:

   ```text
   worldline_id = AFTERFALL
   chronicle_id = C03
   season_id = current season only
   starting_* = exact current runtime/checkpoint context
   ```

An open retry must reuse every field and the same session UUID. A mismatch is
a hard failure, not a reason to reuse another Chronicle or rewrite state.

### 2. Capture every completed public message

For each completed PLAYER or GM public message:

1. perform the public-safety review;
2. preserve the exact emitted text (no summarization, cleanup, or
   reconstruction);
3. compute lowercase SHA-256 from exact UTF-8 content;
4. allocate the next contiguous `message_order`, starting at zero;
5. generate and durably retain one idempotency UUID for that message;
6. call `append_public_transcript_message`.

The callable API serializes appends per session and rejects skipped or
renumbered orders. A network retry uses the same idempotency UUID and identical
payload; it returns the original record rather than duplicating or overwriting
it. GM output is captured only after the public response is complete.

### 3. Close one session

Before a room change, checkpoint handoff, or deliberate session end:

1. flush all acknowledged messages in ascending `message_order`;
2. call `close_public_transcript_session` with the exact final save version,
   game time, scene ID, and a short safe close note if needed;
3. record the resulting session UUID and last message order in the handoff;
4. use a new UUID for the next play session.

Closed sessions reject new messages. The same close payload may be retried
idempotently. Do not reopen or renumber a session.

## Failure handling

- If the boot/checkpoint/runtime identity cannot be verified, fail closed and
  do not capture a guessed tuple.
- If capture fails before acknowledgement, retain the original payload and
  idempotency UUID for retry; do not substitute reconstructed text.
- If public-safety review is uncertain, omit the message from this public-safe
  store and record only a non-content operational warning outside the
  transcript.
- Historical gaps remain `MISSING_TRANSCRIPT` or `PARTIAL`; this protocol
  begins at the next actual public message and does not fill gaps.

## Archive promotion

Capture is not Canon and is not publication. During a normal Archive review,
only verified public-safe rows may be copied into the C03/AFTERFALL transcript
namespace with their session and partial/gap metadata intact. Canon summaries,
checkpoints, and events must never be converted into USER/GM dialogue.

## Verification reference

The deployed contract and rollback-only verification live on the shared
repository default branch:

- `supabase/migrations/20260925003736_public_transcript_capture_session_api_v1.sql`
- `supabase/tests/public_transcript_capture_session_api_v1_verification.sql`
- `docs/RAW_ROLLING_CAPTURE_V1.md`
