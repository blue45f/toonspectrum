# ToonSpectrum third-party notices

This repository notice records the libraries introduced by the Studio
hybrid-provider wave on 2026-07-28. The versions below are pinned in
`package.json` and resolved identically in `pnpm-lock.yaml`. Their copyright
remains with their respective authors. ToonSpectrum does not relicense,
obscure, or claim ownership of these libraries.

| Package | Resolved version | License | Upstream source |
| --- | ---: | --- | --- |
| `paper` | 0.12.18 | MIT | <https://github.com/paperjs/paper.js> |
| `rbush` | 4.0.1 | MIT | <https://github.com/mourner/rbush> |
| `harfbuzzjs` | 1.4.0 | MIT | <https://github.com/harfbuzz/harfbuzzjs> |
| `@resvg/resvg-wasm` | 2.6.2 | MPL-2.0 | <https://github.com/yisibl/resvg-js/tree/v2.6.2> |
| `@techstark/opencv-js` | 5.0.0-release.1 | Apache-2.0 | <https://github.com/TechStark/opencv-js> |
| `onnxruntime-web` | 1.27.0 | MIT | <https://github.com/microsoft/onnxruntime/tree/v1.27.0> |
| `three-mesh-bvh` | 0.9.13 | MIT | <https://github.com/gkjohnson/three-mesh-bvh> |
| `@gltf-transform/core` | 4.4.2 | MIT | <https://github.com/donmccurdy/glTF-Transform> |
| `@gltf-transform/extensions` | 4.4.2 | MIT | <https://github.com/donmccurdy/glTF-Transform> |
| `@gltf-transform/functions` | 4.4.2 | MIT | <https://github.com/donmccurdy/glTF-Transform> |
| `manifold-3d` | 3.5.1 | Apache-2.0 | <https://github.com/elalish/manifold> |
| `opencascade.js` / OpenCascade WASM | 1.1.1 | LGPL-2.1-only | <https://github.com/donalffons/opencascade.js> |
| `rhino3dm` / openNURBS WASM | 8.32.1 | MIT | <https://github.com/mcneel/rhino3dm> |
| `web-ifc` WASM | 0.0.77 | MPL-2.0 | <https://github.com/ThatOpen/engine_web-ifc> |
| `xatlasjs` | 0.2.0 | MIT | <https://github.com/repalash/xatlas.js> |
| Comlink runtime embedded by `xatlasjs` | bundled in `xatlasjs` 0.2.0 | Apache-2.0 | <https://github.com/GoogleChromeLabs/comlink> |
| `lazy-brush` | 2.0.2 | MIT | <https://github.com/dulnan/lazy-brush> |
| `perfect-freehand` | 1.2.3 | MIT | <https://github.com/steveruizok/perfect-freehand> |
| `p5.brush` standalone entry | 2.2.1 | MIT | <https://github.com/acamposuribe/p5.brush> |
| `p5` peer resolution for `p5.brush` | 2.3.1 | LGPL-2.1 | <https://github.com/processing/p5.js> |
| `libtess` dependency of the resolved `p5` peer | 1.2.2 | SGI-B-2.0 | <https://github.com/brendankenny/libtess.js> |
| `hokusai-brush`, `hokusai-core`, and `hokusai-tile-mem` | 0.3.0 | MIT OR Apache-2.0 | <https://github.com/reearth/hokusai/tree/f7e998173c0e7427b95afe0b6947e3103da60f00> |
| `wasm-bindgen` family | 0.2.123 | MIT OR Apache-2.0 | <https://github.com/wasm-bindgen/wasm-bindgen/tree/0.2.123> |
| `unicode-ident` data tables | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 | <https://github.com/dtolnay/unicode-ident/tree/1.0.24> |
| Vello CPU stack (`vello_cpu`, Parley, HarfRust, Skrifa and transitive crates) | feature-locked Cargo graph | per-crate SPDX expressions | <https://github.com/linebender/vello> |
| Vello GPU stack (`vello`, Velato, `vello_svg`, usvg, wgpu and transitive crates) | `fabric,lottie,svg` feature-locked Cargo graph | per-crate SPDX expressions | <https://github.com/linebender/vello> |
| `google/ink` mesh subset | 1.1.0 / `1d0daba661f3035f42f3649b8e6a0061b47aa759` | Apache-2.0 | <https://github.com/google/ink> |
| `google/ink-stroke-modeler` | 0.1.0 / `f2388813b0b25bc3e33d143d369a8367ab2e30c8` | Apache-2.0 | <https://github.com/google/ink-stroke-modeler> |
| `abseil-cpp` linked into Google Ink WASM | 20260526.0 and 20250512.0 | Apache-2.0 | <https://github.com/abseil/abseil-cpp> |
| `libmypaint` WASM | 1.6.1 / `2768251dacce3939136c839aeca413f4aa4241d0` | ISC | <https://github.com/mypaint/libmypaint> |
| dli/paint (Fluid Paint) `painting.frag` CPU port | first-party embedded port, no npm artifact | MIT | <https://github.com/dli/paint> |
| dli/paint (Fluid Paint) `brush.js` PBD chain + `splat.frag` + `painting.frag` WGSL port | first-party embedded port, no npm artifact | MIT | <https://github.com/dli/paint> |
| croquis.js capsule pen + pulled-string port | `@disjukr/croquis-js` 0.0.3, first-party embedded port | (MIT OR Apache-2.0), MIT elected | <https://github.com/disjukr/croquis.js> |
| Klecks brush tip kernel re-implementations | first-party embedded kernels, no npm artifact | MIT | <https://github.com/bitbof/klecks> |

Some npm archives do not contain a standalone `LICENSE` file even though their
package metadata declares an SPDX license. In particular,
`@resvg/resvg-wasm`, `onnxruntime-web`, and `onnxruntime-common` omit that file.
The release notice generator therefore records the complete resolved
production inventory, collects the license texts that are present, adds the
official ONNX Runtime MIT notice, includes the Apache-2.0 Comlink attribution
shipped beside xatlas, and records the exact MPL-2.0 source location for the
unmodified resvg executable.

ToonSpectrum imports `p5.brush/standalone`; that entry is self-contained and
does not statically import the resolved `p5` peer. The production dependency
inventory nevertheless includes pnpm's automatically resolved `p5` peer and
its `libtess` dependency, so their upstream LGPL-2.1 and SGI-B-2.0 notices
remain in the generated artifact. This records dependency resolution without
claiming that the `p5` application entry or `libtess` is bundled into the
Studio standalone-brush chunk. The MIT-licensed `p5.brush` archive carries a
local deterministic finite-difference fill-compositor patch: it replaces an
undefined fragment-quad derivative at translucent fill edges while retaining
the upstream spectral pigment blend, public API, attribution, and license.

Four natural-media modules embed third-party code ported by hand rather than
resolved from npm: `src/domains/creator/studio-impasto-relief-shading-v1.ts`
(CPU port of dli/paint `shaders/painting.frag` and its `paint.js` defaults,
MIT), `src/domains/creator/render/studio-gpu-bristle-wgsl.ts` (WGSL port of
dli/paint `brush.js` and its six constraint fragment shaders
`project.frag`, `distanceconstraint.frag`, `bendingconstraint.frag`,
`planeconstraint.frag`, `setbristles.frag` and `updatevelocity.frag`, plus
`shaders/splat.frag` and `shaders/painting.frag`, MIT),
`src/domains/creator/studio-croquis-capsule-pen-v1.ts` (re-typed port of
croquis.js `brush/simple.ts` and `stabilizer/pulled-string.ts`, dual
`(MIT OR Apache-2.0)` with the MIT option elected), and
`src/domains/creator/studio-oss-brush-kernels.ts` (clean re-implementations of
Klecks brush algorithms that closely follow specific upstream functions, MIT;
the libmypaint `.myb` recipes it also carries are ISC parameter values covered
by the libmypaint WASM notice above). croquis.js declares its SPDX expression
in `package.json` and README but ships no license text file, so the canonical
MIT text with upstream author attribution is preserved — the same treatment
given to `@resvg/resvg-wasm` and `onnxruntime-web` above. The verbatim
permission notices are checked in at `third_party/dli-paint/LICENSE`,
`third_party/croquis-js/LICENSE-MIT`, and `third_party/klecks/LICENSE`. The
release notice generator embeds each of those texts into
`dist/legal/THIRD_PARTY_NOTICES.generated.md`, and `pnpm run audit:licenses`
fails if a copy is missing, its permission notice is altered, or this notice
stops referencing it.

The checked-in `studio-hokusai-wasm` wrapper uses a Cargo v4 lockfile and exact
manifest pins: `hokusai-brush`, `hokusai-core`, and `hokusai-tile-mem` are
`=0.3.0`, while `wasm-bindgen` is `=0.2.123`. The generated release artifact
includes both MIT and Apache-2.0 license choices, the Hokusai attribution, and
the Unicode-3.0 notice required by `unicode-ident` data tables. The license
audit records the complete locked Rust dependency graph and the exact crates.io
checksums, rather than treating the WASM file as an opaque binary.

### inkwash — permission on record, nothing ported yet

The project owner has stated that Johno Whitaker
(<https://github.com/johnowhitaker/inkwash>) granted express permission to use
that project's source and shaders. The repository publishes no licence file, so
this record exists to make the grant auditable **before** any line is ported.

- Upstream: <https://github.com/johnowhitaker/inkwash>
- Author: Johno Whitaker
- Basis: express permission granted to the project owner (no public licence)
- Permission reference: **TODO — project owner to record the email, issue or DM
  that carries the grant.** Do not cite a reference that has not been supplied.

**As of this entry no inkwash code is present in this repository.** The
watercolour/ink lane's parameter reuse is a clean-room reimplementation and says
so in code at `src/domains/creator/brush/studio-wet-edge-bloom-v1.ts`, and
`scripts/verify-studio-living-ink-inkwash-oracle.mjs` drives a locally pinned
original without bundling or copying it. Both of those statements are true
today and both become false on the first ported line: a port must update them
in the same change, add the ported modules to
`EMBEDDED_FIRST_PARTY_PORT_NOTICES` in
`scripts/generate-third-party-notices.mjs`, and keep the ported code in clearly
identifiable modules so provenance stays auditable.

`pnpm run verify:studio-hokusai-wasm` validates the source/output integrity
manifest without requiring Rust. `pnpm run
verify:studio-hokusai-wasm:rebuild` additionally requires the pinned Rust
1.97.1, Cargo 1.97.1, and wasm-pack 0.15.0 toolchain and proves that a clean
release rebuild is byte-identical to the checked-in JS, types and WASM.

The checked-in Vello CPU and GPU artifacts have an independent fail-closed
notice boundary. `crates/studio-engine-vello/THIRD_PARTY_INVENTORY.json`
records the exact `wasm32-unknown-unknown` package sets, Cargo.lock checksums,
binary hashes and package-to-license-document mapping. The CPU `pkg` inventory
contains 85 external crates. The GPU `pkg-gpu` inventory contains 144 external
crates for the exact `fabric,lottie,svg` feature set, including Vello, Velato,
`vello_svg`, usvg, Parley, HarfRust and all three resolved Skrifa versions.
Both artifact directories ship a `NOTICE` and exact source-derived license
bundle (`crates/studio-engine-vello/pkg/THIRD_PARTY_LICENSES.txt` and
`crates/studio-engine-vello/pkg-gpu/THIRD_PARTY_LICENSES.txt`). A separate
`THIRD_PARTY_NOTICES.sha256` pins those source notice artifacts without
changing the engine binary integrity manifests.

The independently emitted Google Ink Mesh, google/ink-stroke-modeler and
libmypaint Emscripten artifacts are not inferred from pnpm. Their locked
provenance is stored in
`packages/studio-brush-platform/src/ink-mesh/THIRD_PARTY_INVENTORY.json`,
`packages/studio-brush-platform/src/ink-modeler/THIRD_PARTY_INVENTORY.json`,
and
`packages/studio-brush-platform/src/libmypaint/THIRD_PARTY_INVENTORY.json`.
Each artifact directory ships a hash-locked `NOTICE` and exact copies of the
upstream Google Ink, Google Ink Stroke Modeler, abseil-cpp, or libmypaint
license files. The release generator validates both the copied text and the
opaque JavaScript/WASM SHA-256 values, so omitting a component, artifact, or
license copy fails `pnpm run audit:licenses`.

The OCCT integration loads `opencascade.js` as an independently emitted,
lazy browser module and WASM asset. ToonSpectrum does not modify or statically
link that package. Its exact corresponding source, license, replacement/rebuild
procedure, and binary boundary are documented in
`docs/third-party/opencascade-lgpl.md`. A recipient can replace the package with
a compatible modified build and rebuild the application without changing the
ToonSpectrum document format. The generated release notice includes the package's
LGPL-2.1 text and resolved source metadata. Any future modification to OCCT or
`opencascade.js` must add a dated modification notice and publish corresponding
source before release.

The reviewed `opencascade.js@1.1.1` artifact identifies OCCT commit
`33d9a6fa21ca4fa711da7066655aa2ba854545ee`. Its pnpm/npm integrity is
`sha512-lw6/vOl86+CkJ8d3V01mlbGAC0A49gc1HbwGcqGeKjk5SGRLiF15jyUuA8aYEvizcPNTu4Ta4A+Ut2DJgsa7AQ==`,
and the independently emitted upstream WASM SHA-256 is
`6cc2f3fa1611d32ad7563f7092aa1bf58741124302630cef7d21561ecd7b7284`.
The engineering evidence gate is complete for this exact unmodified artifact;
final commercial legal suitability remains counsel-reviewed release approval.

Every production build writes the resulting user-accessible artifact to
`dist/legal/THIRD_PARTY_NOTICES.generated.md`. Run `pnpm run audit:licenses`
to validate the resolved graph without writing a build artifact. The audit
fails on an unreviewed license family, a missing direct dependency/version,
missing xatlas/Comlink attribution, or a notice policy that no longer matches
this file.

The optional native `sharp`/libvips packages are denied install scripts and are
not a Studio browser runtime. The post-build audit fails if a libvips or sharp
native runtime marker appears in the Vite distribution. If a future server or
desktop release intentionally distributes those binaries, its packaging must
carry the applicable LGPL source-and-relinking obligations separately.
