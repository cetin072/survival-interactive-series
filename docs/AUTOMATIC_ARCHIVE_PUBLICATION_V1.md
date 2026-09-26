# Automatic Archive Publication v1

Status: FOUNDATION / ZERO-COST-FIRST
Owner goal: the player only plays; Archive text, visual candidates, and publication accumulate without routine manual publishing work.

## 1. Existing contracts retained

This foundation extends, not replaces:

- `docs/ARCHIVE_SYNC_POLICY.md`
- `docs/ILLUSTRATION_PIPELINE.md`
- `docs/IP_ASSET_PIPELINE.md`
- existing Reader Edition / RAW Vault / World Explorer
- AFTERFALL append-only RAW capture
- AFTERFALL visual archive contract on `worldline/afterfall-rpg`

The Archive remains a publication layer, not the gameplay engine.

## 2. Game-first boundary

The live gameplay path stays lightweight:

```
PLAYER -> GM -> runtime/RAW persistence -> public GM response
```

The following are publication work and must not block a turn:

- Reader rebuild
- Archive reconciliation
- entity/relation reconciliation
- visual candidate detection
- visual brief creation
- image generation
- image storage
- site publication

Archive failure is never gameplay failure.

## 3. Publication Batch

A Publication Batch freezes one source snapshot so text, graph, and visuals are derived from the same Canon boundary.

Minimum contract:

- batch_id
- chronicle_id
- worldline_id
- season_id
- source_save_version
- source_game_time
- source_checkpoint
- source_range / source refs
- created_at
- text_status
- graph_status
- visual_status
- publish_status
- error_summary

Stable source identity must make a rerun idempotent. Reprocessing the same batch must update/no-op rather than duplicate Reader chapters, graph records, or visual candidates.

V1 must prefer an existing table/metadata model if it can represent this safely. A new database table is not justified until the existing contracts are audited.

## 4. Publication layers

### RAW
Immutable exact PLAYER_SAFE USER/GM public source. Missing dialogue is never reconstructed.

### Reader
Rebuildable edited reading layer. It may remove UI/meta/choice gates and organize chapters, but may not invent dialogue, events, feelings, motives, or future facts.

### Encyclopedia / Graph
Current PLAYER_SAFE Canon facts and relationships for Characters, Locations, Events, Factions, Maps, Chronicles, and Seasons.

### Visual
Canon-derived visual candidates and generated assets. Visual failure must not block text publication.

## 5. Visual Point

A Visual Point means: “this is worth representing visually later.”

Initial categories:

- CHARACTER
- LOCATION
- EVENT
- ENVIRONMENT
- MAP

Detection happens from already persisted scenes/events/characters/checkpoints in batch work, not by adding image work to the live turn.

Candidate examples:

- CHARACTER: PLAYER / CORE / recurring MAJOR with sufficient appearance anchor
- LOCATION: stable recurring base/location with Canon role
- EVENT: irreversible loss, major rescue, faction change, disaster turn, season climax
- ENVIRONMENT: representative atmosphere such as red horizon, flood, snow, thaw, reclaimed ruins
- MAP: stable settlement/route model or season-end topology

V1 does not create an image for every scene.

## 6. Visual batch limits

Default planning limits:

- max 3 generation attempts per batch
- max 6 generated assets per day
- max 2 retries per asset

These are configuration values, not hard narrative rules.

Existing 04:30 KST Archive reconciliation remains the primary publication cadence. A second daily visual batch may be added later only after a zero-additional-cost scheduler path is verified.

## 7. Cost guard

Default policy:

```
COST_MODE=ZERO_COST_ONLY
ALLOW_PAID_GENERATION=false
```

Provider cost classes:

- INCLUDED
- UNKNOWN
- PAID

When ZERO_COST_ONLY is active:

- INCLUDED may run when its actual product path is verified.
- UNKNOWN must stop at an approval boundary.
- PAID must stop at an approval boundary.

No API key, paid image API, paid worker, paid queue, or usage-based service is enabled merely to complete automation.

## 8. Image-generation boundary

The desired pipeline is:

```
Visual Point -> Visual Brief -> Batch Queue -> ChatGPT image generation -> asset storage -> Archive
```

However, V1 must not claim unattended ChatGPT image generation until a real supported path is demonstrated.

Until then, the safe automatic boundary is:

```
Visual Point -> Visual Brief -> READY_FOR_CHATGPT_GENERATION
```

If free/included unattended generation cannot be proven, record the product boundary and continue automating the rest of the publication pipeline.

## 9. Shared snapshot rule

Reader, graph, and visual briefs from one batch must use the same publication snapshot.

They must not silently mix:

- a newer Character state with an older Reader chapter
- future Canon with older public text
- hidden GM state with PLAYER_SAFE publication
- different season/save anchors

## 10. Visibility

Existing visibility semantics are retained:

- PUBLIC_ARCHIVE
- PLAYER_ARCHIVE
- CORE_PRIVATE

Public publication must reject PLAYER_ARCHIVE and CORE_PRIVATE assets/data.

Security is enforced in data/API/publication generation, not only by hiding UI elements.

## 11. AFTERFALL visual direction

Style id: `AFTERFALL_ARCHIVE_V1`

Core direction:

- painterly, non-photorealistic
- realistic human proportions
- contemporary Korean environments
- quiet cinematic composition
- low-to-medium saturation
- atmospheric depth and negative space
- “small human in a beautiful, vast damaged world”

Mood variants:

- QUIET_DECAY
- VAST_WORLD
- RED_HORIZON
- QUIET_FANTASY

QUIET_FANTASY borrows light, composition, softness, and atmosphere only. It does not introduce magic or medieval fantasy objects.

## 12. Map rule

Map topology is deterministic.

AI must not decide:

- node position
- route topology
- distance
- direction
- hidden-route disclosure

AI may only provide decorative/atmospheric rendering layers.

Public maps must not expose hidden fallback nodes, concealed routes, or CORE-only information.

## 13. Publication cadence

Retain the current rule:

- per turn: Supabase RAW only
- important irreversible branch: optional early promotion
- daily 04:30 KST: normal Archive reconciliation/publication
- season end: full closeout

Visual generation is a separate batch concern and may lag behind text publication.

Valid state:

```
TEXT=PUBLISHED
GRAPH=PUBLISHED
VISUAL=WAITING
```

An image failure must not hold back a verified Reader chapter.

## 14. First implementation slices

### Slice A — Foundation
- this contract
- current-state/cost audit
- Publication Batch pure-data contract
- Visual Point pure-data contract
- cost guard
- deterministic dry-run tests

No Supabase write and no image call.

### Slice B — Text publication automation
- reconcile new verified RAW
- rebuild Reader
- reconcile PLAYER_SAFE graph
- batch publication checks
- reuse current CI/Netlify path

### Slice C — Visual queue
- candidate compiler
- provider-neutral visual brief
- batch limits/retry
- product-boundary-safe ChatGPT bridge if actually supported

### Slice D — asset delivery
- storage only after quota/cost/security confirmation
- public visual publication
- Archive rendering

## 15. Acceptance invariants

V1 must preserve:

- RAW immutability
- Chronicle isolation
- PLAYER_SAFE publication
- no future/GM-only leakage
- idempotent batch reruns
- no duplicate visual points
- archive errors never block gameplay
- UNKNOWN/PAID provider hard-stop under ZERO_COST_ONLY
- Reader provenance remains auditable
- current deterministic Reader checks remain green

## 16. Current deliberate non-goals

Do not add in this foundation:

- paid APIs
- image generation calls
- Supabase Storage bucket
- production scheduler changes
- LoRA/training
- video generation
- admin CMS
- large frontend redesign
- microservice/queue infrastructure

The next step after this foundation is a read-only capability and cost audit, followed by the smallest testable Publication Batch / Visual Point implementation.
