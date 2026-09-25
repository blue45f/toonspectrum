# Brush Studio release quality and startup isolation — 2026-09-20

Status: **implemented and locally validated; production deployment is not completed**.
Base reviewed: `6cafbb293d90e9b4cb45405c9fa1a0fb52f016c4`.
The user authorized production deployment, but this work does not substitute for the existing
protected CI, authenticated release account or exact-SHA deployment policy.

## Priorities selected from actual failures

Further engine additions were deferred in favor of delivering the already-implemented native
preview/conversion workflow without degrading editor startup or weakening quality gates.
The base main CI run `35447695577` failed two mandatory checks: the Studio host exceeded its
29696-line architecture ceiling (29709 observed), and the build exceeded accepted static
bundle/request limits. The Vite compilation itself succeeded; the bundle ratchet was the failing
build step. The remaining core jobs had passed. Broader repository QA also has existing failures;
a green core must not be described as a full-repository QA pass.

Reviewed unfinished bundle-isolation work from the local release-validation worktree was copied
into a separate branch and completed here. The original recovery worktree and unrelated dirty
full-suite/database/3D branches were not modified or merged wholesale.

## Implementation

1. **Focused core imports.** Browser callers of SITE_URL, public-share parsing and fortune data
   use their existing focused modules rather than the side-effectful core barrel. Additive package
   exports expose business and public-share-path without changing their implementations. A source
   AST test rejects future browser value imports from the full core entry.
2. **Optional presentation loads on request.** Save-dialog and modal-body code is not required
   for initial canvas rendering. Existing launch buttons remain immediate. Once loaded, the
   original component stays mounted with its existing closed/open props. Import failure leaves
   the canvas intact and exposes explicit retry/cancel; late results after closing are ignored.
   Marketplace model details load only for a selected model and have an inline retry state.
3. **Preserve save activation and snapshot ordering.** The project archive builder is imported
   only inside the explicit save action, after the browser file picker. Current document snapshots
   are captured after that import. Import/write failures use the existing error path and preserve
   autosave; no file-picker activation, archive semantics or persistence authority was replaced.
4. **Native document bridge extraction.** Move native-brush commit orchestration out of the
   oversized host without caching mutable refs or capturing a mutation ticket early. Lock/access,
   page/history, pending-stroke and save checks are preserved and tested. The host is below its
   unchanged line ceiling. No lines were removed merely to hide a failed architectural check.
5. **Reduce tiny static requests without eager engines.** Group audited already-synchronous
   numeric/guide/icon leaves. The color-wheel geometry is pure and remains separate from its UI.
   Tests prohibit renderers, Workers and native-session code from joining these micro-contract
   chunks. The accepted bundle baseline and temporary allowance are unchanged.
6. **Make regression coverage mandatory.** Add the native document/session/output/inspector,
   extracted bridge, optional-loader and browser-entry/chunk tests to the existing sorted required
   CI target manifest. No required test, security check, protection rule or threshold is removed.

## Static build measurements

Before: main CI's full production-build manifest. After: local production build on the connected
Apple M2 Max using the pinned repository toolchain. Values are emitted static JS size/request
counts, not network download timings, pen latency or FPS. Units below are KiB (1024 bytes).

| Metric | Before | After |
| --- | ---: | ---: |
| App entry raw | 1116.7 | 672.4 |
| App entry gzip | 371.0 | 218.9 |
| App entry static JS chunks | 29 | 12 |
| Studio route raw | 6993.6 | 6535.8 |
| Studio route gzip | 2344.6 | 2187.5 |
| Studio route static JS chunks | 282 | 253 |
| Studio after app shell raw | 5876.9 | 5863.5 |
| Studio after app shell gzip | 1973.6 | 1968.6 |
| Studio after app shell static chunks | 253 | 241 |
| BG3D activation raw | 4202.7 | 3544.8 |
| BG3D activation gzip | 1215.1 | 1038.0 |
| BG3D activation static chunks | 86 | 68 |

`check:studio-bundle --verbose`: **27 within baseline, 2 improved, 0 regressed, 0 unbaselined**.
The 13 longer-term reference-budget observations remain visible; they are not the accepted
release ceilings. Neither UPDATE_BUNDLE_BASELINE nor a temporary allowance was used.
The checker also prints an old runtime observation dated September 14 unless run with --runtime;
that old observation is not evidence of the current change's startup behavior.

## Additional live-startup probe: still outside the historical runtime budget

The production bundle was also opened with the existing `check-studio-bundle --runtime`
probe. The current run observed 382 startup JS requests / 8823.0 KiB decoded JS, including
129 eager-dynamic requests / 2287.1 KiB. The accepted September 14 runtime reference is
339 requests / 8087.8 KiB, with 107 eager-dynamic requests / 1942.6 KiB. This additional
runtime-budget check therefore **failed four measurements**, even though the mandatory
static bundle check now passes. The reported set includes previously added onboarding,
floating-layout and site media modules. No runtime baseline was rewritten.

These figures must not be advertised as a new runtime-budget success, a physical-pen
latency result, or proof that all excess was caused by this patch. The static before/after
comparison is measured; a matched current-parent live-startup control was not completed.
Reducing unintended mount-time imports while preserving visible controls remains a
separate unfinished performance target before claiming complete startup optimization.

## Local validation executed

- Full repository strict ESLint passed, using the normal repository ignore policy. An earlier
  changed-file invocation explicitly named ignored apps/web/vite.config.ts and failed only its ignored-file
  warning; the full configured strict lint was then run successfully, not bypassed.
- Standard frontend and API typechecks passed; realtime Worker typecheck passed.
- Production web bundle, generated third-party notices, static CSP and unchanged bundle gate passed.
- API build and emitted main.js syntax validation passed. API deployment was not performed.
- Required semantic shards passed: product 222 tests; Studio foundation 3617; Studio editing 2233;
  Studio 3D 314; Studio character 477. These are Vitest counts for the final expanded manifests,
  not an invented combined full-suite count. Shard preflight/material commands also ran.
- Serial performance suite: 432 tests across 21 files passed without concurrent heavy builds.
- Save/archive and host/chunk boundary suite: 39 tests passed. Targeted recovery/loader/bridge
  tests passed. CI manifest/protection-contract tests: 21 passed.
- Cloudflare static verification: 43 tests passed; free-infrastructure policy passed.
- Actual production-emitted native Worker passed all three engines, preview/application, scope
  lifetime, exact output replay, original preservation, fixture-history Undo/Redo, canonical
  document-codec reload and SVG embedding. Peak active Workers 1, final 0; page/CSP errors 0.
  The earlier native trial/packed-dirty browser workflow also passed.
- Public-route axe smoke: 3 routes passed with no serious/critical automated violations. Its API
  responses are test stubs; this does not certify production backend readiness.

The native browser verifier uses actual inspector/Worker/codec code with an isolated history
host. It is not full-Studio E2E, OPFS crash recovery or physical-stylus/mobile certification.
Existing large-chunk, third-party WASM/Three warnings and broad optional QA failures are not
claimed fixed by these scoped changes.

## Release status and external prerequisites

No production mutation, account creation, fallback host, environment change or DB migration was
performed. Wrangler's read-only production-deployment lookup failed because this Mac has no
usable Cloudflare login/token in its current execution environment. The repository has no
Cloudflare deployment workflow or available matching repository secret as an alternative.
The temporary-account suggestion was not used: it would not update the authorized service.

Read-only probes of the public site and health paths returned HTTP 403 from this environment.
That is an inability to confirm service health here, not proof of a global production outage.
Before an actual release, restore the authorized Cloudflare authentication locally (never paste
credentials into the chat), inspect current deployed version/origins, require the exact merged
main SHA's core/verify success, and run the repository's approved manual static release pipeline.
Preserve the existing known-good rollback version and routing origins. Authentication alone is
not a reason to skip any remaining release check.

## Reproduction

```sh
pnpm run lint:strict
pnpm run typecheck
node scripts/ci-core-regression-shards.mjs studio-foundation
node scripts/ci-core-regression-shards.mjs studio-editing
node scripts/ci-core-regression-shards.mjs studio-3d
pnpm run test:perf
pnpm run build:bundle
pnpm run check:studio-bundle -- --verbose
node scripts/verify-studio-native-brush-document.mjs --built-worker
node scripts/verify-studio-native-brush-probe.mjs --built-worker
pnpm run test:a11y
```

Generated build logs and native/browser evidence remain under ignored `.qa/engine-resume/`.
The next feature phase should address actual main-canvas native input, original MYB payload
preservation and large sparse surfaces only after this release path is healthy, with same-input
pixel evidence and real-device latency measurements rather than descriptor-only promotion.
