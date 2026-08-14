# Klecks — brush tip kernels (algorithms re-implemented)

- Upstream: https://github.com/bitbof/klecks
- License: MIT (see LICENSE, verbatim upstream copy) — Copyright (c) 2026 bitbof (bitbof.com)

`src/domains/creator/studio-oss-brush-kernels.ts` re-implements Klecks brush
algorithms (pen equal-area scatter, `genBrushAlpha01` multi-octave chalk alpha,
chalk rotate hash) and `studio-dry-media-kernel-tip.ts` builds the core
dry-media tips on those kernels. The implementations are clean re-typings of
the published algorithms rather than file copies, but they follow specific
upstream functions closely, so the MIT notice is preserved here and embedded
verbatim into `dist/legal/THIRD_PARTY_NOTICES.generated.md` by
`scripts/generate-third-party-notices.mjs`; removing either fails
`pnpm run audit:licenses`.
