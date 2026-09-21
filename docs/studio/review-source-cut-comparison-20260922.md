# Source-cut comparison continuation — 2026-09-22

Status: implemented; final exact-head CI and merge receipts belong to the PR.

## Resumed work

Reused `/Users/hjunkim/.chatgpt-worktrees/toonspectrum-review-workflow-continuity-20260921` instead of creating another checkout. Its previous clean branch and commit were preserved. The new continuation branch is `feat/review-source-frame-navigation-20260922`, initially based on main `5dc180e8fedb2ac57cbcd22367ddd8fea707ed01`.

This is a bounded F09 increment after the existing page comparison, viewport continuity, personal drafts, review groups and approval-history work. It does not recreate those features.

## User-visible behavior

- The actual pinned-review comparison display has an explicitly opened source-cut comparison panel. It does not mount cropped images or ID search until opened.
- Either A or B can supply the source cut. Current source-order labels help navigation, but correspondence requires the same original page ID and an exact unique frame ID. Order, similar pixels, names, bounds and graph panel identifiers never substitute for authoring identity.
- Each snapshot uses its own immutable authoring bounds. Moved/resized cuts can therefore be inspected without pretending equal page scroll offsets refer to equal cuts. Original page/A-B/overlay/zoom controls remain available and unchanged.
- An absent counterpart is described only as missing from the currently selected page, not proof that it was deleted. Different pages, legacy mappings and ambiguous identities produce explicit explanations and no stale counterpart image.
- Search and 100-ID pages bound the select DOM while retaining access to all loaded IDs. Search, source-side changes and list-page changes clear the previous selection.
- Only the intersection of the cut bounding box and page is shown. Non-rectangular cuts can include surrounding pixels; this is not a polygon mask. Empty, non-finite or extreme transforms fall back to the full-page viewer. Limits: width scale 64, height scale 512, either crop aspect direction 64.
- Display transforms never change saved source pixels, review anchors, editor selection, source content, comments or approval state.
- Crops reuse `StudioReviewImage` with no-referrer and the existing private-preview lease lifecycle. URL-only renewal preserves selection; source/revision identity changes reset it. Existing actor-switch, permission-revocation and expiry removal also remove the entire cut panel. Nothing new is persisted or sent to an external service.
- Both crop regions support keyboard focus/scrolling. Image failures are announced outside the clipped region so they cannot disappear above its visible bounds.

## Evidence and commands

The local synthetic browser fixture reuses the real comparison component and maps one frame ID to cut 3 in A and cut 8 in B. Exact projection checks verify each version's x/y and export scale, in addition to screenshots.

```sh
pnpm exec vitest run apps/web/src/domains/creator/virtual-space/studio-review-frame-comparison.test.ts apps/web/src/domains/creator/virtual-space/studio-review-comparison-model.test.ts apps/web/src/domains/creator/virtual-space/studio-review-viewport.test.ts apps/web/src/domains/creator/virtual-space/StudioPinnedReviewComparison.test.tsx --maxWorkers=2
STUDIO_QA_BASE_URL=http://127.0.0.1:4491 node scripts/verify-review-frame-comparison.mjs
STUDIO_QA_BASE_URL=http://127.0.0.1:4491 node scripts/verify-review-viewport-continuity.mjs
pnpm run typecheck
```

New model and actual-component tests are automatically covered by the existing required `apps/web/src/domains/creator/virtual-space` CI directory target; no gate/timeout/coverage threshold was weakened. Browser screenshots and JSON reports are generated under ignored `artifacts/review-source-cuts` and `artifacts/review-viewport-continuity`, not committed as source.

Browser checks cover 1440/820/390/320px, source-bound projection, keyboard access, overflow, missing correspondence, reverse-side selection, source changes and URL-only renewal. Existing viewport tests independently cover A/B, zoom, overlay, real wheel input and responsive position restoration. Identity/ACL tests use explicit synthetic HTTP/identity; they are not new production authentication, live storage or WAN evidence.

The old worktree intentionally excluded `apps/web/public`. Initial test setup therefore failed on missing translation files; only tracked i18n and required JSON metadata were restored. A direct default-heap TypeScript attempt ran out of memory; the repository's standard 12-GiB typecheck command is used instead. Neither condition was hidden by changing product types or test assertions.

## Deliberately still separate

This does not finish all F01–F40, pixel/AI difference detection, cross-page cut discovery, split/merge lineage, manual reattachment of comments, frame-level linked scrolling, new drawing/attachment comment types, formal delivery jobs, full team resource planning, native-tool round trips or production real-time acceptance.

No new dependency, runtime API, database schema, deployment, production migration/ACL, environment variable, secret, domain, paid plan or infrastructure operation is part of this continuation. Deployment remains outside the user's requested scope.
