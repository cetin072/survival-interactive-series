# Automation B — Native Worker Scheduled Prompt

Status: **CURRENT AUTHORITY**

이 문서는 **INGESTING / REVIEW_PASS_STAGED 이후 역할의 full authority**다. 예약 실행의 최초 boot authority는 `docs/automation/ILLUSTRATION_B_NATIVE_WORKER_ROUTER.md`다. PREPARED Renderer는 이미지 생성 전 이 문서를 읽지 않는다.

Automation B Native Worker의 목적은 **생성된 삽화를 검수하고 PASS 자산만 게시 경로로 넘기는 것**이다. 이미지 생성은 별도 Clean Renderer가 담당한다. 현재 DB status가 이번 실행의 역할을 결정하며, 정확히 한 역할만 수행하고 종료한다.

대상:
- Repository: `cetin072/survival-interactive-series`
- Supabase project: `jgsxpdflgkqroecfjzxq`
- Library source: `/IMAGE-RENDER/output/current.png`
- Machine contract: `archive/automation/illustration-native-worker-runtime-contract.json`
- Review policy: `archive/automation/illustration-review-provider.json`
- Review handoff branch: `automation-b-review-handoff`
- Review handoff path: `archive/automation/runtime/illustration-review-handoff.json`

## 공통

1. Boot Router가 이미 current job status를 고정한 뒤 이 문서가 로드된다.
2. 한 실행에서 역할은 하나다.
   - PREPARED = reservation bridge DISPATCH 또는 COLLECT (Boot Router 소유)
   - INGESTING = Reviewer + review handoff 작성
   - REVIEW_PASS_STAGED = PASS site asset transfer/resume
   - 그 외 = NOOP
3. AI Worker는 review decision을 Supabase에 직접 쓰지 않는다. INGESTING 판정은 GitHub의 전용 runtime handoff branch에 작은 JSON 하나로 넘기고, Program workflow가 fresh lease를 획득하여 기존 `archive_illustration_review_decide_v3`를 호출한다.
4. 오래된 장소/사건을 억지로 재시도하지 않는다. Program Prep은 GitHub receipts뿐 아니라 durable DB attempt history도 읽어 **아직 한 번도 시도하지 않은 CHARACTER를 재시도 CHARACTER보다 먼저** 고른다.
5. 새 Vault 보관을 만들지 않는다. REJECT 원본은 backend로 운반하지 않는다.
6. HUMAN_REVIEW에서는 Library 원본을 보존하고 자동 진행하지 않는다.

## PREPARED

PREPARED는 Boot Router가 `ILLUSTRATION_B_RESERVATION_BRIDGE.md`의 DISPATCH/COLLECT로 처리한다. 이 문서는 Reviewer/Transfer 실행에만 로드한다. 이미지는 exact visual prompt와 고정 저장 suffix만 받는 격리 one-shot Renderer가 생성한다.

## INGESTING — Reviewer 역할만

1. exact `current.png`가 없으면 mutation 없이 종료한다.
2. Library raw file을 materialize하고 실제 이미지를 stored `job.review_context`와 비교한다.
3. current job의 immutable binding을 다시 확인한다: `job_id`, `main_sha`, `point_id`, `generation_key`, `subject_id`, `prompt_sha256`, `review_context_sha256`.
4. PASS / REJECT / HUMAN_REVIEW 중 하나만 결정한다.
5. Supabase의 lease acquire / review_decide / 상태변경 RPC를 이 AI 실행에서 직접 호출하지 않는다.
6. exact Library file id를 읽고 다음 필드만 가진 `illustration-review-handoff-v1` JSON을 만든다.
   - `version`
   - `job_id`
   - `main_sha`
   - `point_id`
   - `generation_key`
   - `subject_id`
   - `prompt_sha256`
   - `review_context_sha256`
   - `source_library_path` = `/IMAGE-RENDER/output/current.png`
   - `source_library_file_id` = exact `file_...`
   - `decision`
   - `review_provider` = `native_chatgpt_vision`
   - `review_summary`
   - `rejection_codes`
   - `created_at` = UTC ISO timestamp
7. GitHub에서 branch=`automation-b-review-handoff`, path=`archive/automation/runtime/illustration-review-handoff.json`의 현재 blob SHA를 읽은 뒤 **그 파일 하나만** update한다. main은 수정하지 않는다.
8. handoff commit이 성공하면 즉시 종료한다. 같은 실행에서 DB 판정 재확정, transfer, Finalizer를 수행하지 않는다.
9. REJECT/HUMAN_REVIEW/PASS 어느 경우에도 이 단계에서는 `current.png`를 삭제하지 않는다.
   - PASS는 다음 Native Worker가 DB의 `REVIEW_PASS_STAGED`를 읽어 transfer한다.
   - REJECT는 다음 PREPARED job의 격리 reservation Renderer가 job.created_at보다 오래된 stale `current.png`만 안전하게 교체한다.
   - HUMAN_REVIEW는 새 PREPARED job이 생기지 않으므로 원본이 그대로 보존된다.

## REVIEW_PASS_STAGED — PASS site asset transfer/resume

1. 이미 저장된 PASS 판정을 다시 판단하지 않는다.
2. fresh lease가 없으면 `archive_illustration_render_job_lease_acquire(job_id,'archive-illustration-native-transfer',600)`로 얻는다.
3. exact Library PNG를 512×512 사이트용 PNG로 변환한다.
   - RGB
   - LANCZOS resize
   - 256-color quantization
   - PNG optimize
   - 결과가 200,000 bytes를 넘으면 128-color로 한 번 더 생성한다.
   - 최종 결과는 512×512 PNG, 1,000,000 bytes 이하이어야 한다.
4. 최종 사이트 PNG의 SHA-256/bytes/dimensions를 계산한다.
5. `archive_illustration_review_staging_resume`으로 existing staging을 확인한다.
   - exact matching staging이 있으면 stored_chunk_indexes 기준으로 누락 chunk만 보낸다.
   - 없으면 `archive_illustration_site_staging_begin`으로 하나만 만든다.
6. base64 chunk는 최대 220,000 chars로 나눠 `archive_illustration_review_staging_chunk_put`으로 순서대로 보낸다.
7. 모든 chunk가 저장되면 `archive_illustration_site_staging_finalize`를 한 번 호출한다.
8. FINALIZE_QUEUED가 확인되면 `current.png`를 정리하고 종료한다.
9. transfer 오류/lease lost에서는 실패 결정을 새로 만들지 말고 원본과 partial staging을 보존한다. 다음 실행이 resume한다.

## Program Review Handoff

`.github/workflows/archive-illustration-review-handoff.yml`은 runtime handoff branch의 파일 변경을 받되 **실행 코드는 current main에서 checkout**한다.

Program은:
1. triggering commit에서 exact handoff JSON만 읽는다.
2. handoff schema와 immutable job binding을 fail-closed 검증한다.
3. 이미 같은 decision이 durable하게 적용됐으면 idempotent NOOP한다.
4. 아직 `INGESTING`이면 fresh 600초 lease를 프로그램이 직접 얻는다.
5. 기존 `archive_illustration_review_decide_v3`를 정확히 한 번 호출한다.
6. DB readback으로 decision/status/provider_asset_id를 확인하고 종료한다.

## Program Finalizer

Native Worker는 Finalizer, permanent Storage, Registry, SITE_ASSETS, Production을 직접 수행하지 않는다.
현재 검증된 Program Finalizer가 PASS site asset을 이어서 처리한다.

핵심 불변식:

`PREPARED → 생성만 → INGESTING → AI 판정 JSON → Program이 durable decision → REJECT/HUMAN 종료 또는 PASS → REVIEW_PASS_STAGED → 작은 사이트 PNG만 전송 → FINALIZE_QUEUED → Program Finalizer`
