# Repository authority map

이 문서는 **어디에서 현재 계약을 확인할지** 안내한다. 현재 시즌·시각·작업 상태를 복제하지 않는다. 플레이를 시작할 때는 반드시 [WORLDLINE_ROUTER.md](WORLDLINE_ROUTER.md)의 identity gate를 먼저 적용한다.

| 영역 | 목적 / 입력 → 출력 | Source of Truth / 실행 진입점 | 권위 문서 |
| --- | --- | --- | --- |
| Legacy family runtime | 가족 기반 기존 플레이 → Save/Canon | `START_HERE.md` → `runtime/`, `core/`, `players/main/` | [START_HERE.md](START_HERE.md) |
| Canon v2 runtime | 정식 가족 시즌 → 시즌 상태/Canon | `REBOOT_START_HERE.md` → `canon_v2/`, `seasons_v2/` | [REBOOT_START_HERE.md](REBOOT_START_HERE.md) |
| AFTERFALL runtime | 독립 세계선 플레이 → hot Save/RAW | `worldline/afterfall-rpg`의 `worldlines/AFTERFALL/START_ROOM.md`; hot state는 Supabase `survival_rpg.saves`, durable boot/checkpoint는 해당 branch | [WORLDLINE_ROUTER.md](WORLDLINE_ROUTER.md)와 해당 branch의 최신 boot/handoff |
| STRONGHOLD runtime | 독립 세계선 플레이 → Long/Live state | `worldline/stronghold-chronicle`의 `worldlines/STRONGHOLD/START_ROOM.md`; 같은 branch의 `CURRENT_STATE.json`과 ACTIVE `LIVE_SCENE_STATE.md` | [WORLDLINE_ROUTER.md](WORLDLINE_ROUTER.md)와 해당 branch의 `START_ROOM.md` |
| Archive RAW | 검증된 플레이 기록 → 공개 가능한 불변 source | Supabase RAW와 `archive/content/transcripts/`; `.github/workflows/archive-daily.yml` → `archive/scripts/run-daily-archive.mjs` | [RAW policy](docs/RAW_TRANSCRIPT_ARCHIVE_POLICY.md), [Archive sync](docs/ARCHIVE_SYNC_POLICY.md) |
| Archive Reader / Graph / Visual | 동일 source snapshot → 읽기판/관계/시각 후보 | `archive/content/stories/`, `graphs/`, `visuals/`; Archive daily runner 및 각 publication script | [Reader policy](docs/READER_EDITION_PUBLICATION_POLICY.md), [Automatic Archive](docs/AUTOMATIC_ARCHIVE_PUBLICATION_V1.md) |
| Automation A | 공개 source를 검증·제안·발행 | `archive/automation/config.json`, `.github/workflows/archive-daily.yml` → `archive/scripts/run-daily-archive.mjs` | 현재 config, workflow 및 runner 코드 |
| Automation A-Wiki | 공개 Graph의 의미 사실 확장 | [Draft PR #310](https://github.com/cetin072/survival-interactive-series/pull/310)에서 개발 중; 현재 `main` 계약으로 취급하지 않음 | 해당 PR의 diff/review |
| Automation B | Visual 후보 → 비공개 원본/registry → 공개 파생 asset | `archive/content/visuals/`; `.github/workflows/archive-illustration-prep.yml` → `archive/scripts/prepare-illustration-render-job.mjs`, `.github/workflows/archive-illustration-finalizer.yml` → `archive/scripts/finalize-illustration-job.py`; Supabase private Storage/registry | 현재 B workflows/scripts와 [Production system](docs/architecture/AI_NATIVE_IP_PRODUCTION_SYSTEM_V1.md) |
| Automation C | 승인된 Archive/Reader 질문 → 근거 있는 Knowledge BRIEF | `knowledge/automation/config.json`, `knowledge/content/`; C3는 Supabase `survival_ops.knowledge_semantic_jobs`와 semantic prep/finalizer workflows | [C3 architecture](docs/KNOWLEDGE_AUTOMATION_C3_ARCHITECTURE_V1.md), [semantic protocol](docs/KNOWLEDGE_SEMANTIC_WORKER_PROTOCOL_V1.md) |
| Production | 검증된 main → batch release → Netlify Archive | `.github/workflows/archive-production-release.yml` → `archive/scripts/run-production-release.mjs`; exact deploy verifier | [Production system](docs/architecture/AI_NATIVE_IP_PRODUCTION_SYSTEM_V1.md)와 release workflow |

## 문서 상태

`AUTHORITATIVE`는 현재 판단 원문, `ACTIVE_REFERENCE`는 현행 구현의 보조 설명, `HISTORICAL`은 당시 설계·결과, `SUPERSEDED`는 이후 계약으로 대체된 절차, `ARCHIVE`는 보존 기록, `UNKNOWN`은 현재성을 확인하지 못한 문서다. **설정·코드·해당 세계선 최신 상태가 오래된 설명보다 우선한다.**

| 문서 / 범위 | 상태 | 현재 읽을 곳 |
| --- | --- | --- |
| `AGENTS.md`, `WORLDLINE_ROUTER.md`, 세계선 branch의 최신 boot/handoff | AUTHORITATIVE | 각 대상의 현재 identity와 상태 |
| `archive/automation/config.json`, `knowledge/automation/config.json`, Production release workflow | AUTHORITATIVE | 실제 실행 설정과 gate |
| `docs/KNOWLEDGE_AUTOMATION_C3_ARCHITECTURE_V1.md`, `docs/KNOWLEDGE_SEMANTIC_WORKER_PROTOCOL_V1.md` | ACTIVE_REFERENCE | C3 정상 경로; 실제 job state는 DB |
| `docs/KNOWLEDGE_WORKER_PROTOCOL_V2.md`, `archive/scripts/lib/knowledge-worker-runtime.mjs` | ACTIVE_REFERENCE | 유지 중인 C1/V2 fallback 계약 |
| `docs/KNOWLEDGE_WORKER_PROTOCOL_V1.md`, `docs/knowledge-auto-publish-handoff.md` | SUPERSEDED | `knowledge/automation/config.json`과 C3 문서 |
| `archive/automation/README.md` | HISTORICAL | 현재 `archive/automation/config.json`과 daily/Production workflows |
| `docs/automation/ILLUSTRATION_B_SCHEDULED_WORKER_V1.md` | HISTORICAL | 현재 B prep/finalizer workflows 및 scripts |
| `docs/runbooks/ILLUSTRATION_B_DAILY_OPERATOR_RUNBOOK.md` | SUPERSEDED | 현재 B prep/finalizer workflows 및 scripts |
| `docs/MIDTERM_REVIEW_S01_S05.md`, `docs/THIN_ENGINE_SPEC_V0_1.md`, `docs/THIN_ENGINE_WEB_GAME_V0_1.md` | HISTORICAL | 이전 플레이·설계 기준; 현재 세계선 라우팅은 Router |
| `docs/AUTOMATIC_ARCHIVE_PUBLICATION_AUDIT_2026-09-26.md`, `docs/AUTOMATIC_ARCHIVE_STEP*.md` | HISTORICAL | 당시 단계별 검증 기록; 현재 동작은 코드/config 확인 |

분류하지 않은 설계 문서의 현재성은 `UNKNOWN`으로 두고, 코드·config·PR·해당 세계선 최신 handoff와 대조한 뒤 사용한다.

## Illustration legacy / POC 실행 경계

| 대상 | 분류 | 확인된 caller와 실행 경계 |
| --- | --- | --- |
| `archive-approved-image-readback.yml`, `deliver-approved-jinwoo.py`, `verify-eunchae-site.py`, `verify-seojin-site.py` | LEGACY_BUT_REFERENCED | workflow는 `codex/illustration-automation-v1` push에서만 실행하는 foreground readback proof이며 세 스크립트를 호출한다. |
| `archive-eunchae-signed-upload.yml`, `eunchae_signed_handoff.py`, `test_eunchae_signed_handoff.py` | LEGACY_BUT_REFERENCED | workflow는 같은 branch의 push에서만 실행하는 Preview용 signed handoff proof이며 스크립트와 테스트를 호출한다. |
| `prepare-image-poc.mjs`, `lib/image-poc-exchange.mjs`, 관련 테스트 | POC_TEST_ASSET | `archive-web.yml` CI가 POC 테스트와 `--check`를 실행한다. 실제 이미지 생성이나 Production 전달 경로가 아니다. |

이 항목은 실행 참조가 남아 있으므로 삭제 대상으로 취급하지 않는다. 현재 B 운영 경로는 위의 Automation B 행에서 최신 workflow와 script를 확인한다.
