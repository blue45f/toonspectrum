// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioKonvaRuntime } from "./render/studio-konva-runtime";
import { STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS } from "./studio-live-transform-exact-draft-admission";
import { attachStudioLiveTransformSurface, studioLiveTransformSurfacePixelRatio } from "./studio-live-transform-surface";

import type Konva from "konva";

describe("studioLiveTransformSurfacePixelRatio", () => {
  it.each([[1440, 1100, 2], [1800, 1200, 2], [1920, 1080, 3], [3840, 2160, 2]])(
    "bounds a %ix%i DPR%i preview without raising the renderer budget", (width, height, dpr) => {
      const ratio = studioLiveTransformSurfacePixelRatio(width, height, dpr)!;
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(dpr);
      expect(Math.floor(width * ratio) * Math.floor(height * ratio))
        .toBeLessThanOrEqual(STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS);
    },
  );
  it("keeps native resolution whenever it fits, including fractional CSS sizes", () => {
    expect(studioLiveTransformSurfacePixelRatio(800, 600, 2)).toBe(2);
    expect(studioLiveTransformSurfacePixelRatio(900.5, 800.5, 1.25)).toBe(1.25);
  });
  it.each([[0, 100, 2], [-1, 100, 2], [100, 0, 2], [100, 100, 0], [NaN, 100, 2], [100, Infinity, 2]])(
    "refuses invalid dimensions and pixel ratios", (width, height, dpr) => {
      expect(studioLiveTransformSurfacePixelRatio(width, height, dpr)).toBeNull();
    },
  );
});

describe("attachStudioLiveTransformSurface", () => {
  let stage: Konva.Stage;
  let documentLayer: Konva.Layer;
  let previewLayer: Konva.Layer;
  let originalDpr: number;
  let detach: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => new Proxy({
      canvas: null,
    }, { get: (target, key) => Reflect.get(target, key) ?? (() => undefined) }) as never);
    originalDpr = studioKonvaRuntime.pixelRatio;
    studioKonvaRuntime.pixelRatio = 2;
    stage = new studioKonvaRuntime.Stage({ container: document.createElement("div"), width: 1800, height: 1200 });
    documentLayer = new studioKonvaRuntime.Layer();
    previewLayer = new studioKonvaRuntime.Layer();
    stage.add(documentLayer, previewLayer);
  });
  afterEach(() => {
    detach?.();
    detach = undefined;
    stage.destroy();
    studioKonvaRuntime.pixelRatio = originalDpr;
    vi.restoreAllMocks();
  });

  it("adapts only the ephemeral scene canvas and leaves document and hit geometry native", () => {
    const mainPixels = documentLayer.getNativeCanvasElement().width;
    const hitRatio = previewLayer.getHitCanvas().getPixelRatio();
    detach = attachStudioLiveTransformSurface(previewLayer);
    const canvas = previewLayer.getNativeCanvasElement();
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS);
    expect(previewLayer.getCanvas().getPixelRatio()).toBeLessThan(2);
    expect(documentLayer.getCanvas().getPixelRatio()).toBe(2);
    expect(documentLayer.getNativeCanvasElement().width).toBe(mainPixels);
    expect(previewLayer.getHitCanvas().getPixelRatio()).toBe(hitRatio);
    expect(stage.scaleX()).toBe(1);
  });

  it("tracks viewport resize in both directions and detaches its listeners", () => {
    detach = attachStudioLiveTransformSurface(previewLayer);
    stage.size({ width: 800, height: 600 });
    expect(previewLayer.getCanvas().getPixelRatio()).toBe(2);
    stage.size({ width: 2000, height: 1300 });
    const ratio = previewLayer.getCanvas().getPixelRatio();
    expect(ratio).toBeLessThan(2);
    expect(previewLayer.getNativeCanvasElement().width * previewLayer.getNativeCanvasElement().height)
      .toBeLessThanOrEqual(STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS);
    detach();
    stage.size({ width: 800, height: 600 });
    expect(previewLayer.getCanvas().getPixelRatio()).toBe(ratio);
  });
});
