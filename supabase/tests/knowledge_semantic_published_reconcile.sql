\set ON_ERROR_STOP on
begin;

do $verify$
declare
  prepared jsonb;
  job_id uuid;
  submitted jsonb;
  claimed jsonb;
  updated jsonb;
  repaired jsonb;
  rejected jsonb;
  old_head text := repeat('a',40);
  prepared_head text := repeat('b',40);
  merge_sha text := repeat('c',40);
begin
  if has_function_privilege('service_role',
       'survival_ops.repair_knowledge_semantic_published(uuid,integer,text,text,text)',
       'EXECUTE') then
    raise exception 'repair RPC must not be executable by service_role';
  end if;
  if not has_function_privilege('postgres',
       'survival_ops.repair_knowledge_semantic_published(uuid,integer,text,text,text)',
       'EXECUTE') then
    raise exception 'repair RPC must be executable by postgres';
  end if;

  prepared := public.archive_knowledge_semantic_job_prepare(
    'BACKFILL_BRIEF','PUBLIC_READER','synthetic://published-reconcile',repeat('1',64),
    'synthetic-published-reconcile','c3-test-v1',repeat('2',64),
    '{"synthetic":true}'::jsonb,repeat('3',40),
    '{"source":{"kind":"PUBLIC_READER"},"target":{"brief_id":"K-999"}}'::jsonb,
    'PREPARED',null
  );
  if prepared->>'status' <> 'PREPARED' then
    raise exception 'prepare failed: %',prepared;
  end if;
  job_id := (prepared->>'job_id')::uuid;

  submitted := public.archive_knowledge_semantic_job_submit(
    job_id,'synthetic://published-reconcile',repeat('1',64),
    jsonb_build_object(
      'version','knowledge-semantic-result-v1',
      'decision','BRIEF_READY',
      'job_id',job_id::text,
      'candidate',jsonb_build_object('synthetic',true),
      'evidence',jsonb_build_object('synthetic',true),
      'brief',jsonb_build_object('synthetic',true)
    )
  );
  if submitted->>'status' <> 'ACCEPTED' then
    raise exception 'submit failed: %',submitted;
  end if;

  claimed := public.archive_knowledge_semantic_job_claim_finalizer();
  if claimed->>'status' <> 'FINALIZING' or claimed->>'job_id' <> job_id::text then
    raise exception 'claim failed: %',claimed;
  end if;

  updated := public.archive_knowledge_semantic_job_update(
    job_id,'FINALIZING','PR_OPEN',null,null,302,
    'knowledge/worker/semantic-' || job_id::text,old_head,null
  );
  if updated->>'status' <> 'PR_OPEN' then
    raise exception 'PR_OPEN update failed: %',updated;
  end if;
  updated := public.archive_knowledge_semantic_job_update(
    job_id,'PR_OPEN','BLOCKED','PR_HEAD_CHANGED','PR_RECONCILE',null,null,null,null
  );
  if updated->>'status' <> 'BLOCKED' then
    raise exception 'BLOCKED update failed: %',updated;
  end if;

  rejected := survival_ops.repair_knowledge_semantic_published(
    job_id,302,repeat('d',40),prepared_head,merge_sha
  );
  if rejected->>'status' <> 'REJECTED' or rejected->>'reason' <> 'REPAIR_BINDING_MISMATCH' then
    raise exception 'wrong old head was not rejected: %',rejected;
  end if;

  repaired := survival_ops.repair_knowledge_semantic_published(
    job_id,302,old_head,prepared_head,merge_sha
  );
  if repaired->>'status' <> 'PUBLISHED'
     or repaired->>'final_head_sha' <> prepared_head
     or repaired->>'merge_sha' <> merge_sha then
    raise exception 'published repair failed: %',repaired;
  end if;

  if not exists (
    select 1 from survival_ops.knowledge_semantic_jobs
    where job_id = job_id
      and status='PUBLISHED'
      and final_pr_number=302
      and final_head_sha=prepared_head
      and merge_sha=merge_sha
      and blocker_code is null
      and blocker_stage is null
      and published_at is not null
  ) then
    raise exception 'published repair row state mismatch';
  end if;
end
$verify$;

rollback;
