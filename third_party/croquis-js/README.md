# croquis.js — capsule inking + pulled-string stabilizer (code ported)

- Upstream: https://github.com/disjukr/croquis.js
- Package: `@disjukr/croquis-js` 0.0.3
- License: `(MIT OR Apache-2.0)` per `package.json` and README §license
  ("croquis.js is dual-licensed under Apache 2.0 and MIT terms").
  Author: JongChan Choi <jong@chan.moe>.
- **ToonSpectrum elects the MIT option** of the dual license.

The upstream repository and the published npm archive declare the dual SPDX
expression but ship **no standalone license text file** (checked at
`master` and in `croquis-js-0.0.3.tgz`). LICENSE-MIT in this directory is the
canonical MIT text carrying the upstream author attribution, following the
same discipline this repository already applies to `@resvg/resvg-wasm` and
`onnxruntime-web` (declared SPDX + reviewed canonical text).

`src/domains/creator/studio-croquis-capsule-pen-v1.ts` is a re-typed **code
port** of `src/brush/simple.ts` (`drawCapsule` outer-bitangent capsule fill)
and `src/stabilizer/pulled-string.ts`. The MIT permission notice travels with
the distribution: this LICENSE-MIT copy is embedded verbatim into
`dist/legal/THIRD_PARTY_NOTICES.generated.md` by
`scripts/generate-third-party-notices.mjs`, and removing either fails
`pnpm run audit:licenses`.
