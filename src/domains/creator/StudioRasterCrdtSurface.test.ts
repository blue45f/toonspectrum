import { describe, expect, it } from "vitest";

import { studioRasterTileIntersectsDocumentRect } from "./studio-raster-visible-rect";

const surfaceId = "raster:page-a:ink";

describe("StudioRasterCrdtSurface visible tile filter", () => {
  it("selects intersecting tiles and excludes exact edge contacts", () => {
    const rect = { x: 512, y: 512, width: 512, height: 512 };
    expect(studioRasterTileIntersectsDocumentRect({
      surfaceId,
      tileX: 1,
      tileY: 1,
      width: 512,
      height: 512,
    }, rect, 512)).toBe(true);
    expect(studioRasterTileIntersectsDocumentRect({
      surfaceId,
      tileX: 0,
      tileY: 1,
      width: 512,
      height: 512,
    }, rect, 512)).toBe(false);
    expect(studioRasterTileIntersectsDocumentRect({
      surfaceId,
      tileX: 2,
      tileY: 1,
      width: 512,
      height: 512,
    }, rect, 512)).toBe(false);
  });

  it("uses actual partial-tile dimensions at the document edge", () => {
    expect(studioRasterTileIntersectsDocumentRect({
      surfaceId,
      tileX: 1,
      tileY: 2,
      width: 288,
      height: 176,
    }, { x: 790, y: 1_100, width: 10, height: 100 }, 512)).toBe(true);
    expect(studioRasterTileIntersectsDocumentRect({
      surfaceId,
      tileX: 1,
      tileY: 2,
      width: 288,
      height: 176,
    }, { x: 0, y: 0, width: 100, height: 100 }, 512)).toBe(false);
  });

  it("fails closed for invalid visible rectangles", () => {
    const tile = { surfaceId, tileX: 0, tileY: 0, width: 512, height: 512 };
    expect(studioRasterTileIntersectsDocumentRect(
      tile,
      { x: 0, y: 0, width: 0, height: 100 },
      512
    )).toBe(false);
    expect(studioRasterTileIntersectsDocumentRect(
      tile,
      { x: Number.NaN, y: 0, width: 100, height: 100 },
      512
    )).toBe(false);
    expect(studioRasterTileIntersectsDocumentRect(
      tile,
      { x: 0, y: 0, width: 100, height: 100 },
      0
    )).toBe(false);
  });
});
