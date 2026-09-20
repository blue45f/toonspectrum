# Pinned review source coordinates

Status: **current implementation in this branch**. This extends ADR-0022 without turning authoring page/frame IDs into graph semantic panel IDs.

The capture producer already pins the exact saved `CreatorWork.doc` canonical SHA-256 and server revision. It now records each page's server-decoded PNG dimensions in an existing mutation receipt. Completion copies the ordered raster attestations into the immutable capture operation beside `sourceSnapshot`. There is no new database table or migration.

## Read contract

Every authenticated preview response includes a `mapping` on each preview. The Web parser also supplies the explicit legacy fallback when an older server omits this field.

```ts
type StudioReviewPageMapping = {
  status: "mapped";
  version: 1;
  sourceServerRevision: number;
  sourceContentDigest: string;
  page: {
    ordinal: number;
    id: string;
    width: number; height: number;             // saved authoring pixels
    renderWidth: number; renderHeight: number; // actual encoded PNG pixels
    frames: Array<{
      id: string;
      bounds: { x: number; y: number; width: number; height: number };
      polygon?: Array<{ x: number; y: number }>; // absolute authoring pixels
    }>;
    elements: Array<{ id: string; type: string; origin: "page" | "master" }>;
  };
} | {
  status: "unmapped";
  reason: "legacy-review" | "source-unavailable" | "source-identity-ambiguous"
    | "source-geometry-unsupported" | "render-geometry-mismatch";
};
```

An ordinal selects one captured page, including visually identical pages. The current PNG canonicalizer places per-intent/ordinal metadata into otherwise identical pixels; those pages have distinct encoded hashes and preserve their original count and order. No content-based deduplication is performed.

The reader verifies current work access, the complete review/artifact/revision/digest pin, the immutable document digest, ordered raster identity, and the producer's completed receipt. Merely appending an operation named `review.snapshot-create` through the general graph API cannot create a trusted mapping. The receipt's actor, intent fingerprint, idempotency identity, subject and producer command identity must match.

Only saved page frames become selectable cuts. Master elements retain `origin: "master"` and are selectable as objects, but master frames are not silently assigned page-cut semantics. The map does not guess frame membership from an element's location. Missing/duplicate IDs, unsupported frame geometry and incompatible raster dimensions remain explicitly unmapped. Existing captures without server raster attestations stay unmapped even if a source document happens to be present.

## Annotation contract

The public helpers and types are exported by `@toonspectrum/studio-project-model`:

- `StudioReviewPageMapping`, `StudioReviewMappedPage`, `StudioReviewSourceReference`.
- `createStudioReviewSpatialAnchor(mapping, selection)` returns a validated spatial anchor or `null`.
- `validateStudioReviewSpatialAnchor(mapping, anchor)` rechecks an anchor against the exact immutable source.

The UI supplies one explicit selection of kind `page`, `panel`, `object`, `coordinate`, or `region`. Panel selection requires `frameId`; object selection requires `elementId`. Coordinates and rectangle dimensions use saved authoring pixels. For a displayed image, convert its content-box relative pointer position to these dimensions, excluding any `object-fit` letterboxing. Frame polygons also use authoring coordinates. Coordinate/region anchors may be constrained to an explicitly chosen frame; proximity alone never chooses a frame.

The helper's result is combined with the existing exact `artifactId`, review `revisionId`, and artifact `scope`:

```ts
const spatial = createStudioReviewSpatialAnchor(preview.mapping, {
  kind: "panel", frameId: selectedFrameId,
});
if (spatial) {
  const anchor = { ...spatial, artifactId: subject.artifactId,
    revisionId: subject.revisionId, scope: artifact.scope };
}
```

`anchor.source` contains `version`, `sourceServerRevision`, `sourceContentDigest`, `pageOrdinal`, `pageId`, and the optional explicitly selected `frameId` or `elementId`. These authoring IDs never populate `ScopeRef.panelId` or `ScopeRef.elementId`. The comment repository validates the source against the pinned producer mapping under its existing review lock and current comment permission before inserting. Changing page, cut, element, source revision, digest, or out-of-bounds coordinates is rejected. Existing non-spatial graph comment semantics and idempotent replay are preserved.

Unmapped previews remain readable under current ACL and can receive the existing artifact-level note. The UI must not offer spatial placement for them. The current editable document, a remote peer's map, and guessed page ordering cannot supply a substitute mapping. Opening or updating an editor from an annotation requires a separate current-document comparison and explicit user action; this map itself does not grant editor access or mutate a document.

## Annotation UI

`StudioPinnedReviewPanel` passes a controlled annotation selection to `StudioPinnedReviewPreview`. Mapped images offer explicit page, cut, object, point and region choices. Points and regions can be placed directly on loaded images or entered with labeled percentage inputs and an explicit apply button. Both paths use the shared source validator. The displayed raster is sized without letterboxing inside its placement surface; authoring coordinates are independent of PNG export scale. Saved source-bound comments have a separate location/highlight action which does not retarget a new draft.

The selection carries its preview hash and visibility expiry. A successful same-source lease renewal preserves the chosen location. Pagination, missing/expired mapping, lost permission, hidden document, or an account change removes stale placement. The draft is preserved for the same actor, but a previously spatial draft cannot silently become a whole-review note: the user must select another location or explicitly choose the whole review. The save boundary checks the selection generation and its current visibility lease after fresh comment authorization. The immutable anchor is part of the uncertain-save fingerprint, so an explicit retry of the same note/location keeps its original idempotency identity.

The browser acceptance harness is `apps/web/tools/browser-harnesses/virtual-studio-review-acceptance.html`, driven by `scripts/verify-virtual-studio-review.mjs` under an explicitly supplied worktree-local server. Its HTTP fixture is isolated from production authentication and real documents. Root-owned comparison/harness changes are verified separately from the annotation component tests.

## Verification evidence

Pure source-map tests cover preserved IDs, scaled PNGs, equal-looking pages, malformed/duplicate identity, slanted frames, bounds, version mismatch, master ownership and legacy fallback. API tests cover producer receipt requirements and comment rejection before insertion. The existing real PostgreSQL capture suite now exercises server decoding/admission, distinct equal-pixel pages, capture publication, mapped reading, cut-bound comments, rejected wrong-cut references, and historical source coordinates after the current work changes. Test results are reported separately after execution; this document does not assert CI or deployment completion.

Component and Panel integration tests exercise explicit authoring IDs in the actual POST, normalized keyboard and pointer geometry, saved-note highlighting, uncertain same-anchor retries, pagination, background/late verification, account switching, permission loss, lease renewal/expiry, and unmapped fallback. Editor handoff, assignment, and completion-criteria workflows remain separate work.
