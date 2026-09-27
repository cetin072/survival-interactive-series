-- Restore play-first capture after the temporary LIVE state-link hard guard.
-- Historical rows are unchanged. Routine LIVE transcript pairs may again be
-- written without a state-link; state-linked capture remains available for
-- meaningful durable gameplay mutations.
drop trigger if exists afterfall_live_message_requires_state_link
  on survival_rpg.transcript_messages;

drop function if exists survival_rpg.enforce_afterfall_live_message_link();
