begin;

create or replace function public.archive_a_wiki_native_job_current()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when j.status='EXTRACTOR_READY' then pg_catalog.jsonb_build_object(
        'status','EXTRACTOR_READY','job_id',j.job_id,'session_id',j.session_id,
        'binding_sha256',j.prepared_job_sha256,'payload',j.prepared_job
      )
      when j.status='REVIEW_READY' then pg_catalog.jsonb_build_object(
        'status','REVIEW_READY','job_id',j.job_id,'session_id',j.session_id,
        'binding_sha256',j.review_job_sha256,
        'proposal_sha256',j.review_job->'proposal'->>'proposal_sha256',
        'proposal_storage_sha256',j.proposal_sha256,
        'payload',j.review_job
      )
      else pg_catalog.jsonb_build_object(
        'status',j.status,'job_id',j.job_id,'session_id',j.session_id,
        'blocker_code',j.blocker_code
      )
    end
    from survival_ops.a_wiki_native_jobs j
    where j.status <> 'PUBLISHED'
    order by j.created_at,j.job_id
    limit 1
  ), pg_catalog.jsonb_build_object('status','NO_JOB'));
$$;

create or replace function public.archive_a_wiki_native_job_submit(
  p_job_id uuid,
  p_expected_phase text,
  p_binding_sha256 text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.a_wiki_native_jobs%rowtype;
  result_sha text;
  dispatch_id bigint;
  review_proposal_sha text;
begin
  if p_job_id is null
     or p_expected_phase not in ('EXTRACTOR_READY','REVIEW_READY')
     or p_binding_sha256 !~ '^[a-f0-9]{64}$'
     or p_result is null or pg_catalog.jsonb_typeof(p_result) <> 'object'
     or pg_catalog.pg_column_size(p_result) > 4194304 then
    raise exception 'A_WIKI_NATIVE_SUBMIT_INVALID';
  end if;

  select * into target
  from survival_ops.a_wiki_native_jobs
  where job_id=p_job_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','JOB_NOT_FOUND');
  end if;

  result_sha := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_result::text,'UTF8'),'sha256'),'hex'
  );

  if p_expected_phase='EXTRACTOR_READY' then
    if p_binding_sha256 <> target.prepared_job_sha256 then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','BINDING_MISMATCH');
    end if;
    if p_result->>'version' is distinct from 'wiki-fact-result-v1'
       or p_result->>'job_id' is distinct from target.prepared_job->>'job_id' then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','RESULT_CONTRACT_INVALID');
    end if;
    if target.status <> 'EXTRACTOR_READY' then
      if target.extractor_result_sha256=result_sha then
        return pg_catalog.jsonb_build_object('status','ALREADY_SUBMITTED','job_id',target.job_id);
      end if;
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','PHASE_MISMATCH','actual_status',target.status);
    end if;

    update survival_ops.a_wiki_native_jobs
    set extractor_result=p_result,
        extractor_result_sha256=result_sha,
        status='EXTRACTOR_SUBMITTED',
        extractor_submitted_at=clock_timestamp(),
        blocker_code=null
    where job_id=target.job_id and status='EXTRACTOR_READY';

  else
    if target.review_job_sha256 is null or p_binding_sha256 <> target.review_job_sha256 then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','BINDING_MISMATCH');
    end if;

    review_proposal_sha := target.review_job->'proposal'->>'proposal_sha256';

    if review_proposal_sha is null or review_proposal_sha !~ '^[a-f0-9]{64}$' then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','REVIEW_JOB_PROPOSAL_SHA_INVALID');
    end if;

    if p_result->>'version' is distinct from 'wiki-fact-review-v1'
       or p_result->>'proposal_sha256' is distinct from review_proposal_sha
       or p_result->>'decision' not in ('APPROVE','HUMAN_REVIEW','REJECT') then
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','REVIEW_CONTRACT_INVALID');
    end if;

    if target.status <> 'REVIEW_READY' then
      if target.review_result_sha256=result_sha then
        return pg_catalog.jsonb_build_object('status','ALREADY_SUBMITTED','job_id',target.job_id);
      end if;
      return pg_catalog.jsonb_build_object('status','REJECTED','reason','PHASE_MISMATCH','actual_status',target.status);
    end if;

    update survival_ops.a_wiki_native_jobs
    set review_result=p_result,
        review_result_sha256=result_sha,
        status='REVIEW_SUBMITTED',
        review_submitted_at=clock_timestamp(),
        blocker_code=null
    where job_id=target.job_id and status='REVIEW_READY';
  end if;

  begin
    dispatch_id := survival_ops.dispatch_a_wiki_native_finalizer('native_submit');
  exception when others then
    dispatch_id := null;
  end;

  return pg_catalog.jsonb_build_object(
    'status','ACCEPTED','job_id',target.job_id,
    'result_sha256',result_sha,'dispatch_request_id',dispatch_id
  );
end;
$$;

update survival_ops.a_wiki_native_jobs
set review_result = pg_catalog.jsonb_set(
      review_result,
      '{proposal_sha256}',
      pg_catalog.to_jsonb(review_job->'proposal'->>'proposal_sha256'),
      false
    ),
    review_result_sha256 = pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.jsonb_set(
            review_result,
            '{proposal_sha256}',
            pg_catalog.to_jsonb(review_job->'proposal'->>'proposal_sha256'),
            false
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    updated_at = clock_timestamp()
where status='REVIEW_SUBMITTED'
  and review_result is not null
  and review_job is not null
  and review_result->>'proposal_sha256' = proposal_sha256
  and review_job->'proposal'->>'proposal_sha256' is not null
  and review_job->'proposal'->>'proposal_sha256' <> proposal_sha256;

revoke all on function public.archive_a_wiki_native_job_current() from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_submit(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_a_wiki_native_job_current() to service_role;
grant execute on function public.archive_a_wiki_native_job_submit(uuid,text,text,jsonb) to service_role;

commit;
