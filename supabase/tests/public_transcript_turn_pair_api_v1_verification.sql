-- Rollback-only verification for 20260925044647_public_transcript_turn_pair_api_v1.
-- Leaves no rows behind.

begin;

select survival_rpg.open_public_transcript_session(
  '00000000-0000-0000-0000-00000000b301',
  'AFTERFALL', 'C03', 'S02', 216, 'TEST-TURN-PAIR', 'TEST_TURN_PAIR'
);

select *
from survival_rpg.append_public_transcript_turn(
  '00000000-0000-0000-0000-00000000b301',
  'AFTERFALL', 'C03', 'S02',
  1, 0,
  'PLAYER exact turn pair test',
  'feaa7031bc46675337351079c308594c201cc4e8d7c5fc0709c88f04ad46d041',
  '00000000-0000-0000-0000-00000000b302',
  'GM exact turn pair test',
  'f2a22c410f88a93132fb49ab15761475d19d580901257be1411708935994749f',
  '00000000-0000-0000-0000-00000000b303',
  'TEST-TURN-PAIR', 'TEST_TURN_PAIR', 216,
  'TEST-TURN-PAIR-END', 'TEST_TURN_PAIR', 216,
  'LIVE'
);

-- An exact retry must return the same pair and not duplicate either message.
select *
from survival_rpg.append_public_transcript_turn(
  '00000000-0000-0000-0000-00000000b301',
  'AFTERFALL', 'C03', 'S02',
  1, 0,
  'PLAYER exact turn pair test',
  'feaa7031bc46675337351079c308594c201cc4e8d7c5fc0709c88f04ad46d041',
  '00000000-0000-0000-0000-00000000b302',
  'GM exact turn pair test',
  'f2a22c410f88a93132fb49ab15761475d19d580901257be1411708935994749f',
  '00000000-0000-0000-0000-00000000b303',
  'TEST-TURN-PAIR', 'TEST_TURN_PAIR', 216,
  'TEST-TURN-PAIR-END', 'TEST_TURN_PAIR', 216,
  'LIVE'
);

do $$
declare
  v_count integer;
  v_roles text[];
begin
  select count(*), array_agg(role order by message_order)
    into v_count, v_roles
  from survival_rpg.transcript_messages
  where session_id = '00000000-0000-0000-0000-00000000b301';

  if v_count <> 2 then
    raise exception 'turn-pair retry produced % rows instead of 2', v_count;
  end if;

  if v_roles is distinct from array['USER','GM']::text[] then
    raise exception 'turn-pair role order is %', v_roles;
  end if;

  begin
    perform survival_rpg.append_public_transcript_turn(
      '00000000-0000-0000-0000-00000000b301',
      'AFTERFALL', 'C03', 'S02',
      2, 4,
      'skip USER',
      encode(extensions.digest(convert_to('skip USER','UTF8'),'sha256'),'hex'),
      '00000000-0000-0000-0000-00000000b304',
      'skip GM',
      encode(extensions.digest(convert_to('skip GM','UTF8'),'sha256'),'hex'),
      '00000000-0000-0000-0000-00000000b305',
      null, null, 216, null, null, 216, 'LIVE'
    );
    raise exception 'turn-pair API accepted skipped order';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform survival_rpg.append_public_transcript_turn(
      '00000000-0000-0000-0000-00000000b301',
      'STRONGHOLD', 'C02', 'S02',
      2, 2,
      'wrong USER',
      encode(extensions.digest(convert_to('wrong USER','UTF8'),'sha256'),'hex'),
      '00000000-0000-0000-0000-00000000b306',
      'wrong GM',
      encode(extensions.digest(convert_to('wrong GM','UTF8'),'sha256'),'hex'),
      '00000000-0000-0000-0000-00000000b307',
      null, null, 216, null, null, 216, 'LIVE'
    );
    raise exception 'turn-pair API accepted wrong Chronicle identity';
  exception when sqlstate '23505' then
    null;
  end;
end;
$$;

rollback;
