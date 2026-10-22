-- Additive editorial working state. Immutable semantic jobs, review decisions,
-- receipts, and the public Git snapshot remain authoritative history.
create table survival_ops.knowledge_editor_state (
  job_id uuid primary key references survival_ops.knowledge_semantic_jobs on delete restrict,
  archived boolean not null default false,
  evidence_review jsonb not null default '{"claims":[],"resolutions":[]}',
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.profiles on delete restrict
);
create table survival_ops.knowledge_editor_versions (
  job_id uuid not null references survival_ops.knowledge_semantic_jobs on delete restrict,
  revision integer not null,
  draft_sha256 text not null,
  brief jsonb not null,
  evidence_review jsonb not null,
  edited_by uuid references public.profiles on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key(job_id,revision)
);
create table survival_ops.knowledge_editor_requests (
  request_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references survival_ops.knowledge_semantic_jobs on delete restrict,
  revision integer not null,
  draft_sha256 text not null,
  snapshot jsonb not null,
  publish_requested boolean not null,
  approved_by uuid not null references public.profiles on delete restrict,
  status text not null default 'QUEUED' check(status in ('QUEUED','CHECKING','WAITING_CI','PUBLISHING','PUBLISHED','CHECKED','FAILED','RETRYABLE','CANCELLED')),
  attempt integer not null default 0,
  lease_token uuid,
  lease_at timestamptz,
  result jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(job_id,revision,publish_requested)
);
create unique index knowledge_editor_one_active on survival_ops.knowledge_editor_requests(job_id)
where status in ('QUEUED','CHECKING','WAITING_CI','PUBLISHING');
-- Preserve all existing user edits before any new edit is possible.
insert into survival_ops.knowledge_editor_versions(job_id,revision,draft_sha256,brief,evidence_review,edited_by,created_at)
select job_id,revision,draft_sha256,draft_brief,'{"claims":[],"resolutions":[]}',edited_by,updated_at
from survival_ops.knowledge_operator_drafts;

do $$ declare t text; begin
 foreach t in array array['knowledge_editor_state','knowledge_editor_versions','knowledge_editor_requests'] loop
  execute format('alter table survival_ops.%I enable row level security',t);
  execute format('revoke all on survival_ops.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function survival_ops.private_knowledge_editor_idle(p_job_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from survival_ops.knowledge_editor_requests where job_id=p_job_id and status in ('QUEUED','CHECKING','WAITING_CI','PUBLISHING'))
 then raise exception 'KNOWLEDGE_EDITOR_PUBLICATION_ACTIVE'; end if;
 -- Legacy approvals must finish/recover through their existing exact-version path.
 if exists(select 1 from survival_ops.archive_review_items i
 join survival_ops.knowledge_semantic_jobs j on j.job_id=p_job_id
 where i.source_worker='C_KNOWLEDGE' and i.status='APPROVED' and i.superseded_by is null
 and i.payload->>'operator_job_id'=j.job_id::text and j.status<>'PUBLISHED'
 and not exists(select 1 from survival_ops.archive_review_consumption_receipts r where r.item_id=i.id and r.outcome='BLOCKED'))
 then raise exception 'KNOWLEDGE_EDITOR_LEGACY_APPROVAL_ACTIVE'; end if;
end $$;

-- A working copy can be incomplete. Publishing still uses the full existing
-- validator/build/evidence gates; saving never asserts machine QA PASS.
create function survival_ops.private_knowledge_editor_validate(p_job_id uuid,p_brief jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare j survival_ops.knowledge_semantic_jobs%rowtype; base jsonb; f text; begin
 select * into strict j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id;
 base:=coalesce((select draft_brief from survival_ops.knowledge_operator_drafts where job_id=p_job_id),j.semantic_result->'brief');
 if jsonb_typeof(p_brief) is distinct from 'object' or pg_column_size(p_brief)>262144 then raise exception 'KNOWLEDGE_EDITOR_BRIEF_REQUIRED'; end if;
 if p_brief->>'id' is distinct from coalesce(base->>'id',j.semantic_context->'target'->>'brief_id') then raise exception 'KNOWLEDGE_EDITOR_ID_LOCKED'; end if;
 if base is null and (p_brief->>'risk_level' is distinct from 'HIGH' or p_brief->>'publication_policy' is distinct from 'HUMAN_APPROVED' or p_brief->>'semantic_qa_status' is distinct from 'REVIEW' or p_brief->'risk_domains' is distinct from '["OTHER_SEVERE_HARM"]'::jsonb) then raise exception 'KNOWLEDGE_EDITOR_NEW_DRAFT_RISK_LOCKED'; end if;
 if base is not null then
  foreach f in array array['id','slug','topic_id','content_type','risk_level','risk_domains','publication_policy','story_refs','tools','guide_id','ai_assisted','source_checked_at'] loop
   if p_brief->f is distinct from base->f then raise exception 'KNOWLEDGE_EDITOR_IDENTITY_LOCKED:%',f; end if;
  end loop;
 end if;
 if p_brief->'semantic_qa_status' is distinct from coalesce(base->'semantic_qa_status','"REVIEW"'::jsonb) then raise exception 'KNOWLEDGE_EDITOR_MACHINE_QA_LOCKED'; end if;
 if jsonb_typeof(p_brief->'sections') is distinct from 'array' or jsonb_typeof(p_brief->'sources') is distinct from 'array' then raise exception 'KNOWLEDGE_EDITOR_STRUCTURE_INVALID'; end if;
end $$;

create function public.archive_operator_knowledge_editor_get(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; j survival_ops.knowledge_semantic_jobs%rowtype; d survival_ops.knowledge_operator_drafts%rowtype; s survival_ops.knowledge_editor_state%rowtype; request jsonb; begin
 actor:=survival_ops.private_require_archive_operator();
 select * into j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id;
 if not found then raise exception 'KNOWLEDGE_EDITOR_NOT_FOUND'; end if;
 select * into d from survival_ops.knowledge_operator_drafts where job_id=p_job_id;
 select * into s from survival_ops.knowledge_editor_state where job_id=p_job_id;
 select to_jsonb(r)-'snapshot'-'lease_token' into request from survival_ops.knowledge_editor_requests r where job_id=p_job_id order by created_at desc limit 1;
 return jsonb_build_object('job_id',j.job_id,'revision',coalesce(d.revision,0),'draft_sha256',d.draft_sha256,
 'brief',coalesce(d.draft_brief,j.semantic_result->'brief'),'original',j.semantic_result,'context',j.semantic_context,
 'archived',coalesce(s.archived,j.status in ('HOLD','BLOCKED')),'evidence_review',coalesce(s.evidence_review,jsonb_build_object('claims',coalesce(j.semantic_result->'evidence'->'claims','[]'::jsonb),'resolutions','[]'::jsonb)),
 'status',j.status,'blocker_code',j.blocker_code,'updated_at',coalesce(d.updated_at,j.updated_at),'request',request,
 'history',(select coalesce(jsonb_agg(jsonb_build_object('revision',v.revision,'draft_sha256',v.draft_sha256,'created_at',v.created_at) order by v.revision desc),'[]'::jsonb) from survival_ops.knowledge_editor_versions v where job_id=p_job_id),
 'public_record',(select to_jsonb(pr)-'snapshot'-'lease_token' from survival_ops.knowledge_editor_requests pr where pr.job_id=p_job_id and pr.status='PUBLISHED' order by pr.created_at desc limit 1),
 'source_ref',j.source_ref,'brief_id',coalesce(j.semantic_result->'brief'->>'id',j.semantic_context->'target'->>'brief_id'));
end $$;

create function public.archive_operator_knowledge_editor_save(p_job_id uuid,p_expected_revision integer,p_brief jsonb,p_evidence_review jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; j survival_ops.knowledge_semantic_jobs%rowtype; d survival_ops.knowledge_operator_drafts%rowtype; rev integer; digest text; begin
 actor:=survival_ops.private_require_archive_operator();
 select * into strict j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id for update;
 perform survival_ops.private_knowledge_editor_idle(p_job_id);
 select * into d from survival_ops.knowledge_operator_drafts where job_id=p_job_id for update;
 if coalesce(d.revision,0) is distinct from p_expected_revision then raise exception using errcode='40001',message='KNOWLEDGE_EDITOR_REVISION_CONFLICT'; end if;
 if coalesce((select archived from survival_ops.knowledge_editor_state where job_id=p_job_id),j.status in ('HOLD','BLOCKED')) then raise exception 'KNOWLEDGE_EDITOR_RESTORE_REQUIRED'; end if;
 perform survival_ops.private_knowledge_editor_validate(p_job_id,p_brief);
 if jsonb_typeof(p_evidence_review) is distinct from 'object' or jsonb_typeof(p_evidence_review->'claims') is distinct from 'array' or jsonb_typeof(p_evidence_review->'resolutions') is distinct from 'array' or pg_column_size(p_evidence_review)>262144 then raise exception 'KNOWLEDGE_EDITOR_REVIEW_INVALID'; end if;
 if d.draft_brief=p_brief and coalesce((select evidence_review from survival_ops.knowledge_editor_state where job_id=p_job_id),'{}')=p_evidence_review then return public.archive_operator_knowledge_editor_get(p_job_id); end if;
 rev:=coalesce(d.revision,0)+1;
 -- Hash includes linked evidence/decisions, so changing only evidence invalidates the old approval too.
 digest:=encode(extensions.digest(convert_to(jsonb_build_object('brief',p_brief,'review',p_evidence_review)::text,'UTF8'),'sha256'),'hex');
 insert into survival_ops.knowledge_operator_drafts(job_id,brief_id,base_semantic_result_sha256,draft_brief,draft_sha256,revision,edited_by)
 values(p_job_id,p_brief->>'id',coalesce(j.semantic_result_sha256,encode(extensions.digest(convert_to(j.semantic_context::text,'UTF8'),'sha256'),'hex')),p_brief,digest,rev,actor)
 on conflict(job_id) do update set draft_brief=excluded.draft_brief,draft_sha256=excluded.draft_sha256,revision=excluded.revision,edited_by=excluded.edited_by,updated_at=clock_timestamp();
 insert into survival_ops.knowledge_editor_state(job_id,evidence_review,updated_by) values(p_job_id,p_evidence_review,actor)
 on conflict(job_id) do update set evidence_review=excluded.evidence_review,updated_at=clock_timestamp(),updated_by=actor;
 insert into survival_ops.knowledge_editor_versions(job_id,revision,draft_sha256,brief,evidence_review,edited_by) values(p_job_id,rev,digest,p_brief,p_evidence_review,actor);
 return public.archive_operator_knowledge_editor_get(p_job_id);
end $$;

create function public.archive_operator_knowledge_editor_action(p_job_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; j survival_ops.knowledge_semantic_jobs%rowtype; begin
 actor:=survival_ops.private_require_archive_operator();
 select * into strict j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id for update;
 perform survival_ops.private_knowledge_editor_idle(p_job_id);
 if p_action not in ('RESTORE','ARCHIVE') or p_action is null then raise exception 'KNOWLEDGE_EDITOR_ACTION_INVALID'; end if;
 insert into survival_ops.knowledge_editor_state(job_id,archived,evidence_review,updated_by)
 values(p_job_id,p_action='ARCHIVE',jsonb_build_object('claims',coalesce(j.semantic_result->'evidence'->'claims','[]'::jsonb),'resolutions','[]'::jsonb),actor)
 on conflict(job_id) do update set archived=excluded.archived,updated_at=clock_timestamp(),updated_by=actor;
 return public.archive_operator_knowledge_editor_get(p_job_id);
end $$;

create function public.archive_operator_knowledge_editor_request(p_job_id uuid,p_expected_revision integer,p_publish boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; j survival_ops.knowledge_semantic_jobs%rowtype; d survival_ops.knowledge_operator_drafts%rowtype; r survival_ops.knowledge_editor_requests%rowtype; token text; dispatch_id bigint; begin
 actor:=survival_ops.private_require_archive_operator();
 select * into strict j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id for update;
 select * into strict d from survival_ops.knowledge_operator_drafts where job_id=p_job_id for update;
 if d.revision is distinct from p_expected_revision then raise exception using errcode='40001',message='KNOWLEDGE_EDITOR_REVISION_CONFLICT'; end if;
 if p_publish is null then raise exception 'KNOWLEDGE_EDITOR_INTENT_REQUIRED'; end if;
 select * into r from survival_ops.knowledge_editor_requests where job_id=p_job_id and revision=d.revision and publish_requested=p_publish;
 if found and r.status not in ('FAILED','RETRYABLE') and not (r.status='QUEUED' and r.updated_at<clock_timestamp()-interval '2 minutes') then return to_jsonb(r)-'snapshot'-'lease_token'; end if;
 if r.status='QUEUED' then update survival_ops.knowledge_editor_requests set status='RETRYABLE' where request_id=r.request_id; end if;
 perform survival_ops.private_knowledge_editor_idle(p_job_id);
 if coalesce((select archived from survival_ops.knowledge_editor_state where job_id=p_job_id),j.status in ('HOLD','BLOCKED')) then raise exception 'KNOWLEDGE_EDITOR_RESTORE_REQUIRED'; end if;
 if r.request_id is not null then
  update survival_ops.knowledge_editor_requests set status='QUEUED',lease_token=null,lease_at=null,updated_at=clock_timestamp() where request_id=r.request_id returning * into r;
 else
  insert into survival_ops.knowledge_editor_requests(job_id,revision,draft_sha256,publish_requested,approved_by,snapshot)
  values(p_job_id,d.revision,d.draft_sha256,p_publish,actor,
   jsonb_build_object('job',to_jsonb(j),'brief',d.draft_brief,'review',coalesce((select evidence_review from survival_ops.knowledge_editor_state where job_id=p_job_id),'{}'::jsonb))) returning * into r;
 end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='archive_github_dispatch_token' order by created_at desc limit 1;
 if token is null then raise exception 'KNOWLEDGE_EDITOR_DISPATCH_UNAVAILABLE'; end if;
 select net.http_post(url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/knowledge-review-consumer.yml/dispatches',
 body:=jsonb_build_object('ref','main','inputs',jsonb_build_object('editorial_request_id',r.request_id::text)),
 headers:=jsonb_build_object('Accept','application/vnd.github+json','Authorization','Bearer '||token,'Content-Type','application/json','X-GitHub-Api-Version','2022-11-28'),timeout_milliseconds:=10000) into dispatch_id;
 return (to_jsonb(r)-'snapshot'-'lease_token')||jsonb_build_object('dispatch_request_id',dispatch_id);
end $$;

-- Server-only lease and state transitions. No client can claim machine verification.
create function public.archive_worker_knowledge_editor_request(p_request_id uuid,p_action text,p_lease_token uuid default null,p_result jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r survival_ops.knowledge_editor_requests%rowtype; next_status text; begin
 select * into strict r from survival_ops.knowledge_editor_requests where request_id=p_request_id for update;
 if p_action='GET' then return to_jsonb(r); end if;
 if p_action='CLAIM' then
  if r.status in ('PUBLISHED','CHECKED','CANCELLED') then return jsonb_build_object('status','NOOP'); end if;
  if r.status not in ('QUEUED','RETRYABLE','FAILED') and r.lease_at>clock_timestamp()-interval '35 minutes' then return jsonb_build_object('status','BUSY'); end if;
  update survival_ops.knowledge_editor_requests set status='CHECKING',lease_token=gen_random_uuid(),lease_at=clock_timestamp(),attempt=attempt+1,updated_at=clock_timestamp() where request_id=p_request_id returning * into r;
  return to_jsonb(r);
 end if;
 if r.lease_token is distinct from p_lease_token or p_lease_token is null then raise exception 'KNOWLEDGE_EDITOR_LEASE_INVALID'; end if;
 if r.status not in ('CHECKING','WAITING_CI','PUBLISHING') then raise exception 'KNOWLEDGE_EDITOR_TRANSITION_INVALID'; end if;
 if p_action not in ('WAITING_CI','PUBLISHING','PUBLISHED','CHECKED','FAILED','RETRYABLE') then raise exception 'KNOWLEDGE_EDITOR_TRANSITION_INVALID'; end if;
 if p_action='PUBLISHED' and (not r.publish_requested or r.status<>'PUBLISHING' or p_result->>'status' is distinct from 'LIVE_VERIFIED' or p_result->>'public_url' !~ '^https://survival-diary-archive\.netlify\.app/knowledge/[a-z0-9-]+/$' or p_result->>'merge_sha' !~ '^[a-f0-9]{40}$' or nullif(p_result->>'verified_at','') is null) then raise exception 'KNOWLEDGE_EDITOR_PUBLIC_PROOF_REQUIRED'; end if;
 if p_action in ('WAITING_CI','PUBLISHING') and not r.publish_requested then raise exception 'KNOWLEDGE_EDITOR_APPROVAL_REQUIRED'; end if;
 update survival_ops.knowledge_editor_requests set status=p_action,result=result||p_result,lease_at=clock_timestamp(),updated_at=clock_timestamp() where request_id=p_request_id returning * into r;
 return to_jsonb(r);
end $$;

-- Guard all historical data against mutation, including by later maintenance code.
create function survival_ops.guard_knowledge_editor_history() returns trigger
language plpgsql set search_path='' as $$ begin raise exception 'KNOWLEDGE_EDITOR_HISTORY_IMMUTABLE'; end $$;
create trigger knowledge_editor_version_immutable before update or delete on survival_ops.knowledge_editor_versions for each row execute function survival_ops.guard_knowledge_editor_history();
create function survival_ops.guard_knowledge_editor_request_snapshot() returns trigger
language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' then raise exception 'KNOWLEDGE_EDITOR_REQUEST_IMMUTABLE'; end if;
 if row(new.job_id,new.revision,new.draft_sha256,new.snapshot,new.publish_requested,new.approved_by,new.created_at) is distinct from row(old.job_id,old.revision,old.draft_sha256,old.snapshot,old.publish_requested,old.approved_by,old.created_at) then raise exception 'KNOWLEDGE_EDITOR_REQUEST_IMMUTABLE'; end if;
 return new;
end $$;
create trigger knowledge_editor_request_immutable before update or delete on survival_ops.knowledge_editor_requests for each row execute function survival_ops.guard_knowledge_editor_request_snapshot();

revoke all on function survival_ops.private_knowledge_editor_idle(uuid),survival_ops.private_knowledge_editor_validate(uuid,jsonb),survival_ops.guard_knowledge_editor_history(),survival_ops.guard_knowledge_editor_request_snapshot() from public,anon,authenticated,service_role;
revoke all on function public.archive_operator_knowledge_editor_get(uuid),public.archive_operator_knowledge_editor_save(uuid,integer,jsonb,jsonb),public.archive_operator_knowledge_editor_action(uuid,text),public.archive_operator_knowledge_editor_request(uuid,integer,boolean),public.archive_worker_knowledge_editor_request(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.archive_operator_knowledge_editor_get(uuid),public.archive_operator_knowledge_editor_save(uuid,integer,jsonb,jsonb),public.archive_operator_knowledge_editor_action(uuid,text),public.archive_operator_knowledge_editor_request(uuid,integer,boolean) to authenticated;
grant execute on function public.archive_worker_knowledge_editor_request(uuid,text,uuid,jsonb) to service_role;

create function public.archive_operator_knowledge_editor_version(p_job_id uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform survival_ops.private_require_archive_operator();
 return (select jsonb_build_object('brief',brief,'evidence_review',evidence_review) from survival_ops.knowledge_editor_versions where job_id=p_job_id and revision=p_revision);
end $$;
create function public.archive_operator_knowledge_editor_inbox() returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous jsonb; items jsonb; begin
 perform survival_ops.private_require_archive_operator();
 previous:=public.archive_operator_knowledge_inbox();
 select coalesce(jsonb_agg(i||jsonb_build_object('editor_archived',coalesce(s.archived,(i->>'status')='HOLD'),'editor_request',r.request,'has_body',j.semantic_result ? 'brief','updated_at',coalesce(d.updated_at,j.updated_at),'title',coalesce(d.draft_brief->>'title',i->>'title'),'public_record',pub.request) order by coalesce(d.updated_at,j.updated_at) desc),'[]') into items
 from jsonb_array_elements(previous->'items') i
 join survival_ops.knowledge_semantic_jobs j on j.job_id=(i->>'job_id')::uuid
 left join survival_ops.knowledge_operator_drafts d using(job_id)
 left join survival_ops.knowledge_editor_state s using(job_id)
 left join lateral(select to_jsonb(req)-'snapshot'-'lease_token' request from survival_ops.knowledge_editor_requests req where req.job_id=j.job_id order by created_at desc limit 1) r on true
 left join lateral(select to_jsonb(req)-'snapshot'-'lease_token' request from survival_ops.knowledge_editor_requests req where req.job_id=j.job_id and status='PUBLISHED' order by created_at desc limit 1) pub on true;
 return previous||jsonb_build_object('items',items);
end $$;
revoke all on function public.archive_operator_knowledge_editor_version(uuid,integer),public.archive_operator_knowledge_editor_inbox() from public,anon,authenticated,service_role;
grant execute on function public.archive_operator_knowledge_editor_version(uuid,integer),public.archive_operator_knowledge_editor_inbox() to authenticated;

create table survival_ops.knowledge_editor_events (
 event_id bigint generated always as identity primary key,
 job_id uuid not null references survival_ops.knowledge_semantic_jobs on delete restrict,
 request_id uuid references survival_ops.knowledge_editor_requests on delete restrict,
 event text not null,
 details jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table survival_ops.knowledge_editor_events enable row level security;
revoke all on survival_ops.knowledge_editor_events from public,anon,authenticated,service_role;
create function survival_ops.log_knowledge_editor_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_table_name='knowledge_editor_requests' then
  insert into survival_ops.knowledge_editor_events(job_id,request_id,event,details) values(new.job_id,new.request_id,new.status,jsonb_build_object('attempt',new.attempt,'result',new.result));
 else
  insert into survival_ops.knowledge_editor_events(job_id,event,details) values(new.job_id,case when new.archived then 'ARCHIVED' else 'EDITING' end,jsonb_build_object('actor',new.updated_by));
 end if;
 return new;
end $$;
create trigger knowledge_editor_request_event after insert or update on survival_ops.knowledge_editor_requests for each row execute function survival_ops.log_knowledge_editor_event();
create trigger knowledge_editor_state_event after insert or update on survival_ops.knowledge_editor_state for each row execute function survival_ops.log_knowledge_editor_event();
create trigger knowledge_editor_event_immutable before update or delete on survival_ops.knowledge_editor_events for each row execute function survival_ops.guard_knowledge_editor_history();
revoke all on function survival_ops.log_knowledge_editor_event() from public,anon,authenticated,service_role;
