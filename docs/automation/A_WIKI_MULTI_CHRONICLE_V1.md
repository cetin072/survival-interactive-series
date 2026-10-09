# A-Wiki Multi-Chronicle V1 — execution checkpoint

## Scope and execution plan
Card world selector → existing shared world index/document → actual source-bound C01/C02 Wiki → C03 compatibility → isolation/CI/final Preview → HUMAN_CHECK_READY.
Complete the C01 first-chapter vertical slice before processing every remaining public chapter, then reuse for C02. No recurring extraction/LLM/DB service, source rewrite, C03 operating jobs, main merge or Production release.

## PHASE 0 — PASS
- Branch: codex/a-wiki-multichronicle-v1; worktree: a-wiki-multichronicle-v1.
- Latest baseline main: 7789c88dc3a3afc36e054311a7f6e94f35d79e09. Existing seed commit 1855276; main sync ac13a85.
- Existing branch reused; no existing integrated PR found in GitHub open/all recent PR inventory.
- Read full user master instruction, latest AGENTS, central DEVELOPMENT_CONSTITUTION and WEB_ARCHITECTURE_STANDARD_V1.
- Preserved original checkout's chronicleRegistry.ts dirty change and archive/exporter/.
- Windows; Git/Node24.19/npm11.17 available. System python is an app alias; bundled Python available from Codex runtime.
- Baseline: npm ci --prefix archive/web; npm test --prefix archive/web (28 files /168 PASS); npm run reader:check --prefix archive/web PASS; node --test archive/scripts/lib/wiki-public-sources.test.mjs (11 PASS).
- Existing npm lock audit reports one high advisory; no dependency upgrade introduced.
- C03 uses approved Graph+receipt/hash-checked build-only public source table. PR473 six-first disclosures and PR475 history binding preserved.
- C01 BOOK SHA256: 98235add2392dc66591e26772aa07fb2c45f60b2ecb609ff1a36be4837f290c3 — 10 VERIFIED_GM_NARRATIVE chapters.
- C02 BOOK SHA256: cc21254acc575113b00713bf92dc27d807a14ea6baee727e3acbe2ff85c64fba — 11 actual VERIFIED_GM_NARRATIVE chapters; coverage.included=13 is transformed input spans, not chapter count.
- No C01/C02 chapter fact extraction/review has yet completed.

## Data decision
Reuse and strengthen existing reader-wiki-seed-v1 in archive/content/wiki/{chronicleId}/SEED.json. One curated snapshot per work, build-time checked against its own public BOOK and allowed RAW catalog. Do not forge live save/time/receipts. C03 remains the existing Graph adapter; only optional display contract fields and scoped links are shared.
Reader body SHA256 and RAW sourceHashes are distinct. Every fact/relation carries exact chapter quote and real body hash; build validates RAW refs/hashes. Full chapter treatment ledger will include processed/held/excluded and source references. Exact quote matching is provenance validation, not human or independent semantic approval.
C01/C02 candidates remain PREVIEW_ONLY until human approval; production projection excludes them. Coverage means all currently available public chapters were reviewed, not a claim of complete historical capture.

## Phase status / next exact action
- PHASE1: NOT_VERIFIED — wire existing WikiWorldLobby to page=worlds and common menu; preserve root home and old C03 direct URLs; add route/menu/lobby tests.
- PHASE2: NOT_VERIFIED — strengthen seed validator and build-only minimal projection; shared scoped adapter and document contract; synthetic collisions/invalid source tests.
- PHASE3: NOT_VERIFIED — read C01 chapter01 in full, curate source-bound sample, validate actual detail/relation/Reader flow; then chapters02–10.
- PHASE4: NOT_VERIFIED — apply verified C01 process to C02 chapters01–11.
- PHASE5: NOT_VERIFIED — scoped global search/media/source identity and C04/C05 fixtures, no real future work registration.
- PHASE6: NOT_VERIFIED — full local/CI/exact-head Preview and 1280/390/360 captures. Draft PR pending.
Current state is not HUMAN_CHECK_READY.

## Resumption
Read this file and git status/log first. Resume PHASE1; keep completed source IDs stable. Do not re-extract reviewed unchanged chapters.
Last verified head before this checkpoint: ac13a85 (main sync). Current checkpoint commit is identified by git log.

## PHASE1 checkpoint
- Implemented card lobby, common React/static Knowledge menu target, root-home preservation, pinned C03 legacy route and explicit invalid-world/node state.
- PASS: web 29 files/171 tests, knowledge:build, reader:check, build:verified, diff check. App JS 5,274.38kB (gzip1,624.64kB) at this checkpoint; compare final build.
- Existing orphan seed type failures were real baseline failures and are now fixed by optional common display fields; no receipt/save values fabricated.
- Local Vite running in exec session87367 at http://127.0.0.1:5177/. CUA browser kernel cannot start: windows sandbox helper setup refresh error. Actual local browser clicks NOT_VERIFIED; final Preview gate remains required. Continue independent PHASE2 data work.
- Current last commit5426e0a; this checkpoint commit is the next git log entry. No C01/C02 extraction completed.

## PHASE2 / C01 first-chapter vertical slice checkpoint
- Last committed head before this unit: 28e81ad; inspect git log for this checkpoint commit.
- Common renderer reused: scoped world data and document lookup, source quotes for every fact/relation, all RAW refs per chapter, no invented save/history/images.
- Build-only BOOK/body/RAW hashes, strict chapter ledger and source scope; minimal browser projection. Candidates cannot self-promote by HUMAN_APPROVED label and are excluded when CONTEXT=production.
- Source processed: C01 chapter01 read in full; 10 documents (4 characters /4 locations /2 events),9 relations. Reader and RAW links tested. Remaining C01 chapters02–10 and C02 chapters01–11 are NOT_PROCESSED.
- PASS: web30 files/174 tests, seed3 tests, build:verified, git diff --check. Existing C03 compiler/Graph/history/provenance files untouched.
- Browser retry after kernel reset still fails before opening a tab: Windows sandbox helper setup refresh error. Interactive local gate NOT_VERIFIED. Continue independent source processing; preserve final exact-head Preview gate.
- Next: read C01 chapter02 in full, extend same snapshot with exact quoted evidence; progress chronologically through chapter10. Then C02, scoped search, source review and CI/Preview.
- No main merge or Production operation.

## C01 chapters02–03 checkpoint
- Full bodies read: chapters01–03, including separately retrieved truncated chapter03 night segment. 21 documents,29 relations. RAW/body validation PASS3 tests.
- Actual family reunion, south shelter move, medical-center arrival and car recovery distinguished from plans and reports. No vehicle return to shelter inferred at chapter03 end.
- Read-only source re-review agent c01_source_review audits chapters01–03; this is not human approval.
- Draft PR478 created/attached at head62320ad2c71311b4aaa6b27122e9e9d3e02a38ac. Remains Draft/incomplete. No merge or Production.
- Next: chapter04 full read and same snapshot extension; remaining C01 chapters04–10, C02all, scoped search/final browser gate pending.

## C01 chapters04–05 checkpoint
- Full bodies read: C01 chapters01–05. Current snapshot:27 documents,47 relations. Source-bound hashes remain checked; coverage stays PARTIAL.
- First read-only review audited chapters01–03 (21 docs/46 facts/29 relations). Corrected ambiguous family counts, stale subtitles and narrowed compound claims; strengthened direct rule/vehicle quotes. Do not infer a clinical profession from hospital employment.
- Second read-only review audits chapters04–05. Pending findings are not approval.
- Chapter05 title does not mean a second base was acquired: candidate B is still a plan; two-house loss is hypothetical. Neither an actual new-base visit nor destruction was invented.
- Current prior head464e4ac; checkpoint commit follows. Remaining C01 chapters06–10 and C02all unread/unprocessed. Next exact action: read chapter06 fully and extend same snapshot after checking quotes.
- Browser gate remains NOT_VERIFIED due pre-launch sandbox error; Draft478 and final CI/Preview still in progress, not HUMAN_CHECK_READY.

## C01 chapters06–07 checkpoint
- Full C01 chapters01–07 read; same snapshot35 documents/69 relations. Chapters08–10 and C02all remain unprocessed. Actual B-1 stay and B-2 inspection now differ from previous planning; no B-2 contract/settlement invented.
- Second read-only review: chapters04–05 read22,745 chars,26new facts/18new relations; narrowed claims and strengthened direct evidence. Refuel/stock/shift/contact-rule quotes now bind exact support. Third review audits chapters06–07.
- No source/Canon/RAW/Reader edits. C03 data and jobs untouched. Candidate stays PREVIEW_ONLY/PARTIAL.
- Current prior headac22a11; next git log identifies completed unit. Next exact action: read chapter08 in two complete body chunks; curate real new characters and external-house facts.
- Draft478 final CI/Preview and browser captures still pending; HUMAN_CHECK_READY not reached.

## C01 all-public-chapters checkpoint
- All 10 public C01 chapter bodies fully read; 58 documents/173 source-bound facts/111 relations. Coverage ALL_AVAILABLE_CHAPTERS describes currently available public Reader only; PREVIEW_ONLY persists.
- Read-only review audited chapters08–10 (41,431 chars/69 new facts/42 new relations), exact quotes/body hashes PASS. Compound claims narrowed or strengthened with actual outcomes. No redacted names, missing S02 acquisition history or DAY731 choice outcome reconstructed.
- Full C01 source text and original RAW/Reader/Canon/Graph remain unchanged. Candidate does not claim human/expert validation.
- C02 first chapter read18868 chars; vertical slice17 documents/13 relations in working tree. Discovered original canonical paths differ from archive paths; validator now binds existing catalog pairs and adapter uses validated sourceRefs for real RAW links. No original Reader/transcript changes.
- PASS: web30 files/176 tests; seed4 tests; build:verified. Preview bundle5,398.76kB/gzip1,655.75kB before final C01 quote corrections. Browser still NOT_VERIFIED (pre-launch Windows sandbox helper).
- Prior committed head0e14f3c; this checkpoint follows in git log. Next: C02 chapters02–11 full read and curation, source review, scoped search, final CI/Preview/browser gates. HUMAN_CHECK_READY not reached.

## C02 chapters02–06 checkpoint
- Full public bodies read: C02 chapters01–06, source gaps kept explicit. Snapshot42 documents/44 relations. First independent source review of chapter01 in progress.
- Chapter02 title says yard but body is wildfire preparation with no evacuation outcome; chapter03 ends mid-sentence; do not synthesize missing transitions.
- Chapter04 existing region network and outage recovery, chapter05 independent business, chapter06 actual22% investment distinguished from nationwide expansion proposals.
- Other Park Do-hyun is a separate source identity; statements about Park Hyun-woo/the matching house remain REPORTED until actual observation. No C01 family/C03 history used.
- C01 final review correction binds relation86 to the actual store-owner quote, keeping REDACTED.
- Prior head1896a7c. Next exact action: C02 chapter07 body in two complete chunks, then08–11, semantic source review; scoped global search and final CI/Preview/browser still pending. Not HUMAN_CHECK_READY.

## C02 all-chapter read / scoped search checkpoint
- Actual C02 public Reader11 bodies fully read. Snapshot65 documents/72 relations; source review10–11 pending, coverage remains PARTIAL until that audit. Reviewed earlier claims narrowed to their direct quotes; no fabricated source transitions.
- Reused existing search groups/scoring; Wiki IDs and links now scoped, work title shown, actual candidate facts searchable. Unregistered candidates filtered out of browser projection use. Candidate overview summarizes latest two facts; all original facts and quoted evidence remain in sources section.
- Added test-only C04/C05 valid adapters with colliding char-seojin, shared chapter/part IDs, scoped relations/Reader/RAW, no media, six-first disclosure; C06 registry-only empty state. Real registry unchanged.
- PASS web31 files/179 tests. Latest origin/main ccde6a740fe0cf4a1bde3872addf7da44e6ca25d adds C03 SESSION_001 semantic publication and readback/source-check fixes(#474/#477); inspect then normal merge, do not overwrite Graph/receipts.
- Prior committed headf99f915. Next: finish C02 semantic audit, synchronize main, full local gates, push Draft478 and exact-head CI/Preview. Browser gates NOT_VERIFIED. No main/Production operation.

## Final content integration checkpoint

- Synchronized main: ccde6a740fe0cf4a1bde3872addf7da44e6ca25d; prior head: a4bc397bf5d60fee2110084d4556bff68e72821b. This checkpoint is the next commit in git log; resolve final head with git rev-parse HEAD. Same codex/a-wiki-multichronicle-v1 branch and Draft PR478.
- C01/C0221 public bodies /230,818 characters actually read and audited by an authorized read-only agent. Agent re-review is not human/expert approval. All21 ledger rows REVIEWED; coverage ALL_AVAILABLE_CHAPTERS describes current public Reader only. Both seeds PREVIEW_ONLY; Production omits candidates.
- C01:10 chapters,58 nodes (9 character/16 location/33 event),173 facts,111 relations. C02:11 chapters,65 nodes (22/20/23),118 facts,72 relations. Total123 nodes/291 facts/183 relations. Every fact/relation exact quote/bodySHA/own chapter and all archive RAW canonical mappings/hashes validate. No missing transitions, choice outcomes, dates, save values, redacted names or approval receipts invented.
- Holds: C01 school-station identity, unexecuted City Hall/B2 contract, redacted transport role, missing S02 acquisition, final unanswered DAY731 choice; C02 ch02 title vs fire-preparation body, truncated ch03, unrecorded transitions, same-name other Do-hyun, reported Hyunwoo claims, incomplete investment proposals and final unexplained record anomaly. Chapter notes below retain precise limits.
- C02 original worldline files absent from checkout: actual public archive bytes and BOOK sourceHashes/catalog canonicalRef ↔ archivePath verified; original worldline bytes NOT re-read or claimed verified.
- Reused registry, shared world index/document, six-first disclosure, Reader/RAW, search groups/scoring and CSS. Work identity scoped on routes, data, relations and search; C04/C05 only test fixtures, no new real registration. Future work: registry + actual approved BOOK/RAW catalog + one validated same-contract SEED; no dedicated renderer/CSS. Registry-only work has no unavailable Wiki/Reader button.
- Local PASS: web31files/180tests; knowledge53; semantic39; native-control19; seed4; visual+seed78; Graph/visual/Reader batch; build:verified; CONTEXT=production build (candidate notices and curated facts absent); public boundary38probes; diff check. Windows symlink3 tests SKIP, not PASS. Before fixture correction the combined suite had162PASS/1FAIL/3SKIP; native19 nowPASS.
- Two fixture corrections preserve all assertions and operating functions: semantic temporary Git SSR repository copies validated candidate RAW; stale-ledger C03 test models pendingS04 in temporary copy instead of relying on current published state. No live job or actual receipt change.
- Original books/RAW/Canon/C03Graph/history/facts/visuals/Knowledge/downloads/security/deploy policies unchanged against synchronized main. Generated Knowledge HTML11 differ only in common world menu.
- Preview JS about5,533.46kB/gzip1,691.24 vs PHASE1baseline5,274.38/1,624.64 (+4.9%/+4.1%, includes new main C03). Production excludes candidates:5,300.17/1,629.77. Existing chunk warning remains; no second BOOK prose or runtime Graph compiler. Actual browser performance NOT_VERIFIED.
- PHASE0 PASS. PHASE1–5 code/content/automated gates PASS; actual UI gate NOT_VERIFIED. PHASE6 BLOCKED: final-head CI/Preview pending push and CUA pre-launch Windows sandbox helper error. NOT HUMAN_CHECK_READY. CUA documented kernel retry also fails helper_unknown_error/setup refresh.1280/390/360 layout/keyboard/touch/click/Reader-restoration/captures NOT_VERIFIED.
- Draft https://github.com/cetin072/survival-interactive-series/pull/478; Preview https://deploy-preview-478--survival-diary-archive.netlify.app/?view=wiki-preview&page=worlds. Verify exact deployed head after push.
- Next: final web tests/Preview build, commit/push normal same branch; exact-head Actions+Netlify SHA/results+HTTP checks. Once browser kernel works, full1280/390/360 click paths/captures on exact head. Do not re-extract unchanged chapters or mark Ready/merge/deploy. No Production operation/policy change.

### C01-HAN-JUNHO source ledger

BOOK SHA256: 98235add2392dc66591e26772aa07fb2c45f60b2ecb609ff1a36be4837f290c3

| Chapter | Status | Facts/Relations | BodySHA256 | Limits |
| --- | --- | --- | --- | --- |
| c01-han-junho-chapter-01 | REVIEWED | 14/9 | ef2e9690f9b53ee105588ae1ea4066045754e3d73248e1bc3576f3b2c2e6f2ce | 첫 장 전체를 읽고 실제 행동·상태와 진술·계획을 구분했다. 시청역 합류와 농로 통과는 실행 확정 사실에서 제외했다. |
| c01-han-junho-chapter-02 | REVIEWED | 15/10 | 0461ecc5d6169523f17e0cc1711f852143a1cbac0c05ae885423f2d8b45a66d3 | 제2장 전체를 읽었다. 실제 후퇴·가족 합류·임시 대피 등록·집 회수 포기를 기록하고, 종합운동장 방문과 남쪽 분산 이동은 실행된 것으로 기록하지 않았다. 전력 이상 원인은 미확정이며 병원 연료 이야기는 전언으로 구분했다. |
| c01-han-junho-chapter-03 | REVIEWED | 17/10 | ab42b60d9c76bd0996c1a7984ebfc6e18ade0cf3e43321330efc4f4f6604e0fa | 제3장 전체를 읽고 도구 출력에서 잘린 23:46~05:50 구간도 별도로 읽었다. 실제 남쪽 체육관·서윤 의료원 도착·차량 회수는 기록했다. 새벽 직원 대화, 주유소 전면 공급중단, 회수 차량의 대피소 귀환, 소방차 이동 원인은 확정하지 않았다. |
| c01-han-junho-chapter-04 | REVIEWED | 15/11 | 31a3df03c47a6728a7d0156179c1e6c0e6afac957e4f7ea49c4b320204c1f642 | 제4장 전체를 두 구간으로 읽었다. 차량 귀환·물자 구매와 가족 전원 합류를 기록했다. A/B/C 장기 이동 후보는 방문 장소로 만들지 않았다. 별도 연료 비축·시설 폐쇄·다음날 재출근·외곽주택 복귀를 확정하지 않았다. 원문 28시간 표기는 원문 맥락으로만 보존한다. |
| c01-han-junho-chapter-05 | REVIEWED | 12/7 | 820f9dd95bed716aabc694d68f27b3797a95c99d6dfb233f9a39d4dd8d55f0f3 | 제5장 전체를 읽었다. 두 거주지 상실은 가정이며 실제 소실로 처리하지 않았다. 남쪽 후보 B와 B-1/B-2는 조사·퇴로 계획이지 확보한 장소가 아니다. 실제 아파트 복귀와 대피소 폐쇄는 없고 서윤의 출근 보류 판단과 수압 약화는 확인된다. |
| c01-han-junho-chapter-06 | REVIEWED | 11/7 | 505b8bdc93df1d0c80f062354bf9af662e6f2e21359d36e9ad98e8b1e3826375 | 제6장 전체를 두 구간으로 읽었다. 실제 아파트 복귀와 정호 생활공간, 정전·급수 장애는 기록했다. 후보 B 이동 조건은 충족되지만 장 종료 때 남쪽 출발은 아직 없으므로 방문·숙박 확보로 기록하지 않는다. |
| c01-han-junho-chapter-07 | REVIEWED | 20/15 | a1e4ee4a98eac69d421d619523a4352f1147c06b6f8768fc039706b6d8b30665 | 제7장 전체를 두 구간으로 읽었다. 가까운 호텔 하룻밤, B-1 일주일 숙박, B-2 실제 차량 조사, 아파트 재복귀와 공식 허용 뒤 외곽 집 확인이 실제 실행된다. B-2는 계약·정착하지 않았다. 5일차 이후 08:15 표기에 없는 날짜를 추가하지 않는다. |
| c01-han-junho-chapter-08 | REVIEWED | 19/11 | 5127a9477ada241548477dd09298413c97dca422e1f8222808489bfdd1b27a81 | 제8장 전체를 두 구간으로 읽었다. 실제 거점 보강·체류 시험·텃밭 운영·주4일근무와 소득 감소를 기록했다. 독립 수원이나 완전자급·실직·부업 실행·구조조정 확정을 만들지 않았다. 서윤은 행정 업무 문맥이며 임상 직종을 부여하지 않는다. 원문 상대일차의 달력 날짜를 추가하지 않는다. |
| c01-han-junho-chapter-09 | REVIEWED | 21/12 | fe3faa7db168caa803689dfe732b29472a8a3b8670fffeddba49c6bddf5a13af | 제9장 전체를 두 구간으로 읽었다. 실제 생활서비스와 두 사람 협업, 익명 역할로 확인되는 정비업자·마트운영자·운송협력자를 기록했다. 가려진 이름은 복원하지 않는다. 고령 주민 여러 가구와 인근 농가를 한 명의 특정 인물로 합치지 않았다. 공식 사업체·공동자산·추가채용·구조조정 확정을 만들지 않았다. |
| c01-han-junho-chapter-10 | REVIEWED | 29/19 | 13b48e71da3ee1b5a325c9536a5087d6db315308bdd85d55113edee1721d60a9 | 제10장 전체를 두 구간으로 읽었다. 공개 장은 S02·55에서 시작해 EV·태양광·B/D집 관계의 취득·초기설정 과정은 확인할 수 없으며 보충하지 않는다. 학교 전학·주생활권 등록·독립전력 불참·배터리 교체는 후속 실행 서술로 확인된다. 2박3일 근무는 제안일 뿐 실행하지 않았으며 마지막 DAY731 선택의 응답은 없어 보류한다. 농사조언가구·D집·EV-C가구의 개별 인물 신원은 부족해 가짜 인물로 만들지 않는다. |

<details><summary>Verified public RAW canonical path / archive path / SHA256</summary>

- c01-han-junho-chapter-01: seasons_v2/S01/raw_transcript/PART_001.md → seasons_v2/S01/raw_transcript/PART_001.md — 7e917c2061eec2749a7f540f862a3debdd986f9d41a94b67368a2df3e749ca0f
- c01-han-junho-chapter-02: seasons_v2/S01/raw_transcript/PART_002.md → seasons_v2/S01/raw_transcript/PART_002.md — de9f84356d66fd2c055bfb724dd16a1a47980c42139a11cfd777a2e12cf494c7
- c01-han-junho-chapter-03: seasons_v2/S01/raw_transcript/PART_003.md → seasons_v2/S01/raw_transcript/PART_003.md — 1cc4e060513a0d7831be27f79abc4baf553b8429babc12c860708b7b48c53086
- c01-han-junho-chapter-04: seasons_v2/S01/raw_transcript/PART_004.md → seasons_v2/S01/raw_transcript/PART_004.md — 76d3a25ed86ee4c6737845e6943701e40e6d3137c18f1a719e68b046a3f023ad
- c01-han-junho-chapter-05: seasons_v2/S01/raw_transcript/PART_005.md → seasons_v2/S01/raw_transcript/PART_005.md — 755c7b59fe0ca3f141614dd082ec340eb60bee3bf1737c10f34e990a10385d9b
- c01-han-junho-chapter-06: seasons_v2/S01/raw_transcript/PART_006.md → seasons_v2/S01/raw_transcript/PART_006.md — 2ba316af9bfdcd25460e25b0134f6a7f9a088da18af8b2109d8beba8abac4df4
- c01-han-junho-chapter-07: seasons_v2/S01/raw_transcript/PART_007.md → seasons_v2/S01/raw_transcript/PART_007.md — d5ec46540c3f0329e6ecedd69739937a4485dc1f30976d401bf3ef4e9c0d17d8
- c01-han-junho-chapter-08: seasons_v2/S01/raw_transcript/PART_008.md → seasons_v2/S01/raw_transcript/PART_008.md — cc64e8d0b6adb05e52007cc919b11e5b0eba55dff5b4d72fcefc655e942e91ea
- c01-han-junho-chapter-09: seasons_v2/S01/raw_transcript/PART_009.md → seasons_v2/S01/raw_transcript/PART_009.md — 7519164e37e67544fadd81d0e26fb17b0971413df62e5dbc00cd5e63ceb73828
- c01-han-junho-chapter-10: seasons_v2/S02/raw_transcript/PART_001.md → seasons_v2/S02/raw_transcript/PART_001.md — 51428eb4a41a374a909834158c5f2c040792839835a64e7ab53693d52c018739

</details>

### C02-STRONGHOLD source ledger

BOOK SHA256: cc21254acc575113b00713bf92dc27d807a14ea6baee727e3acbe2ff85c64fba

| Chapter | Status | Facts/Relations | BodySHA256 | Limits |
| --- | --- | --- | --- | --- |
| c02-stronghold-chapter-01 | REVIEWED | 20/13 | 568211d9f8514b126a2fcb4d803c7315ab4d9740ee0c0145fb0bf2e99a4c7d66 | 첫 장 전체18868자를 세 구간으로 읽었다. 실제 번호판 확인과 방비 보강·관계 변화를 기록했다. 발신자의 신원·범죄 책임·관계의 공식 정의는 확정하지 않는다. 첫 장 전의 정전·절도·사업 시작 경위를 보충하지 않는다. |
| c02-stronghold-chapter-02 | REVIEWED | 7/3 | bcf2c88e513f9de43680f5e55927eb7991ee66e89a59d0646bdfd69415dcb801 | 제2장 전체4269자를 읽었다. 제목은 마산의 야적장이지만 본문은2031-03-21 산불 접근과 대피 준비이다. 실제 야적장 방문·두 집 소실·서진 가족 구조·도현 대피 결과는 장 종료에 없어 보류한다. |
| c02-stronghold-chapter-03 | REVIEWED | 7/7 | 659a7934447a6c504bcd0721541bc8aa281ccf011fcf39f45109e1baecdf6b68 | 제3장 전체6188자를 읽었다. 산불 실제 대응·창고 화재 경위는 앞뒤 공개 구간이 비어 있어 재구성하지 않는다. 김 노인 집에 들어온 태훈 가족, 실제 제설 협력과 식사를 기록했다. 본문 끝은 문장 중단이며 이준 학교 통폐합과 정착 확정은 보류한다. |
| c02-stronghold-chapter-04 | REVIEWED | 15/11 | 4fea38498a1cd42f7355443fc6a01e30c439f1044fbe971ed7aa2d4e8aec6768 | 제4장 전체9945자를 두 구간으로 읽었다. 실제 통신불안 속 귀환·지역망 확인과 자원우선거래 합의를 기록했다. 폐목장 피난·위성통신 설치·전기차 구매는 하지 않았다. 앞 장과 날짜 연결·폐목장 취득경위·지역위원회 기원을 꾸미지 않는다. |
| c02-stronghold-chapter-05 | REVIEWED | 7/5 | 9eabbcf8a2ce203472ca0072de01424aee573f8cb965f9f458db5f8ee1eb346b | 제5장 전체5015자를 읽었다. 독립 이후 실제 계약·역할분리·회사 규모를 기록했다. 초기퇴사통보와 이후퇴사후사업을 구분한다. 투자 상담과 역제안은 아직 계약 수락이 아니며 지연과 혼인 등 신분을 만들지 않는다. |
| c02-stronghold-chapter-06 | REVIEWED | 10/5 | 7532798046d5568c9e89673d175c5e18c5eab1d152286f438ad9d699aabed1ea | 제6장 전체5741자를 읽었다. 지분22% 투자 수락·분산투자·사업 성장과 지연의 생활 변화를 확인했다. 전국확장/대형유통 계약은 제안이지 수락이 아니다. 다른박도현·윤서현·박현우는 사진·전화로 확인되는 범위만 기록한다. 방문 선택은 마지막에 미실행이며 두 과거의 과학적 원인을 만들어 넣지 않는다. |
| c02-stronghold-chapter-07 | REVIEWED | 13/7 | dc8d1728125131a22b2749f43a82d325192ad3b734083203fa20a2deadcd697f | 제7장 전체11102자를 두 구간으로 읽었다. 도현·지연 실제 북서권 방문, 현우의 과거 전언과 직접 본 일지/통을 구분한다. 태경은 이동하지 않고 봉투를 열지 않았다. 이후 실제철거·봉투전달·토지매입 실행은 확인된다. USB가설을 세계의 확정 원인으로 쓰지 않는다. |
| c02-stronghold-chapter-08 | REVIEWED | 11/7 | 9fa5a0cf5d1181df3b6b4efbf31108e630007a971a9d05ab0d8e9b509118bbd3 | 제8장 전체13287자를 읽었다. 아래거점 취득 등 시작 전 누락 기록은 보충하지 않는다. 시계차·거리형상은 측정 기록이며 원인은 확정하지 않는다. 실제 무인조사·자체통로 운영과 후속압력 이상·배수차단·출구 제한을 시간순 구분한다. |
| c02-stronghold-chapter-09 | REVIEWED | 8/4 | 047d7e2800e5a29af1834cf996396e01091c00af0aa0f0a7a5c269dbc610608b | 제9장 전체10313자를 두 구간으로 읽었다. 실제 관측전용격리·우회공사·반복시험·72시간 내부강화와 본선 거리변동을 기록했다. 외부예측공개와 통로폐쇄 선택은 끝에 미응답이므로 다음 장 전까지 확정하지 않는다. 흰틈 너머 세계·소리의 정체·예측안전보장은 만들지 않는다. |
| c02-stronghold-chapter-10 | REVIEWED | 9/4 | 34d675c6db74725522fb5befc5f913981432e170e3733f67a373b847a6219b82 | 제10장 전체12873자를 두 구간으로 읽었다. 실제 본선폐쇄·현재위험 경고·고립거점 보급·제한적경보공유와 오경보/국지미탐지를 기록했다. 예측정확도수치·안전보장·조기경보상업화를 만들지 않는다. 마지막 분산망 선택의 실행은 다음 장에서 확인한다. |
| c02-stronghold-chapter-11 | REVIEWED | 11/6 | 96a8332506fef4bc470cc69e921d6bb59198bde59a48f8b7a4f46f8b4df77af0 | 제11장 전체7280자를 읽었다. 실제 분산경보의 시설독립 운영·오류누적·4축 분리와 기록현실불일치 추가를 기록했다. 동일인영상과 날짜만으로 한지연복제·소실·시간여행을 확정하지 않는다. 미래날짜를 실제현재 날짜로 바꾸지 않고 마지막 원인과 후속결말은 보류한다. |

<details><summary>Verified public RAW canonical path / archive path / SHA256</summary>

- c02-stronghold-chapter-01: worldlines/STRONGHOLD/raw_transcript/SESSION_2031_02_TO_2031_03_ROOM_20260925/PART_001.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_2031_02_TO_2031_03_ROOM_20260925/PART_001.md — ea0989372e72622554440965fd3f130ac5c0257b41fc9260c22a1e4c12417f10
- c02-stronghold-chapter-01: worldlines/STRONGHOLD/raw_transcript/SESSION_2031_02_TO_2031_03_ROOM_20260925/PART_002.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_2031_02_TO_2031_03_ROOM_20260925/PART_002.md — fcab069d26a3e991f53f2d3a329f5f1fa627be8bc310ede5d5056c5e9b19124b
- c02-stronghold-chapter-02: worldlines/STRONGHOLD/raw_transcript/SESSION_2031_02_TO_2031_03_ROOM_20260925/PART_005.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_2031_02_TO_2031_03_ROOM_20260925/PART_005.md — 7065c349dfe397f0b7c5f7037eea8dbb37d0194a0b0546bea032291d75b49add
- c02-stronghold-chapter-03: worldlines/STRONGHOLD/raw_transcript/SESSION_20260925_CURRENT_ROOM/PART_001.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_20260925_CURRENT_ROOM/PART_001.md — 4682f4536b43bae98ff14ebad38aa055b69ed8bc067673569965bdaf91ab50d6
- c02-stronghold-chapter-04: worldlines/STRONGHOLD/raw_transcript/SESSION_C02_2032_SPRING_SUMMER_ROOM_20260925/PART_001.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_C02_2032_SPRING_SUMMER_ROOM_20260925/PART_001.md — e39fbb7b8af24b6d7146921e4da87a5c36f9cba191cbf719fad65cfb780400f3
- c02-stronghold-chapter-05: worldlines/STRONGHOLD/raw_transcript/SESSION_C02_20260925_ROOM_01/PART_001.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_C02_20260925_ROOM_01/PART_001.md — ff0d713854574ac1c909ef3cf29470f086063fdeb0efc9e7812bca1ef29a11fc
- c02-stronghold-chapter-06: worldlines/STRONGHOLD/raw_transcript/SESSION_C02_20260925_ROOM_01/PART_002.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_C02_20260925_ROOM_01/PART_002.md — 042d5c7d48cacd1009f62d17c66aedb7308bc16fb2b4625741a1be137d16c643
- c02-stronghold-chapter-07: worldlines/STRONGHOLD/raw_transcript/SESSION_C02_20260925_ROOM_01/PART_003.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_C02_20260925_ROOM_01/PART_003.md — e74260a8c7c0f3769013cdc7379afd6fdba1ce7ae1dd0d867e0ed4d97fb44473
- c02-stronghold-chapter-07: worldlines/STRONGHOLD/raw_transcript/SESSION_C02_20260925_ROOM_01/PART_004.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_C02_20260925_ROOM_01/PART_004.md — 26742d760bc4e3c1bd6bb8dc4ca8c0109e000c3c3a465990dec9e6f16fa4aabf
- c02-stronghold-chapter-08: worldlines/STRONGHOLD/raw_transcript/SESSION_20260925_2039_CURRENT_ROOM/PART_001.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_20260925_2039_CURRENT_ROOM/PART_001.md — 91441202840f07d70474212a8bd07e5ac525951902136ee28fe5519fe7597c06
- c02-stronghold-chapter-09: worldlines/STRONGHOLD/raw_transcript/SESSION_20260925_2039_CURRENT_ROOM/PART_002.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_20260925_2039_CURRENT_ROOM/PART_002.md — debe1d7de5485e5972171aa788db52c84681aecabfaceacde5f5a620ad7b8bae
- c02-stronghold-chapter-10: worldlines/STRONGHOLD/raw_transcript/SESSION_20260925_2039_CURRENT_ROOM/PART_003.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_20260925_2039_CURRENT_ROOM/PART_003.md — 09c51466ecaf070e0fcc1e4ed64ee4b9760e92a7e37f689a9f3179da8fb6ddb3
- c02-stronghold-chapter-11: worldlines/STRONGHOLD/raw_transcript/SESSION_20260925_2039_CURRENT_ROOM/PART_004.md → archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_20260925_2039_CURRENT_ROOM/PART_004.md — ba3b66fe48241308a2432444be4eaa851f03fdf921a5f4db0c247d8afe2793e6

</details>

## Browser CI reuse checkpoint
- Prior implementation head3735a352de014ac4855f882aabe71fe645609507: all six Actions PASS and Netlify Preview ready; deploy-meta commit_ref exactly matches.
- Existing check-reader-browser.py already runs real Chromium locally in CI and on Netlify. Added opt-in --world-wiki audit using the same browser/test toolchain: all five existing widths including1280/390/360, actual card/menu/document/relation/Reader/RAW/search/error/portrait clicks, native keyboard and touch disclosure, no-overflow, captures and completed JSON. No existing assertion removed.
- Preview identity now exact in this workflow (no ancestor-equivalence flag); Archive build ref is the actual PR head. Production audit command and release detection remain unchanged. Artifact archive-browser-review contains local/preview captures and JSON even on failure.
- Local Python compile PASS. Browser audit itself is pending new exact head CI; no PASS or HUMAN_CHECK_READY claimed until test results/captures inspected. CUA remains unavailable; this is repository browser CI reuse, no custom Windows helper or production mutation.
- Next: commit/push this test unit; wait for real final-head CI+Preview; inspect archived1280/390/360 screenshots and completed JSON; record exact tested head in final report/checkpoint.

## Browser source-selection correction checkpoint
- Prior headb81364ede50a3dc23aeffe4981fe23680504af94: Netlify exact-head HTTP PASS for10 Knowledge pages/authoredHTML/meta, sitemap/robots/download/release bytes, missing slug404, Preview+Operatornoindex/CSP and both candidate bundle inclusion. Netlify known Preview toolbar was separated from authored HTML, not mistaken for source mutation.
- Browser CI actually passed C01/C02360px full card/detail/relation/Reader/RAW routes then failed the C03 test assumption: its first legacy profile has no direct RAW link. No original link removed or source invented. Test now clicks existing source-bound char-seojin for current/history Reader/RAW checks; legacy bare char-jinwoo/portrait still explicitly checked separately. No assertion weakened and no C03 data changed.
- Next: push this precise test correction and await complete final-head local+Preview browser audit/captures. Current status not HUMAN_CHECK_READY.

## Browser query-order correction checkpoint
- Head9ff2bf79452af95d05011d56eb4850d37e92ad77: all three worlds passed360px document/relation/Reader/RAW navigation. Search assertion assumed chronicle-before-node order, but the existing helper deliberately emits node-before-chronicle. Corrected selector to match both separate query values; exact per-work title/link checks remain. Product search/URLs unchanged.
- Five non-browser CI and exact-head Netlify HTTP/metadata/download/noindex/CSP checks PASS. Browser final gate still pending corrected head; no HUMAN_CHECK_READY until complete.


## 2026-10-09 post-human visual check / newest-first & original C02 RAW review
- User accepted the card/world layout and requested latest Chronicle first. Render cards and Chronicle side-list by descending registry number; keep registry/storage/Reader chronology unchanged. With a future C04 fixture, C04 appears above C03 without code changes.
- Mobile fixed document jump control previously covered text near the bottom-right. Scoped CSS now makes the three links a normal-flow horizontal control before article content at widths <=820px. Desktop fixed controls remain intact; preserve keyboard focus.
- C02 original RAW comparison against worldline/stronghold-chronicle exact commit 72e12706e7685a20b3f957b3f3e2f3cc85903127 and public archive main exact commit bf49a49e0966beef2d8442d33a4540945280491b: **24/24** canonical worldlines/STRONGHOLD/raw_transcript/SESSION_*/PART_###.md map to same-session public archive/content/transcripts/C02-STRONGHOLD/SESSIONS/SESSION_*/PART_###.md with exactly equal Git blob SHA. Both recursive trees are non-truncated. This closes the byte-identity cross-check for the 24 currently archived PARTs; it does not establish that all missing historical chat was recovered.
- Focused AI semantic spot-checks against embedded verbatim cited passages (not independent human content approval): C01 family relation in chapter01, chapter08 4-day work schedule vs loss of employment, chapter10 unresolved choice, C02 chapter06 actual 22% investment vs unaccepted expansion proposal, C02 chapter11 duplicate-person claim not proven. The cited supporting text was compatible with these restricted statements. Full corpus semantic human approval remains pending.
- User approved the UI layout, not public promotion of the C01/C02 SEEDs. Keep both publication=PREVIEW_ONLY; production adapter excludes them; no forged approval/receipt and no automatic publication.
- Any final merge decision must be on an exact-head green CI after reconciliation with current main; preserve C03 original Graph/history and the 2-day release marker gate.


## 2026-10-09 — Explicit C01/C02 human publication approval

- The user explicitly wrote "승인할게" in the project ChatGPT conversation on 2026-10-09 (KST), after reviewing the C01/C02 Wiki preview and earlier HUMAN_CHECK_READY report. This approves public publication of the two current Reader-grounded curated Wiki snapshots, not speculative expansion or future edits.
- The exact approved source candidates stay immutable as PREVIEW_ONLY in SEED.json. Production admission is a separate human approval manifest, archive/content/wiki/PUBLIC_APPROVALS.json. It pins each Chronicle's complete SEED.json bytes by SHA-256 and BOOK.json bytes by SHA-256. The publication code rejects any changed source, duplicate approval, malformed approval, unsupported Chronicle, or missing approved work. Additional Chronicles do not inherit approval.
- C01: 10 reviewed Reader chapters, 58 Wiki nodes, 173 facts, 111 source-bound relations.
- C02: 11 reviewed Reader chapters, 65 Wiki nodes, 118 facts, 72 source-bound relations. 24 archived RAW PARTs had exact Git blob byte identity with the worldline/stronghold-chronicle source on review; historical gaps remain.
- Content policy: recorded actions vs reported claims remain differentiated; missing choices, histories, origins, personal relationship status, causal explanations and dates are not reconstructed. Publication approves only the presently available Reader-grounded scope. It does not certify full recovery of all chat transcripts.
- Never publicize the approval manifest, evidence hashes, original worldline metadata, private GM materials or archive-only source maps into the browser bundle. Only the already reviewed Wiki document projection is included. Replace the obsolete "human review pending" public label with "public world record" for correctly hash-matched approved snapshots.
- Approval does not authorize an immediate forced Netlify Production deployment, changing the 2-day release marker cadence, automatic RAW ingestion, or running a live A-Wiki/Knowledge worker. The existing normal batched release gate remains authoritative.
- Before merging this approval change: exact-head green CI, verified Production-context build, no C03 Wiki Graph regression, and Preview C01/C02 links checked. If failed, keep as Draft and do not merge.
