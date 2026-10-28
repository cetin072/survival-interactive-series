-- Run through knowledge-editor-legacy-fixture.mjs on an isolated CI database.
-- Exact public Git bytes are inputs. All drafts/approvals below are rolled back.
do $verify$
declare source jsonb; target uuid; original jsonb; state jsonb; draft jsonb; review jsonb; request jsonb; worker jsonb; lease uuid; before_jobs integer; before_reviews integer; begin
 select count(*) into before_jobs from survival_ops.knowledge_semantic_jobs;
 select count(*) into before_reviews from survival_ops.archive_review_items;
 if has_function_privilege('authenticated','public.archive_worker_knowledge_editor_import_legacy(jsonb)','EXECUTE') or has_function_privilege('anon','public.archive_worker_knowledge_editor_import_legacy(jsonb)','EXECUTE') then raise exception 'browser can import'; end if;
 if not has_function_privilege('service_role','public.archive_worker_knowledge_editor_import_legacy(jsonb)','EXECUTE') then raise exception 'service cannot register'; end if;
 if has_table_privilege('authenticated','survival_ops.knowledge_editor_legacy_sources','SELECT') or has_table_privilege('service_role','survival_ops.knowledge_editor_legacy_drafts','UPDATE') then raise exception 'direct table access'; end if;
 perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',true);
 insert into vault.decrypted_secrets(name,decrypted_secret,created_at) values('archive_github_dispatch_token',repeat('x',40),clock_timestamp());
 for source in select s.source from legacy_test_sources s loop
  target:=public.archive_worker_knowledge_editor_import_legacy(source);
  if public.archive_worker_knowledge_editor_import_legacy(source)<>target then raise exception 'duplicate import identity'; end if;
  begin
   perform public.archive_worker_knowledge_editor_import_legacy(jsonb_set(source,'{brief_sha256}',to_jsonb(repeat('0',64))));
   raise exception 'bad hash accepted';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_LEGACY_HASH_MISMATCH' then raise; end if; end;
  state:=public.archive_operator_knowledge_editor_get(target); original:=state->'original';
  if state->>'origin_kind'<>'LEGACY_PUBLIC' or (state->>'revision')::integer<>0 or state->'public_record'<>'null'::jsonb or state->'request'<>'null'::jsonb then raise exception 'import implied approval or AI origin'; end if;
  if not exists(select 1 from jsonb_array_elements(public.archive_operator_knowledge_editor_inbox()->'items') i where i->>'job_id'=target::text) then raise exception 'legacy missing from inbox'; end if;
  draft:=jsonb_set(state->'brief','{summary}',to_jsonb('격리 테스트 수정본: '||(state->'brief'->>'summary'))); review:=state->'evidence_review';
  state:=public.archive_operator_knowledge_editor_save(target,0,draft,review);
  if (state->>'revision')::integer<>1 or state->'original'<>original or state->'request'<>'null'::jsonb then raise exception 'save changed origin or implied approval'; end if;
  if public.archive_operator_knowledge_editor_version(target,1)->'brief'<>draft then raise exception 'saved version missing'; end if;
  begin
   perform public.archive_operator_knowledge_editor_save(target,0,draft,review);
   raise exception 'stale save accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
   perform public.archive_operator_knowledge_editor_save(target,1,jsonb_set(draft,'{slug}','"other-url"'),review);
   raise exception 'public URL changed';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_IDENTITY_LOCKED:slug' then raise; end if; end;
  perform public.archive_operator_knowledge_editor_action(target,'ARCHIVE');
  begin
   perform public.archive_operator_knowledge_editor_save(target,1,draft,review);
   raise exception 'archived save accepted';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_RESTORE_REQUIRED' then raise; end if; end;
  state:=public.archive_operator_knowledge_editor_action(target,'RESTORE');
  if state->'brief'->>'slug'<>source->>'slug' then raise exception 'restore changed URL'; end if;
  request:=public.archive_operator_knowledge_editor_request(target,1,false);
  worker:=public.archive_worker_knowledge_editor_request((request->>'request_id')::uuid,'CLAIM'); lease:=(worker->>'lease_token')::uuid;
  if worker->'snapshot'->'job'<>'null'::jsonb or worker->'snapshot'->'legacy_source'<>source or worker->'snapshot'->>'document_id'<>target::text then raise exception 'request fabricated semantic job or changed source'; end if;
  begin
   perform public.archive_worker_knowledge_editor_request((request->>'request_id')::uuid,'PUBLISHING',lease,'{}');
   raise exception 'check-only published';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_APPROVAL_REQUIRED' then raise; end if; end;
  perform public.archive_operator_knowledge_editor_cancel((request->>'request_id')::uuid);
  begin
   perform public.archive_worker_knowledge_editor_request((request->>'request_id')::uuid,'CHECKED',lease,'{}');
   raise exception 'cancelled worker advanced';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_LEASE_INVALID' then raise; end if; end;
  request:=public.archive_operator_knowledge_editor_request(target,1,true);
  worker:=public.archive_worker_knowledge_editor_request((request->>'request_id')::uuid,'CLAIM'); lease:=(worker->>'lease_token')::uuid;
  perform public.archive_worker_knowledge_editor_request((request->>'request_id')::uuid,'PUBLISHING',lease,'{}');
  perform public.archive_worker_knowledge_editor_request((request->>'request_id')::uuid,'PUBLISHED',lease,jsonb_build_object('status','LIVE_VERIFIED','merge_sha',repeat('f',40),'public_url','https://survival-diary-archive.netlify.app/knowledge/'||(source->>'slug')||'/','verified_at',clock_timestamp()));
  draft:=jsonb_set(draft,'{summary}',to_jsonb('두 번째 격리 수정본: '||(draft->>'summary')));
  state:=public.archive_operator_knowledge_editor_save(target,1,draft,review);
  request:=public.archive_operator_knowledge_editor_request(target,2,false);
  worker:=public.archive_worker_knowledge_editor_request((request->>'request_id')::uuid,'GET');
  if worker->'snapshot'->'public_baseline'->>'merge_sha'<>repeat('f',40) then raise exception 're-edit lost latest verified baseline'; end if;
  perform public.archive_operator_knowledge_editor_cancel((request->>'request_id')::uuid);
  if state->'original'<>original or (select l.source from survival_ops.knowledge_editor_legacy_sources l where l.document_id=target)<>source then raise exception 'original changed'; end if;
  begin
   update survival_ops.knowledge_editor_legacy_sources set slug='changed' where document_id=target;
   raise exception 'source mutation accepted';
  exception when raise_exception then if sqlerrm<>'KNOWLEDGE_EDITOR_HISTORY_IMMUTABLE' then raise; end if; end;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',true);
  begin
   perform public.archive_operator_knowledge_editor_save(target,2,draft,review);
   raise exception 'viewer saved';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',true);
 end loop;
 if (select count(*) from survival_ops.knowledge_editor_legacy_sources)<>6 or (select count(*) from survival_ops.knowledge_semantic_jobs)<>before_jobs or (select count(*) from survival_ops.archive_review_items)<>before_reviews then raise exception 'missing import or fabricated job/review'; end if;
end;
$verify$;
ROLLBACK;
