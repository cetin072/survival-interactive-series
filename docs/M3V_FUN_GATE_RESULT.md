# M3-V Fun Gate Result

Status: **FAIL — runtime AI role is required for fun parity**

## User playtest findings
- Zero-AI state/validator/world simulation works, but compound/free-form autonomous actions cannot be understood or answered with sufficient context.
- This causes a substantial drop in fun compared with the ChatGPT GM playtests.
- Mobile compound-action input incorrectly forced a numeric keypad, removing normal spacing/text entry.
- FAMILY panel should show age and sex beside each character name.

## Decision
M3-V successfully validated the boundary of a pure rules-only runtime.

Keep:
- Live State
- Validator / Action Queue
- Seeded RNG
- World Director
- Family Decision Engine
- local/static fallback

Do not continue toward a fully Zero-AI game as the primary experience.

Next architecture work should preserve the deterministic engine and reintroduce a runtime AI layer where it has the highest value, especially:
1. compound/free-form player intent interpretation,
2. context-aware response/replanning for unexpected actions,
3. adaptive family/world reaction where deterministic rules alone feel mechanical.

The engine remains authoritative for state commits: AI proposes/interprets; Validator/Action Queue commits.

## Immediate UI fixes in PR #14
- compound action field uses normal text keyboard instead of numeric-only mobile keypad,
- FAMILY panel displays Canon age/sex metadata.

No runtime AI provider is selected by this document. Provider/cost/privacy/fallback are a separate architecture decision.
