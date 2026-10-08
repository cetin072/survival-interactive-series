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
