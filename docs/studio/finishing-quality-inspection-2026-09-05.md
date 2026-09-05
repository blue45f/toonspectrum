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

## Integrated finishing checks

The quality center retains `inspectStudioQuality` as its canonical report. The additional
`inspectStudioFinishQuality` engine is connected by `inspectStudioQualityFinishSupplement`:
only additional findings are imported so existing geometry, contrast, raster and review findings
are not counted twice. Additional findings preserve page/element targets. An exception or
truncated additional result prevents a successful finalization verdict.

The extra detail view has its own diagnostic score and `blocker/error/warning/info` vocabulary;
those are not a second final approval. The integrated summary maps them to
`blocking/error/warning/review`. `canFinalize` and the checklist describe local readiness, not a
new server-side authorization or an automatic external-platform publishing decision. Existing
Publish Pack preflight and exporter permissions remain responsible for export/publication.

## Review ownership and navigation

Review decisions belong to the stable document-runtime identity and the current content
revision. Anonymous drafts do not persist decisions. Storage keys are not truncated. Stored
arrays are validated, and stale acknowledgements and manual checks are not rendered as current
while effects reload another document. Full-content revision hashing also covers supplemental
finding evidence. Failed, aborted, unavailable or incomplete raster work is not a successful scan.

Text fields restored with invalid types produce a blocking finding before geometry, hidden
content or lettering reads, without mutating the document. Both scene and element navigation
stop when the host rejects a page switch.

## Scope limits

Inspection is read-only. This change does not add automatic artwork correction, AI visual
judgment, JPEG artifact/banding detection, a server-side approval database, or automatic uploads
to external platforms. Pixel-level and editorial checks that cannot be established from document
facts still require human review.

## Release gate

The branch must pass focused quality tests, Studio menu verification, TypeScript, zero-warning lint, architecture validation, the production build, and the repository `core` check before merging.

A successful aggregate check is not evidence that its constituent commands ran. When repository
CI skips steps, retain independent command logs for the same product source revision and report
that limitation explicitly rather than describing the entire repository test suite as passed.
