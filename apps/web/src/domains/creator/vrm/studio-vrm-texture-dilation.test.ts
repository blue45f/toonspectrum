import { describe, expect, it } from "vitest";

import {
  applyStudioTexturePixelDeltas,
  createStudioTextureArchiveRecord,
  dilateStudioVrmTexture,
  planStudioTextureMemoryEviction,
} from "./studio-vrm-texture-dilation";

describe("studio VRM texture dilation", () => {
  it("dilates only inside the same UV island and material", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba.set([255, 0, 0, 255], (1 * 4 + 1) * 4);
    rgba.set([0, 0, 255, 255], (1 * 4 + 3) * 4);
    const islandIds = new Int32Array([
      1, 1, 1, 2,
      1, 1, 1, 2,
      1, 1, 1, 2,
      1, 1, 1, 2,
    ]);
    const materialIds = new Int32Array([
      7, 7, 7, 8,
      7, 7, 7, 8,
      7, 7, 7, 8,
      7, 7, 7, 8,
    ]);
    const receipt = dilateStudioVrmTexture(
      { width: 4, height: 4, rgba, islandIds, materialIds },
      2,
    );
    expect(receipt.changedPixels).toBeGreaterThan(0);
    expect([...receipt.pixels.slice((1 * 4 + 2) * 4, (1 * 4 + 2) * 4 + 4)]).toEqual([
      255,
      0,
      0,
      255,
    ]);
    expect([...receipt.pixels.slice((0 * 4 + 3) * 4, (0 * 4 + 3) * 4 + 4)]).toEqual([
      0,
      0,
      255,
      255,
    ]);
  });

  it("replays dilation byte deltas for atomic undo and redo", () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 0,
      10, 20, 30, 255,
      0, 0, 0, 0,
    ]);
    const receipt = dilateStudioVrmTexture(
      {
        width: 3,
        height: 1,
        rgba,
        islandIds: new Int32Array([1, 1, 1]),
      },
      1,
    );
    expect(applyStudioTexturePixelDeltas(rgba, receipt.deltas, "redo")).toEqual(receipt.pixels);
    expect(applyStudioTexturePixelDeltas(receipt.pixels, receipt.deltas, "undo")).toEqual(rgba);
  });

  it("never evicts active or dirty 2K/4K texture sets", () => {
    const plan = planStudioTextureMemoryEviction(
      [
        { id: "active-4k", bytes: 64_000_000, active: true, dirty: false, lastUsedAtMs: 1 },
        { id: "dirty-2k", bytes: 16_000_000, active: false, dirty: true, lastUsedAtMs: 2 },
        { id: "cold-a", bytes: 16_000_000, active: false, dirty: false, lastUsedAtMs: 3 },
        { id: "cold-b", bytes: 16_000_000, active: false, dirty: false, lastUsedAtMs: 4 },
      ],
      90_000_000,
    );
    expect(plan.evictedIds).toEqual(["cold-a", "cold-b"]);
    expect(plan.residentIds).toEqual(["active-4k", "dirty-2k"]);
  });

  it("records model, color-space and channel-packing provenance", () => {
    const record = createStudioTextureArchiveRecord({
      modelHash: "glb-sha256",
      channel: "roughness",
      width: 2,
      height: 2,
      pixels: new Uint8ClampedArray(16).fill(128),
      colorSpace: "linear-srgb",
      channelPacking: "R=roughness",
    });
    expect(record.pixelHash).toHaveLength(16);
    expect(record.modelHash).toBe("glb-sha256");
  });
});
