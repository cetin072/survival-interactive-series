begin;

create or replace function survival_ops.guard_a_wiki_native_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='UPDATE' then
    if old.status in ('PUBLISHED','HUMAN_REVIEW','REJECT') then
      raise exception 'A_WIKI_NATIVE_TERMINAL_IMMUTABLE';
    end if;

    if old.prepared_job is distinct from new.prepared_job
       or old.prepared_job_sha256 is distinct from new.prepared_job_sha256
       or old.source_ref is distinct from new.source_ref
       or old.source_sha256 is distinct from new.source_sha256
       or old.graph_sha256 is distinct from new.graph_sha256
       or old.main_sha_at_prepare is distinct from new.main_sha_at_prepare then
      raise exception 'A_WIKI_NATIVE_BINDING_IMMUTABLE';
    end if;

    if old.status='EXTRACTOR_READY' and new.status not in ('EXTRACTOR_READY','EXTRACTOR_SUBMITTED','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='EXTRACTOR_SUBMITTED' and new.status not in ('EXTRACTOR_SUBMITTED','REVIEW_READY','HUMAN_REVIEW','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='REVIEW_READY' and new.status not in ('REVIEW_READY','REVIEW_SUBMITTED','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='REVIEW_SUBMITTED' and new.status not in ('REVIEW_SUBMITTED','FINALIZING','HUMAN_REVIEW','REJECT','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='FINALIZING' and new.status not in ('FINALIZING','PUBLISHED','HUMAN_REVIEW','REJECT','BLOCKED') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    elsif old.status='BLOCKED' and new.status not in ('BLOCKED','FINALIZING') then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    end if;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.archive_a_wiki_native_job_retry_blocked(
  p_job_id uuid,
  p_expected_blocker text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.a_wiki_native_jobs%rowtype;
  dispatch_id bigint;
begin
  if p_job_id is null or p_expected_blocker is null or length(pg_catalog.btrim(p_expected_blocker)) = 0 then
    raise exception 'A_WIKI_NATIVE_RETRY_INVALID';
  end if;

  select * into target
  from survival_ops.a_wiki_native_jobs
  where job_id=p_job_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','NOT_FOUND');
  end if;

  if target.status <> 'BLOCKED' then
    return pg_catalog.jsonb_build_object('status','STATE_MISMATCH','actual_status',target.status);
  end if;

  if target.blocker_code is distinct from p_expected_blocker then
    return pg_catalog.jsonb_build_object('status','BLOCKER_MISMATCH','actual_blocker',target.blocker_code);
  end if;

  if target.review_result is null
     or target.review_result->>'decision' is distinct from 'APPROVE'
     or target.prepared_job is null
     or target.proposal is null
     or target.review_job is null then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','APPROVED_REVIEW_PACKAGE_REQUIRED');
  end if;

  update survival_ops.a_wiki_native_jobs
  set status='FINALIZING',
      finalizing_at=clock_timestamp(),
      blocker_code=null
  where job_id=target.job_id
    and status='BLOCKED';

  begin
    dispatch_id := survival_ops.dispatch_a_wiki_native_finalizer('blocked_retry');
  exception when others then
    dispatch_id := null;
  end;

  return pg_catalog.jsonb_build_object(
    'status','FINALIZING',
    'job_id',target.job_id,
    'dispatch_request_id',dispatch_id
  );
end;
$$;

revoke all on function survival_ops.guard_a_wiki_native_job() from public,anon,authenticated,service_role;
revoke all on function public.archive_a_wiki_native_job_retry_blocked(uuid,text) from public,anon,authenticated;
grant execute on function public.archive_a_wiki_native_job_retry_blocked(uuid,text) to service_role;

commit;
