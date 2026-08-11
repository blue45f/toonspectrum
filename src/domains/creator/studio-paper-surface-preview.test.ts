/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioPaperSurfacePreviewCache,
  getStudioPaperSurfacePreviewTile,
  studioPaperSurfacePreviewCacheStats,
  studioPaperSurfacePreviewOpacity,
} from "./studio-paper-surface-preview";

function installCanvas2dStub(): void {
  HTMLCanvasElement.prototype.getContext = vi.fn(function (
    this: HTMLCanvasElement,
    type: string,
  ) {
    if (type !== "2d") return null;
    const width = this.width || 128;
    const height = this.height || 128;
    return {
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: vi.fn(),
      canvas: this,
      width,
      height,
    } as unknown as CanvasRenderingContext2D;
  }) as typeof HTMLCanvasElement.prototype.getContext;
}

beforeEach(() => {
  installCanvas2dStub();
});

afterEach(() => {
  clearStudioPaperSurfacePreviewCache();
  vi.restoreAllMocks();
});

describe("studio paper surface preview", () => {
  it("builds a seamless tile canvas and reuses the cache", () => {
    const first = getStudioPaperSurfacePreviewTile({ kind: "canvas", seed: 41 });
    const second = getStudioPaperSurfacePreviewTile({ kind: "canvas", seed: 41 });
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(first!.width).toBe(128);
    expect(first!.height).toBe(128);
    expect(studioPaperSurfacePreviewCacheStats().entries).toBe(1);
  });

  it("varies opacity by paper tooth and isolates cache by kind", () => {
    expect(studioPaperSurfacePreviewOpacity("charcoal")).toBeGreaterThan(
      studioPaperSurfacePreviewOpacity("bristol"),
    );
    getStudioPaperSurfacePreviewTile({ kind: "washi", seed: 1 });
    getStudioPaperSurfacePreviewTile({ kind: "kraft", seed: 1 });
    expect(studioPaperSurfacePreviewCacheStats().entries).toBe(2);
  });
});
