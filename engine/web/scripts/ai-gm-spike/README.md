# AI GM Spike 01 — Korean action benchmark

This local-only spike measures whether configured OpenRouter models can turn Korean free-form survival-game input into strict, ordered engine-safe action structures. It does not call the web UI, add `/api/gm`, mutate game state, or deploy anything.

## Run a bounded benchmark

From `engine/web`, set a local environment variable and run a deliberately small smoke pass first:

```powershell
$env:OPENROUTER_API_KEY = 'your-key'
npm run ai-gm:compare -- --max-models=1 --max-cases=2
```

Run all configured models and cases only after reviewing the expected spend:

```powershell
npm run ai-gm:compare
```

Select exact models or fixtures to control cost:

```powershell
npm run ai-gm:compare -- --model=qwen/qwen3.8-flash --case=simple-inspect-water,ambiguous-target --timeout-ms=15000
```

`OPENROUTER_API_KEY` is read only from the local environment. If it is absent, the command exits before a network request with a short setup message. Do not put a real key in `.env.example`, test fixtures, generated reports, or Vite/browser code.

## What is measured

For every configured model and Korean benchmark case, the script records schema validity, expected structural match, action count/order, ambiguity correctness, final-attempt latency, total request wall-clock time, per-attempt error/latency/response-shape observations, available token usage, retry count, and an unavailable-by-default cost field. It sends OpenRouter a strict, case-specific JSON Schema and `provider.require_parameters=true`; models that are missing from the live catalog or do not advertise structured output are recorded as failures without relaxing the schema.

The default model configuration intentionally has no durable dollar estimate. `models.json` carries the retrieval date and source note; replace it with a dated, sourced price config only when a current cost estimate is needed.

The command performs at most one retry for a transient HTTP/network or malformed-schema response, and each request has a bounded timeout. It checks OpenRouter's live model catalog before running cases, so a removed model ID or missing structured-output capability is visible in the report.

## Interpreter boundary and the conditional v0 stop bucket

This spike measures language interpretation, not physical-state validation. A linguistically clear action remains an action proposal even when the supplied state makes it impossible (for example, requesting a car that is elsewhere). The existing authoritative engine Validator, not this interpreter, rejects that proposal later.

`ambiguous=true` normally means a material linguistic reference cannot be resolved. It is a stop result: `actions` must be an empty array and an `ambiguityReason` is required. The current v0 action schema has no condition/deferred-intent field, so the conditional fixture temporarily uses this stop result as a **deferred stop bucket**. Its report record is marked `expectedDisposition: "deferred_condition"` so it is not interpreted as a linguistic-ambiguity result or as the final engine contract. A later integration contract may represent conditions separately; this spike does not define it.

## Outputs and fixture safety

Human-readable summaries and JSON reports are written to `generated/`, which is gitignored. JSON reports retain raw provider content only there for local diagnosis. Committed fixtures use synthetic IDs and contain no personal names, addresses, employer data, or secrets.

The constrained verbs reflect existing engine action concepts: movement, requests/calls, pickup/transfer, inspection, securing, waiting, and cancellation. They are a benchmark interpretation vocabulary only; this spike does not create a new engine state contract or execute queued actions.
