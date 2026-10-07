-- Narrow recovery of the observed shelter/wide-area mutual wait. No new state,
-- cap exception, dispatcher privilege, or weakening of the one-active index.
create function public.archive_illustration_recover_preserved_shelter(
  p_expected_shelter jsonb, p_expected_wide_area jsonb, p_renderer_idle boolean
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,survival_ops,extensions as $$
declare
  s survival_ops.illustration_render_jobs%rowtype;
  w survival_ops.illustration_render_jobs%rowtype;
  t survival_ops.illustration_review_staging%rowtype;
  binary bytea;
  count_chunks integer;
  result jsonb;
begin
  if p_renderer_idle is distinct from true then
    raise exception 'PRESERVED_PASS_RENDERER_NOT_IDLE' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('illustration-render-enqueue'));
  select * into s from survival_ops.illustration_render_jobs
    where job_id='illustration-event-shelter-22e758f3837c-20261007-37526903478' for update;
  select * into w from survival_ops.illustration_render_jobs
    where job_id='illustration-event-wide-area-248abb2775d8-20261007-37560662605' for update;
  if s.job_id is null or w.job_id is null
    or s.job_id is distinct from p_expected_shelter->>'job_id'
    or w.job_id is distinct from p_expected_wide_area->>'job_id'
    or s.subject_id<>'event-shelter' or w.subject_id<>'event-wide-area'
    or s.output_sha256 is distinct from p_expected_shelter->>'output_sha256'
    or s.provider_asset_id is distinct from p_expected_shelter->>'provider_asset_id'
    or s.review_staging_id is distinct from p_expected_shelter->>'review_staging_id'
    or s.point_id is distinct from p_expected_shelter->>'point_id'
    or s.generation_key is distinct from p_expected_shelter->>'generation_key'
    or s.prompt_sha256 is distinct from p_expected_shelter->>'prompt_sha256'
    or w.point_id is distinct from p_expected_wide_area->>'point_id'
    or w.generation_key is distinct from p_expected_wide_area->>'generation_key'
    or w.prompt_sha256 is distinct from p_expected_wide_area->>'prompt_sha256' then
    raise exception 'PRESERVED_PASS_BINDING_CHANGED' using errcode='22023';
  end if;
  if s.status in ('FINALIZE_QUEUED','FINALIZING','SUCCEEDED')
    and w.status='BLOCKED' and w.blocker_code='DEFERRED_ACCEPTED_PASS_RECOVERY' then
    return jsonb_build_object('status','ALREADY_RECOVERED','job_id',s.job_id);
  end if;
  -- Full row CAS includes exact status, source/prompt, timestamps and lease.
  if to_jsonb(s) is distinct from p_expected_shelter
    or to_jsonb(w) is distinct from p_expected_wide_area
    or s.status<>'BLOCKED' or s.blocker_code<>'FINALIZER_IDENTITY_EXISTING_CONFLICT'
    or s.blocker_stage<>'PROGRAM_FINALIZER' or s.review_decision<>'PASS'
    or s.active_provider<>'native_chatgpt' or w.active_provider<>'native_chatgpt'
    or w.status<>'PREPARED' or w.provider_completed_at is not null
    or w.provider_asset_id is not null or w.review_decision is not null
    or w.output_sha256 is not null or w.review_staging_id is not null
    or w.staging_id is not null or w.finalizer_dispatch_at is not null
    or (s.lease_token is not null and s.lease_until>clock_timestamp())
    or (w.lease_token is not null and w.lease_until>clock_timestamp())
    or exists(select 1 from survival_ops.illustration_review_staging where job_id=w.job_id) then
    raise exception 'PRESERVED_PASS_STATE_OR_LEASE_CHANGED' using errcode='22023';
  end if;
  select * into t from survival_ops.illustration_review_staging
    where staging_id=s.review_staging_id for update;
  if t.staging_id is null or t.status<>'READY' or t.job_id<>s.job_id
    or t.point_id<>s.point_id or t.generation_key<>s.generation_key or t.subject_id<>s.subject_id
    or t.source_sha256<>s.output_sha256 or t.provider_asset_id<>s.provider_asset_id
    or t.byte_count<>s.output_bytes or t.width<>512 or t.height<>512
    or s.output_width<>512 or s.output_height<>512 or t.chunk_count<>2 then
    raise exception 'PRESERVED_PASS_STAGING_CHANGED' using errcode='22023';
  end if;
  perform 1 from survival_ops.illustration_review_staging_chunks
    where staging_id=t.staging_id order by chunk_index for update;
  select count(*),decode(string_agg(chunk_b64,'' order by chunk_index),'base64')
    into count_chunks,binary from survival_ops.illustration_review_staging_chunks where staging_id=t.staging_id;
  if count_chunks<>2 or not exists(select 1 from survival_ops.illustration_review_staging_chunks where staging_id=t.staging_id and chunk_index=0)
    or not exists(select 1 from survival_ops.illustration_review_staging_chunks where staging_id=t.staging_id and chunk_index=1)
    or octet_length(binary)<>s.output_bytes or encode(extensions.digest(binary,'sha256'),'hex')<>s.output_sha256 then
    raise exception 'PRESERVED_PASS_BINARY_CHANGED' using errcode='22023';
  end if;
  update survival_ops.illustration_render_jobs set status='BLOCKED',
    blocker_code='DEFERRED_ACCEPTED_PASS_RECOVERY',blocker_stage='PREPARE',
    last_error_code='DEFERRED_ACCEPTED_PASS_RECOVERY',last_error_stage='PREPARE',
    lease_owner=null,lease_token=null,lease_until=null,updated_at=clock_timestamp()
    where job_id=w.job_id;
  -- Reuse existing admission, retry caps, daily-success gate and Finalizer dispatch.
  result:=public.archive_illustration_render_job_enqueue(to_jsonb(s));
  if result->>'status'<>'FINALIZE_QUEUED' or result->>'job_id'<>s.job_id then
    raise exception 'PRESERVED_PASS_REQUEUE_DENIED: %',result->>'status' using errcode='22023';
  end if;
  return result || jsonb_build_object('preserved_job_id',w.job_id,'preserved_status','BLOCKED');
end $$;
revoke all on function public.archive_illustration_recover_preserved_shelter(jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.archive_illustration_recover_preserved_shelter(jsonb,jsonb,boolean) to service_role;
