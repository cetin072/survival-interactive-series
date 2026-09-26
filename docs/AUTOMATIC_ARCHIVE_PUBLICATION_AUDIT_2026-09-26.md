# Automatic Archive Publication v1 — Current-State Audit

Audit date: 2026-09-26
Status: STEP 1 FOUNDATION AUDIT
Mode: READ-ONLY AUDIT / NO PRODUCTION AUTOMATION CHANGES

## 1. GitHub

Repository: `cetin072/survival-interactive-series`

Audited heads at the start of this step:

- `main`: `99e19e878d86e4de2d52a15fbfd36f188ac489f6`
- `worldline/afterfall-rpg`: `88400aec4ead413de027fbf125e87578ac965f92`

Archive publication is currently Git/static oriented:

- `archive/content/**`
- `archive/scripts/**`
- `archive/web/**`
- `.github/workflows/archive-web.yml`

The repository has validation workflows, but no repository cron workflow that performs the documented 04:30 publication reconciliation.

## 2. Current Archive application

Archive production is a Vite static site deployed through Netlify.

Current production project:

- Netlify project: `survival-diary-archive`
- project id: `4b344369-f418-48ba-81b8-991be8974486`
- production branch: `main`
- framework: Vite
- current production commit at audit: `99e19e878d86e4de2d52a15fbfd36f188ac489f6`
- current deploy state: READY
- Netlify Functions: none
- Netlify Edge Functions: none
- forms: disabled

The Netlify connector reports the site on plan `nf_team_pro`. This audit does not assume additional builds, bandwidth, functions, or storage are zero incremental cost. Their incremental cost class remains `UNKNOWN` until explicitly verified.

## 3. Daily 04:30 reconciliation

A ChatGPT task named `Archive 새벽 동기화` exists with:

- schedule: daily 04:30
- timezone: Asia/Seoul
- intended behavior: PLAYER_SAFE reconciliation, branch/PR/CI/Preview/merge
- current actual state: **DISABLED**

Therefore the previous documentation statement that the daily reconciliation task is “enabled” was stale.

Current operational truth:

> The 04:30 publication policy exists, but no active daily publisher is currently running.

No scheduler is enabled by this audit.

## 4. Supabase runtime

Project:

- name: `taejang-phase1-staging`
- project id: `jgsxpdflgkqroecfjzxq`
- region: `ap-northeast-2`
- health: `ACTIVE_HEALTHY`

Relevant existing RPG structures include:

- `survival_rpg.saves`
- `survival_rpg.events`
- `survival_rpg.scenes`
- `survival_rpg.characters`
- `survival_rpg.transcript_sessions`
- `survival_rpg.transcript_messages`
- `survival_rpg.visual_assets`

Applied visual migrations include:

- `20260925174858 afterfall_visual_archive_v1`
- `20260926030800 afterfall_visual_map_ready_2027_03_23`

This step applied no database migration and performed no write.

## 5. Existing visual registry

Current visual registry contains:

### AF-MAP-001

- worldline: AFTERFALL
- type: WORLD_MAP
- status: READY
- visibility: PLAYER_ARCHIVE
- title: 서림 생활권 지도
- Canon anchor: S02 end / save 253
- provider: none
- provider model: none
- object path: none
- image URL: none
- published: no

Its policy already states:

`NO_PAID_PROVIDER_UNTIL_HUMAN_DECISION`

and its deterministic-map generation gate is ready.

## 6. Storage

Existing Supabase Storage buckets are:

- `employee-private-media` — private
- `notice-media` — private
- `promotion-media` — public

These buckets belong to other application concerns and must not be reused for Survival Diary visual assets merely for convenience.

At audit time there is **no dedicated Survival Diary / AFTERFALL visual bucket**.

Current storage objects are only in the existing notice/promotion buckets. No visual archive object exists.

No bucket is created in Step 1.

## 7. Cost status

The user requirement is zero additional cost.

Current audit classification:

| Capability | Current state | Cost class for new automation |
| --- | --- | --- |
| Existing GitHub repository + CI | active | UNKNOWN |
| Existing Netlify static Archive | active / team plan reports Pro | UNKNOWN |
| Existing Supabase database | active | UNKNOWN |
| New Supabase visual Storage usage | not enabled | UNKNOWN |
| ChatGPT image generation | available as a product capability, unattended bridge not yet proven | NOT YET CLASSIFIED FOR AUTOMATION |
| Paid image/API provider | disabled | PAID / BLOCKED |

Rule:

> `UNKNOWN` is not treated as free.

No new cost-bearing feature may be enabled until its incremental cost is verified or the user explicitly approves it.

## 8. Architecture conclusion from Step 1

The smallest safe next implementation is **not** a new service.

Step 2 should add a repository-side, deterministic Publication Batch + Visual Point dry-run layer that:

- reads frozen PLAYER_SAFE source metadata
- produces stable batch/candidate identifiers
- is idempotent
- enforces the cost guard
- performs no image generation
- performs no Supabase write
- performs no Netlify deploy
- performs no scheduler activation

Only after that contract is tested should persistence or scheduling be connected.

## 9. Current blockers / deliberate boundaries

Not blockers for text automation:

- no dedicated visual Storage bucket yet
- image generation bridge not proven
- 04:30 scheduler currently disabled

These simply mean text/graph/visual-candidate work must remain decoupled from image production.

## 10. Step 1 verdict

Foundation and current-state audit are complete.

Safe to proceed to Step 2:

> Publication Batch + cost guard + deterministic dry-run engine.

No gameplay behavior, Canon, RAW content, Supabase data, Netlify production configuration, or scheduler state was changed during this audit.
