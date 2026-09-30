# 생존일기 AI-native IP Production System v1.0

Status: Approved planning baseline  
Approved: 2026-09-28 (Asia/Seoul)  
Repository: `cetin072/survival-interactive-series`  
Notion planning source: https://app.notion.com/p/3e9bd4185ef0814ba0aacd7586485731?pvs=204

## 1. Purpose

The long-term goal is not a game archive alone.

The system should let the user focus on:

- playing AFTERFALL;
- making important worldbuilding/editorial decisions;
- approving exceptions.

The production system converts gameplay into durable IP assets:

```text
gameplay
→ RAW preservation
→ Reader / novel
→ Graph / wiki
→ maps
→ character/location/event illustrations
→ real-world survival questions
→ Knowledge research and writing
→ XLSX / PDF / printable tools
→ Archive site
→ future video / webtoon / education assets
```

The operating goal is a persistent **AI-native IP production system**.

## 2. Source of Truth boundaries

```text
Supabase
= authoritative game runtime/state
= RAW transcript
= private visual originals / registry
= automation execution receipts

GitHub
= code
= verified Archive / Reader / Graph / VISUALS
= public release artifacts
= CI / PR / release history

Notion
= human-readable planning, editing and decisions
= Knowledge editorial room
= long-term roadmap

ChatGPT / Codex
= GM
= development/production workers
= content generation and automation executors

Netlify
= public Archive presentation
```

Do not operate these systems as independent duplicate sources of truth.

## 3. Automation topology

### Automation A — Archive Backbone

Automation A is the **IP source compiler / backbone**, not merely one peer worker.

Current pipeline:

```text
game RAW
→ immutable Archive source
→ Reader
→ Graph
→ VISUALS
→ PR
→ CI
```

A should become the stable source layer consumed by downstream workers.

### Automation B — Visual Worker

```text
Visual READY
→ image generation
→ Supabase private original
→ visual_assets registry
→ deterministic derivative
→ SITE_ASSETS
→ Deploy Preview
→ Production
```

The first generic real E2E target is:

`loc-guild-rear-warehouse` / 길드 뒤편 창고

### Automation C — Knowledge Worker

```text
Archive source
→ question discovery
→ duplicate/risk classification
→ Evidence
→ BRIEF
→ Semantic QA
→ copyright/source gate
→ release candidate
```

Policy:

```text
LOW RISK
+ verified evidence
+ Semantic QA
+ copyright/source gate
→ auto-publish candidate

high-risk / conflict / unknown
→ HUMAN REVIEW
```

## 4. Verified operating snapshot

Verified on 2026-09-28:

- AFTERFALL authoritative save_version: 267
- events: 298
- scenes: 73
- characters: 18
- transcript_messages: 138
- S03 messages: USER 30 / GM 29 / ASSISTANT_PUBLIC_META 9
- state-linked turns: 13
- latest linked save: 267
- visual_assets: 4
  - CHARACTER 3
  - WORLD_MAP 1
- `survival-archive-originals`: private bucket, 3 originals

Recent merged proof points:

- PR #187 — Illustration Automation
- PR #188 — Knowledge auto-publish release gate
- PR #193 — Archive S03 orders 50–63
- PR #195 — first fresh S03 Knowledge Worker run
- PR #196 — Archive S03 orders 64–67

## 5. Target architecture

```text
ChatGPT GM
   ↓
Supabase Runtime
   ↓
Automation A — IP Source Compiler
   ↓
Immutable Source / Reader / Graph / VISUALS
   ├─ Automation B — Visual Worker
   ├─ Automation C — Knowledge Worker
   ├─ future Media Worker
   ├─ future Tool Worker
   └─ future Discovery Worker
```

Future features should consume stable source contracts instead of redesigning A.

## 6. Immediate priority order

1. Stabilize repeated Automation A operation.
   - repeat execution
   - NOOP / duplicate prevention
   - retry
   - failure recovery
   - exact Production SHA verification
2. Complete B real E2E using the guild rear warehouse.
3. Repeat C fresh E2E from real Archive source.
4. Connect a shared Execution Ledger.
5. Add GitHub branch protection, required checks, rollback and actionable-only alerts.
6. Run Supabase privilege/security audit.
7. Automate A → B/C handoff.
8. Only after those gates: strengthen Wiki/map/Graph UX, then video/webtoon/education expansion.

## 7. Shared control-plane contract

Do not build a large new “Automation D” for orchestration.

Use a small shared execution receipt:

```text
RUN
├─ run_id
├─ source_snapshot
├─ source_sha256
├─ worker
├─ started_at
├─ finished_at
├─ result
├─ artifact_ids
├─ cost
├─ retry_count
├─ error_code
└─ approval_reference
```

This ledger is **not gameplay Canon and not the public content source of truth**. It is an execution receipt.

## 8. Operator UX principle

Successful background work should be quiet.

The user should mainly see decisions that require human judgment.

Example:

```text
Today's gameplay
game turns                8
new Reader chapters       1
new Graph relations       6
new Visual candidates     3
new images                1
new Knowledge candidates  2
published                 4
human review required     1

[Review 1 item]
```

## 9. Safety and operational principles

Before expanding features, prioritize:

- repeatability;
- duplicate prevention;
- failure recovery;
- source provenance;
- accurate Canon;
- permission separation;
- cost control;
- minimal operator intervention;
- generation/publication permission separation;
- actionable exceptions over noisy success logs.

Before full AUTO merge, strengthen:

- branch protection;
- required checks;
- exact Production SHA verification;
- rollback;
- Supabase privilege/security audit.

## 10. Knowledge BACKFILL rule

Historical public Archive sources may produce Knowledge candidates, but they must not be disguised as fresh scanner inputs.

If provenance cannot be represented explicitly, the worker must HOLD publication until the contract supports that provenance.

## 11. Long-term destination

The target is a personal **AI IP Studio whose source material is gameplay**:

```text
game
→ novel
→ world encyclopedia
→ relationship graph
→ map
→ illustrations
→ survival knowledge
→ checklists
→ XLSX / PDF
→ video scripts
→ storyboards
→ webtoon material
```

The nearest objective remains **real E2E repeatability of A, B and C**, not feature count.
