# AFTERFALL Illustration Image Prompt Isolation v1

## Purpose

Keep scheduled-worker instructions and image-generation content separate. Selection, retry policy, provider choice, storage, registry, reporting, and release details stay in the operating lane. The image provider accepts only a deterministic prompt contract compiled from a READY point's public visual brief.

## Flow

```text
Scheduler
→ Candidate Selection
→ Image Prompt Compiler
→ Generation Provider
→ Quality Gate
→ Trusted Handoff
→ Storage / Registry / Publication
```

`archive/scripts/lib/illustration-image-prompt.mjs` exports `compileIllustrationImagePrompt(point)` and `validateIllustrationImagePrompt(contract)`. The compiler reads only the point identity and `brief.subject`, `brief.canon_facts`, `brief.art_direction`, and `brief.safeguards`. It emits `illustration-image-prompt-v1`:

```json
{
  "contract_version": "illustration-image-prompt-v1",
  "point_id": "point-…",
  "generation_key": "generation-…",
  "subject_id": "…",
  "positive_prompt": "…",
  "negative_prompt": "…",
  "review_checklist": ["…"]
}
```

The compiler rejects unknown or malformed briefs and any supplied visual text containing operating-context terms. The provider validates the exact contract keys and rejects extra fields. Prompt contents therefore remain unchanged across `native_chatgpt`, `api_openai`, and `manual_import`; provider status or operational metadata never modifies the prompt.

## Visual safeguards

Every negative prompt includes the default exclusions for text, readable writing, labels, numbers, UI, interfaces, dashboards, infographics, tables, report layouts, poster layouts, and watermarks. Existing brief `avoid` entries and visual safeguards are included. The fixed dashboard and report-layout phrases are visual-only exclusions; the same words supplied from a brief are rejected as contamination.

The Taehoon regression checks his approved appearance, single-subject master portrait, simple non-identifying background, and `AFTERFALL_ARCHIVE_V1` painterly semi-realistic style. Unsupported military details, injuries, tattoos, accessories, occupation, other people, and identifiable places are negative constraints. The Baekun regression retains its vegetation, weather, sign, security, and layout exclusions without modifying its accepted identity or image state.

## Provider boundary

`illustration-generation-provider.mjs` accepts the compiled prompt contract as its generation input. Manual import metadata is passed separately and cannot be mistaken for prompt text. The normal generation result contract and common quality, trusted handoff, storage, registry, and publication paths remain unchanged.

No image generation, paid API call, Storage write, registry write, SITE_ASSETS change, or production deployment is performed by the compiler or its tests.
