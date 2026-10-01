# Archive 2.0 follow-up queue

The Automation C human-review loop and Operator Supabase connection policy are on `main`. The batched Production workflow now also runs the prepared smoke validation after it verifies the exact release deploy and marker.

## Deferred

- Generalize `ExplorerView(chronicleId)` through a Chronicle graph registry. The current Explorer remains C03-AFTERFALL-specific.
- Integrate Automation A/B publication candidates into the Knowledge review queue. This change validates the Automation C flow only.
- Consider a restricted worker credential in a separate security change. The current service-role key remains a GitHub Secret and is never sent to browser code.

## Production smoke contract

The smoke runs only after the existing two-day batch creates and verifies a release-marker commit. Ordinary `main` merges remain Preview-only. It checks the Hub, C01, C02, C03 AFTERFALL, Knowledge, `/operator/`, the exact deploy metadata SHA, the release marker, Operator `noindex`, CSP, and the compiled Supabase project origin. Operator login remains a one-time manual Production checklist item; the automated smoke never handles a password.
