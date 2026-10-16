-- Additive review-only control plane. Existing C03 tables/RPCs remain unchanged.
begin;
create table survival_ops.a_wiki_review_control (
  singleton boolean primary key default true check (singleton),
  program_ref text not null default 'main' check (program_ref in ('main','feat/a-wiki-continuous-review-v1')),
  program_sha text check (program_sha ~ '^[a-f0-9]{40}$'),
  worker_connected boolean not null default false,
  last_scan_at timestamptz, source_main_sha text, scan_scope_count integer,
  next_status text not null default 'UNSCANNED',
  last_program_at timestamptz, last_dispatch_at timestamptz, dispatch_request_id bigint
);
insert into survival_ops.a_wiki_review_control(singleton) values(true);
create table survival_ops.a_wiki_review_jobs (
  job_id text primary key check (job_id ~ '^wiki-review-[a-f0-9]{64}$'),
  chronicle_id text not null check (chronicle_id ~ '^C[0-9]{2,}-[A-Z0-9-]+$'),
  worldline_id text not null,
  source_id text not null, source_ref text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  wiki_sha256 text not null check (wiki_sha256 ~ '^[a-f0-9]{64}$'),
  scope_sha256 text not null unique check (scope_sha256 ~ '^[a-f0-9]{64}$'),
  source_main_sha text not null check (source_main_sha ~ '^[a-f0-9]{40}$'),
  work_type text not null default 'SOURCE_REVIEW' check (work_type='SOURCE_REVIEW'),
  source_mode text not null default 'HISTORICAL_REVIEW' check (source_mode='HISTORICAL_REVIEW'),
  status text not null default 'EXTRACTOR_READY' check (status in
    ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED','HUMAN_REVIEW',
     'HUMAN_APPROVAL_REQUIRED','NO_CHANGE','REJECT','BLOCKED','SUPERSEDED')),
  prepared_job jsonb not null check (jsonb_typeof(prepared_job)='object' and pg_column_size(prepared_job)<=4194304),
  binding_sha256 text not null,
  origin_evidence jsonb,
  extractor_result jsonb, extractor_execution_id text, extractor_submitted_at timestamptz,
  proposal jsonb, proposal_sha256 text, review_job jsonb, review_binding_sha256 text,
  review_result jsonb, reviewer_execution_id text, review_submitted_at timestamptz,
  outcome_evidence jsonb, blocker_code text,
  -- No publication mutation exists in this review-only release.
  publication_status text not null default 'NOT_PUBLISHED' check (publication_status='NOT_PUBLISHED'),
  human_approval_status text not null default 'NOT_GRANTED' check (human_approval_status='NOT_GRANTED'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create unique index a_wiki_review_one_active on survival_ops.a_wiki_review_jobs((true))
 where status in ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED');
alter table survival_ops.a_wiki_review_jobs enable row level security;
alter table survival_ops.a_wiki_review_control enable row level security;
revoke all on survival_ops.a_wiki_review_jobs,survival_ops.a_wiki_review_control from public,anon,authenticated,service_role;

create function survival_ops.guard_a_wiki_review_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'A_WIKI_REVIEW_HISTORY_IMMUTABLE'; end if;
 if old.status in ('HUMAN_REVIEW','HUMAN_APPROVAL_REQUIRED','NO_CHANGE','REJECT','BLOCKED','SUPERSEDED') then
   raise exception 'A_WIKI_REVIEW_TERMINAL_IMMUTABLE'; end if;
 if (to_jsonb(old)-array['status','extractor_result','extractor_execution_id','extractor_submitted_at',
   'proposal','proposal_sha256','review_job','review_binding_sha256','review_result','reviewer_execution_id',
   'review_submitted_at','outcome_evidence','blocker_code','updated_at','completed_at'])
   is distinct from (to_jsonb(new)-array['status','extractor_result','extractor_execution_id','extractor_submitted_at',
   'proposal','proposal_sha256','review_job','review_binding_sha256','review_result','reviewer_execution_id',
   'review_submitted_at','outcome_evidence','blocker_code','updated_at','completed_at']) then
   raise exception 'A_WIKI_REVIEW_BINDING_IMMUTABLE'; end if;
 if old.extractor_result is not null and (old.extractor_result is distinct from new.extractor_result
   or old.extractor_execution_id is distinct from new.extractor_execution_id
   or old.extractor_submitted_at is distinct from new.extractor_submitted_at) then raise exception 'A_WIKI_REVIEW_EXTRACTION_IMMUTABLE'; end if;
 if old.proposal is not null and (old.proposal is distinct from new.proposal
   or old.proposal_sha256 is distinct from new.proposal_sha256 or old.review_job is distinct from new.review_job
   or old.review_binding_sha256 is distinct from new.review_binding_sha256) then raise exception 'A_WIKI_REVIEW_PROPOSAL_IMMUTABLE'; end if;
 if old.review_result is not null and (old.review_result is distinct from new.review_result
   or old.reviewer_execution_id is distinct from new.reviewer_execution_id
   or old.review_submitted_at is distinct from new.review_submitted_at) then raise exception 'A_WIKI_REVIEW_DECISION_IMMUTABLE'; end if;
 if new.status not in ('BLOCKED','SUPERSEDED') and not (
   (old.status='EXTRACTOR_READY' and new.status='EXTRACTOR_SUBMITTED') or
   (old.status='EXTRACTOR_SUBMITTED' and new.status='REVIEW_READY') or
   (old.status='REVIEW_READY' and new.status='REVIEW_SUBMITTED') or
   (old.status='REVIEW_SUBMITTED' and new.status in ('NO_CHANGE','HUMAN_APPROVAL_REQUIRED','HUMAN_REVIEW','REJECT'))
 ) then raise exception 'A_WIKI_REVIEW_TRANSITION_INVALID'; end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
create trigger a_wiki_review_guard before update or delete on survival_ops.a_wiki_review_jobs
 for each row execute function survival_ops.guard_a_wiki_review_job();

create function survival_ops.a_wiki_review_json_sha(p jsonb) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(p::text,'UTF8'),'sha256'),'hex');
$$;

create function public.archive_a_wiki_review_snapshot() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('control',(select to_jsonb(c) from survival_ops.a_wiki_review_control c),
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('job_id',j.job_id,'chronicle_id',j.chronicle_id,
 'source_id',j.source_id,'scope_sha256',j.scope_sha256,'status',j.status,'created_at',j.created_at)
 order by j.created_at,j.job_id) from survival_ops.a_wiki_review_jobs j),'[]'::jsonb),
 'active_job',(select to_jsonb(j) from survival_ops.a_wiki_review_jobs j where j.status in
 ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED') limit 1));
$$;
create function public.archive_a_wiki_review_scan(p_main_sha text,p_scope_count integer,p_next_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(p_main_sha,'')!~'^[a-f0-9]{40}$' or p_scope_count is null or p_scope_count<0
 or coalesce(p_next_status,'') not in ('NO_JOB','JOB_AVAILABLE','EXISTING_JOB','LEGACY_NEW_SOURCE') then raise exception 'A_WIKI_REVIEW_SCAN_INVALID'; end if;
 update survival_ops.a_wiki_review_control set last_scan_at=clock_timestamp(),source_main_sha=p_main_sha,
 scan_scope_count=p_scope_count,next_status=p_next_status,last_program_at=clock_timestamp();
 return jsonb_build_object('status','RECORDED');
end $$;
create function public.archive_a_wiki_review_prepare(p_job jsonb,p_main_sha text,p_origin_evidence jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j survival_ops.a_wiki_review_jobs%rowtype; s jsonb;
begin
 s:=p_job->'scope';
 if p_job->>'version' is distinct from 'wiki-continuous-job-v1' or p_job->>'work_type' is distinct from 'SOURCE_REVIEW'
 or coalesce(p_job->>'chronicle_id','')!~'^C[0-9]{2,}-[A-Z0-9-]+$'
 or p_job->>'chronicle_id' is distinct from s->>'chronicle_id' or p_job->>'worldline_id' is distinct from s->>'worldline_id'
 or coalesce(p_job->>'scope_sha256','')!~'^[a-f0-9]{64}$' or p_job->>'scope_sha256' is distinct from s->>'scope_sha256'
 or p_job->>'job_id' is distinct from 'wiki-review-'||(s->>'scope_sha256')
 or coalesce(p_main_sha,'')!~'^[a-f0-9]{40}$' or coalesce(s->>'source_id','')='' 
 or s->>'source_ref' is distinct from 'archive/content/stories/'||(s->>'chronicle_id')||'/BOOK.json'
 or coalesce(s->>'source_sha256','')!~'^[a-f0-9]{64}$' or coalesce(s->>'wiki_sha256','')!~'^[a-f0-9]{64}$'
 or s?'save_version' or s?'game_time' or jsonb_typeof(s->'source') is distinct from 'object'
 or pg_column_size(p_job)>4194304 then raise exception 'A_WIKI_REVIEW_PREPARE_INVALID'; end if;
 perform pg_advisory_xact_lock(5961001);
 select * into j from survival_ops.a_wiki_review_jobs where job_id=p_job->>'job_id';
 if found then
   if j.prepared_job is distinct from p_job then raise exception 'A_WIKI_REVIEW_EXISTING_BINDING_CHANGED'; end if;
   return jsonb_build_object('status','EXISTING_JOB','job_id',j.job_id,'job_status',j.status); end if;
 if exists(select 1 from survival_ops.a_wiki_review_jobs where status in
 ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED')) then return jsonb_build_object('status','ACTIVE_JOB_EXISTS'); end if;
 insert into survival_ops.a_wiki_review_jobs(job_id,chronicle_id,worldline_id,source_id,source_ref,source_sha256,
 wiki_sha256,scope_sha256,source_main_sha,prepared_job,binding_sha256,origin_evidence)
 values(p_job->>'job_id',p_job->>'chronicle_id',p_job->>'worldline_id',s->>'source_id',s->>'source_ref',
 s->>'source_sha256',s->>'wiki_sha256',s->>'scope_sha256',p_main_sha,p_job,survival_ops.a_wiki_review_json_sha(p_job),p_origin_evidence)
 returning * into j;
 return jsonb_build_object('status',j.status,'job_id',j.job_id,'binding_sha256',j.binding_sha256);
end $$;

-- Shares the existing vault credential and workflow, not the C03 dispatcher state.
create function public.archive_a_wiki_review_dispatch(p_action text default 'continuous-consume') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c survival_ops.a_wiki_review_control%rowtype; token text; request_id bigint;
begin
 if coalesce(p_action,'') not in ('continuous-prepare','continuous-consume','continuous-pilot') then raise exception 'A_WIKI_REVIEW_DISPATCH_INVALID'; end if;
 select * into c from survival_ops.a_wiki_review_control;
 if c.program_sha is null then return jsonb_build_object('status','PROGRAM_NOT_CONFIGURED'); end if;
 select ds.decrypted_secret into token from vault.decrypted_secrets ds where ds.name='archive_github_dispatch_token' order by ds.created_at desc limit 1;
 if token is null or length(token)<20 then raise exception 'A_WIKI_REVIEW_DISPATCH_TOKEN_MISSING'; end if;
 select net.http_post(url:='https://api.github.com/repos/cetin072/survival-interactive-series/actions/workflows/a-wiki-native-handoff.yml/dispatches',
 body:=jsonb_build_object('ref',c.program_ref,'inputs',jsonb_build_object('action',p_action,'dispatch_origin','continuous-review-db','program_sha',c.program_sha)),
 headers:=jsonb_build_object('Accept','application/vnd.github+json','Authorization','Bearer '||token,
 'X-GitHub-Api-Version','2022-11-28','Content-Type','application/json','User-Agent','supabase-a-wiki-review-dispatch'),timeout_milliseconds:=10000) into request_id;
 update survival_ops.a_wiki_review_control set last_dispatch_at=clock_timestamp(),dispatch_request_id=request_id;
 return jsonb_build_object('status','DISPATCHED','request_id',request_id,'program_sha',c.program_sha);
end $$;
create function public.archive_a_wiki_review_submit(p_job_id text,p_expected_phase text,p_binding_sha256 text,p_result jsonb,p_execution_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j survival_ops.a_wiki_review_jobs%rowtype; d jsonb;
begin
 if coalesce(p_expected_phase,'') not in ('EXTRACTOR_READY','REVIEW_READY') or coalesce(p_execution_id,'')!~'^[A-Za-z0-9:_.-]{8,180}$'
 or p_result is null or jsonb_typeof(p_result)<>'object' or pg_column_size(p_result)>4194304 then raise exception 'A_WIKI_REVIEW_SUBMIT_INVALID'; end if;
 select * into j from survival_ops.a_wiki_review_jobs where job_id=p_job_id for update;
 if not found then return jsonb_build_object('status','REJECTED','reason','JOB_NOT_FOUND'); end if;
 if p_binding_sha256 is distinct from (case when p_expected_phase='EXTRACTOR_READY' then j.binding_sha256 else j.review_binding_sha256 end)
 then return jsonb_build_object('status','REJECTED','reason','BINDING_MISMATCH'); end if;
 if p_result->>'job_id' is distinct from j.job_id then return jsonb_build_object('status','REJECTED','reason','JOB_ID_MISMATCH'); end if;
 if p_expected_phase='EXTRACTOR_READY' then
   if p_result->>'version' is distinct from 'wiki-continuous-result-v1' or p_result->>'scope_sha256' is distinct from j.scope_sha256
   then return jsonb_build_object('status','REJECTED','reason','RESULT_CONTRACT_INVALID'); end if;
 else
   if p_execution_id=j.extractor_execution_id then return jsonb_build_object('status','REJECTED','reason','INDEPENDENT_EXECUTION_REQUIRED'); end if;
   if p_result->>'version' is distinct from 'wiki-continuous-review-v1' or p_result->>'proposal_sha256' is distinct from j.proposal_sha256
   or coalesce(p_result->>'decision','') not in ('APPROVE','HUMAN_REVIEW','REJECT') or coalesce(p_result->>'note','')=''
   then return jsonb_build_object('status','REJECTED','reason','REVIEW_CONTRACT_INVALID'); end if;
 end if;
 if j.status<>p_expected_phase then
   if (p_expected_phase='EXTRACTOR_READY' and j.extractor_result=p_result and j.extractor_execution_id=p_execution_id)
   or (p_expected_phase='REVIEW_READY' and j.review_result=p_result and j.reviewer_execution_id=p_execution_id)
   then return jsonb_build_object('status','ALREADY_SUBMITTED'); end if;
   return jsonb_build_object('status','REJECTED','reason','PHASE_MISMATCH'); end if;
 if p_expected_phase='EXTRACTOR_READY' then
   update survival_ops.a_wiki_review_jobs set status='EXTRACTOR_SUBMITTED',extractor_result=p_result,
   extractor_execution_id=p_execution_id,extractor_submitted_at=clock_timestamp() where job_id=p_job_id;
 else
   update survival_ops.a_wiki_review_jobs set status='REVIEW_SUBMITTED',review_result=p_result,
   reviewer_execution_id=p_execution_id,review_submitted_at=clock_timestamp() where job_id=p_job_id;
 end if;
 begin d:=public.archive_a_wiki_review_dispatch(); exception when others then d:=jsonb_build_object('status','DISPATCH_RETRY_REQUIRED'); end;
 return jsonb_build_object('status','ACCEPTED','dispatch',d);
end $$;
create function public.archive_a_wiki_review_advance(p_job_id text,p_expected_status text,p_status text,p_package jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j survival_ops.a_wiki_review_jobs%rowtype; wanted text;
begin
 select * into j from survival_ops.a_wiki_review_jobs where job_id=p_job_id for update;
 if not found then return jsonb_build_object('status','NOT_FOUND'); end if;
 if j.status is distinct from p_expected_status then return jsonb_build_object('status','STATE_MISMATCH','actual_status',j.status); end if;
 if p_status in ('SUPERSEDED','BLOCKED') then
   if coalesce(p_package->>'reason','')='' then raise exception 'A_WIKI_REVIEW_REASON_REQUIRED'; end if;
   update survival_ops.a_wiki_review_jobs set status=p_status,blocker_code=p_package->>'reason',completed_at=clock_timestamp() where job_id=p_job_id;
 elsif p_status='REVIEW_READY' then
   if j.status<>'EXTRACTOR_SUBMITTED' or p_package->'proposal'->>'version' is distinct from 'wiki-continuous-proposal-v1'
   or p_package->'proposal'->>'job_id' is distinct from j.job_id
   or p_package->'proposal'->>'scope_sha256' is distinct from j.scope_sha256
   or coalesce(p_package->>'proposal_sha256','')!~'^[a-f0-9]{64}$'
   or p_package->'review_job'->>'version' is distinct from 'wiki-continuous-review-job-v1'
   or p_package->'review_job'->'job' is distinct from j.prepared_job
   or p_package->'review_job'->'proposal' is distinct from p_package->'proposal'
   or p_package->'review_job'->>'proposal_sha256' is distinct from p_package->>'proposal_sha256'
   then raise exception 'A_WIKI_REVIEW_PACKAGE_INVALID'; end if;
   update survival_ops.a_wiki_review_jobs set status='REVIEW_READY',proposal=p_package->'proposal',proposal_sha256=p_package->>'proposal_sha256',
   review_job=p_package->'review_job',review_binding_sha256=survival_ops.a_wiki_review_json_sha(p_package->'review_job') where job_id=p_job_id;
 elsif p_status in ('HUMAN_APPROVAL_REQUIRED','NO_CHANGE','HUMAN_REVIEW','REJECT') then
   wanted:=case when j.review_result->>'decision'='APPROVE' then case when jsonb_array_length(j.proposal->'candidates')>0 then 'HUMAN_APPROVAL_REQUIRED' else 'NO_CHANGE' end else j.review_result->>'decision' end;
   if j.status<>'REVIEW_SUBMITTED' or p_status is distinct from wanted
   or p_package->'review' is distinct from j.review_result or p_package->'proposal' is distinct from j.proposal
   or p_package->>'proposal_sha256' is distinct from j.proposal_sha256 then raise exception 'A_WIKI_REVIEW_APPROVAL_BYPASS'; end if;
   update survival_ops.a_wiki_review_jobs set status=p_status,outcome_evidence=p_package,completed_at=clock_timestamp() where job_id=p_job_id;
 else raise exception 'A_WIKI_REVIEW_ADVANCE_INVALID'; end if;
 update survival_ops.a_wiki_review_control set last_program_at=clock_timestamp();
 return jsonb_build_object('status',p_status,'job_id',p_job_id);
end $$;
create function public.archive_a_wiki_worker_current_v2() returns jsonb
language plpgsql security definer set search_path='' as $$
declare legacy jsonb; j survival_ops.a_wiki_review_jobs%rowtype;
begin
 legacy:=public.archive_a_wiki_native_job_current();
 if legacy->>'status' not in ('NO_JOB','HUMAN_REVIEW','REJECT') then return jsonb_build_object('route','C03_V1','job',legacy); end if;
 select * into j from survival_ops.a_wiki_review_jobs where status in ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED') order by created_at limit 1;
 if not found then return jsonb_build_object('route','IDLE','job',jsonb_build_object('status','NO_JOB'),'legacy_hold',legacy); end if;
 return jsonb_build_object('route','CONTINUOUS_REVIEW_V1','job',jsonb_build_object('status',j.status,'job_id',j.job_id,
 'chronicle_id',j.chronicle_id,'work_type',j.work_type,'binding_sha256',case when j.status='REVIEW_READY' then j.review_binding_sha256 else j.binding_sha256 end,
 'proposal_sha256',j.proposal_sha256,'payload',case when j.status='REVIEW_READY' then j.review_job when j.status='EXTRACTOR_READY' then j.prepared_job else null end));
end $$;
create function survival_ops.a_wiki_review_status() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('worker_connected',c.worker_connected,'last_scan_at',c.last_scan_at,
 'next_status',case when exists(select 1 from survival_ops.a_wiki_review_jobs where status in ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED')) then 'EXISTING_JOB' else c.next_status end,
 'current_chronicle_id',(select j.chronicle_id from survival_ops.a_wiki_review_jobs j order by (j.status in ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED')) desc,j.created_at desc limit 1),
 'current_status',(select j.status from survival_ops.a_wiki_review_jobs j order by (j.status in ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED')) desc,j.created_at desc limit 1),
 'review_decision',(select j.review_result->>'decision' from survival_ops.a_wiki_review_jobs j where j.review_result is not null order by j.review_submitted_at desc limit 1),
 'current_work_type','SOURCE_REVIEW','new_source_count',(select count(*) from survival_ops.a_wiki_native_jobs where status='PUBLISHED'),
 'review_count',(select count(*) from survival_ops.a_wiki_review_jobs where status in ('HUMAN_APPROVAL_REQUIRED','NO_CHANGE','HUMAN_REVIEW','REJECT')),
 'candidate_count',(select coalesce(sum(jsonb_array_length(proposal->'candidates')),0) from survival_ops.a_wiki_review_jobs where status<>'SUPERSEDED'),
 'published_count',0,'duplicate_count',(select coalesce(sum(jsonb_array_length(proposal->'duplicates')),0) from survival_ops.a_wiki_review_jobs where status<>'SUPERSEDED'),
 'no_change_count',(select count(*) from survival_ops.a_wiki_review_jobs where status='NO_CHANGE'),
 'human_review_count',(select count(*) from survival_ops.a_wiki_review_jobs where status='HUMAN_REVIEW'),
 'human_approval_count',0,
 'human_approval_required_count',(select count(*) from survival_ops.a_wiki_review_jobs where status='HUMAN_APPROVAL_REQUIRED'),
 'error_count',(select count(*) from survival_ops.a_wiki_review_jobs where status='BLOCKED'),
 'last_success_at',(select max(completed_at) from survival_ops.a_wiki_review_jobs where status in ('HUMAN_APPROVAL_REQUIRED','NO_CHANGE')))
 from survival_ops.a_wiki_review_control c;
$$;
-- Preserve authoritative auth and existing C03/B/C aggregation byte-for-byte.
alter function public.archive_operator_a_wiki_status() rename to archive_operator_a_wiki_status_before_continuous_v1;
alter function public.archive_operator_a_wiki_status_before_continuous_v1() set schema survival_ops;
create function public.archive_operator_a_wiki_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform survival_ops.private_require_archive_operator();
 return survival_ops.archive_operator_a_wiki_status_before_continuous_v1()
 || jsonb_build_object('continuous_review',survival_ops.a_wiki_review_status());
end $$;
revoke all on function survival_ops.archive_operator_a_wiki_status_before_continuous_v1() from public,anon,authenticated,service_role;
revoke all on function survival_ops.guard_a_wiki_review_job(),survival_ops.a_wiki_review_json_sha(jsonb),survival_ops.a_wiki_review_status() from public,anon,authenticated,service_role;
revoke all on function public.archive_a_wiki_review_snapshot(),public.archive_a_wiki_review_scan(text,integer,text),public.archive_a_wiki_review_prepare(jsonb,text,jsonb),
 public.archive_a_wiki_review_dispatch(text),public.archive_a_wiki_review_submit(text,text,text,jsonb,text),public.archive_a_wiki_review_advance(text,text,text,jsonb),public.archive_a_wiki_worker_current_v2() from public,anon,authenticated;
grant execute on function public.archive_a_wiki_review_snapshot(),public.archive_a_wiki_review_scan(text,integer,text),public.archive_a_wiki_review_prepare(jsonb,text,jsonb),
 public.archive_a_wiki_review_dispatch(text),public.archive_a_wiki_review_submit(text,text,text,jsonb,text),public.archive_a_wiki_review_advance(text,text,text,jsonb),public.archive_a_wiki_worker_current_v2() to service_role;
revoke all on function public.archive_operator_a_wiki_status() from public,anon,service_role;
grant execute on function public.archive_operator_a_wiki_status() to authenticated;
commit;
