# Market CC0 delivery completion — 2026-09-13

Base: `21c3f91f953a1fc00f44c30c3097703de40cf71f`.

## Implemented
- Pin 14 reviewed, already-hosted CC0 files: four 2048×1152 backgrounds, four 1536×1536 transparent props, six PBR GLB models.
- Connect the eight raster assets to community projection and guarded asynchronous canvas insertion. Preserve existing SVG identities and insertion.
- Permit only registered 3D references. Download with a bound, verify SHA-256/size, use the existing mobile GLB validator and SQLite/OPFS model import, and prepare the exact model in a new BG3D scene.
- Recheck operation/document/review-lock scope after asynchronous work. Compensate only the exact new model import when opening becomes stale; never clear a user's library.
- Show actual SVG/WebP/GLB-render previews and same-origin file downloads instead of generic recipe-only cards for supported material.
- Add reproducible validated public manifests and CI regression coverage. No backend schema, authentication, source policy, bundle threshold or required-check changes.

## Executed locally
- Existing five-file regression selection: 123/123 passed.
- Additional panel/detail regressions: 16/16 passed.
- New catalogue/manifest/hash/rejection/model-mobile-admission suite: 35/35 passed.
- Changed TypeScript ESLint: passed.
- `pnpm run typecheck`: passed, including API.
- `pnpm run build:bundle`: passed, including normal pre/post build hooks.
- `pnpm run check:studio-bundle`: passed; 0 ratchet regressions; baseline unchanged.
- Actual Chrome, isolated test context, real production modules and local files: eight image decodes with exact dimensions/hashes; six real model imports and hash-based storage readbacks with one scene node each; no page exceptions. Harness: `apps/web/tools/browser-harnesses/market-cc0-audit.html`.

The browser harness above verifies delivery/storage, not the complete Studio UI, GPU artistic quality or account publishing. Browser account-creation automation was blocked by the tool security check; no bypass was attempted. Existing test account/products and production manuscripts were not changed during source development. Main merge, deployment and any new product registration must be recorded from their actual results separately.

## Follow-up from required CI and built-UI observation
- CI exposed the unchanged architecture ceiling: host 29531 > 29488 lines and AppRouter 131 > 100. Extracted typed marketplace catalog/sync orchestration and the legacy entry resolver; the original ceiling tests now pass without editing their limits (host 29483, router 97 before final formatting).
- The built UI demonstrated that `/studio?installMarketResource=...` stopped at Studio home. The canonical legacy-entry resolver now preserves the complete market query while redirecting to the existing draft-canvas route. Unrelated home queries and existing work routes are unchanged.
- Added ten entry-route and six catalog/sync regression cases. Architecture/deep-link/entry/catalog selection: 49 passed; full web/API typecheck and changed-file lint passed again.
