# Archive Public Novel V4

## Product goal

Make the Survival Diary Archive a public, read-only site that starts with world
exploration and provides a clear route to the verified public play transcript.
The top-level model is `Survival Diary IP → Chronicle → Worldline → Season`.
The active chronicle is `C03 AFTERFALL / 서진우`; other chronicles are isolated
namespaces and must never contribute Canon, graph, or transcript data to C03.

## User experience

- World exploration is the default view and includes search, entities, a 2D
  expandable graph, newest-first events, recent items, and world pressure.
- A persistent, high-visibility "생존일기 원문 읽기" control opens a dedicated,
  spacious reader with a season/part table of contents, progress, prior/next
  navigation, and reader-to-archive links.
- The UI is a neutral light, content-first reading surface with accessible type
  sizing on desktop and mobile.

## Transcript integrity rules

- Only public, verified USER/GM/operational public records become transcript
  content. Preserve their order and wording.
- Never turn Canon, summaries, checkpoints, event data, or memory into dialogue.
- Do not publish prompts, tools, hidden reasoning, GM-only content, future plot,
  secrets, or personal information.
- Clearly distinguish `verified transcript`, `canon narrative summary`, and
  `missing transcript` in data and UI.

## Source hierarchy

1. Verified `seasons_v2/<season>/raw_transcript` records
2. Approved PLAYER_SAFE Canon summaries
3. Explicit missing-transcript notice

Raw records are historical sources; approved Canon remains the current gameplay
fact source when the two differ.

## Non-goals

- No engine/web changes, runtime schema changes, direct Supabase access, 3D
  graph, transcript fabrication, or changes to Canon source documents.

## Acceptance criteria

- World exploration is the default landing view and the transcript CTA is visible.
- C01 한준호 기록은 `seasons_v2/**`에서 검증한 S01 9개와 S02 후반 1개만
  원문으로 읽을 수 있고, S02 초반 공백은 명시한다.
- C02 박도현 / STRONGHOLD는 검증 원문이 확보되기 전까지 metadata-only 카드로
  표시한다.
- 현재 생존기 C03 AFTERFALL / 서진우의 S01은 `worldlines/AFTERFALL/**`
  원문 backfill 전까지 `MISSING TRANSCRIPT`와 별도 정본 요약으로만 표시한다.
- Reader state survives a world-explorer round trip.
- Graph behavior and newest-first timeline remain available.
- The application builds without exposing private data.

## Test plan

- Typecheck and production build.
- Static transcript-data assertions for the exact C01/C02/C03 source-root map,
  gaps, and Chronicle-to-entity isolation.
- Browser responsive and visual review of explorer and reader.
- Confirm no diff in `engine/web`.

## Rollback boundary

The V4 work is isolated to Archive content, Archive web UI, its policy, and
archive-only checks. Reverting this branch leaves engine and gameplay untouched.
