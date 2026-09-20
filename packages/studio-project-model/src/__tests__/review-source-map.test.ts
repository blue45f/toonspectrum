import { describe, expect, it } from "vitest";

import { createStudioReviewSpatialAnchor, deriveStudioReviewPageMapping, reviewAnchorSchema,
  studioReviewPageMappingSchema, validateStudioReviewSpatialAnchor } from "../index";

const pin = { sourceServerRevision: 7, sourceContentDigest: "a".repeat(64), ordinal: 0, renderWidth: 1600, renderHeight: 2400 };
const frame = { id: "frame-a", type: "frame", x: 20, y: 30, width: 200, height: 100 };
const doc = { width: 800, pagesList: [{ id: "page-a", canvasH: 1200, elements: [frame, { id: "text-a", type: "text" }] },
  { id: "page-b", canvasH: 1200, elements: [] }] };
const mapping = () => deriveStudioReviewPageMapping(doc, pin);
describe("immutable authoring review source map", () => {
  it("preserves source IDs and export scale without inventing graph panel identities", () => {
    const map = mapping();
    expect(map).toMatchObject({ status: "mapped", sourceServerRevision: 7,
      page: { id: "page-a", ordinal: 0, width: 800, height: 1200, renderWidth: 1600, renderHeight: 2400, frames: [{ id: "frame-a" }] } });
    const spatial = createStudioReviewSpatialAnchor(map, { kind: "panel", frameId: "frame-a" });
    expect(spatial?.source).toEqual({ version: 1, sourceServerRevision: 7, sourceContentDigest: pin.sourceContentDigest, pageOrdinal: 0, pageId: "page-a", frameId: "frame-a" });
    const anchor = reviewAnchorSchema.parse({ ...spatial, artifactId: "artifact", revisionId: "review-snapshot", scope: { projectId: "project" } });
    expect(anchor.scope).toEqual({ projectId: "project" });
  });
  it("keeps identical-looking pages separate by ordinal and stable page ID", () => {
    const blank = { width: 800, pagesList: [{ id: "first", canvasH: 1200, elements: [] }, { id: "second", canvasH: 1200, elements: [] }] };
    expect(deriveStudioReviewPageMapping(blank, pin)).toMatchObject({ page: { ordinal: 0, id: "first" } });
    expect(deriveStudioReviewPageMapping(blank, { ...pin, ordinal: 1 })).toMatchObject({ page: { ordinal: 1, id: "second" } });
  });
  it.each([
    { ...doc, pagesList: [{ ...doc.pagesList[0], id: undefined }] },
    { ...doc, pagesList: [doc.pagesList[0], doc.pagesList[0]] },
    { ...doc, pagesList: [{ ...doc.pagesList[0], elements: [frame, frame] }] },
  ])("does not guess missing or duplicate authoring identities", (source) => {
    expect(deriveStudioReviewPageMapping(source, pin)).toEqual({ status: "unmapped", reason: "source-identity-ambiguous" });
  });
  it("rejects a stretched/cropped raster and missing source dimensions", () => {
    expect(deriveStudioReviewPageMapping(doc, { ...pin, renderWidth: 700 })).toEqual({ status: "unmapped", reason: "render-geometry-mismatch" });
    expect(deriveStudioReviewPageMapping({ ...doc, width: undefined }, pin)).toEqual({ status: "unmapped", reason: "source-geometry-unsupported" });
    expect(deriveStudioReviewPageMapping(doc, { ...pin, renderWidth: 1066, renderHeight: 1600 })).toMatchObject({ status: "mapped" });
  });
  it("maps authored slanted frame points to page coordinates and rejects positions outside the cut", () => {
    const map = deriveStudioReviewPageMapping({ ...doc, pagesList: [{ ...doc.pagesList[0], elements: [{ ...frame, points: [0, 0, 200, 20, 180, 100, 0, 100] }] }] }, pin);
    expect(map).toMatchObject({ page: { frames: [{ polygon: [{ x: 20, y: 30 }, { x: 220, y: 50 }, { x: 200, y: 130 }, { x: 20, y: 130 }] }] } });
    expect(createStudioReviewSpatialAnchor(map, { kind: "coordinate", frameId: "frame-a", x: 30, y: 60 })).not.toBeNull();
    expect(createStudioReviewSpatialAnchor(map, { kind: "coordinate", frameId: "frame-a", x: 219, y: 31 })).toBeNull();
  });
  it("requires exact version, page, cut and element rather than proximity inference", () => {
    const map = mapping(), anchor = createStudioReviewSpatialAnchor(map, { kind: "object", elementId: "text-a" })!;
    expect(validateStudioReviewSpatialAnchor(map, anchor)).toBe(true);
    for (const change of [{ sourceServerRevision: 8 }, { sourceContentDigest: "b".repeat(64) }, { pageOrdinal: 1 }, { pageId: "page-b" }, { elementId: "missing" }]) {
      expect(validateStudioReviewSpatialAnchor(map, { ...anchor, source: { ...anchor.source, ...change } })).toBe(false);
    }
    expect(createStudioReviewSpatialAnchor(map, { kind: "object", elementId: "text-a", frameId: "frame-a" })).toBeNull();
    expect(createStudioReviewSpatialAnchor(map, { kind: "panel", frameId: "page-a" })).toBeNull();
  });
  it("rejects a region spanning a concave cut's empty notch even when all four corners are inside", () => {
    const map = deriveStudioReviewPageMapping({ width: 100, pagesList: [{ id: "page", canvasH: 100, elements: [
      { id: "cut", type: "frame", x: 0, y: 0, width: 100, height: 100,
        points: [0, 0, 100, 0, 100, 100, 60, 100, 60, 20, 40, 20, 40, 100, 0, 100] },
    ] }] }, { ...pin, renderWidth: 100, renderHeight: 100 });
    expect(createStudioReviewSpatialAnchor(map, { kind: "region", frameId: "cut", x: 20, y: 40, width: 60, height: 40 })).toBeNull();
    expect(createStudioReviewSpatialAnchor(map, { kind: "region", frameId: "cut", x: 5, y: 40, width: 20, height: 40 })).not.toBeNull();
  });
  it("bounds points/regions to source pixels and rejects unrelated geometry", () => {
    const map = mapping();
    expect(createStudioReviewSpatialAnchor(map, { kind: "region", frameId: "frame-a", x: 30, y: 40, width: 40, height: 40 })).not.toBeNull();
    for (const selection of [
      { kind: "coordinate" as const, x: NaN, y: 1 }, { kind: "coordinate" as const, x: 801, y: 1 },
      { kind: "region" as const, x: 750, y: 1, width: 100, height: 20 }, { kind: "region" as const, x: 1, y: 1, width: -1, height: 20 },
      { kind: "page" as const, width: 10 }, { kind: "panel" as const, frameId: "frame-a", x: 40, y: 40 },
    ]) expect(createStudioReviewSpatialAnchor(map, selection)).toBeNull();
  });
  it("keeps master object identity distinct and never converts master frames into page cuts", () => {
    const map = deriveStudioReviewPageMapping({ ...doc, master: { elements: [{ ...frame, id: "master-frame" }] } }, pin);
    expect(map).toMatchObject({ page: { elements: [{ id: "frame-a", origin: "page" }, { id: "text-a", origin: "page" }, { id: "master-frame", origin: "master" }] } });
    expect(createStudioReviewSpatialAnchor(map, { kind: "panel", frameId: "master-frame" })).toBeNull();
    expect(createStudioReviewSpatialAnchor(map, { kind: "object", elementId: "master-frame" })).not.toBeNull();
  });
  it("never enables spatial annotations for a legacy mapping or accepts injected URL fields", () => {
    expect(createStudioReviewSpatialAnchor({ status: "unmapped", reason: "legacy-review" }, { kind: "page" })).toBeNull();
    expect(studioReviewPageMappingSchema.safeParse({ ...mapping(), url: "https://untrusted.invalid" }).success).toBe(false);
  });
});
