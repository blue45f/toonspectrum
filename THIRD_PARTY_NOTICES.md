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

The checked-in `studio-hokusai-wasm` wrapper uses a Cargo v4 lockfile and exact
manifest pins: `hokusai-brush`, `hokusai-core`, and `hokusai-tile-mem` are
`=0.3.0`, while `wasm-bindgen` is `=0.2.123`. The generated release artifact
includes both MIT and Apache-2.0 license choices, the Hokusai attribution, and
the Unicode-3.0 notice required by `unicode-ident` data tables. The license
audit records the complete locked Rust dependency graph and the exact crates.io
checksums, rather than treating the WASM file as an opaque binary.

`pnpm run verify:studio-hokusai-wasm` validates the source/output integrity
manifest without requiring Rust. `pnpm run
verify:studio-hokusai-wasm:rebuild` additionally requires the pinned Rust
1.97.1, Cargo 1.97.1, and wasm-pack 0.15.0 toolchain and proves that a clean
release rebuild is byte-identical to the checked-in JS, types and WASM.

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
