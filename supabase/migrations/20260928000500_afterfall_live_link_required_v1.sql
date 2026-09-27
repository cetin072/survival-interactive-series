-- Require every new AFTERFALL/C03 LIVE USER or GM row to belong to a
-- state-linked turn before the surrounding transaction commits.
--
-- Historical unlinked rows are untouched. Explicit RAW fallback remains
-- available by writing the exact pair with source_type='RECOVERY'; those rows
-- stay quarantined from state-linked publication.
--
-- The state-linked writer inserts USER, GM, and transcript_turn_state_links in
-- one transaction, so this deferred trigger observes the completed link.
create or replace function survival_rpg.enforce_afterfall_live_message_link()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, survival_rpg
as $$
begin
  if new.worldline_id is distinct from 'AFTERFALL'
     or new.chronicle_id is distinct from 'C03'
     or new.source_type is distinct from 'LIVE'
     or new.role not in ('USER', 'GM') then
    return null;
  end if;

  if not exists (
    select 1
    from survival_rpg.transcript_turn_state_links as l
    where l.worldline_id = new.worldline_id
      and l.chronicle_id = new.chronicle_id
      and l.season_id = new.season_id
      and l.session_id = new.session_id
      and l.turn_no = new.turn_no
      and (l.user_message_id = new.id or l.gm_message_id = new.id)
  ) then
    raise exception
      'AFTERFALL LIVE USER/GM rows require state-linked turn capture; use RECOVERY only for explicit unlinked fallback'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger afterfall_live_message_requires_state_link
after insert on survival_rpg.transcript_messages
deferrable initially deferred
for each row
execute function survival_rpg.enforce_afterfall_live_message_link();
