-- ISOLATED database only. Uses synthetic IDs/content. Never run in the live project.
begin;
set local role service_role;
do $$
declare old survival_rpg.transcript_sessions; fresh survival_rpg.transcript_sessions;
  p jsonb := '{"version":1,"disposition":"REVIEW_REQUIRED","publication":"REVIEW_REQUIRED","kind":"NEW_SEASON","history":"NEW_CAPTURE","initial_order":0,"predecessor_id":"00000000-0000-4000-8000-000000000001","evidence_ref":"https://github.com/cetin072/survival-interactive-series/issues/150"}';
begin
  old := survival_rpg.open_public_transcript_session('00000000-0000-4000-8000-000000000001','AFTERFALL','C03','S03');
  if old.archive_intent is not null then raise exception 'legacy call must not imply adoption'; end if;
  begin
    perform survival_rpg.open_public_transcript_session_with_archive_intent('00000000-0000-4000-8000-000000000004','AFTERFALL','C03','S04',
      p || '{"disposition":"ADOPTED","publication":"APPROVED"}');
    raise exception 'GM approval forgery accepted';
  exception when others then if sqlerrm <> 'INVALID_ARCHIVE_INTENT' then raise; end if; end;
  if exists(select 1 from survival_rpg.transcript_sessions where id='00000000-0000-4000-8000-000000000004') then
    raise exception 'forged wrapper open was not rolled back'; end if;
  fresh := survival_rpg.open_public_transcript_session_with_archive_intent('00000000-0000-4000-8000-000000000002','AFTERFALL','C03','S04',p);
  if fresh.archive_intent is distinct from p or fresh.last_message_order <> -1 then raise exception 'open wrapper changed capture'; end if;
  fresh := survival_rpg.open_public_transcript_session_with_archive_intent('00000000-0000-4000-8000-000000000002','AFTERFALL','C03','S04',p);
  begin
    perform survival_rpg.set_archive_source_intent(fresh.id,p || '{"kind":"CONTINUE"}');
    raise exception 'expected compare-and-set rejection';
  exception when others then if sqlerrm <> 'ARCHIVE_INTENT_CHANGED' then raise; end if; end;
  begin
    perform survival_rpg.set_archive_source_intent(old.id,p || '{"hidden_state":{}}');
    raise exception 'expected malformed metadata rejection';
  exception when others then if sqlerrm <> 'INVALID_ARCHIVE_INTENT' then raise; end if; end;
  begin
    perform survival_rpg.set_archive_source_intent(old.id,p || '{"predecessor_id":"00000000-0000-4000-8000-000000000001"}');
    raise exception 'expected self-link rejection';
  exception when others then if sqlerrm <> 'INVALID_ARCHIVE_INTENT' then raise; end if; end;
  begin
    perform survival_rpg.open_public_transcript_session_with_archive_intent('00000000-0000-4000-8000-000000000003','AFTERFALL','C04','S04',p);
    raise exception 'expected scope rejection';
  exception when others then if sqlerrm <> 'UNAPPROVED_DISCOVERY_SCOPE' then raise; end if; end;
  if exists(select 1 from survival_rpg.transcript_sessions where id='00000000-0000-4000-8000-000000000003') then
    raise exception 'failed wrapper must roll back its open';
  end if;
  begin
    update survival_rpg.transcript_sessions set archive_intent=p || '{"disposition":"ADOPTED","publication":"APPROVED"}' where id=fresh.id;
    raise exception 'direct service UPDATE granted approval';
  exception when check_violation then null; end;
  begin
    perform public.archive_operator_authorize_source(fresh.id,p,'{}');
    raise exception 'service credential reached approver';
  exception when insufficient_privilege then null; end;
  begin
    insert into survival_ops.archive_source_authorizations(session_id) values(fresh.id);
    raise exception 'service credential wrote protected authority';
  exception when insufficient_privilege then null; end;
  perform survival_rpg.close_public_transcript_session(fresh.id);
  select * into fresh from survival_rpg.transcript_sessions where id=fresh.id;
  if fresh.archive_intent is distinct from p or fresh.status <> 'CLOSED' then raise exception 'legacy close changed intent'; end if;
end;
$$;
reset role;
set local role archive_exporter;
do $$
begin
  if (select count(*) from survival_rpg.transcript_sessions where archive_intent->>'disposition'='REVIEW_REQUIRED') <> 1 then
    raise exception 'metadata not readable under existing scoped SELECT';
  end if;
  if has_function_privilege(current_user,'survival_rpg.set_archive_source_intent(uuid,jsonb,jsonb)','EXECUTE')
     or has_table_privilege(current_user,'survival_rpg.transcript_sessions','UPDATE') then
    raise exception 'exporter gained source writes';
  end if;
  if has_function_privilege('anon','survival_rpg.open_public_transcript_session_with_archive_intent(uuid,text,text,text,jsonb,integer,text,text)','EXECUTE')
     or has_function_privilege('authenticated','survival_rpg.set_archive_source_intent(uuid,jsonb,jsonb)','EXECUTE') then
    raise exception 'browser role gained intent write';
  end if;
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000098',true);
do $$ begin
  begin
    perform public.archive_operator_authorize_source('00000000-0000-4000-8000-000000000002','{}','{}');
    raise exception 'ordinary authenticated user approved';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000097',true);
do $$ begin
  begin
    perform public.archive_operator_authorize_source('00000000-0000-4000-8000-000000000002','{}','{}');
    raise exception 'inactive operator approved';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
do $$ declare p jsonb; d jsonb := '{"disposition":"ADOPTED","publication":"APPROVED","evidence_ref":"https://github.com/cetin072/survival-interactive-series/issues/150","allow_continuation":true,"published_predecessor_id":"00000000-0000-4000-8000-000000000001","supersedes_id":null,"approved_through":null}';
begin
  -- The trusted operator RPC validates its input against the actual captured intent.
  p := '{"version":1,"disposition":"REVIEW_REQUIRED","publication":"REVIEW_REQUIRED","kind":"NEW_SEASON","history":"NEW_CAPTURE","initial_order":0,"predecessor_id":"00000000-0000-4000-8000-000000000001","evidence_ref":"https://github.com/cetin072/survival-interactive-series/issues/150"}';
  perform public.archive_operator_authorize_source('00000000-0000-4000-8000-000000000002',p,d);
  perform public.archive_operator_authorize_source('00000000-0000-4000-8000-000000000002',p,d);
  begin
    perform public.archive_operator_authorize_source('00000000-0000-4000-8000-000000000002',p || '{"kind":"CONTINUE"}',d);
    raise exception 'mismatched runtime attestation accepted';
  exception when others then if sqlerrm <> 'ARCHIVE_INTENT_CHANGED' then raise; end if; end;
  begin
    perform public.archive_operator_authorize_source('00000000-0000-4000-8000-000000000002',p,d || '{"publication":"REVIEW_REQUIRED"}');
    raise exception 'decision changed without CAS';
  exception when others then if sqlerrm <> 'ARCHIVE_AUTHORIZATION_CHANGED' then raise; end if; end;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}',true);
do $$ begin
  begin
    perform public.archive_operator_authorize_source('00000000-0000-4000-8000-000000000002','{}','{}');
    raise exception 'forged JWT text bypassed DB role ACL';
  exception when insufficient_privilege then null; end;
  if has_table_privilege(current_user,'public.profiles','UPDATE') then raise exception 'GM may forge capability registry'; end if;
end $$;
reset role;
rollback;
