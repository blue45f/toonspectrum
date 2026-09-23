import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
  STUDIO_BG3D_THREE_WEBGL_CAPTURE_IMPLEMENTATION_V1,
  type StudioBg3dCaptureAdapter,
} from "./studio-bg3d-capture-adapter";
import {
  captureStudio3dPlatesFromAdapter,
  captureStudio3dPlatesFromSource,
} from "./studio-bg3d-grade-plates-production";
import { captureStudio3dPlates, createStudio3dScene } from "./studio-bg3d-grade-plates";

function adapter(
  capture: StudioBg3dCaptureAdapter["capture"],
): StudioBg3dCaptureAdapter {
  return {
    backend: "three-webgl",
    engineId: "three",
    engineVersion: "184",
    implementationRevision: STUDIO_BG3D_THREE_WEBGL_CAPTURE_IMPLEMENTATION_V1,
    graphicsApi: "webgl2",
    profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
    getSourceSize: () => ({ width: 8, height: 6 }),
    capture,
  };
}

describe("studio-bg3d-grade-plates-production", () => {
  it("falls back to CPU synthetic when source is cpu-synthetic or raster size mismatches", () => {
    const scene = createStudio3dScene();
    const cpu = captureStudio3dPlatesFromSource(scene, 32, 18, { kind: "cpu-synthetic" });
    expect(cpu.fill.length).toBe(32 * 18 * 4);
    expect(cpu.line.length).toBe(cpu.fill.length);

    const mismatched = captureStudio3dPlatesFromSource(scene, 32, 18, {
      kind: "rgba-raster",
      fill: new Uint8ClampedArray(8),
      width: 2,
      height: 1,
    });
    expect(mismatched.fill).toEqual(captureStudio3dPlates(scene, 32, 18).fill);
  });

  it("packs an explicit RGBA raster and derives a line plate when line is omitted", () => {
    const scene = createStudio3dScene();
    const width = 16;
    const height = 12;
    const fill = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const on = x > 7;
        fill[i] = on ? 220 : 40;
        fill[i + 1] = on ? 200 : 40;
        fill[i + 2] = on ? 180 : 40;
        fill[i + 3] = 255;
      }
    }
    const plates = captureStudio3dPlatesFromSource(scene, width, height, {
      kind: "rgba-raster",
      fill,
      width,
      height,
    });
    expect(plates.fill).toBe(fill);
    expect(plates.line.some((_, i) => i % 4 === 3 && plates.line[i]! > 0)).toBe(true);
  });

  it("uses adapter RGBA when capture succeeds and falls back when it throws", async () => {
    const scene = createStudio3dScene();
    const width = 8;
    const height = 6;
    const rgba = new Uint8ClampedArray(width * height * 4);
    rgba.fill(180);
    const okAdapter = adapter(vi.fn(async () => ({ width, height, rgba })));
    const ok = await captureStudio3dPlatesFromAdapter(scene, width, height, okAdapter);
    expect(okAdapter.capture).toHaveBeenCalled();
    expect(ok.fill).toEqual(rgba);

    const failing = adapter(vi.fn(async () => {
      throw new Error("gpu busy");
    }));
    const fallback = await captureStudio3dPlatesFromAdapter(scene, width, height, failing);
    expect(fallback.fill).toEqual(captureStudio3dPlates(scene, width, height).fill);

    const missing = await captureStudio3dPlatesFromAdapter(scene, width, height, null);
    expect(missing.fill).toEqual(captureStudio3dPlates(scene, width, height).fill);
  });
});
