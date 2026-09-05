# Studio finishing quality inspection

The finishing quality center combines deterministic document inspection with the existing story-continuity review surface.

## Inspection coverage

- document identity, page geometry, duplicate IDs, and issue caps;
- frame gutters, overlaps, clipping, empty regions, and scroll rhythm;
- dialogue presence, range integrity, readable size, fit, and contrast;
- image and animation source integrity plus browser-side intrinsic raster checks;
- layer groups, clipping relationships, hidden approved content, review state, and unresolved comments;
- structured continuity findings mapped into the same severity and navigation model.

## Safety contract

- `blocking` and `error` findings cannot be acknowledged away;
- ambiguous visual judgments remain `review` findings rather than false passes;
- acknowledgements and the manual checklist are invalidated by the document revision fingerprint;
- browser raster probing is bounded, abortable, and reports skipped work instead of silently declaring success;
- the quality center reuses the canonical page and element navigation paths and does not mutate artwork.

## Release gate

The branch must pass focused quality tests, Studio menu verification, TypeScript, zero-warning lint, architecture validation, the production build, and the repository `core` check before merging.
