import { describe, expect, it } from "vitest";

import {
  planStudioSkiaRetainedCameraTranslation,
  type StudioSkiaDocumentCamera,
} from "./studio-skia-camera-continuity";

const camera = (overrides: Partial<StudioSkiaDocumentCamera> = {}): StudioSkiaDocumentCamera => ({
  scaleX: 2,
  scaleY: -2,
  rotation: 0,
  offsetX: -64,
  offsetY: -128,
  ...overrides,
});

describe("Skia retained camera continuity", () => {
  it("bridges a clipped-stage scroll with the exact camera translation", () => {
    expect(planStudioSkiaRetainedCameraTranslation(
      camera(),
      camera({ offsetX: -164, offsetY: -378 }),
    )).toEqual({ x: -100, y: -250 });
  });

  it("normalizes a settled no-op translation", () => {
    expect(planStudioSkiaRetainedCameraTranslation(camera(), camera())).toEqual({ x: 0, y: 0 });
  });

  it("rejects zoom, reflection, rotation, and invalid camera changes", () => {
    expect(planStudioSkiaRetainedCameraTranslation(camera(), camera({ scaleX: 3 }))).toBeNull();
    expect(planStudioSkiaRetainedCameraTranslation(camera(), camera({ scaleY: 2 }))).toBeNull();
    expect(planStudioSkiaRetainedCameraTranslation(camera(), camera({ rotation: 90 }))).toBeNull();
    expect(planStudioSkiaRetainedCameraTranslation(
      camera(),
      camera({ offsetX: Number.NaN }),
    )).toBeNull();
    expect(planStudioSkiaRetainedCameraTranslation(null, camera())).toBeNull();
  });
});
