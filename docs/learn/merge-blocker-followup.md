# PR #784 merge-blocker follow-up

## Observed failures and change boundaries

The earlier CI run 33988787342 failed its lint and serial performance jobs; core and verify consequently failed. The learning-specific run 33988787348 failed because its focused TypeScript configuration lacked Node and Vite ambient types. Commit 90f03dd added those types and retained keyboard access to the named scroll region, with a narrowly documented lint exception and a six-case accessibility test. These changes do not make a queued CI run a passing one.

The remaining observed performance failure was `studio-oil-ribbon-carrier.impasto-relief.test.ts`'s dense self-crossing scribble: measured ratio 8.785 against the existing 8.55 limit. This follow-up changes a real operation in that path rather than re-pinning the limit: GGX half-vector normalization and Schlick Fresnel depend only on the tile's light/material options, not on the pixel normal. They are now computed once per call and reused by the flat reference and non-flat cells.

Multiplication order, input validation, Sobel sampling, edge handling, dirty-region writes, shading limits and emboss fallback are unchanged. Constants are not shared across calls, so changing a light or material cannot reuse stale state. The existing carrier budget, fixtures, deterministic geometry floors, resolution and regression-detection thresholds remain unchanged. No tests, branch protections or required checks are removed or replaced.

The learning workflow previously explicitly named only two model test files, leaving the new accessibility file out of this focused gate. It now discovers the entire learning test directory, runs the new independent scalar-output oracle, and repeats the existing full `test:perf` command before the unchanged browser tests. Root core/verify remain mandatory and independent.

## Actually executed locally

Environment: Node 22.16.0, TypeScript 5.8.3, isolated CPU container; not the repository's Node 24 CI environment.

- Reconstructed the complete pre-change module from the connector and verified its exact Git blob hash: `b51a9d23a35ac7d2736ddc4ab67eb498c1c81430`.
- Strict TypeScript check passed for both production module versions and for the new test file using a local adapter from Vitest's describe/it imports to node:test and installed Node type declarations.
- 960 original-versus-optimized comparisons checked 7,750,272 output cells with zero byte mismatches across four typed input formats, dimensions, material/light variations, both quality modes, clipped/empty regions and retained buffers. Input data remained unchanged. Invalid-input error messages were compared too.
- Seven new independent scalar-oracle test bodies passed under the local Node runner (7 passed, 0 failed). The committed test remains a standard Vitest file.
- Warmed, alternating A/B CPU diagnostic on a deterministic dense 200x200 height tile, nine rounds of 30 calls each: median 5.2834 ms before, 1.4693 ms after; after/before 0.2781. These are isolated shading-kernel timings, **not whole-brush, browser or end-user latency measurements**.

The full carrier performance budget, installed repository Vitest/ESLint, full app build and browser E2E were not executed in this local container. Remote Desktop Commander reported no connected devices; the container could not resolve external package/source hosts. The new CI result must demonstrate whether the original scribble budget now passes on Node 24. A successful local microbenchmark is not a substitute for that gate or proof that the PR is merged.

## Repository checks

```sh
pnpm exec tsc -p tsconfig.learning.json
pnpm exec vitest run src/domains/learn src/domains/creator/studio-impasto-relief-shading-v1.light-constants.test.ts
pnpm run test:perf
PLAYWRIGHT_CHANNEL='' pnpm exec playwright test e2e/learn.spec.ts e2e/learn-resilience.spec.ts
```

Observe the new commit's workflow results and the PR's `merged` flag separately. A preview merge SHA or enabled auto-merge is not a completed main merge.
