# Recovered local experiments — 2026-09-08

This folder preserves the unique diagnostics and measurements from six local recovery snapshots
reviewed against main `a1c08fa111cc79efdaaed73ab71cdcff4d3c490c`. The executable tools use the
current workspace layout. They are opt-in and write to a separate output directory. The original
snapshot patches and historical benchmark JSON remain available for inspection in this folder.

| Tool / material | Source commit | What is preserved |
| --- | --- | --- |
| `inkwash-parity.experiment.ts` | `e2913a9105e39136c0a6192fb2889766d9008bd3` | V3/V4 prefix mark assertion and live/direct/tiled CPU pixel measurements at three subpixel phases |
| `ink-field.experiment.ts` | `3fabba274b196440435efb0bb1d35f808ed78e1f` | 2x/4x preview versus 4x committed field measurement, with the original stroke and sampled region |
| `painttube-ab.experiment.ts` and `fixtures/` | `ca48da2cb00c1a2ccaccbeb1ce80bfab2a619412` | 24 original before/after cases across V2/V3/V4, crossings, thresholds and R8 states |
| `bg3d-origin-probe.tsx` and `.mts` | `c4ad158a043905a57a3bbfaf0a0373c2fef6c43c` | Animated host origin/viewport measurements and screenshots before and after disabling the animation |
| `evidence/architecture/` and original architecture patch | `0a630760455ad6ddc70e038caf86224861d42b1c` | Historical bristle/fluid measurements and all snapshot alternatives, including local configuration |
| Inactive local dependency-check setting and original main diagnostic patch | `cdbf3e2b9fa4f8b4b27ebbc2b43066eb5718d18b` | The original local setting and durable-brush diagnostic source for provenance |

`provenance.json` records source paths and SHA-256 hashes. `source-patches/*.patch` contains the
exact `git show --format=fuller --binary <source SHA>` output. These patches are archival material;
applying them wholesale would replace current product code and workspace configuration with old
versions. The architecture snapshot's parent history was squashed into merged PR #830
(`dcb9f8bd9ee34208aee1401c053bd4f8ce821630`); its 57 source commits are not 57 missing features.

## Run CPU experiments

Use the existing workspace dependencies and run from the repository root:

```sh
node --import tsx scripts/experiments/recovered-20260908/run.mts --help
node --import tsx scripts/experiments/recovered-20260908/run.mts --run cpu
node --import tsx scripts/experiments/recovered-20260908/run.mts --run painttube-ab --output /tmp/toonspectrum-painttube-recovered
node --import tsx scripts/experiments/recovered-20260908/run.mts --run inkwash-parity
node --import tsx scripts/experiments/recovered-20260908/run.mts --run ink-field
```

With no output argument, each invocation creates a fresh system temporary directory. A supplied
directory is owned by that invocation; reusing it replaces its reports. The launcher prints its
location and writes an `execution.json`, one log and Vitest JSON report per CPU experiment, and
the experiment's `results.json`. `cpu` runs the three suites serially with one worker. These
commands use Node, Vitest and CanvasKit's CPU raster backend; they do not start a browser, GPU
context, API or database. Missing dependencies should be installed separately through the normal
workspace process. The launcher itself does not install packages or change dependency policy.

The `.experiment.ts` files and dedicated Vitest config prevent discovery by normal `*.test.ts`
suites. The config and output helper additionally reject runs without the launcher's explicit
opt-in environment. Local static checks are:

```sh
node node_modules/typescript/bin/tsc --project scripts/experiments/recovered-20260908/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js scripts/experiments/recovered-20260908
```

## Meaning and limits of the CPU results

- Painttube asserts complete mark equality and exact CPU Skia pixels between the two historical
  renderers. The fixtures are from production history `e3cbfa7f4eaa3feee905fee43278a848661df267`
  (before) and `f901d93e9202e2c7c4658b1f76d5fa9db2b06064` (after), both already ancestors of the
  reviewed main. This is a recovered A/B experiment; it does not compare every current renderer
  behavior or establish browser/GPU equivalence.
- Inkwash asserts identical prefix marks and successful committed rendering. Its pixel deltas
  are measurements, preserving the original diagnostic's intent. A passing test is not a claim
  that live and tiled pixels are identical. The retained CPU run has exact live/direct pixels in
  the sampled region, but 345–358 pixels out of 44,278 exceed channel delta 8 for direct/tiled
  comparison, with maximum channel delta 198–199. The tiled result reports scale 1 while the
  destination uses the original 1048/720 transform; treat this as measured behavior of the CPU
  harness, not a verified browser regression or a quality acceptance threshold.
- Ink-field reports the original sampled alpha differences without imposing a new acceptance
  threshold. The retained run measured 0/11,250 pixels above delta 12 for the 2x preview and
  4/11,250 for the 4x preview. Its test confirms that the measurement runs to completion.

The original inkwash harness passed `CanvasKit.MakeCanvas()` directly as a browser-like surface.
CanvasKit's emulation has no canvas `width`/`height` and its `drawImage` expects a SkImage. The
adaptation in `cpu-surface.ts` follows the existing
`apps/web/src/domains/creator/live/studio-live-paint-tube.pixel.test.ts`: it snapshots the exact
source RGBA bytes into a CPU SkImage for drawing, implements dimensions/resizing, and releases
all surfaces. This is host API adaptation, not a replacement raster algorithm. It also clears
the texture cache before disposal. Imports, output paths and TypeScript narrowing were updated;
the original stroke inputs, measured regions, thresholds and A/B fixture bodies are preserved.

`evidence/cpu-verification/` records the recovery run separately from the four original benchmark
files in `evidence/cpu-poc314/` and `evidence/architecture/`. Historical results are neither
recomputed nor installed as current performance baselines. Runtime costs of the CPU snapshot
bridge should not be used as production latency measurements.

## Explicit browser/GPU probe

The BG3D probe was adapted and typechecked but was **not executed** during this recovery. To
explicitly run it later on an authorized machine with Playwright Chromium and WebGPU available:

```sh
node --import tsx scripts/experiments/recovered-20260908/run.mts --run bg3d-origin --allow-gpu
```

Both `--run bg3d-origin` and `--allow-gpu` are required. This starts its own Vite server on a free
loopback port and its own Chromium instance, and closes only those resources. It does not
connect to an existing browser session. The report contains viewport/origin samples, browser
errors and browser version, plus two screenshots. It is a measurement probe, with no asserted
visual acceptance threshold. The original driver used temporary absolute paths; the adapted
driver resolves the current repository and fixture paths. Current WebGPU parameters and the
Drei DOM ref type are explicit. CPU/static validation cannot establish WebGPU rendering success.

## Historical local configuration

`local-config/verify-deps-before-run.yaml` preserves the exact setting that appeared in the
architecture and main diagnostic snapshots. No workspace config imports it, and none of the
commands above require it. The normal repository dependency verification remains enabled. If
an operator deliberately needs to reproduce that historical local diagnostic setup, inspect
the source patch and opt into the setting only in a disposable local checkout after reviewing
the installed dependency state. Do not copy it into the shared `pnpm-workspace.yaml`.

The original architecture patch also preserves alternate artifact-noise filtering, navigation
timing telemetry, ignore patterns, Docker exclusions and test-root expressions. Those changes
were not applied indiscriminately: current main already has later path repairs, while broad
noise filters or asset exclusions could hide errors or remove required files. Narrow shared
and server ESLint classifications were reported separately for integration review.
