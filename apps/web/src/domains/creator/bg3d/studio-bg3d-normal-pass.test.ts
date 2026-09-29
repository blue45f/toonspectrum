import { describe, expect, it } from "vitest";

import { createStudioBg3dNormalRasterLayer } from "./studio-bg3d-normal-pass";

describe("Studio BG3D normal raster pass", () => {
  it("copies packed view-space normals into an opaque layer without mutating the source", () => {
    const normalRgba = new Uint8Array([128, 128, 255, 255, 0, 0, 0, 0]);
    const before = normalRgba.slice();
    const layer = createStudioBg3dNormalRasterLayer(2, 1, normalRgba);

    expect(layer).toMatchObject({ role: "color", width: 2, height: 1 });
    expect(Array.from(layer.data)).toEqual([128, 128, 255, 255, 0, 0, 0, 0]);
    expect(layer.data).not.toBe(normalRgba);
    expect(normalRgba).toEqual(before);
  });

  it("rejects malformed shapes and packed buffers whose length disagrees with the frame", () => {
    expect(() => createStudioBg3dNormalRasterLayer(0, 1, new Uint8Array())).toThrow(RangeError);
    expect(() => createStudioBg3dNormalRasterLayer(2, 1, new Uint8Array(4))).toThrow(/length/u);
    expect(() => createStudioBg3dNormalRasterLayer(1, 1, new Uint8ClampedArray(3)))
      .toThrow(/length/u);
  });
});
