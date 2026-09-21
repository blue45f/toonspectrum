# Drawing acceptance: storage handoff, bounded history and accessibility

Status: implementation with exact-head verification tracked in the PR. This is not a deployment record.

## Implemented repairs

- A replacement page can start before the previous WebKit Worker releases its origin-wide SQLite lease. The storage Worker now retries only `lock-unavailable` for 50/100/200/400ms (750ms total), then fails explicitly. It never steals a lease, wipes files, changes the database name or opens a different backend. Other capability/permission errors are not retried. The acquired lease still spans initialization, operations and database close.
- Recent-color updates use one active writer and a latest-value follow-up instead of an unbounded promise chain. While hydration is unavailable, the summary retains no more than the public 12 colors plus a clear marker. Clear/remember order, old-owner fencing and serialized durable writes are preserved.
- A failed history save remains visibly session-only, with accessible status, non-destructive retry and guidance to preserve important color codes. It does not claim cloud backup or durable memory fallback.
- Toolbar count and configuration guidance use stronger text contrast after the real-control accessibility audit identified contrast violations.

## Browser capability distinction

The earlier WebKit test used an ephemeral/private Playwright context. In that context, OPFS methods exist but acquiring SyncAccessHandles can fail. A fresh disk-backed isolated profile can store the same SQLite data without changing the product VFS. An additional reload race exposed the departing Worker lease described above.

WebKit verification now uses a newly generated temporary persistent profile, never the user's browser profile. All 27/35-pin, color, profile and mobile scenarios still require actual `saved` state. The runner additionally closes the entire browser and reopens the same profile to check exact pins and recent colors. It deletes only the profile directory it created, after closing the context.

A separate ephemeral-context test records the actual capability result. If storage is unavailable, it requires the session-only warning, usable color editing, no fake saved status and no document Undo. This result is not counted as durable storage success. No private-mode detection or storage workaround is added to the product.

Reference: SQLite's official persistence guide documents restricted browsing modes and SAH-pool ownership: https://sqlite.org/wasm/doc/trunk/persistence.md

## Automated acceptance

The existing discovery browser job keeps all previous checks and adds Firefox/WebKit coverage in the same job. The runner records context mode, browser version, console/page errors, accessibility results and measured input timings. Source tests cover bounded failure recovery, lease handoff, profile cleanup and previous storage owner semantics.

The Chromium measurement uses 5,000 synthetic document elements and 120 samples after 10 warm-up inputs. It measures a synthetic color input event to the next matching animation frame, enforcing p95 <= 50ms. It also counts real recent-color repository calls and requires zero writes during previews and cancellation. This does not measure physical pen-to-display latency or certify a 5,000-layer rendering engine.

Axe audits the actual color selection, harmony and toolbar configuration components for serious/critical findings. A pass is not a complete screen-reader or WCAG certification.

```sh
pnpm exec vite --host 127.0.0.1 --port 5219 --strictPort
node scripts/verify-studio-drawing-ux-v2.mjs http://127.0.0.1:5219 chromium,firefox,webkit
pnpm exec vitest run apps/web/src/domains/creator/useStudioRecentColors.test.tsx apps/web/src/domains/creator/studio-local-database-worker-handoff.test.ts scripts/lib/studio-drawing-browser-context.test.ts
pnpm run build:bundle && pnpm run check:studio-bundle
```

Evidence: `artifacts/drawing-ux-v2/report.json` and screenshots; generated artifacts are not source files.

## Remaining acceptance boundaries

- Physical iOS/Android keyboards, pen pressure/tilt/palm rejection and VoiceOver/NVDA still require real devices/assistive technology.
- Desktop WebKit with isolated persistent storage is not a claim that every Safari version, private mode or iOS browser mode supports the same persistence.
- Full GPU/large-canvas soak, imported-file corpus and power-loss testing remain separate from the color-editor benchmark.
- QA issue #1905 is not closed by this focused patch. Its historical failures must be reconciled with their exact production lanes.
- Main CI status is checked against the exact PR head, not older or unrelated successful runs. No gates, baselines, permissions, paid runners, deployment, domain, database migration or environment variables are relaxed or changed.

## Integration prerequisite and reproducible isolation

The exact base main CI failed API runtime import validation because the staged CommonJS package omitted the already exported `work-session-evidence` contract. The API compiler's explicit source path and the staged export now include it. Tests load the emitted subpath with real `createRequire` and verify source/compiled-path agreement. No endpoint, authorization, data model or migration is changed.

Each acceptance run also uses a newly allocated loopback origin forwarding only to the fixed local fixture server. This prevents prior test-origin data retained by some WebKit builds from contaminating a fresh run, without clearing any existing origin. The same origin and profile are retained across cold-process recovery. The initial-empty-history assertion remains mandatory. Proxy/profile lifecycle and non-local upstream rejection have tests.

Observed focused results before PR: 29 files / 265 tests; Chromium/Firefox/WebKit 31 interaction scenarios; WebKit complete process restart restored pins and recent colors. The separate ephemeral context explicitly reported session-only while editing remained usable. Three real-control axe audits had no serious/critical findings. Chromium synthetic 5,000-element color input measured p95 9.3ms across 120 samples, with no preview history writes. Exact-head CI and build results are recorded separately in the pull request.
