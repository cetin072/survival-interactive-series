-- Read-only/rollback verification for 20260924173125_rolling_raw_capture_v1.
-- Run only with a trusted database role. This script leaves no rows behind.

begin;

insert into survival_rpg.transcript_messages (
  worldline_id, chronicle_id, season_id, session_id, turn_no, message_order,
  role, content, content_sha256, idempotency_key
) values (
  'TEST-ROLLBACK', 'C99-TEST', 'S00',
  '00000000-0000-0000-0000-000000000001', 0, 0,
  'USER', 'rollback verification only',
  'cdf182559b88fc02ab55abf26965b74cadfed6ca6d5ef35d8611e5a5748b46c5',
  '00000000-0000-0000-0000-000000000002'
);

do $$
begin
  begin
    update survival_rpg.transcript_messages
      set content = 'must not persist'
      where worldline_id = 'TEST-ROLLBACK';
    raise exception 'append-only trigger did not reject UPDATE';
  exception when sqlstate '55000' then
    null;
  end;
end;
$$;

rollback;
