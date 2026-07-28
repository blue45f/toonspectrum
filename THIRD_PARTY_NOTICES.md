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
| `xatlasjs` | 0.2.0 | MIT | <https://github.com/repalash/xatlas.js> |
| Comlink runtime embedded by `xatlasjs` | bundled in `xatlasjs` 0.2.0 | Apache-2.0 | <https://github.com/GoogleChromeLabs/comlink> |

Some npm archives do not contain a standalone `LICENSE` file even though their
package metadata declares an SPDX license. In particular,
`@resvg/resvg-wasm`, `onnxruntime-web`, and `onnxruntime-common` omit that file.
The release notice generator therefore records the complete resolved
production inventory, collects the license texts that are present, adds the
official ONNX Runtime MIT notice, includes the Apache-2.0 Comlink attribution
shipped beside xatlas, and records the exact MPL-2.0 source location for the
unmodified resvg executable.

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
