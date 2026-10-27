-- Isolated fixture only. Never run on a shared/operational database.
\set ON_ERROR_STOP on
begin;
create role anon; create role authenticated; create role service_role;
create schema auth; create schema survival_ops;
create table public.profiles(id uuid primary key,display_name text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function public.current_profile_is_active() returns boolean language sql stable as $$select current_setting('test.active',true)='yes'$$;
create function public.private_actor_can(text) returns boolean language sql stable as $$select current_setting('test.operator',true)='yes'$$;
-- Real permission helper is loaded by the runner, with synthetic identity providers above.
\i /tmp/roadmap-helper.sql
\i /tmp/roadmap-v1.sql
\i /tmp/roadmap-v11.sql
\i /tmp/roadmap-v2.sql
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.active','yes',false);
select set_config('test.operator','yes',false);
insert into survival_ops.bunker_os_operation_logs(idempotency_key,cycle_key,phase,status,title,summary,details,occurred_at)
select 'test-roadmap-'||n,'MONTH01_FIND_THE_ENGINE','WEEK_1_FIND_THE_GAME','COMPLETED','Log '||n,'Synthetic',
jsonb_build_object('source_candidates',jsonb_build_array(
jsonb_build_object('title','Source A '||n,'url','https://example.invalid/a/'||n,'category','OTHER'),
jsonb_build_object('title','Source B '||n,'url','https://example.invalid/b/'||n,'category','BUNKER_BUILD'))), '2026-10-10'::timestamptz
from generate_series(1,101) n;
insert into survival_ops.bunker_os_operation_logs(idempotency_key,cycle_key,phase,status,title,summary,occurred_at)
values('test-roadmap-new','MONTH02_TEST','SYSTEM_SETUP','RUNNING','New cycle','Synthetic','2026-11-10');
set local role authenticated;
do $$declare a jsonb; b jsonb; begin
  a:=public.archive_operator_bunker_os_read_v2('cycles');
  assert (a->>'total_count')::int=2;
  assert a->'cycles'->0->>'cycle_key'='MONTH02_TEST';
  a:=public.archive_operator_bunker_os_read_v2('dashboard');
  assert a->>'current_cycle'='MONTH02_TEST';
  assert (a->>'total_count')::int=1;
  a:=public.archive_operator_bunker_os_read_v2('logs','MONTH01_FIND_THE_ENGINE',null,100,0);
  b:=public.archive_operator_bunker_os_read_v2('logs','MONTH01_FIND_THE_ENGINE',null,100,100);
  assert (a->>'total_count')::int=101 and jsonb_array_length(a->'logs')=100 and (a->>'has_more')::boolean;
  assert jsonb_array_length(b->'logs')=1 and not (b->>'has_more')::boolean;
  assert not exists(select 1 from jsonb_array_elements(a->'logs') x,jsonb_array_elements(b->'logs') y where x->>'id'=y->>'id');
  assert a=public.archive_operator_bunker_os_read_v2('logs','MONTH01_FIND_THE_ENGINE',null,100,0),'stable tie ordering';
  a:=public.archive_operator_bunker_os_read_v2('sources','MONTH01_FIND_THE_ENGINE',null,200,0);
  b:=public.archive_operator_bunker_os_read_v2('sources','MONTH01_FIND_THE_ENGINE',null,200,200);
  assert (a->>'total_count')::int=202 and jsonb_array_length(a->'sources')=200;
  assert jsonb_array_length(b->'sources')=2;
  assert not exists(select 1 from jsonb_array_elements(a->'sources') x,jsonb_array_elements(b->'sources') y where x->>'source_key'=y->>'source_key');
  a:=public.archive_operator_bunker_os_read_v2('sources','MONTH01_FIND_THE_ENGINE',null,200,0,'BUNKER_BUILD');
  assert (a->>'total_count')::int=101 and jsonb_array_length(a->'sources')=101;
  a:=public.archive_operator_bunker_os_read_v2('logs','MISSING_CYCLE');
  assert (a->>'total_count')::int=0 and jsonb_array_length(a->'logs')=0;
  a:=public.archive_operator_bunker_os_read_v2('logs','MONTH01_FIND_THE_ENGINE',null,999999,0);
  assert jsonb_array_length(a->'logs')=100,'page cap';
  begin perform public.archive_operator_bunker_os_read_v2('logs',null,'INVALID');raise exception 'accepted bad status';exception when invalid_parameter_value then null;end;
end$$;
reset role;
select set_config('test.operator','no',false);
set local role authenticated;
do $$begin begin perform public.archive_operator_bunker_os_read_v2();raise exception 'viewer admitted';exception when insufficient_privilege then null;end;end$$;
reset role;
select set_config('test.operator','yes',false);
select set_config('test.active','no',false);
set local role authenticated;
do $$begin begin perform public.archive_operator_bunker_os_read_v2();raise exception 'inactive admitted';exception when insufficient_privilege then null;end;end$$;
reset role;
select set_config('test.actor','',false);
set local role authenticated;
do $$begin begin perform public.archive_operator_bunker_os_read_v2();raise exception 'missing identity admitted';exception when insufficient_privilege then null;end;end$$;
reset role;
set local role anon;
do $$begin begin perform public.archive_operator_bunker_os_read_v2();raise exception 'anon admitted';exception when insufficient_privilege then null;end;end$$;
reset role;
do $$begin
assert (select count(*)=102 from survival_ops.bunker_os_operation_logs),'reads changed rows';
assert not has_function_privilege('anon','public.archive_operator_bunker_os_read_v2(text,text,text,integer,integer,text)','execute');
assert not has_table_privilege('authenticated','survival_ops.bunker_os_operation_logs','select');
end$$;
rollback;
\echo 'PASS: isolated PostgreSQL cycle/pagination/permission/read-only contract'
