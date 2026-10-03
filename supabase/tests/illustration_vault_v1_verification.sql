begin;

do $$
declare
  v_bucket record;
  v_def text;
  v_policy_count integer;
begin
  select id,public,file_size_limit into v_bucket
  from storage.buckets where id='survival-illustration-vault';
  if not found or v_bucket.public is distinct from false or v_bucket.file_size_limit<>20971520 then
    raise exception 'ILLUSTRATION_VAULT_BUCKET_INVALID';
  end if;

  if to_regclass('survival_ops.illustration_vault_items') is null then
    raise exception 'ILLUSTRATION_VAULT_TABLE_MISSING';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname='storage' and tablename='objects'
    and policyname='archive operator illustration vault read'
    and cmd='SELECT';
  if v_policy_count<>1 then
    raise exception 'ILLUSTRATION_VAULT_OPERATOR_POLICY_MISSING';
  end if;

  select pg_get_functiondef('public.archive_illustration_review_complete_unleased_internal(jsonb)'::regprocedure)
    into v_def;
  if position('illustration_vault_items' in v_def)=0
     or position('dispatch_afterfall_illustration_vault' in v_def)=0
     or position('review_staging_id=p_review->>''review_staging_id''' in v_def)=0 then
    raise exception 'ILLUSTRATION_REVIEW_VAULT_BINDING_MISSING';
  end if;

  select pg_get_functiondef('archive_ops.dispatch_afterfall_illustration_prep()'::regprocedure)
    into v_def;
  if position('dispatch_afterfall_illustration_vault_pending' in v_def)=0 then
    raise exception 'ILLUSTRATION_VAULT_RETRY_NOT_REUSED_BY_PREP';
  end if;

  select pg_get_functiondef('public.archive_operator_illustration_vault(integer)'::regprocedure)
    into v_def;
  if position('private_require_archive_operator' in v_def)=0 then
    raise exception 'ILLUSTRATION_VAULT_OPERATOR_AUTH_MISSING';
  end if;
end
$$;

rollback;
