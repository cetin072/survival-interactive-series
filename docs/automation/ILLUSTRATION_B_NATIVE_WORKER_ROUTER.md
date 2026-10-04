# Automation B — Native Worker Boot Router

Status: **CURRENT BOOT AUTHORITY**

이 파일은 예약 실행 시작 시 가장 먼저 읽는 최소 router다.
**이 파일을 읽은 뒤 current job status를 확인하기 전에는 다른 Automation B 문서를 읽지 않는다.**

1. Supabase project `jgsxpdflgkqroecfjzxq`에서 `public.archive_illustration_render_job_current()`를 정확히 한 번 읽는다.
2. current job이 없으면 아무 변경 없이 종료한다.
3. status=`PREPARED`이면 **clean Renderer path**만 수행한다.
   - 이미지 생성 전에는 추가 GitHub 문서, 프로젝트 설명, 과거 결과를 읽지 않는다.
   - `/IMAGE-RENDER/output/current.png`가 없는지 확인한다.
   - fresh renderer lease를 얻는다.
   - `public.archive_illustration_render_prompt()`의 exact UTF-8 TEXT와 job.prompt_sha256 일치만 확인한다.
   - SHA gate 통과 직후의 다음 생성 행동은 네이티브 이미지 생성 호출이다.
   - 이미지 장면 입력은 DB가 반환한 exact TEXT 그 자체다. 앞뒤 설명, 제목, 상태, 운영 문장을 붙이지 않는다.
   - 정확히 1장을 생성해 `/IMAGE-RENDER/output/current.png`에 저장/readback하고 provider_complete로 `INGESTING`까지만 넘긴 뒤 즉시 종료한다.
4. status가 `INGESTING` 또는 `REVIEW_PASS_STAGED`일 때만 그 시점부터 아래 full authority를 읽고 해당 역할 하나만 수행한다.
   - `docs/automation/ILLUSTRATION_B_NATIVE_WORKER_PROMPT.md`
   - `archive/automation/illustration-native-worker-runtime-contract.json`
   - `archive/automation/illustration-review-provider.json`
5. 그 외 status는 NOOP 종료한다.

불변식: **PREPARED 이미지 생성 전 context = boot router + current job binding + exact DB prompt뿐이다.**
