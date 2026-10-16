# 《생존일기》 Web / Engine Responsibility v1

## Status
**PLANNING BASELINE — before visual expansion**

## Core rule

> AI proposes story, character judgement, world movement and bounded intent.  
> The web engine owns facts, rules, calculations, persistence, validation and final commit.

The browser must never rely on the AI as the final source of truth for time, location, inventory, ownership, route status, base state, vehicle state, family state, save/load or irreversible game rules.

---

## 1. What the web engine already owns

Current LiveState already has first-class fields for:
- clock / day / date / time / phase
- family party members and locations
- vehicles
- bases
- resources
- institutions
- known routes
- active / completed actions
- public world state
- last change
- renderer flags

Existing deterministic transitions already cover:
- time advance
- party movement
- vehicle movement
- resource band change
- base capability addition

Existing runtime also has:
- public checkpoint contract
- Validator / Action Queue / authoritative commit
- serialization / save-state helpers
- duplicate in-flight request protection
- player-input logging only after successful commit
- story/engine time-location synchronization guard

---

## 2. What should move into deterministic web/engine logic next

### A. Family state facts
The engine should own and mutate:
- location
- who is together with whom
- broad physical condition band
- availability / mobility status
- communication reachability
- current role / task

AI may narrate and propose these changes, but the engine validates and commits them.

### B. Vehicle facts
The engine should own:
- current location
- current operator
- available / unavailable / damaged / blocked status
- passenger membership
- basic fuel / range band when introduced

A vehicle must not be in a different location from its active operator/passengers without a valid transition.

### C. Route / movement facts
The engine should own:
- known routes
- open / slow / blocked / unknown route status
- movement origin and destination
- elapsed time for travel
- whether a requested move is feasible

AI can introduce a road closure or suggest a detour as a public-world event, but the final route state is committed by the engine.

### D. Institution / external-system facts
The engine should own public statuses such as:
- hospital operating / emergency mode / inaccessible
- school or academy open / early dismissal / closed
- company normal / early leave / stopped
- shelter open / full / unavailable
- utilities available / degraded / offline

AI narrates how the player learns this; the engine stores the fact.

### E. Resource / survival facts
The engine should gradually own:
- food
- water
- electricity
- communications
- fuel
- medicine
- shelter / warmth / security bands

Initial UI may use simple qualitative bands rather than precise numbers. The engine, not the AI, decides legal state changes and prevents impossible consumption or duplication.

### F. Base facts and growth
The engine should own:
- base status
- capabilities
- installed systems
- known limitations
- upgrades / damage / repair
- which family members are present

Base growth is a long-term reward system and must be deterministic enough to support future graphics.

### G. Time and routine compression
The engine should own:
- elapsed minutes/hours/days
- routine time jumps
- day changes
- travel time bounds

AI decides what is worth dramatizing; the engine decides the actual clock change.

### H. Choice Gate
The engine/server should reject or filter choices that are only micro-execution when the strategic direction is already known.

Examples normally handled without a new player choice:
- call again
- send a status update
- keep driving toward the already selected destination
- park nearby
- wait briefly
- choose a normal safe detour
- tell a family member to stay where previously agreed

Player choice should return for:
- meaningful family priority conflicts
- entering or abandoning a dangerous area
- abandoning a base / vehicle / major asset
- scarce-resource allocation
- helping outsiders at meaningful family risk
- irreversible strategic changes
- morally or legally consequential decisions

Goal: one player choice should normally allow **4–6 meaningful story beats** before the next Choice Gate.

---

## 3. What should remain AI-led

AI GM should primarily own:
- prose and scene composition
- dialogue
- character voice
- family autonomy and disagreement
- interpretation of ambiguous natural-language intent
- new public events and complications
- emotionally meaningful reactions
- selection of which deterministic facts deserve dramatic attention
- next strategic dilemma proposal

AI must not be the authoritative calculator or database.

---

## 4. Data fields that should be added before major visual expansion

Priority 1:
- party member condition / availability / contactability
- party `with` synchronization helpers
- vehicle passenger / operator synchronization
- route status transition helpers
- institution status transition helper
- base status transition helper
- public signal/event ledger

Priority 2:
- qualitative resource consumption / gain transitions
- base damage / repair / upgrade transitions
- vehicle condition / fuel bands
- family current task / role

Priority 3:
- deeper survival meters if later required by gameplay evidence
- exact numeric simulation only where qualitative bands are insufficient

Do not introduce large numeric survival systems merely because another survival game has them.

---

## 5. Visual UI dependency rule

Visual expansion should consume engine state rather than invent new state.

Recommended future main screen:
- top: DAY / time / location / danger
- story: dominant reading area
- optional key scene illustration
- bottom: strategic choices + free action
- secondary drawers/tabs: family / base / vehicle / resources / event log

Visual references should inform hierarchy and mood, not copy another game's IP, artwork, characters or exact interface.

---

## 6. Near-term implementation order

1. Expand deterministic transition helpers for family / vehicle / route / institution / base state.
2. Add consistency tests for those transitions.
3. Connect bounded AI state_hints to the expanded transitions only where safe.
4. Strengthen Choice Gate filtering using engine facts.
5. Confirm save/load contains the expanded authoritative state.
6. Then build the next visual shell from these stable fields.
7. After AI spending limit is restored, run only a small paid live smoke and continue model cost-quality benchmarking.

---

## Non-goals for this phase

- no Production deployment
- no PR #67 merge
- no large graphics system yet
- no exact hunger/thirst simulation without gameplay need
- no AI-authored final state
- no RAW transcript as runtime input
- no Hidden World Seed exposure
