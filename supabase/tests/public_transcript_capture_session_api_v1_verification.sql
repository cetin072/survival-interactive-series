-- Rollback-only verification for 20260925003736_public_transcript_capture_session_api_v1.
-- Run only with a trusted database role. This script leaves no rows behind.

begin;

select survival_rpg.open_public_transcript_session(
  '00000000-0000-0000-0000-000000000101',
  'TEST-ROLLBACK', 'C99-TEST', 'S00', 1, 'T+00:00', 'TEST_OPEN'
);

select survival_rpg.append_public_transcript_message(
  '00000000-0000-0000-0000-000000000101',
  'TEST-ROLLBACK', 'C99-TEST', 'S00', 0, 0, 'USER',
  'rollback verification only',
  'cdf182559b88fc02ab55abf26965b74cadfed6ca6d5ef35d8611e5a5748b46c5',
  '00000000-0000-0000-0000-000000000102',
  'T+00:01', 'TEST_APPEND', 1, 'LIVE'
);

-- Same stable idempotency key/payload returns the first row without duplication.
select survival_rpg.append_public_transcript_message(
  '00000000-0000-0000-0000-000000000101',
  'TEST-ROLLBACK', 'C99-TEST', 'S00', 0, 0, 'USER',
  'rollback verification only',
  'cdf182559b88fc02ab55abf26965b74cadfed6ca6d5ef35d8611e5a5748b46c5',
  '00000000-0000-0000-0000-000000000102',
  'T+00:01', 'TEST_APPEND', 1, 'LIVE'
);

do $$
begin
  begin
    perform survival_rpg.append_public_transcript_message(
      '00000000-0000-0000-0000-000000000101',
      'TEST-ROLLBACK', 'C99-TEST', 'S00', 0, 2, 'GM',
      'out of order',
      '2ee32f5ece03681d50a2cf0ad37c6e65a08cb45ac4fe434bc072533bd91b643b',
      '00000000-0000-0000-0000-000000000103',
      null, null, null, 'LIVE'
    );
    raise exception 'ordered append did not reject a skipped message_order';
  exception when sqlstate '22023' then
    null;
  end;
end;
$$;

select survival_rpg.append_public_transcript_message(
  '00000000-0000-0000-0000-000000000101',
  'TEST-ROLLBACK', 'C99-TEST', 'S00', 0, 1, 'GM',
  'rollback GM verification',
  '363ce9130aacd0aba2feb015c164ae54910242f812292420e1dd2812bf432515',
  '00000000-0000-0000-0000-000000000104',
  'T+00:02', 'TEST_CLOSE', 1, 'LIVE'
);

select survival_rpg.close_public_transcript_session(
  '00000000-0000-0000-0000-000000000101',
  1, 'T+00:03', 'TEST_CLOSED', 'rollback verification only'
);

do $$
begin
  begin
    perform survival_rpg.append_public_transcript_message(
      '00000000-0000-0000-0000-000000000101',
      'TEST-ROLLBACK', 'C99-TEST', 'S00', 0, 2, 'GM',
      'out of order',
      '2ee32f5ece03681d50a2cf0ad37c6e65a08cb45ac4fe434bc072533bd91b643b',
      '00000000-0000-0000-0000-000000000103',
      null, null, null, 'LIVE'
    );
    raise exception 'closed session accepted a new message';
  exception when sqlstate '55000' then
    null;
  end;

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
