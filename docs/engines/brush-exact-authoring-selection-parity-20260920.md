# Exact material authoring, isolated brush selection and SVG fidelity

Date: 2026-09-20. Baseline main: `2981170a292fbe83a57b2a2913d6ddcfa3cbde74`.
This is implemented product work, not completion of every future brush/physical-material design.

## Recovered work and ownership

PR #1847's design is already on main. We recovered a stable snapshot of uncommitted exact-material authoring changes from `feat/brush-exact-material-authoring-20260920` at parent `0843e0373ee068302a6c7446175f0a3b45bcf4c6` into a separate worktree. The source worktree, its uncommitted files and other sessions were not edited. The scoped pigment declaration fix was cherry-picked normally; required test targets were merged additively in lexical order.

## Product behavior

- New explicit catalogue/slot selections use the selected item's own engine receipt or its ID-derived baseline. Missing programs no longer inherit a previous brush's oil/watercolor/composition. Existing saved receipts and already committed strokes are not migrated.
- Current material brushes open with their exact input, seed, slots, tuning, execution bindings and explicit main-tool color/width/opacity. The source library entry is preserved and saving creates another brush.
- An execution-bound authoring envelope preserves the material receipt across JSON export, draft autosave and reopening. Unknown/future/changed execution data is rejected rather than replaced by a plausible recipe.
- Invalid drafts do not mount the autosaving editor. Original JSON remains available for recovery. Import size and stale asynchronous import/save/loading results are guarded.
- Saving verifies the reloaded complete engine programs and effective tool values, not just a format number.
- Zero flow and zero opacity remain zero instead of becoming faint paint. Texture seed variation remains inside the existing signed positive seed domain.
- This is exact editing for supported current material receipts, not automatic editing of every native MYB/Hokusai/Google Ink program. Unsupported originals stay unchanged.

## Reproduced selection issue

A new 176-case suite failed 173 cases on the baseline selector (three explicit-receipt controls passed). These are a matrix exposing one inherited-program problem, not 173 independent bugs. The fixed selector passes all 176, covering every 169 registered preset ID plus ordering, slots and receipt preservation. Registered IDs include retained/hidden entries; this is not a claim of 169 new product brushes.

An actual-browser fixture uses the product catalogue UI and retained `StudioDrawNode`. Oil, pen and watercolor produced identical nonempty pixel hashes whether selected from a clean state or after an unrelated custom composition. Missing-program slots likewise match; explicitly stored slot programs retain their own behavior. It is an isolated fixture, not full Studio/OPFS or physical-pen evidence.

## Discovered Canvas/SVG discrepancy and fix

The first real exact-authoring browser run failed the existing SVG alpha gate for a thin, translucent oil brush (33px, opacity 0.42, seed 2147483647). Canonical live/committed pixels were identical, but SVG alpha mass differed by 7.65844%. Switching opacity attributes or retaining more opacity digits did not resolve it.

Explicit SVG arc paths for capsules/ellipses align much more closely with the Canvas path geometry in the tested browsers than SVG primitive shortcuts. Current execution-bound material exports select the path serializer; legacy material and the low-level default serializer preserve their original byte-for-byte output. The pre-existing 17 legacy golden checks are unchanged. Canonical Canvas drawing and stored contact inputs are unchanged. Current SVG bytes deliberately change while ideal geometry stays the same.

Installed Chrome 153.0.8010.48 on Apple M2 Max, three pigment providers:

| Provider | Live/committed max channel difference | SVG normalized mean channel difference | SVG relative alpha mass difference |
| --- | ---: | ---: | ---: |
| Spectral.js | 0 | 0.00006146 | 0.00037737 |
| open-km spectral | 0 | 0.00004818 | 0.00037737 |
| ColorMix Lab | 0 | 0.00007195 | 0.00037737 |

Thus alpha error fell from about 7.66% to 0.038% in this scenario. SVG antialiasing is not byte-identical to Canvas (observed per-channel maximum up to 37). No gate was loosened. Before/after authoring/reload hashes match for each output separately. The three models are not expected to match one another.

The full existing material browser suite exercised 114 recipes and the 10,000-input/128-strand stress case with zero reported failures. This broad run used bundled Chromium 151.0.7922.34, not installed Chrome 153. Across the recipes, live/committed maximum channel error was zero; maximum SVG normalized mean error was 0.00071094 and maximum relative alpha error 0.0139498, within the unchanged respective 0.01 and 0.04 gates. This run covers the same current-material path output; the final targeted Chrome runs also verify the legacy/current serializer selection.

## Cost and limits

Curved-path SVG is larger and costs more to serialize than primitive shortcuts. Repeated numeric formatting is reused without changing output bytes (six recipe/mode SHA-256 comparisons match). In one warm Node 24 run, the 8,542-contact oil sample used 1,452,643 UTF-8 bytes / 23.36ms with legacy primitives versus 2,498,638 bytes / 32.56ms with explicit paths. The improvement here is output fidelity, not a drawing-FPS improvement. Sequential local timings varied under concurrent machine load; the raw byte counts are exact for the fixed input. Gzip measurements in the benchmark are illustrative, not the product download encoding.

The unchanged 64MiB UTF-16 SVG budget still rejects oversized output visibly; no partial successful download or silent lower-quality substitution is introduced. Paths can reach this limit sooner. PNG remains the existing explicit alternative. Live contact generation and Canvas rendering do not use this serializer.

## Executed checks and reproduction

- Integrated brush/editor/library/selection/runtime/SVG unit regression: 1,176 tests in 45 files passed, including the five curve-path tests and unchanged legacy replay goldens. Earlier failures were used to reproduce selector leakage and detect accidental legacy-SVG changes; no golden hashes were replaced.
- Exact authoring browser: three pigment models, live/settled/committed Canvas, document SVG, JSON download/reload, zero-flow restore and unsupported-draft preservation passed. Page/console errors were zero.
- Selection browser: three real catalogue choices, retained renderer output and slot receipt isolation passed. Page/console errors were zero.
- Whole production build and static CSP/legal notice generation passed. Bundle structural ratchet passed without changed limits. Initial app entry remains 12 static chunks / 672.4KiB raw; runtime eager loading was not remeasured by that check. Existing large-chunk/third-party build warnings remain visible.
- Final branch/CI/merge status is reported by the PR, not inferred from these local checks. Browser fixtures do not certify full Studio workflow, OPFS durability, collaboration, native-engine live performance, physical stylus latency or production deployment.

```sh
node scripts/verify-brush-selection-isolation.mjs /tmp/brush-selection-review
node scripts/verify-brush-exact-authoring.mjs /tmp/brush-exact-review
TOONSPECTRUM_BRUSH_V6_VERIFY_DIR=/tmp/brush-material-review node scripts/verify-studio-brush-v6-quality.mjs
pnpm exec tsx scripts/benchmark-brush-material-svg.mts
```

No extra external engines, guessed calibrated pigments, physical canvas pickup or new water solver are claimed. The exact current-material workflow is a concrete step toward the unified engine contract; native-original editing and stateful physical material domains remain separate follow-up work.

## Integrated-main follow-up

Main `431c036cfaef56c4fe6a488d2d1308084f6241f1` was merged without conflicts. Its production bundle, static CSP and structural budget checks passed; the normal push hook passed frontend/API types, architecture, lockfile, changed-file lint and secret checks. A broader brush run passed 3,653 tests and exposed one block-vs-stream SVG expectation that omitted the now-explicit curve mode. The public block serializer now accepts an optional mode while retaining its legacy default. The streaming test covers both old and current receipts, exact contact order and unchanged output-budget failure behavior. The focused follow-up passed 39 tests in four files, including untouched legacy golden hashes. The full rerun outcome is recorded in the PR.
