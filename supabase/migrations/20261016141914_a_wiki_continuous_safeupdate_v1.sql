-- Respect the operating pg_safeupdate WHERE requirement, including singleton writes.
-- Preserve every durable job/result/review and the original applied migration.
begin;
create or replace function public.archive_a_wiki_review_scan(p_main_sha text,p_scope_count integer,p_next_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(p_main_sha,'')!~'^[a-f0-9]{40}$' or p_scope_count is null or p_scope_count<0
 or coalesce(p_next_status,'') not in ('NO_JOB','JOB_AVAILABLE','EXISTING_JOB','LEGACY_NEW_SOURCE') then raise exception 'A_WIKI_REVIEW_SCAN_INVALID'; end if;
 update survival_ops.a_wiki_review_control set last_scan_at=clock_timestamp(),source_main_sha=p_main_sha,
 scan_scope_count=p_scope_count,next_status=p_next_status,last_program_at=clock_timestamp() where singleton=true;
 return jsonb_build_object('status','RECORDED');
end $$;

create or replace function public.archive_a_wiki_review_dispatch(p_action text default 'continuous-consume') returns jsonb
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
 update survival_ops.a_wiki_review_control set last_dispatch_at=clock_timestamp(),dispatch_request_id=request_id where singleton=true;
 return jsonb_build_object('status','DISPATCHED','request_id',request_id,'program_sha',c.program_sha);
end $$;

create or replace function public.archive_a_wiki_review_advance(p_job_id text,p_expected_status text,p_status text,p_package jsonb) returns jsonb
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
 update survival_ops.a_wiki_review_control set last_program_at=clock_timestamp() where singleton=true;
 return jsonb_build_object('status',p_status,'job_id',p_job_id);
end $$;
commit;
