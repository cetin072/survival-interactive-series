-- Reconcile independently reviewed repository publication without inventing native
-- Extractor/Reviewer runs. Preserve every prepared binding when the graph changes.
begin;

alter table survival_ops.a_wiki_native_jobs
  add column completion_origin text,
  add column completion_evidence jsonb,
  add column supersedes_job_id uuid references survival_ops.a_wiki_native_jobs(job_id),
  add constraint a_wiki_native_jobs_completion_evidence_check check (
    (completion_origin is null and completion_evidence is null)
    or (completion_origin is not null and completion_origin = 'EXTERNAL_REVIEWED_MERGE'
      and completion_evidence is not null
      and jsonb_typeof(completion_evidence) = 'object'
      and pg_column_size(completion_evidence) <= 65536)
  );

alter table survival_ops.a_wiki_native_jobs
  drop constraint a_wiki_native_jobs_status_check,
  add constraint a_wiki_native_jobs_status_check check (status in (
    'EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED',
    'FINALIZING','HUMAN_REVIEW','REJECT','PUBLISHED','BLOCKED','SUPERSEDED'
  )),
  drop constraint a_wiki_native_jobs_source_ref_source_sha256_key,
  add constraint a_wiki_native_jobs_source_graph_key
    unique (source_ref,source_sha256,graph_sha256);

drop index survival_ops.a_wiki_native_jobs_one_active;
create unique index a_wiki_native_jobs_one_active
  on survival_ops.a_wiki_native_jobs ((true))
  where status not in ('PUBLISHED','SUPERSEDED');

-- Catalog approval and content hashes remain the program verifier's responsibility.
-- The database also binds the public AFTERFALL namespace, season, and source path.
create or replace function survival_ops.validate_a_wiki_native_prepare(p_job jsonb,p_main_sha text)
returns void
language plpgsql
set search_path = ''
as $$
declare v_source jsonb;
begin
  if p_job is null or pg_catalog.jsonb_typeof(p_job) <> 'object'
    or pg_catalog.pg_column_size(p_job) > 4194304
    or p_job->>'version' is distinct from 'wiki-fact-job-v1'
    or p_job->>'chronicle_id' is distinct from 'C03-AFTERFALL'
    or p_job->>'worldline_id' is distinct from 'AFTERFALL'
    or p_job->>'visibility' is distinct from 'PUBLIC_ARCHIVE'
    or coalesce(p_job->>'season_id','') !~ '^S[0-9]{2,3}$'
    or coalesce(p_job->>'job_id','') !~ '^wiki-job-[a-f0-9]{64}$'
    or coalesce(p_main_sha,'') !~ '^[a-f0-9]{40}$' then
    raise exception 'A_WIKI_NATIVE_PREPARE_INVALID';
  end if;
  if pg_catalog.substring(p_job->>'season_id',2)::integer < 3 then
    raise exception 'A_WIKI_NATIVE_PREPARE_INVALID';
  end if;
  v_source := p_job->'source';
  if pg_catalog.jsonb_typeof(v_source) is distinct from 'object'
    or coalesce(v_source->>'session_id','') !~ '^SESSION_[0-9]{3}$'
    or v_source->>'manifest_ref' is distinct from
      'archive/content/transcripts/C03-AFTERFALL/' || (p_job->>'season_id') || '/'
      || (v_source->>'session_id') || '/SOURCE_MANIFEST.json'
    or coalesce(v_source->>'manifest_sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_job->>'graph_sha256','') !~ '^[a-f0-9]{64}$' then
    raise exception 'A_WIKI_NATIVE_PREPARE_BINDING_INVALID';
  end if;
end;
$$;

-- This validates the durable evidence envelope, not GitHub content. Only the
-- service verifier may call the publication RPC after checking exact PR/main
-- ancestry, independently approved receipt, and raw-byte fact/source checksums.
create or replace function survival_ops.a_wiki_publication_evidence_valid(
  p_source_ref text,p_source_sha256 text,p_prepared_job_sha256 text,p_evidence jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_fact_root text;
  v_fact_name text;
  v_merged_at timestamptz;
begin
  if p_evidence is null or pg_catalog.jsonb_typeof(p_evidence) <> 'object'
    or pg_catalog.pg_column_size(p_evidence) > 65536
    or p_evidence->>'version' is distinct from 'a-wiki-publication-evidence-v1'
    or p_evidence->>'origin' is distinct from 'EXTERNAL_REVIEWED_MERGE'
    or coalesce(p_source_ref,'') !~ '^archive/content/transcripts/C03-AFTERFALL/S[0-9]{2,3}/SESSION_[0-9]{3}/SOURCE_MANIFEST[.]json$'
    or p_evidence->>'source_ref' is distinct from p_source_ref
    or p_evidence->>'source_sha256' is distinct from p_source_sha256
    or p_evidence->>'prepared_job_sha256' is distinct from p_prepared_job_sha256
    or coalesce(p_evidence->>'receipt_sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_evidence->>'receipt_job_id','') !~ '^wiki-job-[a-f0-9]{64}$'
    or coalesce(p_evidence->>'proposal_sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_evidence->>'review_sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_evidence->>'graph_before_sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_evidence->>'graph_after_sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_evidence->>'outcome','') not in ('APPLIED','NO_FACTS')
    or pg_catalog.jsonb_typeof(p_evidence->'pr_number') is distinct from 'number'
    or coalesce(p_evidence->>'pr_number','') !~ '^[1-9][0-9]{0,9}$'
    or coalesce(p_evidence->>'head_ref','') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'
    or coalesce(p_evidence->>'head_sha','') !~ '^[a-f0-9]{40}$'
    or coalesce(p_evidence->>'merge_sha','') !~ '^[a-f0-9]{40}$'
    or coalesce(p_evidence->>'verified_main_sha','') !~ '^[a-f0-9]{40}$'
    or coalesce(p_evidence->>'merged_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+]00:00)$' then
    return false;
  end if;
  if pg_catalog.substring(pg_catalog.split_part(p_source_ref,'/',5),2)::integer < 3 then return false; end if;
  -- Casts are intentionally checked here; malformed/future timestamps fail closed.
  if (p_evidence->>'pr_number')::bigint > 2147483647 then return false; end if;
  v_merged_at := (p_evidence->>'merged_at')::timestamptz;
  if v_merged_at > pg_catalog.clock_timestamp() + interval '5 minutes' then return false; end if;
  v_fact_root := 'archive/content/public-facts/C03-AFTERFALL/'
    || pg_catalog.split_part(p_source_ref,'/',5) || '/';
  v_fact_name := 'AWIKI_' || pg_catalog.split_part(p_source_ref,'/',6)
    || '_' || p_source_sha256 || '.json';
  if p_evidence->>'receipt_ref' is distinct from v_fact_root || 'receipts/' || v_fact_name then
    return false;
  end if;
  if p_evidence->>'outcome' = 'APPLIED' then
    return p_evidence->>'fact_ref' is not distinct from v_fact_root || v_fact_name
      and coalesce(p_evidence->>'fact_sha256','') ~ '^[a-f0-9]{64}$';
  end if;
  return p_evidence->>'fact_ref' is null and p_evidence->>'fact_sha256' is null
    and p_evidence->>'graph_before_sha256' = p_evidence->>'graph_after_sha256';
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  return false;
end;
$$;

create or replace function survival_ops.guard_a_wiki_native_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='UPDATE' then
    if old.status in ('PUBLISHED','HUMAN_REVIEW','REJECT','SUPERSEDED') then
      raise exception 'A_WIKI_NATIVE_TERMINAL_IMMUTABLE';
    end if;
    if old.job_id is distinct from new.job_id
      or old.session_id is distinct from new.session_id
      or old.created_at is distinct from new.created_at
      or old.supersedes_job_id is distinct from new.supersedes_job_id
      or old.prepared_job is distinct from new.prepared_job
      or old.prepared_job_sha256 is distinct from new.prepared_job_sha256
      or old.source_ref is distinct from new.source_ref
      or old.source_sha256 is distinct from new.source_sha256
      or old.graph_sha256 is distinct from new.graph_sha256
      or old.main_sha_at_prepare is distinct from new.main_sha_at_prepare then
      raise exception 'A_WIKI_NATIVE_BINDING_IMMUTABLE';
    end if;

    -- The general advance RPC cannot supply this evidence. All native semantic
    -- payloads and timestamps must remain exactly as they were before recovery.
    if new.status='PUBLISHED' and new.completion_origin='EXTERNAL_REVIEWED_MERGE'
      and old.completion_evidence is null
      and survival_ops.a_wiki_publication_evidence_valid(
        old.source_ref,old.source_sha256,old.prepared_job_sha256,new.completion_evidence
      )
      and (pg_catalog.to_jsonb(old) - array[
        'status','completion_origin','completion_evidence','blocker_code',
        'final_pr_number','final_head_ref','final_head_sha','merge_sha','published_at','updated_at'
      ]) = (pg_catalog.to_jsonb(new) - array[
        'status','completion_origin','completion_evidence','blocker_code',
        'final_pr_number','final_head_ref','final_head_sha','merge_sha','published_at','updated_at'
      ])
      and new.final_pr_number = (new.completion_evidence->>'pr_number')::integer
      and new.final_head_ref = new.completion_evidence->>'head_ref'
      and new.final_head_sha = new.completion_evidence->>'head_sha'
      and new.merge_sha = new.completion_evidence->>'merge_sha'
      and new.published_at = (new.completion_evidence->>'merged_at')::timestamptz then
      new.updated_at := pg_catalog.clock_timestamp();
      return new;
    end if;
    if old.completion_origin is distinct from new.completion_origin
      or old.completion_evidence is distinct from new.completion_evidence then
      raise exception 'A_WIKI_NATIVE_PUBLICATION_EVIDENCE_IMMUTABLE';
    end if;

    -- Retire only the graph-bound blocked package; never erase or rebind it.
    if old.status='BLOCKED'
      and old.blocker_code='A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED'
      and new.status='SUPERSEDED'
      and (pg_catalog.to_jsonb(old) - array['status','updated_at'])
        = (pg_catalog.to_jsonb(new) - array['status','updated_at']) then
      new.updated_at := pg_catalog.clock_timestamp();
      return new;
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
    elsif old.status='BLOCKED' and (new.status not in ('BLOCKED','FINALIZING')
      or (new.status='FINALIZING' and old.blocker_code='A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED')) then
      raise exception 'A_WIKI_NATIVE_TRANSITION_INVALID';
    end if;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create or replace function public.archive_a_wiki_native_job_recovery_current()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select pg_catalog.to_jsonb(j) from survival_ops.a_wiki_native_jobs j
    where j.status not in ('PUBLISHED','SUPERSEDED')
    order by j.created_at,j.job_id limit 1
  ), pg_catalog.jsonb_build_object('status','NO_JOB'));
$$;

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
        'proposal_storage_sha256',j.proposal_sha256,'payload',j.review_job
      )
      else pg_catalog.jsonb_build_object(
        'status',j.status,'job_id',j.job_id,'session_id',j.session_id,
        'blocker_code',j.blocker_code
      )
    end
    from survival_ops.a_wiki_native_jobs j
    where j.status not in ('PUBLISHED','SUPERSEDED')
    order by j.created_at,j.job_id limit 1
  ), pg_catalog.jsonb_build_object('status','NO_JOB'));
$$;

create or replace function public.archive_a_wiki_native_job_prepare(p_job jsonb,p_main_sha text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created survival_ops.a_wiki_native_jobs%rowtype;
  existing survival_ops.a_wiki_native_jobs%rowtype;
  v_source jsonb;
begin
  perform survival_ops.validate_a_wiki_native_prepare(p_job,p_main_sha);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('a_wiki_native_job_admission',0));
  v_source := p_job->'source';
  -- A published source remains complete even if subsequent graph commits exist.
  select * into existing from survival_ops.a_wiki_native_jobs
  where source_ref=v_source->>'manifest_ref' and source_sha256=v_source->>'manifest_sha256'
    and status='PUBLISHED' order by published_at desc,job_id limit 1;
  if found then
    return pg_catalog.jsonb_build_object('status','EXISTING_JOB','job_id',existing.job_id,
      'job_status',existing.status,'session_id',existing.session_id);
  end if;
  select * into existing from survival_ops.a_wiki_native_jobs
  where status not in ('PUBLISHED','SUPERSEDED') order by created_at,job_id limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'status',case when existing.source_ref=v_source->>'manifest_ref'
        and existing.source_sha256=v_source->>'manifest_sha256'
        and existing.graph_sha256=p_job->>'graph_sha256' then 'EXISTING_JOB' else 'ACTIVE_JOB_EXISTS' end,
      'job_id',existing.job_id,'job_status',existing.status,'session_id',existing.session_id);
  end if;
  if exists(select 1 from survival_ops.a_wiki_native_jobs
    where source_ref=v_source->>'manifest_ref' and source_sha256=v_source->>'manifest_sha256'
      and graph_sha256=p_job->>'graph_sha256' and status='SUPERSEDED') then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','GRAPH_ALREADY_SUPERSEDED');
  end if;
  insert into survival_ops.a_wiki_native_jobs (
    status,session_id,source_ref,source_sha256,graph_sha256,main_sha_at_prepare,prepared_job,prepared_job_sha256
  ) values ('EXTRACTOR_READY',v_source->>'session_id',v_source->>'manifest_ref',
    v_source->>'manifest_sha256',p_job->>'graph_sha256',p_main_sha,p_job,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_job::text,'UTF8'),'sha256'),'hex'))
  returning * into created;
  return pg_catalog.jsonb_build_object('status','EXTRACTOR_READY','job_id',created.job_id,'created',true,
    'session_id',created.session_id,'binding_sha256',created.prepared_job_sha256);
end;
$$;

create or replace function public.archive_a_wiki_native_job_reconcile_publication(
  p_job_id uuid,p_expected_status text,p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target survival_ops.a_wiki_native_jobs%rowtype;
begin
  if p_job_id is null or coalesce(p_expected_status,'') not in (
    'EXTRACTOR_READY','EXTRACTOR_SUBMITTED','REVIEW_READY','REVIEW_SUBMITTED','FINALIZING','BLOCKED'
  ) then raise exception 'A_WIKI_NATIVE_RECONCILE_INVALID'; end if;
  select * into target from survival_ops.a_wiki_native_jobs where job_id=p_job_id for update;
  if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;
  if not survival_ops.a_wiki_publication_evidence_valid(
    target.source_ref,target.source_sha256,target.prepared_job_sha256,p_evidence
  ) then raise exception 'A_WIKI_NATIVE_PUBLICATION_EVIDENCE_INVALID'; end if;
  if target.status='PUBLISHED' and target.completion_origin='EXTERNAL_REVIEWED_MERGE'
    and target.completion_evidence=p_evidence then
    return pg_catalog.jsonb_build_object('status','ALREADY_RECONCILED','job_id',target.job_id,
      'completion_origin',target.completion_origin,'merge_sha',target.merge_sha);
  end if;
  if target.status is distinct from p_expected_status then
    return pg_catalog.jsonb_build_object('status','STATE_MISMATCH','actual_status',target.status);
  end if;
  update survival_ops.a_wiki_native_jobs
  set status='PUBLISHED',completion_origin='EXTERNAL_REVIEWED_MERGE',completion_evidence=p_evidence,
    final_pr_number=(p_evidence->>'pr_number')::integer,final_head_ref=p_evidence->>'head_ref',
    final_head_sha=p_evidence->>'head_sha',merge_sha=p_evidence->>'merge_sha',
    published_at=(p_evidence->>'merged_at')::timestamptz,blocker_code=null
  where job_id=target.job_id and status=p_expected_status;
  return pg_catalog.jsonb_build_object('status','PUBLISHED','job_id',target.job_id,'reconciled',true,
    'completion_origin','EXTERNAL_REVIEWED_MERGE','merge_sha',p_evidence->>'merge_sha');
end;
$$;

create or replace function public.archive_a_wiki_native_job_supersede_reprepare(
  p_job_id uuid,p_expected_status text,p_job jsonb,p_main_sha text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.a_wiki_native_jobs%rowtype;
  replacement survival_ops.a_wiki_native_jobs%rowtype;
  v_source jsonb;
begin
  if p_job_id is null or p_expected_status is distinct from 'BLOCKED' then
    raise exception 'A_WIKI_NATIVE_REPREPARE_INVALID';
  end if;
  perform survival_ops.validate_a_wiki_native_prepare(p_job,p_main_sha);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('a_wiki_native_job_admission',0));
  select * into target from survival_ops.a_wiki_native_jobs where job_id=p_job_id for update;
  if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;
  v_source := p_job->'source';
  if v_source->>'manifest_ref' is distinct from target.source_ref
    or v_source->>'manifest_sha256' is distinct from target.source_sha256
    or v_source->>'session_id' is distinct from target.session_id
    or p_job->>'season_id' is distinct from target.prepared_job->>'season_id' then
    raise exception 'A_WIKI_NATIVE_REPREPARE_SOURCE_MISMATCH';
  end if;
  if p_job->>'graph_sha256' = target.graph_sha256 then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','GRAPH_UNCHANGED');
  end if;
  if target.status='SUPERSEDED' then
    select * into replacement from survival_ops.a_wiki_native_jobs
    where supersedes_job_id=target.job_id and prepared_job=p_job and main_sha_at_prepare=p_main_sha
    order by created_at,job_id limit 1;
    if found then
      return pg_catalog.jsonb_build_object('status','ALREADY_REPREPARED','job_id',replacement.job_id,
        'job_status',replacement.status,'supersedes_job_id',target.job_id,
        'binding_sha256',replacement.prepared_job_sha256);
    end if;
  end if;
  if target.status is distinct from p_expected_status then
    return pg_catalog.jsonb_build_object('status','STATE_MISMATCH','actual_status',target.status);
  end if;
  if target.blocker_code is distinct from 'A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','GRAPH_DRIFT_BLOCKER_REQUIRED');
  end if;
  if exists(select 1 from survival_ops.a_wiki_native_jobs
    where source_ref=target.source_ref and source_sha256=target.source_sha256
      and graph_sha256=p_job->>'graph_sha256') then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','GRAPH_REVISION_ALREADY_EXISTS');
  end if;
  update survival_ops.a_wiki_native_jobs set status='SUPERSEDED'
  where job_id=target.job_id and status='BLOCKED';
  insert into survival_ops.a_wiki_native_jobs (
    status,session_id,source_ref,source_sha256,graph_sha256,main_sha_at_prepare,
    prepared_job,prepared_job_sha256,supersedes_job_id
  ) values ('EXTRACTOR_READY',target.session_id,target.source_ref,target.source_sha256,
    p_job->>'graph_sha256',p_main_sha,p_job,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_job::text,'UTF8'),'sha256'),'hex'),target.job_id)
  returning * into replacement;
  return pg_catalog.jsonb_build_object('status','EXTRACTOR_READY','job_id',replacement.job_id,'created',true,
    'session_id',replacement.session_id,'supersedes_job_id',target.job_id,
    'binding_sha256',replacement.prepared_job_sha256);
end;
$$;

-- Existing approved same-graph retries remain available; graph drift must prepare
-- and independently review a replacement package instead of looping FINALIZING.
create or replace function public.archive_a_wiki_native_job_retry_blocked(p_job_id uuid,p_expected_blocker text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target survival_ops.a_wiki_native_jobs%rowtype;
  dispatch_id bigint;
begin
  if p_job_id is null or p_expected_blocker is null or length(pg_catalog.btrim(p_expected_blocker))=0 then
    raise exception 'A_WIKI_NATIVE_RETRY_INVALID';
  end if;
  select * into target from survival_ops.a_wiki_native_jobs where job_id=p_job_id for update;
  if not found then return pg_catalog.jsonb_build_object('status','NOT_FOUND'); end if;
  if target.status <> 'BLOCKED' then
    return pg_catalog.jsonb_build_object('status','STATE_MISMATCH','actual_status',target.status);
  end if;
  if target.blocker_code is distinct from p_expected_blocker then
    return pg_catalog.jsonb_build_object('status','BLOCKER_MISMATCH','actual_blocker',target.blocker_code);
  end if;
  if target.blocker_code='A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED' then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','GRAPH_REPREPARE_REQUIRED');
  end if;
  if target.review_result is null or target.review_result->>'decision' is distinct from 'APPROVE'
    or target.prepared_job is null or target.proposal is null or target.review_job is null then
    return pg_catalog.jsonb_build_object('status','REJECTED','reason','APPROVED_REVIEW_PACKAGE_REQUIRED');
  end if;
  update survival_ops.a_wiki_native_jobs
  set status='FINALIZING',finalizing_at=pg_catalog.clock_timestamp(),blocker_code=null
  where job_id=target.job_id and status='BLOCKED';
  begin
    dispatch_id := survival_ops.dispatch_a_wiki_native_finalizer('blocked_retry');
  exception when others then dispatch_id := null;
  end;
  return pg_catalog.jsonb_build_object('status','FINALIZING','job_id',target.job_id,'dispatch_request_id',dispatch_id);
end;
$$;

-- Preserve the currently installed B/C observability implementation verbatim.
-- The later B migration replaced the public body and accidentally omitted A-Wiki.
alter function public.archive_operator_system_status() set schema survival_ops;
alter function survival_ops.archive_operator_system_status() rename to archive_operator_system_status_without_a_wiki_v1;
revoke all on function survival_ops.archive_operator_system_status_without_a_wiki_v1() from public,anon,authenticated,service_role;

create or replace function public.archive_operator_a_wiki_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_count bigint;
  active_count bigint;
  published_count bigint;
  latest_job jsonb;
begin
  perform survival_ops.private_require_archive_operator();
  select count(*) filter (where j.status <> 'SUPERSEDED'),
    count(*) filter (where j.status not in ('PUBLISHED','HUMAN_REVIEW','REJECT','SUPERSEDED')),
    count(*) filter (where j.status='PUBLISHED')
  into total_count,active_count,published_count from survival_ops.a_wiki_native_jobs j;
  select pg_catalog.jsonb_build_object(
    'job_id',j.job_id,'status',j.status,'session_id',j.session_id,
    'season_id',j.prepared_job->>'season_id','source_ref',j.source_ref,'blocker_code',j.blocker_code,
    'final_pr_number',j.final_pr_number,'merge_sha',j.merge_sha,
    'completion_origin',case when j.status='PUBLISHED' then coalesce(j.completion_origin,'NATIVE_REVIEWED_MERGE') else null end,
    'supersedes_job_id',j.supersedes_job_id,'dispatch_count',j.dispatch_count,'dispatch_at',j.dispatch_at,
    'created_at',j.created_at,'updated_at',j.updated_at,'extractor_submitted_at',j.extractor_submitted_at,
    'review_ready_at',j.review_ready_at,'review_submitted_at',j.review_submitted_at,
    'finalizing_at',j.finalizing_at,'published_at',j.published_at,
    'age_minutes',greatest(0,floor(extract(epoch from (pg_catalog.clock_timestamp()-coalesce(
      j.published_at,j.finalizing_at,j.review_submitted_at,j.review_ready_at,
      j.extractor_submitted_at,j.updated_at,j.created_at)))/60))
  ) into latest_job from survival_ops.a_wiki_native_jobs j
  where j.status <> 'SUPERSEDED' order by j.created_at desc,j.job_id desc limit 1;
  return pg_catalog.jsonb_build_object('job_count',total_count,'active_count',active_count,
    'published_count',published_count,'latest_job',latest_job);
end;
$$;

create or replace function public.archive_operator_system_status()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select survival_ops.archive_operator_system_status_without_a_wiki_v1()
    || pg_catalog.jsonb_build_object('a_wiki',public.archive_operator_a_wiki_status());
$$;

revoke all on function survival_ops.validate_a_wiki_native_prepare(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function survival_ops.a_wiki_publication_evidence_valid(text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function survival_ops.guard_a_wiki_native_job() from public,anon,authenticated,service_role;
revoke all on function public.archive_a_wiki_native_job_recovery_current() from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_current() from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_prepare(jsonb,text) from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_reconcile_publication(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_supersede_reprepare(uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.archive_a_wiki_native_job_retry_blocked(uuid,text) from public,anon,authenticated;
grant execute on function public.archive_a_wiki_native_job_recovery_current() to service_role;
grant execute on function public.archive_a_wiki_native_job_current() to service_role;
grant execute on function public.archive_a_wiki_native_job_prepare(jsonb,text) to service_role;
grant execute on function public.archive_a_wiki_native_job_reconcile_publication(uuid,text,jsonb) to service_role;
grant execute on function public.archive_a_wiki_native_job_supersede_reprepare(uuid,text,jsonb,text) to service_role;
grant execute on function public.archive_a_wiki_native_job_retry_blocked(uuid,text) to service_role;
revoke all on function public.archive_operator_system_status() from public,anon,service_role;
revoke all on function public.archive_operator_a_wiki_status() from public,anon,service_role;
grant execute on function public.archive_operator_system_status() to authenticated;
grant execute on function public.archive_operator_a_wiki_status() to authenticated;

commit;
