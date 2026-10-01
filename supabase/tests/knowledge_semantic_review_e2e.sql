\set ON_ERROR_STOP on
begin;

do $review_e2e$
declare
  v_item jsonb;
  v_duplicate jsonb;
  v_inbox jsonb;
  v_detail jsonb;
  v_decision jsonb;
  v_approved jsonb;
  v_receipt jsonb;
  v_item_id uuid;
  v_decided_at timestamptz;
  v_head_sha text := repeat('a',40);
  v_key text := 'C_KNOWLEDGE:K-011:' || repeat('a',40);
  v_source_ref text := 'https://github.com/cetin072/survival-interactive-series/blob/' || repeat('a',40) || '/knowledge/content/briefs/K-011.json';
begin
  if has_function_privilege('authenticated','public.archive_worker_enqueue_review_item(text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.archive_worker_enqueue_review_item(text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_operator_review_inbox()','EXECUTE') then
    raise exception 'review queue grants do not preserve operator/worker boundaries';
  end if;

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_item := public.archive_worker_enqueue_review_item(
    v_key,'C_KNOWLEDGE','KNOWLEDGE',null,'P1',
    'Knowledge semantic review K-011','A synthetic C3 review fixture for the existing Operator Inbox.','HIGH',v_source_ref,
    jsonb_build_object('brief_id','K-011','head_sha',v_head_sha,'decision','HUMAN_REVIEW','reason_codes',jsonb_build_array('RISK_REVIEW'),'pr_number',188)
  );
  if v_item->>'status' <> 'PENDING' or v_item->>'created' <> 'true' then
    raise exception 'HUMAN_REVIEW item was not enqueued: %',v_item;
  end if;
  v_item_id := (v_item->>'id')::uuid;

  v_duplicate := public.archive_worker_enqueue_review_item(
    v_key,'C_KNOWLEDGE','KNOWLEDGE',null,'P1',
    'Knowledge semantic review K-011','A synthetic C3 review fixture for the existing Operator Inbox.','HIGH',v_source_ref,
    jsonb_build_object('brief_id','K-011','head_sha',v_head_sha,'decision','HUMAN_REVIEW','reason_codes',jsonb_build_array('RISK_REVIEW'),'pr_number',188)
  );
  if v_duplicate->>'id' <> v_item_id::text or v_duplicate->>'created' <> 'false' then
    raise exception 'review enqueue idempotency failed: %',v_duplicate;
  end if;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',true);
  begin
    perform public.archive_operator_review_inbox();
    raise exception 'non-operator unexpectedly accessed the review inbox';
  exception when insufficient_privilege then
    if sqlerrm <> 'SURVIVAL_ARCHIVE_OPERATOR_FORBIDDEN' then raise; end if;
  end;

  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',true);
  v_inbox := public.archive_operator_review_inbox();
  if (v_inbox->>'pending_count')::integer <> 1
     or v_inbox->'items'->0->>'id' <> v_item_id::text
     or v_inbox->'items'->0->>'source_worker' <> 'C_KNOWLEDGE' then
    raise exception 'Operator Inbox did not expose the pending C3 review item: %',v_inbox;
  end if;
  v_detail := public.archive_operator_review_item_detail(v_item_id);
  if v_detail->'payload'->>'brief_id' <> 'K-011' or v_detail->>'status' <> 'PENDING' then
    raise exception 'Operator detail did not preserve C3 target metadata: %',v_detail;
  end if;
  v_decision := public.archive_operator_decide_review_item(v_item_id,'APPROVED','Synthetic C3 review accepted.');
  if v_decision->>'status' <> 'APPROVED' then
    raise exception 'Operator decision did not persist: %',v_decision;
  end if;
  v_decided_at := (v_decision->>'decided_at')::timestamptz;

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select item into v_approved from public.archive_worker_list_approved_reviews(1) as rows(item);
  if v_approved->>'id' <> v_item_id::text or v_approved->>'decision' <> 'APPROVED'
     or v_approved->'payload'->>'brief_id' <> 'K-011' then
    raise exception 'C3 approval consumer could not retrieve exact approved work: %',v_approved;
  end if;
  v_receipt := public.archive_worker_record_review_consumption(
    v_item_id,v_decided_at,'CONSUMED','{"status":"C3_TEST_CONSUMED"}'::jsonb
  );
  if v_receipt->>'outcome' <> 'CONSUMED' then
    raise exception 'C3 approval consumer receipt failed: %',v_receipt;
  end if;
  if (select count(*) from public.archive_worker_list_approved_reviews(1)) <> 0 then
    raise exception 'consumed C3 approval was returned again';
  end if;
end
$review_e2e$;

rollback;
