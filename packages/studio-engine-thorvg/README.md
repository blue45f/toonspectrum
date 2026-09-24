# @toonspectrum/studio-engine-thorvg

Bounded ThorVG WebCanvas provider for safe SVG and Lottie specialist islands.

- `audit` is dependency-light and runs before any WASM or renderer initialization.
- `runtime` is dynamically imported only after the immutable provider plan selects ThorVG.
- Exactly one of `wg`, `gl`, or `sw` is selected for a request. Runtime failure never retries another backend or Vello.
- Active/external SVG surfaces, Lottie expressions and external image assets are rejected.
- `wasm/thorvg.wasm` is copied byte-for-byte from `@thorvg/webcanvas@1.1.2` and pinned by `INTEGRITY.sha256`.
- Canvas paint is detached and disposed before the canvas/backend is destroyed; the process-global engine is terminated only after the final lease releases.

Browser lifecycle verification:

```bash
pnpm run verify:studio-thorvg-browser
```
