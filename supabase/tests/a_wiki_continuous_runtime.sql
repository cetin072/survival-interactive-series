-- Isolated database regression only. Every test row is rolled back.
begin;
-- REST runs with pg_safeupdate in production; even singleton UPDATE needs WHERE.
do $$
declare signature text;
begin
 foreach signature in array array['public.archive_a_wiki_review_scan(text,integer,text)',
 'public.archive_a_wiki_review_dispatch(text)','public.archive_a_wiki_review_advance(text,text,text,jsonb)'] loop
  if position('where singleton=true' in lower(pg_get_functiondef(signature::regprocedure)))=0 then
   raise exception 'SAFEUPDATE_WHERE_MISSING: %',signature;
  end if;
 end loop;
end $$;
create function pg_temp.job(c text,h text) returns jsonb language sql as $$
 select jsonb_build_object('version','wiki-continuous-job-v1','job_id','wiki-review-'||repeat(h,64),
 'chronicle_id',c,'worldline_id',c,'scope_sha256',repeat(h,64),'work_type','SOURCE_REVIEW',
 'scope',jsonb_build_object('chronicle_id',c,'worldline_id',c,'scope_sha256',repeat(h,64),
 'source_id','chapter-01','source_ref','archive/content/stories/'||c||'/BOOK.json',
 'source_sha256',repeat('a',64),'wiki_sha256',repeat('b',64),'source',jsonb_build_object('text','Fictional source')));
$$;
do $$
declare job jsonb:=pg_temp.job('C01-FIXTURE','1'); r jsonb; j survival_ops.a_wiki_review_jobs%rowtype; prop jsonb; rev jsonb;
begin
 if not (select relrowsecurity from pg_class where oid='survival_ops.a_wiki_review_jobs'::regclass)
 or not (select relrowsecurity from pg_class where oid='survival_ops.a_wiki_review_control'::regclass) then raise exception 'RLS_DISABLED'; end if;
 if has_table_privilege('authenticated','survival_ops.a_wiki_review_jobs','SELECT')
 or has_table_privilege('service_role','survival_ops.a_wiki_review_jobs','UPDATE')
 or has_function_privilege('anon','public.archive_a_wiki_review_submit(text,text,text,jsonb,text)','EXECUTE')
 or has_function_privilege('authenticated','public.archive_a_wiki_worker_current_v2()','EXECUTE')
 or not has_function_privilege('service_role','public.archive_a_wiki_review_prepare(jsonb,text,jsonb)','EXECUTE') then raise exception 'GRANTS_INVALID'; end if;
 r:=public.archive_a_wiki_review_prepare(job,repeat('a',40));
 if r->>'status'<>'EXTRACTOR_READY' then raise exception 'PREPARE_FAILED'; end if;
 if public.archive_a_wiki_review_prepare(job,repeat('a',40))->>'status'<>'EXISTING_JOB' then raise exception 'DEDUP_FAILED'; end if;
 if public.archive_a_wiki_review_prepare(pg_temp.job('C02-FIXTURE','2'),repeat('a',40))->>'status'<>'ACTIVE_JOB_EXISTS' then raise exception 'ACTIVE_GATE_FAILED'; end if;
 select * into j from survival_ops.a_wiki_review_jobs where job_id=job->>'job_id';
 if public.archive_a_wiki_worker_current_v2()->>'route'<>'CONTINUOUS_REVIEW_V1' then raise exception 'ROUTER_FAILED'; end if;
 if public.archive_a_wiki_review_submit(j.job_id,'EXTRACTOR_READY',repeat('0',64),'{}','extractor-test')->>'reason'<>'BINDING_MISMATCH' then raise exception 'SHA_GATE_FAILED'; end if;
 r:=jsonb_build_object('version','wiki-continuous-result-v1','job_id',j.job_id,'scope_sha256',j.scope_sha256);
 if public.archive_a_wiki_review_submit(j.job_id,'EXTRACTOR_READY',j.binding_sha256,r,'extractor-test')->>'status'<>'ACCEPTED' then raise exception 'SUBMIT_FAILED'; end if;
 if public.archive_a_wiki_review_submit(j.job_id,'EXTRACTOR_READY',j.binding_sha256,r,'extractor-test')->>'status'<>'ALREADY_SUBMITTED' then raise exception 'SUBMIT_REPLAY_FAILED'; end if;
 begin
 perform public.archive_a_wiki_review_advance(j.job_id,'EXTRACTOR_SUBMITTED','HUMAN_APPROVAL_REQUIRED','{}');
 raise exception 'BYPASS_ALLOWED'; exception when others then if sqlerrm='BYPASS_ALLOWED' then raise; end if; end;
 prop:=jsonb_build_object('version','wiki-continuous-proposal-v1','job_id',j.job_id,'scope_sha256',j.scope_sha256,'candidates',jsonb_build_array(jsonb_build_object('text','fictional candidate')),'duplicates','[]'::jsonb);
 perform public.archive_a_wiki_review_advance(j.job_id,'EXTRACTOR_SUBMITTED','REVIEW_READY',jsonb_build_object('proposal',prop,'proposal_sha256',repeat('c',64),
 'review_job',jsonb_build_object('version','wiki-continuous-review-job-v1','job',job,'proposal',prop,'proposal_sha256',repeat('c',64))));
 select * into j from survival_ops.a_wiki_review_jobs where job_id=j.job_id;
 rev:=jsonb_build_object('version','wiki-continuous-review-v1','job_id',j.job_id,'proposal_sha256',j.proposal_sha256,'decision','HUMAN_REVIEW','note','Fictional semantic hold');
 if public.archive_a_wiki_review_submit(j.job_id,'REVIEW_READY',j.review_binding_sha256,rev,'extractor-test')->>'reason'<>'INDEPENDENT_EXECUTION_REQUIRED' then raise exception 'SELF_REVIEW_ALLOWED'; end if;
 perform public.archive_a_wiki_review_submit(j.job_id,'REVIEW_READY',j.review_binding_sha256,rev,'reviewer-test');
 begin
 perform public.archive_a_wiki_review_advance(j.job_id,'REVIEW_SUBMITTED','HUMAN_APPROVAL_REQUIRED',jsonb_build_object('review',rev,'proposal',prop,'proposal_sha256',j.proposal_sha256));
 raise exception 'HUMAN_HOLD_BYPASSED'; exception when others then if sqlerrm='HUMAN_HOLD_BYPASSED' then raise; end if; end;
 perform public.archive_a_wiki_review_advance(j.job_id,'REVIEW_SUBMITTED','HUMAN_REVIEW',jsonb_build_object('review',rev,'proposal',prop,'proposal_sha256',j.proposal_sha256));
 begin
 update survival_ops.a_wiki_review_jobs set status='EXTRACTOR_READY' where job_id=j.job_id;
 raise exception 'TERMINAL_MUTATED'; exception when others then if sqlerrm='TERMINAL_MUTATED' then raise; end if; end;
 if public.archive_a_wiki_review_prepare(pg_temp.job('C02-FIXTURE','2'),repeat('a',40))->>'status'<>'EXTRACTOR_READY' then raise exception 'HELD_WORLD_STARVES_OTHER_WORLD'; end if;
 -- Equal source/entity identifiers never cross world boundaries.
 if (select count(distinct chronicle_id) from survival_ops.a_wiki_review_jobs)<>2 then raise exception 'CROSS_WORLD'; end if;
 if exists(select 1 from survival_ops.a_wiki_review_jobs where publication_status<>'NOT_PUBLISHED' or human_approval_status<>'NOT_GRANTED') then raise exception 'PUBLICATION_INVENTED'; end if;
 begin
 perform public.archive_a_wiki_review_prepare(jsonb_set(pg_temp.job('C03-FIXTURE','3'),'{scope,chronicle_id}','"C01-FIXTURE"'),repeat('a',40));
 raise exception 'CROSS_SCOPE_ALLOWED'; exception when others then if sqlerrm='CROSS_SCOPE_ALLOWED' then raise; end if; end;
end $$;
-- Approved semantic review is not human approval or publication; empty is NO_CHANGE.
do $$
declare j survival_ops.a_wiki_review_jobs%rowtype; ext jsonb; prop jsonb; rev jsonb; counts jsonb;
begin
 select * into j from survival_ops.a_wiki_review_jobs where chronicle_id='C02-FIXTURE';
 ext:=jsonb_build_object('version','wiki-continuous-result-v1','job_id',j.job_id,'scope_sha256',j.scope_sha256);
 perform public.archive_a_wiki_review_submit(j.job_id,'EXTRACTOR_READY',j.binding_sha256,ext,'extractor-second');
 prop:=jsonb_build_object('version','wiki-continuous-proposal-v1','job_id',j.job_id,'scope_sha256',j.scope_sha256,'candidates','[]'::jsonb,'duplicates','[]'::jsonb);
 perform public.archive_a_wiki_review_advance(j.job_id,'EXTRACTOR_SUBMITTED','REVIEW_READY',jsonb_build_object('proposal',prop,'proposal_sha256',repeat('d',64),'review_job',jsonb_build_object('version','wiki-continuous-review-job-v1','job',j.prepared_job,'proposal',prop,'proposal_sha256',repeat('d',64))));
 select * into j from survival_ops.a_wiki_review_jobs where chronicle_id='C02-FIXTURE';
 rev:=jsonb_build_object('version','wiki-continuous-review-v1','job_id',j.job_id,'proposal_sha256',j.proposal_sha256,'decision','APPROVE','note','Fixture independently found no change');
 perform public.archive_a_wiki_review_submit(j.job_id,'REVIEW_READY',j.review_binding_sha256,rev,'reviewer-second');
 perform public.archive_a_wiki_review_advance(j.job_id,'REVIEW_SUBMITTED','NO_CHANGE',jsonb_build_object('review',rev,'proposal',prop,'proposal_sha256',j.proposal_sha256));
 perform public.archive_a_wiki_review_prepare(pg_temp.job('C03-FIXTURE','3'),repeat('a',40));
 select * into j from survival_ops.a_wiki_review_jobs where chronicle_id='C03-FIXTURE';
 ext:=jsonb_build_object('version','wiki-continuous-result-v1','job_id',j.job_id,'scope_sha256',j.scope_sha256);
 perform public.archive_a_wiki_review_submit(j.job_id,'EXTRACTOR_READY',j.binding_sha256,ext,'extractor-third');
 prop:=jsonb_build_object('version','wiki-continuous-proposal-v1','job_id',j.job_id,'scope_sha256',j.scope_sha256,'candidates',jsonb_build_array(jsonb_build_object('text','fixture candidate')),'duplicates','[]'::jsonb);
 perform public.archive_a_wiki_review_advance(j.job_id,'EXTRACTOR_SUBMITTED','REVIEW_READY',jsonb_build_object('proposal',prop,'proposal_sha256',repeat('e',64),'review_job',jsonb_build_object('version','wiki-continuous-review-job-v1','job',j.prepared_job,'proposal',prop,'proposal_sha256',repeat('e',64))));
 select * into j from survival_ops.a_wiki_review_jobs where chronicle_id='C03-FIXTURE';
 rev:=jsonb_build_object('version','wiki-continuous-review-v1','job_id',j.job_id,'proposal_sha256',j.proposal_sha256,'decision','APPROVE','note','Fixture candidate approved');
 perform public.archive_a_wiki_review_submit(j.job_id,'REVIEW_READY',j.review_binding_sha256,rev,'reviewer-third');
 perform public.archive_a_wiki_review_advance(j.job_id,'REVIEW_SUBMITTED','HUMAN_APPROVAL_REQUIRED',jsonb_build_object('review',rev,'proposal',prop,'proposal_sha256',j.proposal_sha256));
 counts:=survival_ops.a_wiki_review_status();
 if counts->>'human_approval_count'<>'0' or counts->>'human_approval_required_count'<>'1'
 or counts->>'no_change_count'<>'1' or counts->>'published_count'<>'0' or counts->>'worker_connected'<>'false' then raise exception 'COUNTERS_OR_APPROVAL_INVENTED: %',counts; end if;
 begin delete from survival_ops.a_wiki_review_jobs where chronicle_id='C03-FIXTURE'; raise exception 'HISTORY_DELETED';
 exception when others then if sqlerrm='HISTORY_DELETED' then raise; end if; end;
end $$;
-- Preserve legacy payload shape and priority when a new C03 source is queued.
do $$
declare job jsonb; r jsonb; old jsonb;
begin
 job:=jsonb_build_object('version','wiki-fact-job-v1','chronicle_id','C03-AFTERFALL','worldline_id','AFTERFALL',
 'visibility','PUBLIC_ARCHIVE','season_id','S04','job_id','wiki-job-'||repeat('3',64),'graph_sha256',repeat('4',64),
 'source',jsonb_build_object('session_id','SESSION_999','manifest_ref','archive/content/transcripts/C03-AFTERFALL/S04/SESSION_999/SOURCE_MANIFEST.json','manifest_sha256',repeat('5',64)));
 r:=public.archive_a_wiki_native_job_prepare(job,repeat('6',40));
 old:=public.archive_a_wiki_native_job_current();
 if public.archive_a_wiki_worker_current_v2()->>'route'<>'C03_V1' or public.archive_a_wiki_worker_current_v2()->'job' is distinct from old then raise exception 'C03_V1_REGRESSION'; end if;
end $$;
-- Operator output composes existing fields and still requires the original capability.
do $$ begin
 begin perform public.archive_operator_a_wiki_status(); raise exception 'UNAUTHENTICATED_ALLOWED';
 exception when others then if sqlerrm='UNAUTHENTICATED_ALLOWED' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001"}',true);
set local role authenticated;
select public.archive_operator_system_status()->'a_wiki'->'continuous_review' is not null as has_live_aggregate;
reset role;
rollback;
