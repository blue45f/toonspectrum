# ToonSpectrum Studio Hokusai WASM

Transparent, deterministic natural-media rendering for ToonSpectrum Studio,
built directly from Hokusai 0.3.0.

## Dependency and pixel contract

The Cargo manifest pins `hokusai-core`, `hokusai-brush`, and
`hokusai-tile-mem` to exactly `0.3.0`. It intentionally does not use
`hokusai-wasm`: that upstream wrapper composites tiles over white.

This wrapper reads `MemSurface`'s original premultiplied-alpha, linear-sRGB
fix15 tiles and returns **straight-alpha sRGB RGBA8**:

- untouched pixels are `[0, 0, 0, 0]`;
- `fullFrame()` returns the complete canvas;
- `dirtyBounds()` returns `[x, y, width, height]`, or an empty `Int32Array`;
- `dirtyFrame()` returns tightly packed RGBA8 for that rectangle;
- dirty bounds are conservative 64 px tile bounds, clipped to the canvas, so
  they also include pixels erased back to transparent.

## Build and test

Rust 1.88 or newer and the `wasm32-unknown-unknown` target are sufficient for
local development. Commercial release artifacts are intentionally stricter:
Rust/Cargo 1.97.1 and wasm-pack 0.15.0 must reproduce the checked-in package
byte-for-byte.

```sh
pnpm run test:studio-hokusai-wasm
pnpm run build:studio-hokusai-wasm
pnpm run verify:studio-hokusai-wasm
pnpm run verify:studio-hokusai-wasm:rebuild
```

The build command uses Cargo's checked-in v4 lockfile and exact reviewed crate
checksums. It runs offline with an allowlisted environment, fresh target and
temporary directories, stable source-path remapping, and normalized locale and
time inputs. The generated package is private, contains every required notice,
and is sealed by `pkg/INTEGRITY.sha256`, which also binds the release scripts.

The lightweight verify command detects missing, nested, linked or modified
source/output files without requiring Rust. It also rejects generated WASM that
contains a local home, repository or temporary build path. The rebuild command
performs two independent clean pinned-toolchain builds and requires every JS,
type, metadata and WASM byte to match each other and the checked-in package.

The web-target output is:

```text
pkg/
  INTEGRITY.sha256
  LICENSE-APACHE
  LICENSE-MIT
  LICENSE-UNICODE
  README.md
  package.json
  studio_hokusai_wasm.js
  studio_hokusai_wasm.d.ts
  studio_hokusai_wasm_bg.wasm
  studio_hokusai_wasm_bg.wasm.d.ts
```

## JavaScript lifecycle

```js
import init, {
  HokusaiBrush,
  HokusaiCanvas,
} from "./pkg/studio_hokusai_wasm.js";

await init();

const brush = HokusaiBrush.naturalMedia();
const canvas = new HokusaiCanvas(2048, 2048, 0xdecafbad);

canvas.beginStroke(brush, 0xdecafbad);
canvas.addSample(brush, 120, 200, 0.35, -0.2, 0.7, performance.now());
canvas.addSample(brush, 180, 230, 0.75, 0.1, 0.6, performance.now());
canvas.finishStroke(brush);

const [x, y, width, height] = canvas.dirtyBounds();
const rgba = canvas.dirtyFrame();
// Upload `rgba` into the destination at x/y, then acknowledge it.
canvas.clearDirty();

// `reset()` clears the transparent canvas and cancels an active stroke.
canvas.reset();

// Explicitly release tiles, then release the generated JS/WASM wrapper.
canvas.dispose();
canvas.free();
brush.free();
```

`timeMs` is an absolute, finite, monotonic timestamp. The wrapper derives
Hokusai's delta-seconds input from consecutive samples. Pressure is clamped to
`[0, 1]`, tilt components to `[-1, 1]`, and the first sample seeds Hokusai's
stroke position without painting, as required by the engine.

`beginStroke` snapshots the brush and initializes `BrushState::new(seed)`.
Given the same initial canvas, brush, seed, and ordered sample stream, output is
byte-deterministic. Brush JSON should still come from a trusted brush pack:
Hokusai deliberately supports complex, high-density libmypaint mappings.

`setRadiusLog()` and `radiusLog()` expose a UI-facing base-2 logarithm in
pixels, so `setRadiusLog(Math.log2(radiusPx))` is the intended JavaScript call.
Hokusai 0.3.0 internally stores this setting as a natural logarithm and applies
`exp()`, so the wrapper converts between log2 and natural-log units at the API
boundary.

`dispose()` tombstones the Rust object and is idempotent. Methods that require
live storage throw after disposal. wasm-bindgen's generated `.free()` remains
the final wrapper-memory release.

## License

This package and the pinned Hokusai crates are licensed under
`MIT OR Apache-2.0`, at your option. See `LICENSE-MIT` and `LICENSE-APACHE`.
The transitive `unicode-ident` data tables additionally require the
Unicode-3.0 notice in `LICENSE-UNICODE`; all three notices ship in `pkg/`.
