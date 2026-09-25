# Rolling Raw Capture V1

Status: ACTIVE
Migration: `20260924173125_rolling_raw_capture_v1`
Storage: `survival_rpg.transcript_sessions` + `survival_rpg.transcript_messages`
Write API: migration `20260925003736_public_transcript_capture_session_api_v1`

## Purpose and scope

The table preserves future, player-safe raw USER/GM conversation before it is
condensed into Canon. It is not an Archive publication feed, a Canon source of
truth, or a replacement for the Runtime save. Existing historical gaps remain
gaps; this system never reconstructs them.

Every row is scoped by the full identity tuple:

```text
Survival Diary IP → chronicle_id → worldline_id → season_id → session_id → message_order
```

The trusted capture caller must resolve that tuple from the active worldline
boot/checkpoint before writing. It must never use another Chronicle's Canon,
entity, or checkpoint to complete missing values. In particular, the active
C03 `AFTERFALL` stream is independent of C01 and C02 history.

## Data contract

Required fields are `worldline_id`, `chronicle_id`, `season_id`, `session_id`,
`turn_no`, `message_order`, `role`, `content`, `content_sha256`, and a stable
`idempotency_key`.

- `role` is one of `USER`, `GM`, or `ASSISTANT_PUBLIC_META`.
- `content_sha256` is the lowercase SHA-256 of the exact UTF-8 `content`.
- `message_order` is monotonically allocated within the session. The database
  uniquely enforces `(worldline_id, chronicle_id, season_id, session_id,
  message_order)`.
- `idempotency_key` is generated once per message by the trusted caller and
  reused for every retry. It is globally unique.
- `game_time`, `scene_id`, and `save_version` are optional context, not
  permission to infer or rewrite dialogue.
- `public_safe` is forced true. Anything not safely publishable must remain
  outside this table.

The trusted service uses only these callable database functions (all are
`SECURITY INVOKER`, and executable only by `service_role`):

- `open_public_transcript_session(...)` creates an `OPEN` session or returns
  the existing session only when every opening field matches exactly.
- `append_public_transcript_message(...)` verifies exact UTF-8 SHA-256,
  serializes the session, and accepts only the next `message_order`. A retry
  with the same stable key and identical payload returns the original row;
  any mismatch fails without overwriting it.
- `close_public_transcript_session(...)` records the final runtime context and
  closes the session idempotently. New messages are rejected afterward, while
  completed append retries remain readable to the trusted service.

Do not call the tables directly from gameplay code. Generate the session UUID
and per-message idempotency UUID in the trusted capture adapter, then retain
them until acknowledgement/retry completes.

## Session and flush lifecycle

1. On a session open, resolve and persist one new `session_id` with the exact
   Chronicle/worldline/season identity by calling
   `open_public_transcript_session`. Initialize `message_order` to zero.
2. Before every flush, redact or reject secrets, personal information, hidden
   GM state, future spoilers, and non-public tool context. Compute the content
   SHA-256 after that review.
3. Append the completed USER/GM/public-meta message using
   `append_public_transcript_message`. A retry reuses the same key and payload.
4. On session close, flush every acknowledged message in ascending
   `message_order`, call `close_public_transcript_session` with final runtime
   context, record the close in the Runtime/session handoff, and start a new
   UUID for the next session. Never reopen a closed session to renumber it.
5. Archive publication remains a separate PLAYER_SAFE review step. Raw capture
   alone does not make a message Canon or publish it on Netlify.

## Security and immutability

- RLS is enabled and forced; the table has no policies.
- `anon`, `authenticated`, and `public` receive no table privileges.
- Only the server-held `service_role` has the minimum table privileges needed
  by the security-invoker lifecycle functions. The browser roles have none.
  Do not place that key in browser code,
  static Archive assets, commits, logs, or examples.
- A `BEFORE UPDATE OR DELETE` trigger rejects mutation even if a trusted
  maintenance session attempts it. Corrections are a new message plus an
  explicit publication-layer annotation, never a raw-row rewrite.
- The current static Archive frontend does not connect to Supabase directly.

## Verification

- Repository mirror: `supabase/migrations/20260924173125_rolling_raw_capture_v1.sql`
- Rollback-only database check: `supabase/tests/rolling_raw_capture_v1_verification.sql`
- Session API mirror: `supabase/migrations/20260925003736_public_transcript_capture_session_api_v1.sql`
- Session API rollback check: `supabase/tests/public_transcript_capture_session_api_v1_verification.sql`
- The connected Supabase migration ledger records this migration under the same
  version and name. The verification script inserts only inside a transaction,
  proves UPDATE rejection, and rolls back.


## 2026-09-25 operational proof

A rollback-only connected-database proof exercised the deployed lifecycle API end to end:

1. open one C03 / AFTERFALL / S02 session;
2. append USER order 0;
3. append GM order 1;
4. retry the USER append with the same idempotency key and payload;
5. reject a skipped message order;
6. reject a C02 / STRONGHOLD identity against the C03 session;
7. close the session;
8. reject a new append after close;
9. roll the transaction back and verify zero test residue.

This proves the database contract is operational. It does **not** prove that the
ChatGPT product conversation runtime automatically calls the adapter on every
message. At present, that product-level hook is **NOT YET AUTOMATIC** from this
repository alone. A trusted caller must invoke the session API during play (for
example, an authorized GM/tool workflow). Do not describe the system as
"automatic live capture" until real play produces non-test rows without a
manual archive/backfill step.
