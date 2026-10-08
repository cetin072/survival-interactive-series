begin;

-- Reservations survive HOLD, HUMAN_REVIEW and terminal history. Never recycle IDs.
-- Preserve pre-contract duplicate recovery history; prohibit new reservations.

create function survival_ops.guard_knowledge_brief_reservation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then perform pg_catalog.pg_advisory_xact_lock(724015); end if;
  if tg_op='INSERT' and exists(select 1 from survival_ops.knowledge_semantic_jobs
    where semantic_context->'target'->>'brief_id'=new.semantic_context->'target'->>'brief_id') then
    raise exception 'KNOWLEDGE_SEMANTIC_BRIEF_RESERVED';
  end if;
  if tg_op='UPDATE' and new.semantic_context->'target' is distinct from old.semantic_context->'target' then
    raise exception 'KNOWLEDGE_SEMANTIC_RESERVATION_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger knowledge_brief_reservation_immutable
  before insert or update on survival_ops.knowledge_semantic_jobs
  for each row execute function survival_ops.guard_knowledge_brief_reservation();
revoke all on function survival_ops.guard_knowledge_brief_reservation() from public,anon,authenticated,service_role;

-- Read-only identity check, also usable before an administrative finalizer retry.
create function public.archive_knowledge_semantic_job_verify_reservation(
  p_job_id uuid, p_brief_id text, p_source_ref text, p_source_sha256 text,
  p_policy_sha256 text, p_result_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare j survival_ops.knowledge_semantic_jobs%rowtype;
begin
  select * into j from survival_ops.knowledge_semantic_jobs where job_id=p_job_id;
  if not found or p_brief_id is null
    or j.semantic_context->'target'->>'brief_id' is distinct from p_brief_id
    or j.semantic_result->'brief'->>'id' is distinct from p_brief_id
    or j.semantic_result->'candidate'->>'brief_id' is distinct from p_brief_id
    or j.semantic_result->'evidence'->>'brief_id' is distinct from p_brief_id
    or exists(select 1 from survival_ops.knowledge_semantic_jobs other
      where other.job_id<>p_job_id and other.semantic_context->'target'->>'brief_id'=p_brief_id) then
    return jsonb_build_object('status','REJECTED','code','SEMANTIC_TARGET_BRIEF_STALE');
  end if;
  if j.source_ref is distinct from p_source_ref or j.source_sha256 is distinct from p_source_sha256
    or j.policy_sha256 is distinct from p_policy_sha256
    or j.policy_pin->>'sha256' is distinct from p_policy_sha256
    or j.semantic_context->'source'->>'ref' is distinct from p_source_ref
    or j.semantic_context->'source'->>'sha256' is distinct from p_source_sha256
    or j.semantic_result->>'job_id' is distinct from p_job_id::text
    or j.result_decision is distinct from j.semantic_result->>'decision'
    or j.semantic_result_sha256 is null or p_result_sha256 is null
    or j.semantic_result_sha256 is distinct from p_result_sha256
    or j.semantic_result_sha256 is distinct from encode(extensions.digest(convert_to(j.semantic_result::text,'UTF8'),'sha256'),'hex') then
    return jsonb_build_object('status','REJECTED','code','SEMANTIC_RESULT_IDENTITY_CHANGED');
  end if;
  return jsonb_build_object('status','VALID','job_id',j.job_id,'brief_id',p_brief_id);
end;
$$;
revoke all on function public.archive_knowledge_semantic_job_verify_reservation(uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.archive_knowledge_semantic_job_verify_reservation(uuid,text,text,text,text,text)
  to service_role;

commit;
