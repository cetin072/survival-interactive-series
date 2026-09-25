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
Canon condensation. This protocol does not retroactively fabricate any missing
historical dialogue, and it does not publish a captured row automatically.

The identity is fixed for this worldline:

```text
Survival Diary IP → C03 서진우 → AFTERFALL → active season → session UUID
```

C01 and C02 are never accepted as a fallback for an AFTERFALL field, context,
or message.

## Trusted capture boundary

Only a trusted server-side capture adapter may call the database API using its
server-held `service_role`. Browser code, Archive static assets, prompts,
logs, and Git commits must never contain that credential.

The adapter must reject rather than capture:

- system/developer instructions, hidden reasoning, tool inputs or results;
- hidden GM plans, unrevealed NPC state, future spoilers;
- credentials, personal information, or any text not safe for a future public
  transcript review.

The database verifies the exact UTF-8 SHA-256 of each submitted message and
stores only public-safe rows. It is append-only; a correction is a later
annotation/publication decision, never an edit of the original row.

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
