# Studio free arrangement — implementation and verification

Date: 2026-09-13. Continuation of draft PR #1368 on main `21c3f91f`.

## Implemented

- Stable region ownership for top menu/tool group, drawing tool rail, page list and inspector. Existing explicit detachable panels retain their own lifecycle.
- Pointer drag, eight resize edges, edge snapping, visible docking preview, position/size locks, original-dock restore and viewport constraints.
- Keyboard movement (Alt + arrows, Shift for larger steps), click-only placement and numeric width/height controls.
- Collapsible floating panels keep their child trees mounted and make folded controls inert. Narrow rails use a two-row header.
- Remove idle transforms that would incorrectly establish a containing block for nested fixed tool popovers; constrain arrangement menus to the viewport.
- Cancel the current arrangement edit without changing manuscript history.
- Explicit device snapshot save/load using the existing shared SQLite/OPFS key-value database, in a new UI-preference namespace. No database migration.
- Serialize snapshot writes and verify readback before reporting success. Validate the entire bounded snapshot, IDs, duplicates, booleans and finite geometry before applying it.
- Do not overwrite an arrangement changed while an asynchronous snapshot load was pending. Storage failures preserve the current layout.
- Preserve same-tab save/load as a separately labeled fallback. Geometry auto-persistence is distinct from explicitly saving detached/folded state.
- Mobile/focus modes retain authored layout and preserve desktop preferences.

## Verification actually executed

Environment: Node 24.16.0, pnpm 11.4.0, Vitest 4.1.11, Playwright Chromium 1.62.1.

- 50 tests pass in five files: arrangement model (12), device repository/validation (17), React region interactions (11), existing floating surface (8), detachable panel boundary (2).
- Strict ESLint passed on modified production modules and tests. Root Playwright configs are intentionally outside the repository lint scope.
- Web TypeScript compilation and full `pnpm run build` passed, including normal postbuild tasks.
- Real Chromium on the development server passed pointer movement, folding, numeric resize, idle-transform cleanup, SQLite device save/load, fold restoration and mobile/desktop recovery.
- The same scenario passed against the actual built production bundle via local Vite preview, plus individual keyboard movement of `top-chrome`, `panel-page-list`, `tool-rail`, and `panel-inspector`.
- The scenario checks that arranging does not add manuscript history and records browser page errors (none observed). It does not certify all HTTP requests or backend services.
- `git diff --check` passed.

## Release blocker — not bypassed

The separate `pnpm run check:studio-bundle` gate fails:

| Metric | Measured | Allowed |
| --- | ---: | ---: |
| Studio route gzip | 1925.6 KiB | 1920.3 KiB |
| Studio route chunks | 281 | 279 |
| Studio route chunks after app shell | 272 | 270 |

No bundle baseline, tolerance, required check or hook was weakened. This run alone does not establish whether every excess predates the workspace feature. Keep the PR draft until the real size regression is resolved and protected CI passes. Main merge and production deployment are not completed.

## Reproduce the browser check

Build normally, then start `pnpm exec vite preview --host 127.0.0.1 --port 5195 --strictPort` in one terminal. In another, run:

```sh
STUDIO_WORKSPACE_BASE_URL=http://127.0.0.1:5195 pnpm exec playwright test --config playwright.workspace.config.ts
```

The test writes screenshots/traces under `test-results/workspace-arrangement/`. It uses a fresh browser context and local editor `/studio/canvas`, not an authenticated production account.

## Scope limits

Top-level chrome moves as a group; individual button reorder, arbitrary panel tab merging, split-dock trees, and every nested 3D/modal editor are not implemented by this change. Physical tablet/pen, native in-app browsers and complete canvas pixel save/reopen are not certified by these layout checks. Existing document locks and collaboration behavior remain unchanged. No paid service, new dependency, account creation or production-data mutation.
