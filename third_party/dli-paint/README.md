# dli/paint — Fluid Paint (code ported)

- Upstream: https://github.com/dli/paint
- Demo: http://david.li/paint
- License: MIT (see LICENSE, verbatim upstream copy) — Copyright (c) 2017 David Li (http://david.li)

`src/domains/creator/studio-impasto-relief-shading-v1.ts` is a CPU **code port**
of `shaders/painting.frag` (Sobel height→normal, GGX/GGGX/fresnel specular,
wrapped diffuse) with the `paint.js` default parameters. Because actual code is
translated — not merely referenced — the MIT permission notice travels with the
distribution: this LICENSE copy is embedded verbatim into
`dist/legal/THIRD_PARTY_NOTICES.generated.md` by
`scripts/generate-third-party-notices.mjs`, and removing either fails
`pnpm run audit:licenses`.
