# AFTERFALL Illustration B 예약 작업 구조 (v1)

Status: **HISTORICAL V1 scheduled-worker design.** 아래 Draft Release handoff와 활성화 상태는 당시 기준이다. 현재 실행 경로는 `archive-illustration-prep.yml` → `archive/scripts/prepare-illustration-render-job.mjs`, `archive-illustration-finalizer.yml` → `archive/scripts/finalize-illustration-job.py` 및 해당 코드의 안전 gate를 확인한다.

## 목적

이 문서는 READY 상태의 AFTERFALL 시각 후보 한 건을 골라 Codex 기본 이미지 생성으로 원본을 만들고, 검증된 원본만 비공개 보관소로 넘겨 공개 발행 대기열에 넣는 B 작업자의 구조를 정의합니다.

## 흐름

0. 실행 시작 즉시 `illustration-worker-run-receipt-v1` 영수증을 `survival_ops.illustration_worker_runs`에 `STARTED`로 기록합니다. 이후 후보 선택, prompt compiler, 생성 시도, 품질 검수, PNG 전달, identity PR, trusted handoff, Storage readback, registry, cleanup 상태를 같은 `run_id`로 갱신합니다. 실패해도 마지막 성공 지점과 정확한 blocker code/stage를 반드시 남깁니다.
1. 작업자는 archive/content/visuals/C03-AFTERFALL/VISUALS.json에서 READY인 후보 하나를 고릅니다. 이미 처리 중이거나 공개된 point/generation은 다시 처리하지 않습니다.
2. 고정된 AFTERFALL 브리프와 기존 자산의 시각 기준을 읽고 `illustration-image-prompt-v1`을 컴파일합니다. malformed brief나 운영 문맥 오염은 fail closed 합니다.
3. 이미지 생성 provider에는 컴파일된 순수 prompt contract만 전달합니다. 최대 3회 생성하며, 조건을 통과한 원본 하나만 수용합니다. 금지 조건 위반 또는 브리프와의 불일치는 HOLD로 기록합니다.
4. 정확한 point, generation, 도구 결과 ID, PNG 크기·치수·SHA-256, 시도와 검토 결과를 identity JSON에 기록합니다. 비밀값은 이미지 작업자에게 전달하지 않습니다.
5. identity가 main에 합쳐진 정확한 source commit을 사용합니다. 비공개 GitHub Draft Release에 해당 원본 PNG 하나만 첨부하고, release tag는 trusted workflow가 요구하는 식별 규칙으로 만듭니다.
6. exact source commit과 identity를 가리키는 immutable request JSON을 `archive/automation/illustration-handoff-requests/*.json`에 추가해 main에 반영합니다. main push가 `.github/workflows/archive-trusted-image-handoff.yml`을 자동 실행하며, trusted workflow가 source commit과 identity 일치, private Draft Release asset, PNG 형식·치수·bytes·SHA-256을 확인한 뒤 Supabase service-role을 서버 측에서만 사용합니다.
7. workflow가 비공개 원본을 직접 저장하고 정확한 byte/SHA readback, registry reconcile/readback을 수행합니다. 성공 후 임시 Draft Release와 tag를 삭제합니다.
8. 검증된 여러 자산은 한 publication batch에서 파생 이미지를 만들고 SITE_ASSETS.json과 함께 하나의 publication PR로 제안합니다. 공개 웹에는 파생 PNG만 들어갑니다.
9. Production은 #217의 2일 배치 release 정책을 따릅니다. 개별 이미지 작업자는 Production 배포를 직접 실행하지 않습니다.

## 경계와 신뢰

- ChatGPT 예약 작업은 콘텐츠 선택·순수 이미지 프롬프트 컴파일·native 이미지 생성·품질 검수와 실행 영수증 갱신을 담당합니다. trusted handoff는 immutable request가 main에 반영되면 GitHub Actions가 자동 실행합니다.
- Supabase service-role 키는 GitHub Actions secret에만 남습니다. 작업 프롬프트, repo 파일, Draft Release asset, Codex 대화에 복사하거나 입력하지 않습니다.
- 기존 encrypted signed-upload routine은 기본 handoff로 사용하지 않습니다.
- Draft Release는 임시 비공개 handoff입니다. 검증 후 삭제가 확인되지 않으면 해당 작업은 완료로 표시하지 않습니다.
- 사람이 최종적으로 판단해야 하는 주관적 이미지 품질은 자동 검증이 대체하지 않습니다.

## 자동화 / 수동 작업

| 단계 | 실행 방식 |
|---|---|
| 실행 영수증 STARTED/최종 상태 기록 | `survival_ops.illustration_worker_runs` + service-role-only receipt RPC |
| 후보 상태·중복 확인, 브리프 읽기 | 예약 작업이 수행할 절차 |
| 기본 이미지 생성 및 기계적 PNG 메타데이터 기록 | 예약 실행에서 native 생성까지 실증됨 |
| 이미지 품질 수용 | 자동 Quality Gate; 애매한 주관적 품질만 HUMAN_REVIEW |
| identity 변경의 main 반영 | PR CI와 승인/병합 |
| Draft Release 생성 및 원본 첨부 | 연결된 GitHub/Codex 실행 수단이 허용하는 작업자 단계 |
| immutable handoff request 반영 | main 반영 시 trusted workflow 자동 트리거 |
| 비공개 저장, 정확한 readback, registry reconcile/readback, 임시 release 정리 | `.github/workflows/archive-trusted-image-handoff.yml` |
| publication batch 및 #217 배포 창 | 별도 PR과 기존 배치 release 정책 |

## 현재 활성화 상태

ChatGPT 예약 Worker는 활성화되어 있으며 정규 실행은 매일 06:30 KST입니다. 예약 실행에서 후보 선택과 native 이미지 생성까지 실증되었습니다. accepted 원본이 생긴 뒤 Draft Release 생성→immutable request→trusted handoff까지의 완전 무인 연결은 별도 E2E로 계속 검증합니다.
