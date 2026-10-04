\set ON_ERROR_STOP on
begin;
do $verify$
declare
  target survival_ops.knowledge_semantic_jobs%rowtype;
  v_result jsonb;
  before_result jsonb;
  before_source_sha text;
begin
  if has_function_privilege('anon',
      'survival_ops.repair_ex001_human_approved_publication()','EXECUTE')
     or has_function_privilege('authenticated',
      'survival_ops.repair_ex001_human_approved_publication()','EXECUTE')
     or has_function_privilege('service_role',
      'survival_ops.repair_ex001_human_approved_publication()','EXECUTE') then
    raise exception 'EX-001 publication repair grant widened';
  end if;
  if not has_function_privilege('postgres',
      'survival_ops.repair_ex001_human_approved_publication()','EXECUTE') then
    raise exception 'postgres cannot run EX-001 publication repair';
  end if;

  select * into target from survival_ops.knowledge_semantic_jobs
    where job_id='83ee5b52-0732-4d47-a56c-e1046cf18a33'::uuid;
  if not found then
    v_result := survival_ops.repair_ex001_human_approved_publication();
    if v_result->>'status' <> 'NOT_FOUND' then
      raise exception 'unbound job accepted: %',v_result;
    end if;
    return;
  end if;

  before_result := target.semantic_result;
  before_source_sha := target.source_sha256;
  v_result := survival_ops.repair_ex001_human_approved_publication();
  if target.status='BLOCKED' and target.blocker_code='PR_HEAD_CHANGED' then
    if v_result->>'status' <> 'PUBLISHED' then
      raise exception 'approved EX-001 repair failed: %',v_result;
    end if;
    if not exists (
      select 1 from survival_ops.knowledge_semantic_jobs j
      where j.job_id=target.job_id and j.status='PUBLISHED'
        and j.final_pr_number=416
        and j.final_head_sha='6183501036e1388f48d42e30f8845f0c84176d79'
        and j.merge_sha='d00c351cedeebc8703afdfdf817a3104cd4c608c'
        and j.blocker_code is null and j.blocker_stage is null
        and j.published_at is not null
        and j.semantic_result=before_result and j.source_sha256=before_source_sha
    ) then raise exception 'EX-001 publication repair changed immutable state'; end if;
    v_result := survival_ops.repair_ex001_human_approved_publication();
    if v_result->>'status' <> 'REJECTED' then
      raise exception 'repair replay accepted';
    end if;
  elsif v_result->>'status' <> 'REJECTED' then
    raise exception 'unexpected EX-001 repair state: %',v_result;
  end if;
end;
$verify$;
rollback;
