# BAG-SIDE-01 Stage 1/2 — PWA + Android local reminder handoff

## Scope and source provenance

Base: PR #516 `feat/bag-side-01-guided-catalog`, observed GitHub head `7837b3deca5e2db29775fcc327ff6864a7145b6f`.
Source reference: `cetin072/worklog-voice-pwa` latest default HEAD inspected at start: `23d525b29aa5cbad983f6934a7f41140689c5487`.
Reused code is explicitly requested by the owner of both repositories; no third-party license is invented for Worklog code. Capacitor packages retain their published MIT license metadata in locked dependencies. The source repository is a reference only; it is not modified or linked at runtime.

A = pure reusable logic, B = adapt BAG contract, C = auth/Notion/Supabase dependency, D = Expo/OS dependency, E = unnecessary for BAG.

| Actually inspected Worklog source | Classification and disposition |
| --- | --- |
| `public/sw.js` | A: atomic install and scoped click target pattern. B: `/bag-lab/` asset allowlist, BAG cache prefix, SHA-256 complete immutable cohort, opt-in update. E: root interception, all-cache deletion and Push handler intentionally excluded. |
| `public/manifest.webmanifest` | A: Korean name, standalone and real PNG icon contract. B: BAG name/id/start_url/scope/colors/icons; no Worklog icon/brand copied. |
| `public/notifications.js` | A: capability/permission status, user-gesture opt-in, SW test notification. B: exact BAG registration scope, BAG icon/tag/target. C/E: authenticated subscription/VAPID/server Push and account recovery excluded. |
| `public/index.html` | A: manifest/icon/theme linkage. B: minimal `alpha.html` links and More settings. C/E: auth/loading/voice/briefing UI not transplanted. |
| `public/icons/` | B: inspected the versioned 192/512/maskable image assets; reuse image size/purpose conventions. BAG PNGs rasterize the existing `ic-bag` brand symbol; no new image generation service. |
| `mobile/package.json` | D: Expo/RN packages cannot run in static BAG. Existing web UI retained inside Capacitor; no second React Native screen. |
| `mobile/app.json` | D/B: Android permissions/identity contract inspected. Separate `com.cetin072.survivalbag`, BAG channel/native store. No Worklog package, voice permissions, scheme or credentials. |
| `mobile/src/features/schedule/local-notifications.ts` | A: injected permission/list/schedule/cancel boundary and one operation owner. D: Expo driver replaced with minimal Capacitor adapter. B: integer OS IDs carry durable BAG string identifier/owner/item/date/time metadata. |
| `mobile/src/features/schedule/schedule-reminder-service.ts` | **A: actual executable state machine reused**, type-stripped, namespace/brand substitutions. New read-only pending-intent accessor allows authoritative BAG reconciliation before replay. No alternate schedule engine. |
| `mobile/src/features/schedule/schedule-reminder-coordinator.ts` | A: coordinator filters authoritative records, cancels invalid/deleted records and recovers. B: BAG item+date grouped slots replace UUID Schedule records. C/E: server briefing and Calendar cleanup excluded. |
| `mobile/src/features/schedule/schedule-reminder-post-save.ts` | A: synchronize only after committed save. B: reread local IndexedDB snapshot instead of server-returned schedules. Save failure leaves reservations untouched; OS failure is reported separately after a successful inventory commit. C: Supabase cancellation projection excluded. |
| `mobile/src/features/settings/reminder-settings.tsx` | A: separate permission/pending/count/error states and diagnostics. D: RN UI replaced by existing More tab HTML. Exact alarm access is unnecessary for day-based maintenance; inexact Android alarms used. |
| `mobile/plugins/with-worklog-boot-reminder-recovery.js` | A: replay the same OS store/identifiers on boot/unlock/update. D: ExpoSchedulingDelegate cannot be copied to Capacitor. B: BAG receiver uses Capacitor native store, preserves local date/time, discards past reservations. No independent OS scheduling store. |
| `docs/ROADMAP_STAGE4_NEVER_MISS.md` | A: in-app resurface distinct from Push/OS reminders, opt-in default off, collapsed diagnostics. E: WorkRecord attention contract not imported. |
| `docs/notification-server-push.md` | C/E: authenticated server Web Push/VAPID/subscriptions are excluded. No Worklog secrets, identities, account or backend reused. |
| `.github/workflows/firebase-test-lab.yml` | A/D: locked APK build + physical-target verification + Test Lab artifact pattern reusable. C: original GCP project/WIF/service account are not authorized BAG identities and are not copied. Physical Test Lab execution requires separately authorized BAG configuration. |

Reused tests: `tests/mobile-reminders.runtime.test.mjs` + pure `mobile/src/platform/durable-storage.ts` test harness, now under `archive/scripts/lib/bag-side-reused-reminders.test.mjs` and `fixtures/bag-reminders/`. Native boundaries are fakes; they validate crash/ack/storage behavior, **not Android delivery**.

## Implemented behavior

### Stage 1

`alpha.html` links `manifest.webmanifest` and PNG icons. `pwa.mjs` registers `sw.js` only at `/bag-lab/`; `pwa-assets.js` is a content-addressed asset inventory generated by `archive/scripts/build-bag-pwa.mjs`. No root service worker or Service-Worker-Allowed header is introduced. Generated `alpha-shell.txt` contains the exact canonical `alpha.html` bytes: Netlify Preview injects a toolbar into served HTML, so the worker verifies this plain-text source and caches it as HTML while preserving response security headers. This avoids changing global toolbar/deploy policy or relaxing integrity checks.

The worker checks every required HTML/CSS/module/manifest/icon byte before publishing a new cache. It serves one immutable version of the shell, including online requests; it never independently refreshes a JS module inside an old cohort. A failed/mixed install leaves the prior complete version intact. A complete update waits for user consent. Registration checks for updates at startup and after online recovery. Existing open editing dialogs are not force-reloaded. Earlier BAG cache versions are retained to protect old clients; storage quota cleanup is a later maintenance consideration. Other cache namespaces and inventory IndexedDB are never erased.

Inventory DB `bag-side-01-alpha`, schema 1 and portable JSON v1 are unchanged. Reminder metadata lives in a separate `bag-side-01-reminders` DB and is not silently added to the backup format. Reminder preferences must be explicitly enabled again on a new origin/device; after JSON restore current BAG data is reconciled. Preview, QA, production origins, and Android `https://bag.local` have separate storage; migration requires explicit JSON export/import.

### Stage 2

- **A: in-app resurface** shows due/missed physical batches and links to the existing item screen. No overdue date is advanced.
- **B: web/PWA** checks actual support and permission and can send an immediate test notification. It cannot reserve months-later closed-app alarms, and it displays reservation count 0. No native time/settings options are shown in web environments.
- **C: Android** has a separate locked Capacitor shell in `bag-mobile/`, bundling the existing BAG screen. The native adapter handles permission, channel, requested IDs, list/schedule/cancel/test/settings and item click. Reused durable service verifies native acknowledgements and recovers pending intent state. Reservations are explicitly labeled **시험 중** until physical delivery evidence exists.

`reminder-plan.mjs` uses the existing `nextAction` on each physical batch; it does not introduce another expiry/stock evaluator. Quantity 0 and unpacked preset drafts are excluded. Item+date grouping deduplicates matching batches/inspection+rotation dates, retaining each original batch ID and date. Product marked date is always user data; generated inspection/lead dates are management suggestions, not safety dates. Default time is 09:00 local device time, configurable in Android. Past and nonexistent DST clock times stay in-app as needs-attention.

The coordinator serializes whole committed-source reread + native OS mutation using Web Locks across owners/tabs. Invalid/deleted/changed pending intents are superseded before recovery. Changing a date/time/title cancels existing reservation before replacement. Save failure does not run notification mutations. A post-commit OS error leaves the successful inventory write intact and reports a notification error.

Android uses inexact local alarms, **no exact-alarm privilege**. `BagReminderRecovery` replaces the stock Capacitor boot receiver because the latter advances missed alerts by 15 seconds; BAG forbids that policy. It replays the same Capacitor notification store on boot/unlock/package update/time/timezone changes, schedules future wall-clock dates only, and never resurrects a triggered one-shot. Normal task dismissal differs from Android force-stop. Notification channels, Doze, battery policy and force-stop can suppress/delay delivery; exact timing is not promised.

## Validation commands and gates

From repo root:

```sh
node archive/scripts/build-bag-pwa.mjs --check
node --test archive/scripts/lib/bag-side-*.test.mjs
python archive/scripts/check-bag-side-demo.py
python archive/scripts/check-bag-side-alpha.py
python archive/scripts/check-bag-side-presets.py
python archive/scripts/check-bag-side-pwa.py
```

The PWA gate launches the full Chromium `channel=chromium` rather than the lightweight headless-shell, whose notification permission behavior differs from Android/desktop Chrome. It uses a persistent context for installability/storage and separate explicit disposable contexts for denied/granted notification tests (older Chromium cannot address its persistent default context through Browser.setPermission). It verifies Chromium installability criteria, real PNG dimensions, exact SW scope, online first run, offline editing/registration/reload, persistent process-close offline cold start, failed mixed-update survival, complete update, exact inventory/JSON retention and origin/path isolation. Local synthetic fixtures alone simulate server version transitions. Remote testing is restricted to an exact-head **per-PR** Preview; `qa-bag-side` and production are not test targets for this task.

For machines with system Chromium, `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` is supported by the Alpha/PWA runners. Existing Demo/Preset tests remain unchanged. In this cloud image their launch methods are configured externally by a temporary runner to use the same installed Chromium.

Native build (JDK 21, SDK 36, build-tools 35.0.0 and 36.0.0):

```sh
cd bag-mobile
npm ci
npm run build:debug
```

`.github/workflows/bag-side-android.yml` builds a debug APK and runs native wall-clock policy tests. It does not sign/release/deploy production or invoke billable physical tests automatically. The workflow follows Worklog's locked-build/artifact pattern, with an isolated package.

**Physical QA remains an explicit Stage 2 gate.** Required synthetic-device evidence: permission denied/granted/channel blocked; future schedule/dedup; date/time edits; quantity 0; item/batch deletion; JSON restore; storage failure; reopen; ordinary task dismissal; reboot/unlock/update; clock/timezone changes; tap-to-item. Separately document force-stop, Doze and OEM restrictions. A Robo app-touch run alone is not proof of closed-app scheduled delivery or reboot recovery. Original Worklog Test Lab WIF/project/service account must not be borrowed. Repository variable/secret-list access was denied in this session, so Test Lab readiness is unconfirmed.

## Stage 3/4 integration and 1.0 blockers

This branch does not change Knowledge mapping/content, landing/home structure, A-Core/A-Wiki/B/C, Bunker OS, Canon/RAW, Supabase operations or production release policies. No `qa-bag-side` update or main merge.

On the dedicated 1.0 integration branch:
1. Merge each reviewed Stage 3/4 result without overwriting their mappings/pages. Only necessary Alpha linkage is changed here.
2. After merging any `bag-lab` module/HTML/CSS change, rerun `node archive/scripts/build-bag-pwa.mjs`; inspect new complete asset inventory, run offline update/data tests again. Cache new imported modules as part of the same cohort. Landing/knowledge remain outside SW ownership and offline promise.
3. Rebuild Android packaged web assets (`npm run sync`) from the integrated sources. Keep native package/hostname/channel stable to preserve app storage across APK upgrades.
4. Confirm approved final origin and explicit JSON migration plan before real inventory use. Service worker activation and inventory data migration are separate actions.
5. Android physical installation/delivery/reboot gate and Android Chrome actual home-screen installation must be recorded before platform-specific PASS claims. If unavailable, keep Stage 2 PARTIAL and decide release feature scope explicitly.

Current machine checks, CI, actual Preview SHA and device evidence are reported in the Draft PR. PR base was changed from #516 to main because the existing Netlify integration did not create a Preview for that development-base PR. The work branch still derives from #516; review its incremental diff against that branch, and do not merge this stacked prerequisite diff into main as an independent release. No deployment or physical test success is implied by this document.
