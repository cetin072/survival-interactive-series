# 《생존일기》 UI Visual Direction v1

## Status

**REFERENCE DIRECTION ONLY — implementation remains frozen until GM stability / model-quality baseline is fixed.**

This document records the visual references shared during the Story Benchmark phase so the direction is not lost while backend/story work continues.

## 1. Product identity

The target is not a conventional RPG HUD and not a plain web novel.

> **현대 한국 생존 시뮬레이션 + MUD + 인터랙티브 드라마 + 웹소설형 관전 경험**

The player should be able to make important decisions, but much of the pleasure should come from watching the family and world continue to move after that decision.

Therefore the primary screen is a **reading / scene screen**, not a management dashboard.

## 2. Reference A — dark shelter-management story UI

The shared reference uses a highly restrained survival-management screen:
- near-black background
- large readable Korean story text
- very small number of survival indicators at the top
- visible day count
- story occupies most of the screen
- `다음` or decisions appear only after a reading beat
- survivor gallery is a separate screen
- event records / characters are separated from the story view
- food / mental / defense style resources are summarized with large simple numerals
- low-color / monochrome presentation reinforces disaster tone

### What 《생존일기》 should borrow

- **story is visually dominant**
- top HUD should contain only information needed right now
- day/time/location/risk should be readable in one glance
- management/detail information should move to separate panels or tabs
- choices should feel like a deliberate break in the story, not a permanent form UI
- muted palette is compatible with a realistic Korean disaster tone

### What not to copy

- do not reduce 《생존일기》 to three abstract resources only
- do not make every turn a short fixed card
- do not make family members interchangeable management units
- do not hide the realistic world state merely to imitate minimalism

## 3. Reference B — pixel-art narrative RPG UI

The second shared reference shows another useful structure:
- illustrated character cards / portraits
- separate character roster
- story text combined with an occasional scene illustration
- parchment/card-like long-form reading screen
- explicit dramatic decisions after a substantial story passage
- visualized character traits / status outside the main prose

### What 《생존일기》 should borrow

- family portraits/cards can make family identity much stronger
- important turning points can receive a single illustration
- character details should be inspectable without occupying the main reading screen
- major decisions can receive stronger visual framing than routine actions

### What not to copy

- fantasy ornamentation
- dense RPG stat sheets on the story screen
- permanent pixel-art requirement
- gamified attributes that replace realistic state

《생존일기》 can choose a realistic / graphic-novel / restrained illustration style later. The information architecture matters more than copying the art style.

## 4. Recommended combined direction

```text
┌─────────────────────────────────────┐
│ DAY 03   21:40   외곽주택   ⚠ 위험 │
│ 가족 3/4 · 전력 부족 · 차량 1      │  ← compact, optional second row
├─────────────────────────────────────┤
│                                     │
│ 21:40 — 불빛이 사라진 마을         │
│                                     │
│ [important-scene illustration only] │
│                                     │
│ MUD / web-novel narrative            │
│                                     │
│ 서윤(아내): “여보, ...”             │
│                                     │
│ > [긴급재난문자]                     │
│ > ...                                │
│                                     │
│ family/world continue autonomously   │
│ several meaningful beats             │
│                                     │
│ ### 현재 변화                        │
│ - ...                                │
│                                     │
├─────────────────────────────────────┤
│ 정말 중요한 판단점일 때만           │
│                                     │
│ 1. ...                               │
│ 2. ...                               │
│ 3. ...                               │
│                                     │
│ [직접 행동 / later: microphone]      │
└─────────────────────────────────────┘
```

## 5. Main story-screen hierarchy

Priority:

1. **story / scene**
2. current danger and location
3. meaningful decision gate
4. free action
5. compact family / resource indicators
6. secondary management UI

Never allow a management panel to push the current story below the first mobile viewport.

## 6. Compact top HUD

Long-term target, not immediate implementation:

Primary row:
- DAY
- time
- current location
- visible risk

Optional compact secondary state:
- family accounted for e.g. `3/4`
- base status
- power / food band only when relevant
- vehicle availability when relevant

Do not permanently show every resource.

A status that has no relevance to the current scene should stay in the management panel.

## 7. Family / base / resource screens

Secondary screens can eventually include:

### Family
- portrait
- name / relationship
- current location
- visible condition
- current role / what they are doing
- important relationship tension / trust only if player-visible

### Base
- apartment / outer house / future bases
- visible facilities
- power / water / food / security
- growth upgrades
- damage / current work

### Vehicles / resources
- vehicle location/status/operator
- important inventory
- resource bands

### Event record
- important decisions
- major family conflicts
- disaster escalation
- base-growth milestones

This resembles the useful separation seen in the survivor/event-reference screens without turning the family into NPC inventory.

## 8. Illustration policy

Illustrations are **punctuation, not wallpaper**.

Use for:
- disaster reveal
- first arrival at a major location
- family reunion/separation
- base transformation
- serious injury/loss
- first appearance of an important recurring person
- season climax / aftermath

Do not generate a new image every turn.

The story must remain fully playable when no illustration exists.

## 9. Choice presentation

The UI should reflect the new GM rhythm.

Bad:
```text
call again
check road again
tell wife again
continue driving
```

Good:
```text
risk entering the outer district for father
abandon that route and regroup in the city
send son separately and continue alone
change the family priority plan entirely
```

Choices should appear after substantial autonomous progression and should look visually heavier than routine text.

## 10. Reading / watching mode

The product should support the feeling of watching a compelling game session.

Desired rhythm:

```text
player sets direction
→ story runs for a while
→ family acts
→ outside world acts
→ consequences unfold
→ player watches/reads
→ major new dilemma
→ player intervenes again
```

This is why long turns and lower choice frequency are not just prose preferences; they are core UX.

## 11. Voice future direction

After text-GM quality and cost are stable:

### TTS
- `읽어주기` for current scene / whole new scene
- first prototype can use device/browser TTS to avoid model cost
- premium voice provider can be evaluated later

### Voice input
- microphone → speech-to-text → existing choice/free-action parser
- examples: `3번`, `1번 하고 2번`, or a natural free action
- voice remains an alternate input, not the only control path

Long-term interaction target:

> **이야기를 듣는다 → 중요한 순간에 말로 결정한다 → 다시 이야기를 듣는다.**

## 12. Current freeze

Do not start a broad visual redesign yet.

Before visual implementation resumes:
1. stable GM transport
2. Pro-level story-quality baseline
3. cheaper-model benchmark
4. accepted model/runtime cost

Then this document becomes the visual implementation baseline.

## Decision

Keep the current MUD grammar. Later evolve its visual shell toward:

> **dark restrained survival HUD + character-card depth + occasional scene art + story-first mobile reading**

rather than replacing the MUD/story structure with a conventional RPG interface.
