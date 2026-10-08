# A-Core Source Discovery V2 — 검수와 승인 경계

기준 main: `e0e70f76ab890d8d2140ab8847cb33ac5421e38e` (2026-10-08).
작업 branch: `codex/a-core-source-discovery-v2`.
운영 범위: DB `C03 / AFTERFALL` → Archive `C03-AFTERFALL`만 허용한다.

## 실행 흐름

기존 정규 실행은 S03의 고정 source UUID → S03 watermark → 게시 경로다.
이번 V2 경로는 다음과 같다. 정규 workflow와 `mode=AUTO` 설정은 변경하지 않았다.

```text
C03 세션 metadata (최대 100개, 일관된 read-only snapshot)
  → 명시적 archive_intent / committed main MANIFEST 대조
  → 세션별 cursor + predecessor / Reader frontier 검증
  → 선택된 세션의 고정 상한 안에서 최대 200행
  → 기존 exact RAW 봉인 / Reader append-only / Graph·Visual / PR gate
```

- `node archive/scripts/run-daily-archive.mjs --discovery-check`:
  origin/main의 committed manifests를 읽고 제한 exporter login으로 계획을 출력한다.
  DB transaction은 REPEATABLE READ READ ONLY이며 파일·DB·GitHub 쓰기,
  lease, dispatch, 예약은 없다. 계획에 RAW 본문을 직렬화하지 않는다.
- `--candidate-check archive/scripts/lib/fixtures/archive-discovery-synthetic.json`:
  synthetic DTO를 받아 임시 디렉터리에서 기존 공개 자료와 candidate를 검증한다.
  DB/GitHub 연결은 없고 임시 디렉터리는 완료/실패 시 제거한다.
- `--discovery-apply`: **승인 후 사용하는 미활성 opt-in 어댑터**다.
  기존 mode에 따라 실제 PR 생성/병합을 수행할 수 있다. 이번에는 실행하지 않았다.
  최신 main과 깨끗한 worktree를 요구하고, build 후와 AUTO merge 직전에
  main/intent/RAW/optional link를 다시 검증한다. 기존 `--apply` 예약은 이 경로로 전환하지 않았다.

## 최소 metadata 계약 (migration 미적용)

`transcript_sessions.archive_intent` JSONB 하나를 추가한다. 기존 open/close RPC,
RAW, RLS 및 exporter의 transcript 3개 테이블 SELECT 계약을 유지한다.
기존 행은 NULL로 남긴다. 자동 backfill/승인/재시작 추론은 없다.

| 필드 | 의미 |
|---|---|
| version | 1 |
| disposition | ADOPTED / SUPERSEDED / REVIEW_REQUIRED (본편 채택) |
| publication | APPROVED / REVIEW_REQUIRED (명시적 공개 승인) |
| kind | CONTINUE / NEW_SEASON / RESTART / LEGACY (Runtime의 의도) |
| history | NEW_CAPTURE / MAPPED_BASELINE / LEGACY |
| initial_order | 새 capture는 0; 기존 게시 source는 확정된 baseline과 일치 |
| predecessor_id | 실제 앞 source UUID; NULL은 새 이야기의 승인이 아니다 |
| evidence_ref | 이 저장소 Issue/PR의 결정 근거 URL |
| checkpoint_ref, checkpoint_revision | 선택적, 같은 시즌의 실제 immutable checkpoint ref와 commit |

`public_safe`는 개별 행의 안전성이다. 채택이나 명시적 공개 승인과 의미가 다르다.
OPEN/CLOSED는 lifecycle이며 시즌 COMPLETE를 만들지 않는다.

`set_archive_source_intent`는 기존 intent와 비교하는 CAS RPC다. service_role만 호출하며
다른 namespace·자기 predecessor·예상값 충돌·금지 필드를 거부한다.
`open_public_transcript_session_with_archive_intent`는 기존 open에 intent 등록을 원자적으로
연결하는 additive wrapper다. 기존 7-argument open 호출은 그대로 동작하며 NULL intent가 된다.

승인 후 `worldline/afterfall-rpg`의 실제 `PLAY_SESSION_PROTOCOL_V3.md` room-boot 경로에서
Runtime이 이전 room UUID와 CONTINUE/NEW_SEASON 의도를 wrapper에 전달하도록 연결한다.
정상 세션마다 사용자에게 UUID 설정 파일을 쓰게 하지 않는다. 이번에는 해당 branch/BOOT를 수정하지 않았다.
RESTART는 자동 append하지 않고 편집 검토가 필요하다. SUPERSEDED는 원문을 보존하고 수집을 제외한다.
이미 게시된 source를 SUPERSEDED로 바꾸면 게시 이력 충돌로 차단한다.

## 실제 read-only 진단

Supabase `jgsxpdflgkqroecfjzxq`, `survival_rpg`에서 C03/AFTERFALL metadata/count/hash만 확인했다.
각 질의는 REPEATABLE READ READ ONLY로 종료했다. S04 본문은 출력·저장·fixture·PR·Preview에 넣지 않았다.

MCP 연결은 `SET ROLE archive_exporter`를 허용하지 않았다. 로컬
`ARCHIVE_EXPORT_DATABASE_URL`도 없어 실제 CLI는 `BLOCKER_SECRET_SETUP_REQUIRED`로 종료했다.
따라서 **실제 제한 login 실행은 NOT_VERIFIED**다. 메타데이터 진단은 MCP의 read-only 연결을
사용했으며, role 자체의 grants/RLS는 catalog에서 별도로 확인했다. 대체 login으로 runner를 실행하지 않았다.

| 시즌 | source UUID | 상태 | 이미 저장소에 반영된 범위 | 미처리/검토 대상 | V2 제안 |
|---|---|---|---|---|---|
| S02 | 4728081b-faa4-4d59-a461-2ac20239b751 | CLOSED | 0–0, SESSION_003 fragment | 새 수집 없음; 기존 불완전 capture 유지 | LEGACY_REVIEW_REQUIRED |
| S02 | f43f1b72-5fc3-4188-926d-866d4e065adc | CLOSED | 0–0, SESSION_004 fragment | 새 수집 없음; 기존 불완전 capture 유지 | LEGACY_REVIEW_REQUIRED |
| S02 | 5998b89f-7151-4169-b132-5c316d15a252 | CLOSED | 0–5, SESSION_005 | 새 수집 없음; rolling 형식 유지 | LEGACY_REVIEW_REQUIRED |
| S02 | 5ec92846-b221-45fd-8889-643698c1b6e9 | CLOSED | 0–33, SESSION_006 | 새 수집 없음; rolling 형식 유지 | LEGACY_REVIEW_REQUIRED |
| S02 | 76cb43c7-f233-46a2-923f-d7a4a0c8e91b | CLOSED | 0–5, SESSION_007 | 새 수집 없음; rolling 형식 유지 | LEGACY_REVIEW_REQUIRED |
| S02 | 53e2bcbf-ec73-4943-9a79-1239cf11f310 | CLOSED | 0–19, SESSION_009 | 새 수집 없음; rolling 형식 유지 | LEGACY_REVIEW_REQUIRED |
| S03 | 8ef127f7-4729-4161-9784-49123171ad2a | CLOSED | 42–105, SESSION_001–008 | cursor=106, 현재 backlog 없음 | MISSING_STRUCTURED_INTENT; baseline 유지 |
| S04 | 75bc9505-636d-4afb-95ed-a5579b63722f | CLOSED | 없음 | 0–1, USER 1 / GM 1 | REVIEW_REQUIRED |
| S04 | 029cd316-6ac6-4f82-815a-09c4b7372eb3 | OPEN | 없음 | 0–9, USER 5 / GM 5 | REVIEW_REQUIRED |

S04 두 세션 모두 public_safe=true, source_type=LIVE이며 저장된 정확한 UTF-8 해시가 일치했다.
하지만 구조화된 채택·대체·predecessor·공개 승인 근거가 없다. CLOSED/OPEN,
starting save/version 또는 날짜만으로 이전 도입부의 대체 여부나 연속성을 확정하지 않았다.
사용자가 두 도입부의 채택/대체와 연결을 확인할 때까지 둘 다 REVIEW_REQUIRED다.

S02 MANIFEST의 `6d7b61bd-31e1-4973-9fb3-b09ecd4f5531` legacy 기록은 승인 범위의
C03 session 목록에 보이지 않는다. alias/namespace를 자동 합치거나 없는 데이터라고 판정하지 않는다.
S01 수동·shared-chat·DOCX 복구와 S02 rolling 이력은 기존 adapter로 보존하며 fresh cursor로 변환하지 않는다.

실제 S03 게시 42–105의 64개 SHA가 main SOURCE_MANIFEST와 모두 일치했다.
전체 S03의 0–41 과거 혼합 capture는 새 pair 규칙으로 재게시하지 않는다.

## 보존·실패 경계

- Cursor는 origin/main manifests에만 있다. candidate/PR/CI 실패는 cursor를 쓰지 않는다.
- 게시 범위 overlap/구간 gap/SESSION 번호 충돌/namespace/hash/turn 오류는 fail closed다.
- published SHA 재감사에서 변경 또는 RLS-hidden 행이 보이면 해당 source와 후속 chain을 차단한다.
- 앞 세션이 OPEN, backlog, USER tail 또는 검토 대기면 후속 연속 세션을 먼저 append하지 않는다.
- UUID 정렬은 보고서 표시 순서이며 서사 순서가 아니다. predecessor와 Reader frontier가 순서를 결정한다.
- 한 실행의 message page는 200행이다. 402행 fixture는 200/200/2로 cursor를 통해 이어진다.
- Snapshot 시작 시 상한을 고정하고 transaction은 build/CI 전에 COMMIT한다.
- deterministic segment/branch, open PR 재사용, orphan branch 검토, exact head/base,
  기존 필수 CI/Preview 및 batched Production release를 재사용한다. force push/merge는 없다.
- 새 시즌 manifest는 PARTIAL이다. 세션 CLOSED로 시즌 완료를 선언하지 않는다.
- 기존 Reader chapter의 body/title/id/source/hash/배열 순서는 append-only 검사로 보존한다.
- 실제 state-link와 검증 가능한 같은 시즌 checkpoint가 없으면 Graph/Visual anchor를 유지하고
  NO_STRUCTURED_ANCHOR 또는 CHECKPOINT_NOT_VERIFIED를 보고한다. 사실/관계/save version을 발명하지 않는다.
- A-Wiki/B/C는 실행하지 않았다. publicKnowledgeInventory/scanKnowledge는 순수 공개 입력 계약 검사만 사용한다.

## 검증 명령

```sh
node --test archive/scripts/lib/archive-daily-core.test.mjs archive/scripts/lib/archive-source-discovery.test.mjs
node archive/scripts/run-daily-archive.mjs --candidate-check archive/scripts/lib/fixtures/archive-discovery-synthetic.json
node --test archive/scripts/lib/reader-batch.test.mjs archive/scripts/lib/publication-graph.test.mjs archive/scripts/lib/visual-compiler.test.mjs archive/scripts/lib/wiki-public-sources.test.mjs archive/scripts/lib/knowledge-scan.test.mjs
cd archive/web
npm test -- --run
npm run build:verified
```

Synthetic S04는 SESSION_001과 Reader 1개 장만 추가하고, protected public files의 byte hash를 비교한다.
운영 RAW/BOOK/GRAPH/VISUALS는 변경하지 않는다. CI의 `metadata` job은 격리 PostgreSQL 17에
기존 capture/exporter migrations와 이번 초안을 적용하여 legacy RPC/CAS/RLS/권한 회귀를 검증한다.
이는 실제 Supabase migration 실행이 아니다. Browser CI는 기존 공개 입력의 모바일/desktop 및
동일 PR Preview를 검증한다. 실제 S04 공개 동선은 아직 NOT_RUN이다.

Windows checkout이 RAW를 CRLF로 바꾼 상태에서는 원본 byte hash 검사에 실패했다.
독립 worktree의 공개 입력 173개를 committed HEAD와 비교했고 실질 변경 0개,
172개의 CRLF-only 차이를 확인한 뒤 committed bytes로 복원했다. PR에는 EOL 변경을 넣지 않는다.
기존 atomic rename/link 테스트의 sandbox EPERM은 정상 로컬 권한으로 재실행해 통과했다.

## 승인 후 순서

1. Draft 코드/격리 DB CI 검토. 코드 main 병합은 별도 승인이다.
2. 이번 additive metadata migration과 실제 S03 baseline/S04 두 세션의 채택·연속성·공개 결정을 확인하고
   승인한 값만 CAS 등록한다. exporter role/password/secret 재설정이나 새로운 테이블 권한은 필요 없다.
3. worldline의 room-boot wrapper 연결을 별도 승인해 적용한다. worldline 전체를 main으로 합치지 않는다.
4. 기존 제한 exporter 접속으로 `--discovery-check`를 재검증한다.
5. 승인된 작은 공개 구간 한 개를 V2 opt-in 어댑터와 기존 PR/CI/Preview 경로로 검증하고,
   main 반영 후 같은 구간을 다시 check하여 중복 없음과 cursor를 확인한다.
6. 정규 runner의 호출을 V2로 전환하는 별도 승인 후 기존 예약을 유지한다.
   현재 AUTO 설정이나 Production 2일 묶음 정책을 이번 PR에서 바꾸지 않는다.
7. 기존 batched Production release에서 실제 반영을 확인한다.

이번 실행 범위: 운영 활성화 NOT_RUN, 실제 처분 쓰기 NOT_RUN, 실제 RAW 공개 NOT_RUN,
main/worldline 병합 NOT_RUN, Production 배포 NOT_RUN.
