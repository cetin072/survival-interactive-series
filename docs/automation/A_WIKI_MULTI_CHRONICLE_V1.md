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
