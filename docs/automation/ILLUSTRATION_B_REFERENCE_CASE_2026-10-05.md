# Automation B 예약형 완전격리 Renderer — 검증 표준 사례

기준일: 2026-10-05  
Repository: `cetin072/survival-interactive-series`  
범위: 《생존일기》 Automation B illustration pipeline  
상태: **GOLDEN REFERENCE — LIVE E2E PASS**

## 1. 이 문서의 목적

이 문서는 Automation B 개발 과정에서 **실제로 성공이 증명된 경로만** 고정하는 프로젝트 내부 표준 사례다.

목표는 세 가지다.

1. 다음 작업자가 이미 해결된 문제를 다시 설계하지 않게 한다.
2. transport 성공, Reviewer 성공, 최종 게시 성공을 서로 혼동하지 않게 한다.
3. 최종 LIVE E2E 검증과 이후 회귀 시 비교할 기준선을 제공한다.

이 문서는 계획서가 아니다. 아래 PASS 표시는 실제 실행 증거가 있는 항목에만 사용한다.

---

## 2. 최종 목표 구조

```text
Program Prep
  ↓
exact visual prompt
  ↓
예약 Dispatcher
  ↓
완전격리 Renderer
  ↓
/IMAGE-RENDER/output/current.png
  ↓
COLLECT
  ↓
provider_complete
  ↓
Reviewer
  ↓
Program durable decision
  ↓
PASS Transfer
  ↓
Finalizer
  ↓
Storage / Registry / derivative / SITE_ASSETS
  ↓
SUCCEEDED
```

핵심 책임 경계:

- **Prep**: 어떤 장면을 그릴지 결정하고 exact visual prompt를 만든다.
- **Dispatcher**: exact prompt를 Renderer 예약 본문으로 전달한다.
- **Renderer**: 그림만 만든다. DB/GitHub/Reviewer/Finalizer 문맥을 읽지 않는다.
- **COLLECT**: 새 PNG가 정말 새 실행 결과인지 identity/version/hash/decode로 확인한다.
- **Reviewer 이후**: 기존에 검증된 Automation B 후반부를 그대로 사용한다.
- 한 실행은 한 역할만 수행한다.

---

## 3. 실전 PASS 연대기

### A. 기존 후반부 E2E — loc-shelter

대상: `loc-shelter`

실제 성공 범위:

```text
Reviewer
→ Program durable decision
→ PASS Transfer
→ Finalizer
→ Storage
→ Registry
→ derivative
→ SITE_ASSETS
→ SUCCEEDED
```

확인된 교정:

- derivative 생성 경로의 fallback 문제가 발견되었다.
- 최소 수정 후 재실행하여 실제 SITE_ASSETS까지 성공했다.
- 따라서 후반부 전체를 새로 설계할 이유가 없다는 것이 확인되었다.

판정: **PASS — 기존 후반부 E2E 기준 사례**

---

### B. 기존 후반부 E2E — loc-bridge

대상: `loc-bridge`

실제 성공 범위:

```text
Reviewer
→ Program durable decision
→ PASS Transfer
→ Finalizer
→ PR
→ checks
→ Storage
→ Registry
→ derivative
→ SITE_ASSETS
→ SUCCEEDED
```

발견된 실제 장애:

- Finalizer가 PR 생성 직후 GitHub의 `no checks reported`를 즉시 실패로 오판했다.
- 실제 원인은 check propagation delay였다.

교정:

- PR #419
- checks가 아직 붙지 않았으면 최대 약 90초 기다린 뒤 기존 check watch를 수행한다.
- delayed checks와 no-check timeout 회귀 테스트를 추가했다.

결과:

- 기존 loc-bridge job을 재개했다.
- 최종 `SUCCEEDED`.
- `SITE_ASSETS` 등록 완료.

판정: **PASS — Finalizer propagation 보강까지 포함한 기준 사례**

---

### C. visual-only 새 채팅 이미지 생성

검증 목적:

> Renderer가 Automation B 전체 운영 문맥을 읽지 않아도 이미지를 만들 수 있는가?

입력:

- DB 설명 없음
- GitHub 설명 없음
- Reviewer/Finalizer 설명 없음
- Automation B 운영 설명 없음
- 순수한 장면 묘사만 사용

결과:

- 현대 한국 도로교량 painterly 이미지 정상 생성.
- 운영 대시보드/UI 문맥 오염 없음.

판정: **PASS — Renderer 문맥 격리 원칙 확정**

---

### D. 예약 → Library 자동 핸드오프

검증 목적:

> ChatGPT 예약 실행이 사람 개입 없이 이미지를 만든 뒤 지정 Library 경로에 저장할 수 있는가?

지정 경로:

`/IMAGE-RENDER/output/reservation-handoff-test.png`

실제 결과:

- file_id: `file_00000000e95c81f7a9217a766e2a09d3`
- library_file_id: `libfile_1f67d2f4ed28819183ebd519b9ac4ff7`
- size: 2,831,359 bytes

확정 교훈:

- 개인 Library는 `/mnt/data`와 다른 저장소다.
- 예약 결과 확인 시 `/mnt/data`만 보고 파일 부재를 판정하면 안 된다.
- Files/Library surface에서 exact path를 확인해야 한다.

판정: **PASS — 예약 생성 → Library 저장**

---

### E. 동적 exact prompt 예약 전달

검증 목적:

> 하드코딩 prompt가 아니라 실제 Prep 후보에서 나온 매번 다른 exact visual prompt를 사람 없이 격리 Renderer에 전달할 수 있는가?

실제 후보:

- subject: `event-fireline`
- prep mode: `PREVIEW_ONLY`
- visual prompt: 775자
- Renderer 전체 prompt: 938자

실제 실행:

```text
실제 Prep 후보/컴파일러
→ runtime durable prompt
→ 예약 Dispatcher
→ 기존 격리 Renderer task prompt update
→ exact readback
→ Renderer 실행
→ /IMAGE-RENDER/output/current.png 교체
```

실제 결과:

- Renderer prompt 전체 일치: PASS
- Library path: `/IMAGE-RENDER/output/current.png`
- Library stable id: `libfile_a1e80988e2748191bf6f3881444683f8`
- version: 3 → 4
- PNG: 1672 × 941
- size: 2,912,260 bytes
- full decode: PASS
- SHA256: `36f861adce87a772d8d5f5e219b78efc6ce057ab977768c2f682757f5c288c8d`

운영 문맥이 Renderer prompt에 포함되지 않은 것을 확인했다.

중요한 한계:

- 이 실행은 `PREVIEW_ONLY`였다.
- `provider_complete`를 호출하지 않았다.
- 실제 LIVE DB job을 `SUCCEEDED`로 만든 E2E가 아니다.

판정: **PASS — dynamic prompt transport + isolated scheduled render + exact Library save**  
판정 제외: **LIVE E2E NOT YET RUN**

불변 증거:

- `archive/automation/runtime/illustration-reservation-probe.json`
- transport evidence commit: `ecf4b29c5f7cb7efd2e6b3b428056cd322043773`

---

## 4. 프롬프트 품질 기준

실제 수동/예약 테스트에서 품질 개선 효과가 확인된 공통 지침:

- 배경의 글자·간판·표지판·안내문은 장면의 핵심 요소가 되지 않도록 최소화한다.
- 불필요한 읽을 수 있는 문구, 브랜드명, 지명, 숫자, 광고 문구를 새로 만들어 넣지 않는다.
- 필요한 생활 표식은 작고 비식별적인 배경 요소로만 표현한다.
- 사진처럼 과도하게 사실적인 렌더링보다 붓터치와 회화성이 분명하게 느껴지는 painterly illustration을 유지한다.

이 지침은 negative-prompt 시스템을 크게 추가하는 방식이 아니라 기존 positive visual prompt 뒤에 붙이는 최소한의 공통 guidance로 유지한다.

---

## 5. 표준 구현 패턴

### 5.1 DISPATCH

입력:

- 실제 PREPARED job
- exact visual prompt
- prompt SHA
- Renderer task id
- 현재 `current.png` baseline metadata

처리:

1. active job identity를 고정한다.
2. `current.png`의 file/library id, version, modified_at, SHA를 baseline으로 기록한다.
3. exact visual prompt + 최소 저장 지시만 Renderer prompt로 만든다.
4. 기존 격리 Renderer task를 1회성으로 재사용한다.
5. task readback으로 prompt 전체 일치와 hash를 확인한다.
6. durable receipt를 남기고 종료한다.

금지:

- Renderer에게 DB/GitHub/Reviewer/Finalizer 설명 전달
- 새 예약 남발
- 미해결 dispatch 상태에서 동일 output slot 재사용
- 같은 실행에서 COLLECT까지 진행

### 5.2 RENDER

Renderer가 받는 정보는 원칙적으로 두 종류뿐이다.

1. exact visual prompt
2. `/IMAGE-RENDER/output/current.png` 저장 지시

Renderer는 다른 프로젝트 문서, DB, 이전 이미지, 다른 대화의 운영 문맥을 읽지 않는다.

### 5.3 COLLECT

새 이미지 판정은 단순 파일 존재가 아니라 다음을 함께 확인한다.

- exact Library path
- job identity
- prompt SHA
- file/library identity
- version 변경
- modified_at
- bytes/hash 변경
- PNG format/dimension
- Pillow verify
- reopen + full decode

모두 통과한 결과만 `provider_complete`에 전달한다.

### 5.4 REVIEW 이후

새 구조를 만들지 않는다.

기존 검증 경로를 그대로 재사용한다.

```text
INGESTING
→ Reviewer
→ GitHub review handoff
→ Program durable decision
→ REVIEW_PASS_STAGED
→ PASS Transfer
→ FINALIZE_QUEUED
→ Program Finalizer
→ SUCCEEDED
```

---

## 6. 반드시 유지할 실패 방지 규칙

1. **Library와 /mnt/data를 혼동하지 않는다.**
2. **PR 직후 no checks reported를 즉시 실패로 판정하지 않는다.**
3. **transport PASS를 LIVE E2E PASS라고 기록하지 않는다.**
4. **Renderer에 운영 문맥을 넣지 않는다.**
5. **current.png는 단일 writer만 사용한다.**
6. **미해결 dispatch에서 blind retry하지 않는다.**
7. **정규 B는 검증된 reservation Coordinator + visual-only one-shot Renderer를 재사용한다.**
8. **daily success guard를 테스트 편의를 위해 우회하지 않는다.**
9. **새 provider/새 DB table/유료 API를 먼저 만들지 않는다.**
10. **기존 Reviewer 이후 성공 구조를 갈아엎지 않는다.**
11. **한 실행 = 한 역할을 유지한다.**
12. **실제 evidence 없는 PASS를 만들지 않는다.**

---

## 7. 현재 코드 기준

후보 PR:

- PR #424 — `feat(illustration): pass exact prompts to isolated scheduled renderer`
- branch: `fix/automation-b-render-guidance-v1`
- 기준 commit: `7ae22b9ba5b4185b4c2f214cb6b5451c89ceea03`

주요 구현:

- `docs/automation/ILLUSTRATION_B_RESERVATION_BRIDGE.md`
- `archive/scripts/illustration-reservation-bridge.mjs`
- `archive/scripts/lib/illustration-reservation-handoff.mjs`
- 관련 회귀 테스트
- prompt quality guidance

PR #424에서 기록된 검증:

- illustration 관련 79 tests PASS
- `git diff --check` PASS
- 실제 scheduled dynamic transport PASS

---

## 8. 최종 LIVE acceptance 기준

다음 **한 건의 실제 PREPARED job**이 아래 전체를 사람 개입 없이 통과해야 한다.

```text
PREPARED
→ DISPATCH
→ exact isolated Renderer
→ current.png new version
→ COLLECT
→ provider_complete
→ INGESTING
→ Reviewer
→ Program durable decision
→ REVIEW_PASS_STAGED
→ PASS Transfer
→ FINALIZE_QUEUED
→ Finalizer
→ Storage verified
→ Registry READY
→ derivative
→ SITE_ASSETS
→ SUCCEEDED
```

최종 PASS 조건:

- exact 동일 job binding
- exact prompt SHA
- Renderer visual-only isolation 유지
- 새 PNG identity/version/hash 검증
- Reviewer durable decision 확인
- Transfer와 Finalizer 역할 분리
- Registry READY
- Storage verified
- SITE_ASSETS exact subject 1건
- DB `SUCCEEDED`
- 기존 성공 경로 회귀 없음

이 전체가 확인되기 전에는 **예약형 완전격리 Automation B 개발 완료**라고 판정하지 않는다.

---

## 9. 완료 후 이 문서의 역할

최종 LIVE E2E가 성공하면 이 문서를 삭제하거나 새 문서로 갈아엎지 않는다.

대신 이 문서에 최종 실행의 다음 증거만 추가한다.

- job_id
- subject_id
- prompt_sha256
- Library file/version/SHA
- Reviewer decision
- Finalizer evidence
- Registry/Storage/SITE_ASSETS evidence
- final `SUCCEEDED`
- 사용한 main SHA

그 뒤 이 문서는 Automation B 예약형 완전격리 Renderer의 **golden reference / 회귀 비교 기준**으로 유지한다.

## 10. LIVE Golden Case — event-fireline (완료)

2026-10-06 current main `d864f7f8481208392bbf3f6dc0cdd7f174c3d78b`와
실제 DB/Storage/Registry, runtime branch를 재확인했다.

- job_id: `illustration-event-fireline-56d5c65b6320-20261005-liveaccept1`
- subject_id: `event-fireline`
- job main SHA: `22e080d6f77fc0a2d963ad428e18b73e424db4ed`
- prompt SHA: `4c3d04c06c3b63328e3202539ac3da041881a3693c8f99420c74ff0b3164daa9`
- Renderer task: `6ac2e58fc3848191aba731468f6c3e18`; exact visual prompt + fixed suffix만 전달, task prompt exact readback=true.
- renderer prompt SHA: `f5f06238b98c3c595377d635c7e107cba1e7898aa35a01c47be59f7465bc8e5f`
- Library: `/IMAGE-RENDER/output/current.png`; stable ID `libfile_a1e80988e2748191bf6f3881444683f8`, version **4 → 5**.
- 생성 file ID: `file_0000000018e481fd828652c5c1377af0`
- 생성 PNG SHA: `ad752c36ba67542ee0533e8df697bb5a03e326ab0e792d6e8558c6230d97e98d`; 1774×887, 2,844,084 bytes; full decode PASS (runtime collection evidence).
- provider_complete: `2026-10-05T02:15:41.355355+00:00`, DB INGESTING readback.
- Reviewer: native_chatgpt_vision PASS; handoff commit `d94af03a285a5386b01aa947b639fae36de57d07`.
- Program durable decision: DB PASS, reviewed_at `2026-10-05T03:17:20.92172+00:00`.
- PASS Transfer: 512×512, 175,035 bytes, SHA `f1a01bbc7f00e1dd6fa2cf44378bc8d76eeae49cf12f198f3771e376a8fcfede`; 2/2 chunks.
- `PASS_ASSET_TRANSFER_LEASE_EXPIRED` 1회: `2026-10-05T04:10:00.145629+00:00`; original/staging 보존 후 기존 recovery로 FINALIZE_QUEUED, dispatch request 142.
- Finalizer SUCCEEDED: `2026-10-05T04:21:49.787267+00:00`; source commit `dfdb1a9f2acec885fe005dc1f05edb338362724d`.
- Storage: `survival-archive-originals`의 exact point/generation/source-SHA object 존재, 175,035 bytes; Registry `generation_meta.storage_verified=true`.
- Registry: `AF-EVENT-376B71213D04FF0D608134A0`, READY, exact source/job binding.
- SITE_ASSETS: exact subject **1건**, derivative `site-png-512-v1`, 512×512, 175,038 bytes.
- 실제 main derivative 파일 존재 및 재계산 SHA 일치: `f4705f85469f455f938ce289ce78ae30ce6edf1c5d326649abfc88b70ed1c811`.
- 최종 DB status **SUCCEEDED** / review_decision **PASS** / runtime **LIVE_E2E_PASS**, binding_mismatch=false.

불변 runtime 증거:
[reservation handoff](https://github.com/cetin072/survival-interactive-series/blob/5edbc84f21339065a8298f70db28f1b4066bcc1a/archive/automation/runtime/illustration-reservation-handoff.json),
[review handoff](https://github.com/cetin072/survival-interactive-series/blob/5edbc84f21339065a8298f70db28f1b4066bcc1a/archive/automation/runtime/illustration-review-handoff.json).

Registry의 legacy `unattended_generation_proven=false`는 남아 있다.
예약 생성 증거는 task/Library/runtime 기록으로 확인하며 이 legacy 필드를
조용히 수정하거나 그 필드가 true라고 보고하지 않는다.
이 검수에서는 Library 원본을 다시 가져오지 못했으므로 생성 PNG full decode는
당시 immutable collection evidence이고, 실제 main derivative SHA는 이번에 재검증했다.

> Transfer lease 만료는 즉시 전체 실패로 판단하지 않는다.
> exact job/source binding이 유지되고 resume 가능한 staging이 존재하면 기존 recovery path를 사용한다.

`ONE_EXTRA_LIVE_ACCEPTANCE_JOB`는 이 검증 1건의 역사적 예외로 종료했다.
정규 운영은 기존 daily success/attempt/semantic cap을 그대로 사용한다.
앞 절의 acceptance 직전 설명과 PREVIEW_ONLY 판정은 당시 연대기이며,
현재 최종 판정은 이 LIVE Golden Case가 권위다.