# Brush Studio release-readiness review — 2026-09-20

Status: **implemented release-boundary improvements; not a production deployment receipt**.

## Review decision

The next useful improvement is not another engine name. CanvasKit/Vello/libmypaint already
have real trial, selected-stroke conversion, exact preview/apply and scoped-session paths.
The current release is blocked by accumulated startup dependencies and an oversized host.
This change addresses those concrete failures while retaining the original pixels, input,
mutation/history checks, engine ownership and stored document formats.

Baseline is main `6cafbb293d90e9b4cb45405c9fa1a0fb52f016c4` (PR #1843).
Its CI run 35447695577 failed the production bundle ratchet on 12 measurements and the
foundation shard on host length (29,709 lines against a 29,696 ceiling). Compilation alone
had succeeded; that did not mean the release checks had passed.

Previously interrupted release-boundary source in the local release-validation worktree was
reviewed and copied to an isolated worktree, preserving the original and other agents' work.
A local source/hash snapshot is retained in `.qa/engine-resume/recovery-input.json`.
The recovered work is hardened here rather than being silently treated as already validated.

## Implemented

- Browser consumers import the existing `business` and `public-share-path` leaves of core,
  rather than its side-effectful value barrel. The leaf exports are public, dependency-free
  modules; they do not create another schema/implementation or change the lockfile.
- Optional modal bodies and the formal-save presentation load only after an opening action.
  Immediate launch controls and autosave/document save authority stay in the editor.
  Loaded components retain identity across close/reopen. Failed imports expose local retry/
  cancel controls, ignore late responses and do not reload the document.
- Marketplace model catalogue presentation is deferred until a model is selected. A rejected
  optional import remains an inline error rather than replacing the 3D editor/canvas. Tests
  retain an unsaved input and the exact sibling canvas across failure and retry.
- Native-brush document preparation is extracted to a typed editor bridge. The lazy inspector
  supplies the same existing validator synchronously at user invocation; the host has no
  runtime value import of the brush renderer/validator graph. Mutation tickets are still
  captured before Worker execution, and history/page/lock/save/drawing refs are read afresh.
  Missing module input fails closed. The real browser harness now exercises this bridge.
- Already-synchronous pure numeric and document-metadata leaves and the exact initial icon
  set are co-located to reduce small requests. AST tests reject renderer/Worker imports in
  these groups. Engine modules and stateful authority stores are not moved into these leaves.

No accepted bundle baseline, tolerance, host ceiling, existing workflow gate, license policy,
production origin, data, credential or deployment setting is modified.

## Static bundle measurement

Before is the exact main CI report; after is the same checker against the local production
build of this source. This is emitted dependency-graph size, not a physical stylus or
same-session wall-clock A/B benchmark. KiB means 1024 bytes.

| Static closure | Main before | Reviewed build | Interpretation |
| --- | ---: | ---: | --- |
| App raw JS | 1116.7 KiB | 672.2 KiB | About 39.8% less static app JS |
| App gzip JS | 371.0 KiB | 218.8 KiB | About 41.0% less compressed app JS |
| App JS chunks | 29 | 12 | Fewer synchronous requests |
| Studio route raw JS | 6993.6 KiB | 6534.0 KiB | No renderer/pixel quality reduction |
| Studio route chunks | 282 | 249 | Optional UI and small shared leaves separated |
| Studio after app raw JS | 5876.9 KiB | 5861.8 KiB | Under unchanged 5867.1 KiB ratchet maximum |
| Studio after app chunks | 253 | 237 | Under unchanged 241 maximum |
| BG3D activation raw JS | 4202.7 KiB | 3544.8 KiB | Catalogue is no longer an activation prerequisite |
| BG3D activation chunks | 86 | 68 | No newly eager specialist engines |

The mandatory static checker reports **27 within baseline, 3 improved, 0 regressed**.
The 13 design-reference observations are still above long-term targets and remain printed;
passing the ratchet does not mean those design goals are achieved.

## Real-startup finding — NOT passed off as success

The extended `check-studio-bundle.mjs --runtime` measurement was also executed. The actual
Studio canvas attached at 1,680ms in this single probe, with crossOriginIsolated=true and
5,000ms settling. It measured 378 startup JS requests / 8822.4 KiB decoded and 129 eager-
dynamic requests / 2288.4 KiB. Those four runtime measurements exceed the stored 2026-09-14
reference (339 / 8087.8 KiB and 107 / 1942.6 KiB), so **that extended check exits 1**.

The older runtime reference predates later features and is not a freshly rerun main baseline.
Do not interpret this as either an introduced regression or a measured improvement in startup
latency. It reveals remaining work that the mandatory static-only CI invocation does not test.
Notable startup consumers include the inspector, layer navigator, dry-media canvas, menubar,
SVG exporter and background services. Their real user-trigger/data dependencies must be
measured before deferring them; hiding essential save/input initialization to win a benchmark
would be unsafe. The runtime baseline was not rewritten.

## Local verification executed

- Exact CI foundation shard: 74 files / 3,606 tests passed, including unchanged host ceiling.
- Product: 21 / 222; editing: 157 / 2,125; 3D: 26 / 307; character: 31 / 477. These are the five
  mandatory static shard executions, not a claim that the complete repository suite ran.
- Native late-module/transaction/inspector/boundary tests: 5 files / 69 tests passed.
- Optional import failure/retry/canvas preservation: 3 files / 8 tests passed.
- Standard frontend/API typecheck, realtime-worker types, API build + emitted entry syntax,
  full strict repository lint, dependency hygiene, license audit and secret scan passed.
- Full production web build, generated license notices and static CSP verification passed.
- Free-infrastructure policy and Cloudflare-static rules/types/tests passed (43 tests).
- Required automated accessibility smoke passed on `/`, `/learn` and `/market`; this is not a
  whole-Studio accessibility audit.
- Compiled native Worker document/preview/session harness passed with the real editor bridge,
  canonical save/load, fixture-history Undo/Redo, PNG/SVG parity, stale-ticket rejection and
  cancellation. Peak Worker count 1, final 0, page/CSP errors 0. The native trial's dirty-frame
  reconstruction also retained 0 mismatched bytes.

The initial full serial performance suite recorded **431 passed and 1 failed**: unchanged
GGX/emboss CPU ratio 4.743 versus its >6 floor. Full lint was running concurrently at that time;
that is context, not a proven cause. The exact unchanged two-test file passed when isolated.
Both results are retained; no threshold was changed and the failed run is not erased.
A subsequent full serial run after build/lint completed passed all 432 tests in 21 files.

Existing Babel size, wasm-vips, import-meta/CJS, ag-psd util and Three/VRM build observations
remain visible. The import-hygiene check exits successfully but notes an unbuilt desktop CLI
entry. Test suites overlap; do not add the focused counts to claim unique total coverage.

The new optional-module/bridge tests and existing native preview/session/PNG tests are now
explicit mandatory CI targets (12 additions, zero removals). The expanded groups passed again:
foundation 77 files / 3,617 tests; editing 164 / 2,234; 3D 28 / 311. The target-policy Node suite
also passed 21 tests. This prevents a green compact
core suite from accidentally omitting the newly integrated brush paths.

## Deployment state and remaining work

The user explicitly requested production deployment. The established Render origin was
checked without changing it: live=200, ready=200, no Vercel headers. The current public edge
live endpoint also returned ok. Those are existing-service health checks, NOT evidence of a
new version being deployed.

A read-only Wrangler deployment-list attempt failed because this execution environment has
no usable noninteractive Cloudflare authentication (CLOUDFLARE_API_TOKEN). No replacement
account, new provider, temporary deployment, environment-variable write or credential change
was attempted. No production deploy ID is available for this work. Authentication must be
connected securely to the deployment runtime, not pasted into a chat or committed to source.

Release order remains: complete mandatory verification, review/merge a known SHA, verify a
clean exact main source/build, then one approved Cloudflare deployment and public asset/API/
Worker smoke checks. API/database deployment is not implied by these browser-only changes.
No required gate will be bypassed to compensate for missing authentication.

After release readiness, the next work is: measure real eager-dynamic owners and defer only
nonessential UI; preserve original MYB resources end-to-end; connect selected engines to live
input with one pinned pixel owner; then validate sparse tile memory and physical stylus/mobile
latency. None of those future capabilities is falsely marked implemented in this change.

Generated reports and hashes stay under ignored `.qa/engine-resume/`. Reproduce with the
standard `typecheck`, `test:perf`, `test:a11y`, core shard, `build`, `check:studio-bundle`, native
compiled-Worker verifier, and extended `check-studio-bundle.mjs --runtime` commands.
