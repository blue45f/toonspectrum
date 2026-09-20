# Non-studio regression repair — 2026-09-20

Status: product and test repairs implemented; the complete local production-browser suite passed. This record does not assert a subsequent GitHub CI result or deployment.

## Failure attribution

The complete log from [Non-studio experience quality job 105993507296](https://github.com/blue45f/toonspectrum/actions/runs/35479103099/job/105993507296) reported 42 failed and 237 passed browser tests. The failures were not all caused by one overlay:

| Original failures | Concrete cause | Repair and retained evidence |
| --- | --- | --- |
| 33 | The first-visit `BetaOpenEventGate` remained open above normal page controls. | A common Playwright fixture closes the actual visible event button and waits for the modal to disappear. Four separate gate tests cover first exposure, keyboard dismissal, Escape, persisted dismissal, and proof that the journey fixture clicks the actual button. The product gate is unchanged. |
| 5 | Home assertions expected the removed `.cf-intent-film img`. | Assertions now check the current brand-film link and product-tour action; hero, bridge, production-journey imagery, responsive bounds and keyboard navigation checks remain. |
| 1 | The hero secondary action now opens the product tour. | Verify that current action and the separately rendered production sample-project link. |
| 1 | Recovery-copy assertions predated the explicit atomic apply/undo wording. | Verify the current apply and undo receipts, the applied plan status, and disappearance of the undo action after undo. |
| 1 | Recent-work viewport coverage read a retired checkpoint key. Further inspection found the sanitized recent manuscript URL also omitted the current exact-resume request. | Save a real pen stroke through the editor and read it back from the durable store; read current exact-resume metadata and restore the same canonical document, page, zoom and viewport. The product emits only the fixed `resume=latest` token, never a caller-provided token or room authority. |
| 1 | Exact-resume fixture seeded a compatibility-only localStorage manuscript and mocked an authenticated but inaccessible local document. The current manuscript source is OPFS/SQLite, with access and recovery decisions. | Seed through the shipped durable writer, read back both pages, and open a genuine guest local document. Require the actual page/zoom/selection restore event and UI receipt, then verify metadata survives returning to the library. The fixture seeds metadata only once, so navigation cannot mask persistence failures. |

After these changes the first whole local run passed 280 of 283 tests (the original 279 plus four new gate tests). The remaining probes identified two actual product boundaries:

- A local editor reports initial work hydration before asynchronous durable recovery is decided. Exact-resume could classify an absent target page as deleted and persist the empty initial page over its saved context. The host now waits for source hydration, recovery discovery/decision, and local document unlock before consuming or persisting exact-resume state. Hydrated remote read-only documents can still restore their view. The existing keyed document runtime remounts state for document/auth identity changes.
- The mobile search filter sheet was inside a route stacking context. The fixed site navigation intercepted its bottom `결과 보기` button despite the sheet's own z-index. The sheet and backdrop now render through a body portal. Real click, Escape, focus return, URL state and unmount scroll restoration are checked.

No test was skipped or removed. No forced click, gate suppression, increased timeout, reduced assertion threshold, production API permission bypass, or infrastructure change is part of the repair. Both affected workflow path filters include the common fixture; the non-studio workflow also includes the dedicated gate spec and search-explorer source/tests.

## Validation

Local environment: macOS ARM64, Node 24.16.0, Playwright 1.62.1 Chromium, production Vite preview on port 5209. The configured two browser workers and normal timeouts are retained. API outage fixtures deliberately return anonymous session success and other API 503 responses, or route-specific mocked responses. This is production browser UI/storage evidence, not a live authenticated backend or Linux CI claim.

- `pnpm run build`: PASS, including legal notices and static CSP postbuild checks, after all product changes. `pnpm run check:studio-bundle`: PASS (27 within baseline, 10 improved, zero regressed; separate reference telemetry is not a new runtime measurement).
- Four focused Vitest files: 23 tests PASS (exact-resume source authority, pending-recovery preservation, continuity URL sanitation, filter portal/focus/unmount).
- Changed TypeScript/TSX files: scoped ESLint PASS; `git diff --check` PASS. Both modified workflow files parse as valid YAML and include the fixture trigger.
- Three targeted production-browser regressions: PASS in 42.4 seconds. Search filter real close/focus: 3.7 seconds; exact page-2/160%/selection restoration: 10.5 seconds; real authored recent-work durable reopen and viewport: 40.6 seconds.
- Whole `pnpm exec playwright test --config playwright.non-studio.config.ts`: **283 passed in 6.4 minutes** (382,110.888 ms), zero unexpected, skipped or flaky tests. The structured run started at `2026-09-20T02:02:02.356Z`.

Local diagnostic evidence: `/tmp/virtual-studio-pr1856-non-studio-ee7-job.log`, `/tmp/virtual-studio-non-studio-failure-classification.json`, `/tmp/virtual-studio-non-studio-final-build.log`, `/tmp/virtual-studio-non-studio-final-unit.log`, `/tmp/virtual-studio-non-studio-final-focused-v2.log`, and `/tmp/virtual-studio-non-studio-final-full.log`. Playwright writes the whole-suite structured result to `test-results/non-studio-results.json` and per-test screenshots/attachments below `test-results/`.
