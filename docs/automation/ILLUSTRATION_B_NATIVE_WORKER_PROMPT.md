# Automation B — Native Worker Scheduled Prompt

Status: **CURRENT AUTHORITY**

이 문서 본문을 ChatGPT 예약 `Automation B Native Worker`의 운영 프롬프트 권위로 사용한다.

Automation B의 목적은 **신규 인물 중심으로 하루 최소 1장의 검수 통과 삽화를 사이트에 게시하는 것**이다.
한 실행에서 생성과 검수를 함께 수행하지 않는다. 현재 DB status가 이번 실행의 역할을 결정하며, 정확히 한 역할만 수행하고 종료한다.

대상:
- Repository: `cetin072/survival-interactive-series`
- Supabase project: `jgsxpdflgkqroecfjzxq`
- Library source: `/IMAGE-RENDER/output/current.png`
- Machine contract: `archive/automation/illustration-native-worker-runtime-contract.json`
- Review policy: `archive/automation/illustration-review-provider.json`

## 공통

1. 가장 먼저 `public.archive_illustration_render_job_current()`를 정확히 한 번 읽고 immutable binding을 고정한다.
2. current job이 없으면 NOOP 종료한다.
3. 한 실행에서 역할은 하나다.
   - PREPARED = Renderer
   - INGESTING = Reviewer
   - REVIEW_PASS_STAGED = PASS site asset transfer/resume
   - 그 외 = NOOP
4. 오래된 장소/사건을 억지로 재시도하지 않는다. 후보 선택은 Program Prep의 current-main 정책을 따른다.
5. 새 Vault 보관을 만들지 않는다. REJECT 원본은 backend로 운반하지 않는다.
6. HUMAN_REVIEW에서는 Library 원본을 보존하고 자동 진행하지 않는다.

## PREPARED — Renderer 역할만

1. `/IMAGE-RENDER/output/current.png`가 이미 존재하면 덮어쓰지 않고 종료한다.
2. `archive_illustration_render_job_lease_acquire(job_id,'archive-illustration-native-renderer',1800)`로 fresh lease를 얻는다.
3. `archive_illustration_render_prompt()` exact UTF-8 TEXT를 읽고 SHA-256이 job.prompt_sha256과 정확히 같은지 확인한다.
4. exact prompt TEXT만 장면 설명 authority로 사용해 네이티브 이미지 생성으로 정확히 1장을 만든다. 별도 negative prompt, 프로젝트명, 시즌명, 운영 문맥을 추가하지 않는다.
5. Renderer는 품질판정을 하지 않는다. 실제 이미지가 반환되면 metadata prompt가 비어 있어도 폐기하지 않는다.
6. 원본 PNG를 `/IMAGE-RENDER/output/current.png`에 저장하고 readback으로 존재/bytes>0를 확인한다.
7. 성공 후에만 `archive_illustration_render_job_provider_complete(job_id,prompt_sha256)`를 한 번 호출해 INGESTING으로 넘긴다.
8. 여기서 종료한다. 같은 실행에서 Review하지 않는다.

## INGESTING — Reviewer 역할만

1. exact `current.png`가 없으면 mutation 없이 종료한다.
2. Library raw file을 materialize하고 실제 이미지를 stored `job.review_context`와 비교한다.
3. `archive_illustration_render_job_lease_acquire(job_id,'archive-illustration-native-reviewer',600)`로 fresh lease를 얻고 binding/context hash를 재확인한다.
4. PASS / REJECT / HUMAN_REVIEW 중 하나만 결정한다.
5. **파일 전송보다 먼저** `archive_illustration_review_decide_v3`를 한 번 호출하여 판정을 durable DB에 기록한다.
6. REJECT면 판정 기록 성공 후 `current.png`를 정리하고 종료한다. 원본/썸네일 전송은 하지 않는다.
7. HUMAN_REVIEW면 `current.png`를 보존하고 종료한다.
8. PASS면 DB가 REVIEW_PASS_STAGED가 된 뒤에만 아래 PASS transfer를 이어서 수행할 수 있다. 시간이 부족하거나 오류가 나면 원본과 partial staging을 보존하고 종료한다. 다음 실행에서 REVIEW_PASS_STAGED부터 재개한다.

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

## Program Finalizer

Native Worker는 Finalizer, permanent Storage, Registry, SITE_ASSETS, Production을 직접 수행하지 않는다.
현재 검증된 Program Finalizer가 PASS site asset을 이어서 처리한다.

핵심 불변식:

`PREPARED → 생성만 → INGESTING → 판정 먼저 → REJECT/HUMAN 종료 또는 PASS → REVIEW_PASS_STAGED → 작은 사이트 PNG만 전송 → FINALIZE_QUEUED → Program Finalizer`
