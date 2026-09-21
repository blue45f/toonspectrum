# 검수 비교 위치 보존 — 2026-09-21

Status: current implementation; remote CI and main merge pending.
Baseline: `2eeaf1bc23379d9176379c95f30beecc94b3546c` (PR #1903).

## Implemented increment

- The pinned-review comparison retains independent relative scroll positions across side-by-side, A/B, overlay, zoom and viewport resize.
- Narrow screens default to one-image A/B; an explicitly chosen layout is respected.
- Matching linked pages carry their current position to a temporarily hidden A/B side. Unlinked pages remain independent.
- Entering overlay takes the most recently navigated page position; leaving overlay projects that same view back to both matching pages.
- Neutral gray, light and dark manuscript backgrounds affect the read-only viewing surface, not the source artwork or global theme.
- Explicit view reset returns zoom to 100%, opacity to 50% and view positions to the start. It does not replace either pinned source.
- A renewed URL or visibility lease is not a new image identity. Existing decoded pixels and viewport state remain while the existing access checks stay valid.
- Page ordinal, source page ID, source revision/digest, image digest and dimensions form the view lifetime boundary. A different source cannot inherit the previous page's scroll/zoom, even when its pixels are identical.
- Images that are still loading do not overwrite remembered scroll positions with zero. Resize observers are removed when the view changes/unmounts.

## Existing invariants retained

- No authoring document, brush, layer, Undo, graph, review status, approval or publish mutation is introduced.
- The existing actor boundaries, preview lease expiry, background visibility and access-revocation handling remain in `StudioPinnedReviewComparison` and its existing hooks.
- No image bytes, URLs, comments, authentication data or viewport state are persisted by the new hook.
- No new server API, database migration, schema, secret, provider, paid plan or deployment change.
- This is the F06/F10 view-continuity increment, not completion of all F01–F40 requirements.
- Production task conflict handling, persistent personal review drafts/batch publication, multi-group approval, automated pixel/cut diff, advanced AI billing and WAN review are not implemented by this PR.

## Main CI regression recovered

Main CI run `35563394810` failed the menu-verifier contract in the foundation shard. During this continuation, PR #1908 restored fully user-configurable rail visibility and PR #1909 aligned the verifier with that shipped eight-tool default. Their newer main implementation takes precedence. The earlier local ten-effective-tool test adjustment is not carried forward. We retain the current main tool configuration and re-run the full foundation shard; no CI gate or toolbar preference is disabled.

Viewport continuity is limited to the currently mounted pair. Closing the comparison, losing access or changing its source identity discards the transient view state; it is not a persisted personal bookmark.

## Validation and reproduction

Integrated main: `599fc0f0d944ce6a0848325719bdab7aebcc0132`.

- Targeted comparison/model/menu tests: 4 files, 32 cases passed before latest-main integration.
- Full `studio-foundation` semantic shard after integration: **236 files, 5,648 cases passed**. This includes the actual menu-verifier regression and new viewport tests; totals are overlapping scopes, not additive.
- Root and API TypeScript passed on the feature changes. Normal commit/push hooks and exact PR CI remain the final integration gates.
- `verify-review-viewport-continuity.mjs` passed on 1440px and 390px, with resize transitions to 820px and 320px. It uses native browser wheel input, checks A/B positions, zoom, URL renewal, overlay, background, resize, focus, reset and source identity changes.
- The fixture renders the actual component using synthetic local images. It is not server authorization, authenticated production, lease-network timing, pixel-diff quality or WAN performance evidence. Existing lease/actor/revocation unit regressions remain mandatory.
- Build, final CI and merge receipts are recorded separately in the associated PR. No deployment is triggered by this document.

```sh
node scripts/ci-core-regression-shards.mjs studio-foundation
pnpm run typecheck
pnpm run build:bundle
pnpm exec vite --host 127.0.0.1 --port 4456 --strictPort
STUDIO_QA_BASE_URL=http://127.0.0.1:4456 node scripts/verify-review-viewport-continuity.mjs
```

Generated screenshots and JSON live under ignored `artifacts/review-viewport-continuity/`; they are not source files or production data. Native wheel delivery is intentionally used instead of treating a direct DOM scroll assignment as a completed React interaction.
